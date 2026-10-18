"""POST /api/risk-analysis: facts, checker, provider fall-through, template, request validation.

No network: provider calls go to the httpx.MockTransport helpers of test_explain. Tests pass an
explicit env mapping and read the committed frontend/public/models/hfvalid-risk.json (the HFValid table).
Run from backend/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock as umock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes_risk import router  # noqa: E402
from services import llm_providers  # noqa: E402
from services import risk as rk  # noqa: E402
from services.risk import FeInput, RiskRequest, analyse, build_facts, check, template_text  # noqa: E402
from services.settings import runtime_env  # noqa: E402
from tests.test_explain import GROQ_HOST, KEYS, LITE, PRIMARY, Clock, Mock, gemini_reply, groq_reply  # noqa: E402

DATA = json.loads(rk.DATA_PATH.read_text(encoding="utf-8"))
FE = {"peak_stress_mpa": 15.83, "load_newtons": 800, "stress_index_percent": 10.553333}
GOOD = ("A sideways fall would load this femur 2.17 to 3.18 times its strength in the study authors' model, as it "
        "would every femur in the study, and 75 of the 101 women had a stronger femur. Its ARF0 of 47.1% is higher "
        "than 56 of the 101 women. No fracture was recorded for this 78-year-old woman during the follow-up.")


def run(fields, env, mock=None):
    transport = (mock or Mock()).transport()
    return asyncio.run(analyse(RiskRequest(**fields), env, data=DATA, transport=transport))


def reasons(result):
    return [(f.provider, f.reason) for f in result.fallbacks]


class RiskTestCase(unittest.TestCase):
    def setUp(self):
        rk.reset_cooldowns()
        logging.getLogger("rainbowbone.risk").disabled = True

    def tearDown(self):
        rk.reset_cooldowns()
        logging.getLogger("rainbowbone.risk").disabled = False


class FactsTests(unittest.TestCase):
    def test_ranks_factor_of_risk_and_cohort_figures(self):
        facts = build_facts(DATA, "Pat001", FeInput(**FE))
        self.assertEqual(facts.model_dump(), {
            "age": 78, "arf0_percent": 47.1, "arf0_higher_than": 56, "cohort_n": 101,
            "cohort_median_arf0_percent": 44.3, "cohort_fractured": 4,
            "fractured_arf0_min_percent": 53.7, "fractured_arf0_max_percent": 73.2,
            "msf_newtons": 1339, "msf_lower_than": 75, "fall_force_low_newtons": 2900, "fall_force_high_newtons": 4260,
            "factor_of_risk_low": 2.17, "factor_of_risk_high": 3.18,  # 2900 / 1338.86 and 4260 / 1338.86
            "cohort_msf_max_newtons": 2879,
            "fractured_within_followup": False, "days_ct_to_fracture": None,
            "fe": {"peak_stress_mpa": 15.83, "load_newtons": 800.0, "stress_index_percent": 10.55}})

    def test_fractured_subject_and_no_fe(self):
        facts = build_facts(DATA, "Pat004")  # ARF0 55.7 %, MSF 1478 N, fractured 1529 days after the CT
        self.assertEqual((facts.age, facts.arf0_percent, facts.msf_newtons), (75, 55.7, 1478))
        self.assertEqual((facts.arf0_higher_than, facts.msf_lower_than), (76, 63))
        self.assertEqual((facts.factor_of_risk_low, facts.factor_of_risk_high), (1.96, 2.88))
        self.assertEqual((facts.fractured_within_followup, facts.days_ct_to_fracture, facts.fe), (True, 1529, None))

    def test_ranks_and_factors_use_the_published_precision(self):
        # Pat006's ARF0 ties another subject's at 0.1 % but not in the CSV; Pat013's factor is 4260 / 987.44.
        self.assertEqual(build_facts(DATA, "Pat006").arf0_higher_than, 18)
        self.assertEqual(build_facts(DATA, "Pat027").msf_lower_than, 80)
        self.assertEqual(build_facts(DATA, "Pat013").factor_of_risk_high, 4.31)
        self.assertEqual(build_facts(DATA, "Pat032").factor_of_risk_high, 14.89)
        self.assertEqual(build_facts(DATA, "Pat050").factor_of_risk_low, 1.75)

    def test_unknown_case(self):
        with self.assertRaises(rk.UnknownCase):
            build_facts(DATA, "Pat999")

    def test_missing_or_broken_data_file(self):
        broken = json.loads(json.dumps(DATA))
        broken["subjects"]["Pat002"]["msf_newtons"] = 0
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(rk.RiskDataUnavailable):
                rk.load_dataset(Path(folder, "missing.json"))
            path = Path(folder, "hfvalid-risk.json")
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(rk.RiskDataUnavailable):
                rk.load_dataset(path)
        self.assertEqual(rk.load_dataset(rk.DATA_PATH)["cohort"]["n"], 101)


class CheckerTests(unittest.TestCase):
    facts = build_facts(DATA, "Pat001", FeInput(**FE))
    fractured = build_facts(DATA, "Pat004")

    def test_good_text_and_roundings_pass(self):
        for text in [GOOD, "An ARF0 of 47%, against a median of 44.3%.", "It would load it 2.2 to 3.2 times.",
                     "Fracture risk is higher than most: this bone is likely to break in a fall.",
                     "Absolute Risk of Fracture at time 0 (ARF0) is 47.1%.", "Women who fractured had 53.7% to 73.2%.",
                     "The study median ARF0 of 44.3% is lower.", "The 4 women who fractured had an ARF0 of 53.7% to 73.2%.",
                     "A fall of 2,900 to 4,260 N exceeds the strongest MSF in the study, 2,879 N.",
                     "It would load it 2.17 to 3.18\u00d7 its strength."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))

    def test_names_spelled_out_as_the_prompt_asks_pass(self):
        # The prompt asks for "MSF (minimum sidefall strength)" and "ARF0 (absolute risk of fracture at time 0)" on
        # first use: the 0 of "time 0" is a name, not a number, and the ARF0 value is still checked through it.
        for text in ["Its MSF (minimum sidefall strength) is 1,339 N; 75 of the 101 women had a stronger femur.",
                     "Its ARF0 (absolute risk of fracture at time 0) is 47.1%, higher than 56 of the 101 women.",
                     "The study median ARF0 (absolute risk of fracture at time 0) of 44.3% is lower."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))
        self.assertEqual(check("Its ARF0 (absolute risk of fracture at time 0) is 44.3%.", self.facts),
                         "not this femur's ARF0: 44.3%")
        self.assertIn("'MSF (minimum sidefall strength)'", rk.SYSTEM_PROMPT)
        self.assertIn("'ARF0 (absolute risk of fracture at time 0)'", rk.SYSTEM_PROMPT)

    def test_invented_numbers_fail(self):
        for text, token in [("An ARF0 of 52%.", "52"), ("A fall of 4.26 kN.", "4.26"), ("Of the other 100 women.", "100"),
                            ("Subject Pat001.", "001"), ("Weighs 55 kg.", "55"), ("Since 1995.", "1995")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"number not in input: {token}")

    def test_fe_numbers_are_not_allowed(self):
        # fe is echoed in the facts but is our own solve, not published data, and never sent to a model.
        for text, token in [("The 11% stress index above is a simpler measure.", "11"),
                            ("A peak stress of 15.83 MPa.", "15.83"), ("A stress index of 10.55%.", "10.55")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"number not in input: {token}")

    def test_numbers_used_as_the_wrong_quantity_fail(self):
        # Each number is a real fact, but not the quantity the words around it say.
        for text, reason in [("This femur has a 78% risk of breaking.", "not a percent in the input: 78"),  # the age
                             ("This femur has a 56% fracture risk.", "not a percent in the input: 56"),  # a rank
                             ("Its fracture risk is 3.18%.", "not a percent in the input: 3.18"),  # a factor
                             ("Its ARF0 is higher than 78 of the 101 women in the study.",
                              "not a count of women in the input: 78"),
                             ("Its ARF0 is higher than 47 women.", "not a count of women in the input: 47"),
                             ("A fall load of 3.18 N.", "not a force in newtons in the input: 3.18"),
                             ("Its MSF is 1,339 kN.", "not a force in kN in the input: 1,339"),
                             ("A fall would load it 47.1 times its strength.",
                              "not a multiple of the strength in the input: 47.1"),
                             ("Its ARF0 is 44.3%.", "not this femur's ARF0: 44.3%"),  # the cohort median
                             ("This femur has an ARF0 of 73.2%.", "not this femur's ARF0: 73.2%")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), reason)
        # With the dashboard's fe the 11% index is a fact in the request, yet still not a number the text may use.
        self.assertEqual(check("Its ARF0 is 11%.", self.facts), "number not in input: 11")

    def test_time_predictions_fail(self):
        for text, reason in [("It may break within 2 years.", "time prediction: '2 years'"),
                             ("A 5-year risk of 47.1%.", "time prediction: '5-year'"),
                             ("A fracture 1200 days later.", "time prediction: '1200 days'"),
                             ("It could break next year.", "time prediction: 'next year'"),
                             ("Over the next few decades.", "time prediction: 'next few decades'"),
                             ("An ARF0 of 47.1% a year.", "time prediction: 'a year'"),
                             ("Her lifetime risk is 47.1%.", "time prediction: 'lifetime'"),
                             ("It may break soon.", "time prediction: 'soon'"),
                             ("Over a 4 y period it may break.", "time prediction: '4 y'"),
                             ("ARF0 is the risk over 78 years.", "time prediction: '78 years'")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), reason)
        for text in ["It could break within months.", "It could break within weeks.", "It could break within the decade.",
                     "It could break later in life.", "It could eventually break.", "It could break in the years ahead.",
                     "Over the long term it could break.", "Its ARF0 is a yearly risk.", "It may break in her eighties."]:
            with self.subTest(text=text):
                self.assertRegex(check(text, self.facts) or "", r"^time prediction: ")

    def test_facts_with_a_time_unit_pass(self):
        self.assertIsNone(check("This 78-year-old woman, aged 78 years.", self.facts))
        self.assertIsNone(check("A woman 78 years old, at the age of 78 years.", self.facts))
        self.assertIsNone(check("A fracture 1,529 days after the CT scan of this 75-year-old.", self.fractured))
        self.assertEqual(check("A fracture 1,529 years after the CT.", self.fractured),
                         "time prediction: '1,529 years'")

    def test_advice_diagnosis_and_probability_fail(self):
        for text, hit in [("She should avoid falls.", "should"), ("You could break it.", "You"),
                          ("See a doctor about 47.1%.", "doctor"), ("This shows osteoporosis.", "osteopor"),
                          ("Diagnosed at 78.", "Diagnos"), ("Treatment could help.", "Treat"),
                          ("A prescription may help.", "prescri"), ("A 47.1% chance of breaking.", "chance"),
                          ("A probability of 47.1%.", "probab"), ("It will break in a fall.", "will"),
                          ("We recommend care.", "recommend"), ("Calcium helps.", "Calcium")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"blocked wording: {hit!r}")

    def test_hip_fracture_claims_fail(self):
        # HFValid records that a woman fractured, not where, so "hip fracture" is not a fact.
        for text in ["Four of the 101 women had a hip fracture.", "Four women in the study broke a hip.",
                     "Her hip was broken during the follow-up.", "Four women had hip fractures."]:
            with self.subTest(text=text):
                self.assertRegex(check(text, self.facts) or "", r"^blocked wording: ")
        self.assertIsNone(check("Four of the 101 women had a fracture during the follow-up.", self.facts))

    def test_referrals_screening_drugs_and_prevention_fail(self):
        for text in ["She needs to see a GP.", "She needs a bone density scan.", "A DXA scan is the next step.",
                     "Hip protectors would help her.", "Physiotherapy could help.",
                     "Bisphosphonates or denosumab would strengthen it.", "Talk to a healthcare provider.",
                     "Ask a nurse about it.", "Go to the emergency room.", "Strength training can help.",
                     "Fall prevention is important for her.", "She needs to seek medical attention.",
                     "She has brittle bone disease.", "This is a fragility fracture case of low bone mass."]:
            with self.subTest(text=text):
                self.assertRegex(check(text, self.facts) or "", r"^blocked wording: ")

    def test_likelihood_and_certainty_fail(self):
        for text in ["This femur has a 47.1% likelihood of breaking.", "It is 47.1% likely to break.",
                     "This femur is going to break.", "This femur is bound to break.",
                     "This femur is expected to break.", "This femur is sure to break.",
                     "This femur will almost surely fracture."]:
            with self.subTest(text=text):
                self.assertRegex(check(text, self.facts) or "", r"^blocked wording: ")

    def test_rank_direction(self):
        # Pat001: 56 women had a lower ARF0 (arf0_higher_than); 75 women had a stronger femur (msf_lower_than).
        for text in ["An ARF0 higher than 56 of the 101 women.", "56 women in the study had a lower ARF0.",
                     "Its MSF is weaker than 75 of the 101 women.", "75 of the 101 women had a stronger femur.",
                     "Its MSF is lower than that of 75 women."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))
        # The first is Gemini's live wording that the number check alone let through.
        for text, phrase in [("A Minimum Sidefall Strength of 1339 newtons, which is stronger than 75 women.",
                              "stronger than 75"),
                             ("A stronger femur than 75 women.", "stronger femur than 75"),
                             ("75 of the 101 women in the study had a weaker femur.",
                              "75 of the 101 women in the study had a weaker"),
                             ("An ARF0 lower than 56 of the 101 women.", "lower than 56"),
                             ("56 of the 101 women had a higher ARF0.", "56 of the 101 women had a higher")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"wrong direction: {phrase!r}")

    def test_spelled_out_quantities_fail(self):
        for text, word in [("Higher than five women.", "five"), ("Twice its strength.", "Twice"),
                           ("About three quarters of the women.", "three"), ("She is one of the 101 women.", "one"),
                           ("Higher than fifty-six of the 101 women.", "fifty"), ("Over one hundred women.", "one")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"spelled-out quantity: {word!r}")

    def test_a_number_word_passes_only_as_a_count_of_women_that_is_a_fact(self):
        # cohort_fractured is 4: "four" passes where it counts women, and is a spelled-out quantity anywhere else.
        for text in ["Four of the 101 women had a fracture.", "The four women who fractured had 53.7% to 73.2%.",
                     "Four women fractured during the follow-up."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))
        for text, word in [("Its ARF0 is four percent.", "four"), ("It may break within four years.", "four"),
                           ("Only three women in the study had a fracture.", "three")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"spelled-out quantity: {word!r}")

    def test_a_rounded_fact_does_not_let_a_number_word_through(self):
        # round(2.17) = 2 and round(3.18) = 3 are facts; as words they would invent falls, places, counts and multiples.
        for text, word in [("This woman had fallen three times before her CT scan.", "three"),
                           ("Only three in the study had a fracture.", "three"),
                           ("Her femur would crack in two places in a sideways fall.", "two"),
                           ("This femur is two times as likely to break as an average femur.", "two"),
                           ("A sideways fall makes this femur three times more likely to break than the median woman.",
                            "three")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"spelled-out quantity: {word!r}")
        for text, hit in [("A sideways fall makes this femur 3 times more likely to break.", "more likely"),
                          ("Its ARF0 is a validated estimate.", "validat")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"blocked wording: {hit!r}")

    def test_length_and_empty(self):
        self.assertEqual(check(" ", self.facts), "empty text")
        self.assertEqual(check("a" * (rk.MAX_CHARS + 1), self.facts), f"over {rk.MAX_CHARS} characters")


class ChainTests(RiskTestCase):
    def test_gemini_answers_with_the_facts_only(self):
        mock = Mock(gemini=gemini_reply(GOOD), groq=groq_reply(GOOD))
        result = run({"case_id": "Pat001", "fe": FE}, KEYS, mock)
        self.assertEqual((result.provider, result.model, result.fallbacks), ("gemini", PRIMARY, []))
        self.assertEqual(result.text, f"{GOOD} {rk.NOTE}")
        self.assertEqual(result.case_id, "Pat001")
        self.assertEqual(result.source.model_dump(), {k: DATA["source"][k] for k in ("citation", "doi", "license")})
        body = json.loads(mock.requests[0].content)
        self.assertEqual(body["systemInstruction"], {"parts": [{"text": f"{rk.SYSTEM_PROMPT} {rk.DIGITS_RULE}"}]})
        self.assertIn("digits", rk.DIGITS_RULE)
        sent = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(sent, result.facts.model_dump(exclude={"fe"}))
        self.assertEqual(result.facts.fe.model_dump(), {"peak_stress_mpa": 15.83, "load_newtons": 800.0,
                                                        "stress_index_percent": 10.55})
        for absent in ("Pat001", "15.83", "10.55"):
            self.assertNotIn(absent, mock.requests[0].content.decode())

    def test_a_gemini_answer_is_kept_for_an_hour_and_a_template_for_a_minute(self):
        clock = Clock().patch(self)
        first = run({"case_id": "Pat001", "fe": FE}, {}, Mock())
        self.assertEqual(first.provider, "template")
        kept = run({"case_id": "Pat001", "fe": FE}, {}, Mock())
        self.assertEqual((kept.text, kept.served), (first.text, "cached"))
        mock = Mock(gemini=gemini_reply(GOOD), groq=groq_reply(GOOD))
        answers = [run({"case_id": "Pat001", "fe": FE}, KEYS, mock) for _ in range(4)]
        self.assertEqual(mock.calls, [PRIMARY])  # keys set: another chain, so the template did not stop Gemini
        self.assertEqual({(a.provider, a.text) for a in answers}, {("gemini", f"{GOOD} {rk.NOTE}")})
        run({"case_id": "Pat001"}, KEYS, mock)
        self.assertEqual(mock.calls, [PRIMARY] * 2)  # other facts (no fe) ask again
        clock.now += llm_providers.OTHER_ANSWER_TTL_S + 1
        self.assertIsNot(run({"case_id": "Pat001", "fe": FE}, {}, Mock()), first)  # the template expired
        self.assertEqual(mock.calls, [PRIMARY] * 2)
        clock.now += llm_providers.GEMINI_ANSWER_TTL_S
        run({"case_id": "Pat001", "fe": FE}, KEYS, mock)
        self.assertEqual(mock.calls, [PRIMARY] * 3)
        rk.reset_cooldowns()
        run({"case_id": "Pat001", "fe": FE}, KEYS, mock)
        self.assertEqual(mock.calls, [PRIMARY] * 4)

    def test_a_429_sends_the_next_requests_straight_to_the_fallback_gemini_model(self):
        Clock().patch(self)
        first = run({"case_id": "Pat001"}, KEYS, Mock(gemini=httpx.Response(429), lite=gemini_reply(GOOD)))
        self.assertEqual((first.provider, first.model), ("gemini", LITE))
        rk._answers.clear()
        mock = Mock(gemini=gemini_reply(GOOD), lite=gemini_reply(GOOD))
        result = run({"case_id": "Pat001"}, KEYS, mock)
        self.assertEqual((result.provider, result.model, mock.calls), ("gemini", LITE, [LITE]))
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: skipped: HTTP 429 less than 300 s ago")])

    def test_rejected_gemini_text_falls_through_to_groq(self):
        for text, reason in [("An ARF0 of 52%.", "number not in input: 52"),
                             ("She should see a doctor.", "blocked wording: 'should'"),
                             ("Its MSF is stronger than 75 women.", "wrong direction: 'stronger than 75'"),
                             ("It could break within 2 years.", "time prediction: '2 years'")]:
            with self.subTest(text=text):
                rk.reset_cooldowns()
                mock = Mock(gemini=gemini_reply(text), groq=groq_reply(GOOD))
                result = run({"case_id": "Pat001"}, KEYS, mock)
                self.assertEqual((result.provider, result.model), ("groq", "openai/gpt-oss-120b"))
                self.assertEqual(result.text, f"{GOOD} {rk.NOTE}")
                self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: rejected: {reason}")])
                self.assertEqual(mock.calls, [PRIMARY, GROQ_HOST])

    def test_gemini_http_error_tries_lite_then_groq(self):
        mock = Mock(gemini=httpx.Response(503), groq=groq_reply(GOOD))
        result = run({"case_id": "Pat001"}, KEYS, mock)
        self.assertEqual(result.provider, "groq")
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: HTTP 503"), ("gemini", f"{LITE}: HTTP 503")])
        self.assertEqual(mock.calls, [PRIMARY, LITE, GROQ_HOST])

    def test_everything_failing_gives_the_template(self):
        mock = Mock(gemini=httpx.ReadTimeout("slow"), groq=groq_reply("An ARF0 of 52%."))
        result = run({"case_id": "Pat001", "fe": FE}, KEYS, mock)
        self.assertEqual((result.provider, result.model), ("template", None))
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: timed out after 10 s"),
                                           ("groq", "openai/gpt-oss-120b: rejected: number not in input: 52")])
        self.assertEqual(result.text, f"{template_text(result.facts)} {rk.NOTE}")

    def test_no_keys_and_offline_give_the_template_without_calls(self):
        mock = Mock()
        result = run({"case_id": "Pat001"}, {}, mock)
        self.assertEqual(result.provider, "template")
        self.assertEqual(reasons(result), [("gemini", "GEMINI_API_KEY not set"), ("groq", "GROQ_API_KEY not set")])
        offline = run({"case_id": "Pat001"}, {**KEYS, "AI_OFFLINE": "1"}, mock)
        self.assertEqual((offline.provider, offline.fallbacks), ("template", []))
        self.assertEqual(mock.requests, [])

    def test_keys_never_in_response_or_logs(self):
        logging.getLogger("rainbowbone.risk").disabled = False
        mock = Mock(gemini=httpx.Response(401, text=KEYS["GEMINI_API_KEY"]),
                    groq=httpx.ConnectError(KEYS["GROQ_API_KEY"]))
        with self.assertLogs("rainbowbone.risk", level="WARNING") as logs:
            result = run({"case_id": "Pat001"}, KEYS, mock)
        dumped = result.model_dump_json() + "\n".join(logs.output)
        for key in KEYS.values():
            self.assertNotIn(key, dumped)


class TemplateTests(unittest.TestCase):
    def test_template_words_the_facts(self):
        text = template_text(build_facts(DATA, "Pat001", FeInput(**FE)))
        self.assertEqual(text, "A sideways fall would load this femur 2.17 to 3.18 times its minimum sidefall strength "
                               "(MSF, 1,339 N) in the study authors' model. Such a fall would exceed the MSF of every "
                               "femur in the study; 75 of the 101 women had a stronger femur. Its published absolute "
                               "risk of fracture at time 0 (ARF0) is 47.1%, higher than 56 of the 101 women. No "
                               "fracture was recorded for this woman during the study's follow-up.")
        self.assertIn("recorded a fracture 1,529 days after this CT scan", template_text(build_facts(DATA, "Pat004")))

    def test_template_says_every_femur_only_when_it_is_true(self):
        # The cohort's strongest MSF is 2,879 N, below the 2,900 N fall force, so every factor of risk is above 1.
        data = json.loads(json.dumps(DATA))
        data["fall_force"]["low_newtons"] = 2800
        text = template_text(build_facts(data, "Pat001"))
        self.assertNotIn("every femur", text)
        self.assertIn("Such a fall would exceed its strength;", text)

    def test_template_passes_for_every_subject(self):
        fe = FeInput(**FE)
        for case_id in DATA["subjects"]:
            for f in (None, fe):
                facts = build_facts(DATA, case_id, f)
                text = template_text(facts)
                self.assertIsNone(check(text, facts), case_id)
                self.assertLessEqual(len(text), 420, case_id)

    def test_template_passes_the_checker_for_varied_data(self):
        rng = random.Random(11)
        for _ in range(500):
            n = rng.randint(1, 12)
            data = json.loads(json.dumps(DATA))
            data["fall_force"] = {"low_newtons": rng.choice([2900, rng.uniform(100, 5000)]), "high_newtons": 4260}
            data["subjects"] = {}
            for i in range(n):
                fractured = rng.random() < 0.3
                data["subjects"][f"S{i}"] = {
                    "age": rng.randint(55, 100), "arf0_percent": rng.choice([0.0, 0.05, 99.95, rng.uniform(0, 100)]),
                    "msf_newtons": rng.choice([1.0, 4260.0, rng.uniform(200, 9000)]),
                    "fractured_within_followup": fractured,
                    "days_ct_to_fracture": rng.choice([None, rng.randint(1, 3000)]) if fractured else None}
            fe = rng.choice([None, FeInput(peak_stress_mpa=rng.uniform(0, 500), load_newtons=rng.uniform(0, 5000),
                                           stress_index_percent=rng.uniform(0, 100))])
            for case_id in data["subjects"]:
                facts = build_facts(data, case_id, fe)
                text = template_text(facts)
                self.assertIsNone(check(text, facts), text)


class RouteTests(RiskTestCase):
    def client(self, env, data_path=rk.DATA_PATH):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[runtime_env] = lambda: env
        patcher = umock.patch.object(rk, "DATA_PATH", data_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        return TestClient(app)

    def test_contract_shape(self):
        response = self.client({}).post("/api/risk-analysis", json={"case_id": "Pat001", "fe": FE})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {"case_id", "facts", "text", "provider", "model", "served", "saved_at", "fallbacks",
                                     "source"})
        self.assertEqual(set(body["facts"]), {
            "age", "arf0_percent", "arf0_higher_than", "cohort_n", "cohort_median_arf0_percent", "cohort_fractured",
            "fractured_arf0_min_percent", "fractured_arf0_max_percent", "msf_newtons", "msf_lower_than",
            "fall_force_low_newtons", "fall_force_high_newtons", "factor_of_risk_low", "factor_of_risk_high",
            "cohort_msf_max_newtons", "fractured_within_followup", "days_ct_to_fracture", "fe"})
        self.assertEqual(set(body["source"]), {"citation", "doi", "license"})
        self.assertEqual((body["provider"], body["model"]), ("template", None))
        self.assertEqual(self.client({}).post("/api/risk-analysis", json={"case_id": "Pat002"}).json()["facts"]["fe"],
                         None)

    def test_unknown_case_is_404(self):
        response = self.client({}).post("/api/risk-analysis", json={"case_id": "Pat999"})
        self.assertEqual(response.status_code, 404)

    def test_bad_bodies_are_422(self):
        client = self.client({})
        for payload in [{}, {"case_id": 1}, {"case_id": ""}, {"case_id": "Pat001", "fe": {"peak_stress_mpa": 15.83}},
                        {"case_id": "Pat001", "fe": {**FE, "peak_stress_mpa": "15.83"}},
                        {"case_id": "Pat001", "fe": {**FE, "load_newtons": -800}},
                        {"case_id": "Pat001", "fe": {**FE, "stress_index_percent": 100.5}},
                        {"case_id": "Pat001", "fe": {**FE, "stress_index_percent": True}},
                        {"case_id": "Pat001", "fe": "high"}]:
            with self.subTest(payload=payload):
                self.assertEqual(client.post("/api/risk-analysis", json=payload).status_code, 422)

    def test_missing_data_is_503(self):
        response = self.client({}, rk.DATA_PATH.with_name("missing.json")).post("/api/risk-analysis",
                                                                               json={"case_id": "Pat001"})
        self.assertEqual(response.status_code, 503)

    def test_bad_chain_config_is_500(self):
        response = self.client({"AI_CHAIN": "gpt"}).post("/api/risk-analysis", json={"case_id": "Pat001"})
        self.assertEqual(response.status_code, 500)

    def test_main_app_serves_the_route(self):
        from main import app

        self.assertIn("/api/risk-analysis", app.openapi()["paths"])


if __name__ == "__main__":
    unittest.main()
