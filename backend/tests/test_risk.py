"""POST /api/risk-analysis: facts, checker, provider fall-through, template, request validation.

No network: provider calls go to the httpx.MockTransport helpers of test_explain. Tests pass an
explicit env mapping and read the committed public/models/hfvalid-risk.json (the HFValid table).
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
from services import risk as rk  # noqa: E402
from services.risk import FeInput, RiskRequest, analyse, build_facts, check, template_text  # noqa: E402
from services.settings import runtime_env  # noqa: E402
from tests.test_explain import GROQ_HOST, KEYS, LITE, PRIMARY, Mock, gemini_reply, groq_reply  # noqa: E402

DATA = json.loads(rk.DATA_PATH.read_text(encoding="utf-8"))
FE = {"peak_stress_mpa": 15.83, "load_newtons": 800, "stress_index_percent": 10.553333}
GOOD = ("The HFValid authors' finite-element model gave this femur an ARF0 of 47.1%, higher than 56 of the 101 "
        "women and above the study median of 44.3%. Its sideways-fall strength (MSF) is 1,339 N, and 75 women had "
        "a stronger femur. A sideways fall would load it 2.17 to 3.18 times its estimated strength, so a fall like "
        "that could break it. No hip fracture was recorded for this 78-year-old woman during the follow-up.")


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
            "factor_of_risk_low": 2.17, "factor_of_risk_high": 3.18,  # 2900 / 1339 and 4260 / 1339
            "fractured_within_followup": False, "days_ct_to_fracture": None,
            "fe": {"peak_stress_mpa": 15.83, "load_newtons": 800.0, "stress_index_percent": 10.55}})

    def test_fractured_subject_and_no_fe(self):
        facts = build_facts(DATA, "Pat004")  # ARF0 55.7 %, MSF 1478 N, fractured 1529 days after the CT
        self.assertEqual((facts.age, facts.arf0_percent, facts.msf_newtons), (75, 55.7, 1478))
        self.assertEqual((facts.arf0_higher_than, facts.msf_lower_than), (76, 63))
        self.assertEqual((facts.factor_of_risk_low, facts.factor_of_risk_high), (1.96, 2.88))
        self.assertEqual((facts.fractured_within_followup, facts.days_ct_to_fracture, facts.fe), (True, 1529, None))

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
                     "The 11% stress index above is a simpler measure from 15.8 MPa under 800 N.",
                     "Absolute Risk of Fracture at time 0 (ARF0) is 47.1%.", "Women who fractured had 53.7% to 73.2%."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))

    def test_invented_numbers_fail(self):
        for text, token in [("An ARF0 of 52%.", "52"), ("A fall of 4.26 kN.", "4.26"), ("Of the other 100 women.", "100"),
                            ("Subject Pat001.", "001"), ("Weighs 55 kg.", "55"), ("Since 1995.", "1995")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"number not in input: {token}")

    def test_time_predictions_fail(self):
        for text, reason in [("It may break within 2 years.", "time prediction: '2 years'"),
                             ("A 5-year risk of 47.1%.", "time prediction: '5-year'"),
                             ("A fracture 1200 days later.", "time prediction: '1200 days'"),
                             ("It could break next year.", "time prediction: 'next year'"),
                             ("Over the next few decades.", "time prediction: 'next few decades'"),
                             ("An ARF0 of 47.1% a year.", "time prediction: 'a year'"),
                             ("Her lifetime risk is 47.1%.", "time prediction: 'lifetime'"),
                             ("It may break soon.", "time prediction: 'soon'")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), reason)

    def test_facts_with_a_time_unit_pass(self):
        self.assertIsNone(check("This 78-year-old woman, aged 78 years.", self.facts))
        self.assertIsNone(check("A hip fracture 1,529 days after the CT scan of this 75-year-old.", self.fractured))
        self.assertEqual(check("A hip fracture 1,529 years after the CT.", self.fractured),
                         "time prediction: '1,529 years'")

    def test_advice_diagnosis_and_probability_fail(self):
        for text, hit in [("She should avoid falls.", "should"), ("You could break it.", "You"),
                          ("See a doctor about 47.1%.", "doctor"), ("This shows osteoporosis.", "osteopor"),
                          ("Diagnosed at 78.", "Diagnos"), ("Treatment could help.", "Treat"),
                          ("A prescription may help.", "prescri"), ("A 47.1% chance of breaking.", "chance"),
                          ("A probability of 47.1%.", "probab"), ("It will break in a fall.", "will break"),
                          ("We recommend care.", "recommend"), ("Calcium helps.", "Calcium")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"blocked wording: {hit!r}")

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
        for text, word in [("Higher than four women.", "four"), ("Twice its strength.", "Twice"),
                           ("About three quarters of the women.", "three")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"spelled-out quantity: {word!r}")

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
        self.assertEqual(body["systemInstruction"], {"parts": [{"text": rk.SYSTEM_PROMPT}]})
        sent = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(sent, result.facts.model_dump())
        self.assertNotIn("Pat001", mock.requests[0].content.decode())

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
        for part in ["78-year-old", "(ARF0) of 47.1%", "higher than 56 of the 101 women", "median of 44.3%",
                     "53.7% to 73.2%", "(MSF) at 1,339 N", "2,900 to 4,260 N", "2.17 to 3.18 times that strength",
                     "would exceed it", "No hip fracture was recorded", "The 11% fracture risk index above",
                     "15.83 MPa", "standing load of 800 N"]:
            self.assertIn(part, text)
        self.assertIn("hip fracture 1,529 days after this CT scan", template_text(build_facts(DATA, "Pat004")))

    def test_template_passes_for_every_subject(self):
        fe = FeInput(**FE)
        for case_id in DATA["subjects"]:
            for f in (None, fe):
                facts = build_facts(DATA, case_id, f)
                self.assertIsNone(check(template_text(facts), facts), case_id)

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
        self.assertEqual(set(body), {"case_id", "facts", "text", "provider", "model", "fallbacks", "source"})
        self.assertEqual(set(body["facts"]), {
            "age", "arf0_percent", "arf0_higher_than", "cohort_n", "cohort_median_arf0_percent", "cohort_fractured",
            "fractured_arf0_min_percent", "fractured_arf0_max_percent", "msf_newtons", "msf_lower_than",
            "fall_force_low_newtons", "fall_force_high_newtons", "factor_of_risk_low", "factor_of_risk_high",
            "fractured_within_followup", "days_ct_to_fracture", "fe"})
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
