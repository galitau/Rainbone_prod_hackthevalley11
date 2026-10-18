"""Gemini key failover, per-key memory, no key failover on a rate limit, and saved Gemini answers
(services.llm_providers).

No network: every call goes to an httpx.MockTransport that answers per model and per key. The keys below are fake
and only ever sent to that transport. Saved answers go to a temporary AI_ANSWER_STORE file per test.
Run from backend/:  python -m unittest discover -s tests -t .
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock as umock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes_explain import router as explain_router  # noqa: E402
from services import explain as ex  # noqa: E402
from services import llm_providers  # noqa: E402
from services import risk as rk  # noqa: E402
from services.explain import ExplainRequest, explain  # noqa: E402
from services.llm_providers import GeminiProvider, gemini_keys  # noqa: E402

# Fake key shapes only. Each has a distinctive tail, so a leaked fragment of it would be found.
KEY1 = "FAKEKEY1-qT7vW2xR9mL4sK8pD3hJ6"
KEY2 = "FAKEKEY2-nB5cY1zV8gF0tQ7eU2wX4"
GROQ = "FAKEGROQ-Zr4Lm8Qp2Wt6Ys0Hv"
TWO_KEYS = {"GEMINI_API_KEY": KEY1, "GEMINI_API_KEYS": KEY2, "GROQ_API_KEY": GROQ}
SIM = {"max_von_mises_stress_mpa": 41.98, "average_youngs_modulus_gpa": 17.25, "bone_volume_cm3": 408.09,
       "fracture_risk_index_percent": 27.99, "load_newtons": 800.0}
GOOD = ("Like a bridge, a bone carries load through its material. In this model it carried 800 newtons, "
        "and the stress near the most loaded spots reached about 42 MPa.")
GOOD_GROQ = "A bone carries load like a bridge. Here it carried 800 newtons and the stress reached about 42 MPa."
GOOD_RISK = "A sideways fall would load this femur 2.17 to 3.18 times its strength in the study authors' model."
# No number, so it passes the checker for any facts (tests that vary the facts use these).
PLAIN = "A bone carries load the way a bridge does, through its material."
PLAIN_GROQ = "Like a bridge, a bone carries its load through its material."
PRIMARY, LITE = "gemini-3.8-flash", "gemini-3.5-flash-lite"
GROQ_HOST = "api.groq.com"
FE = {"peak_stress_mpa": 15.83, "load_newtons": 800.0, "stress_index_percent": 10.55}
SAVED_TIME = datetime(2026, 10, 18, 14, 5, 0, tzinfo=timezone.utc)


RESPONSE_ID, MODEL_VERSION = "test-response-id", "test-model-version"


def gemini_reply(text, ids=True):
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps({"text": text})}]}, "finishReason": "STOP"}]}
    if ids:  # what a real generateContent response carries besides the candidates
        body.update(responseId=RESPONSE_ID, modelVersion=MODEL_VERSION)
    return httpx.Response(200, json=body)


def groq_reply(text):
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"text": text})},
                                                  "finish_reason": "stop"}]})


class KeyMock:
    """Replies per (model, key label), e.g. {(PRIMARY, 1): httpx.Response(429)}; `gemini` answers the rest.

    `calls` lists (model, key label) for Gemini and "groq" for Groq, so a test reads the order without key text.
    """

    def __init__(self, replies=None, gemini=None, groq=None):
        self.replies, self.gemini, self.groq = dict(replies or {}), gemini, groq
        self.calls = []

    async def __call__(self, request):
        if request.url.host == GROQ_HOST:
            self.calls.append("groq")
            reply = self.groq
        else:
            model = request.url.path.split("/")[-1].split(":")[0]
            label = {KEY1: 1, KEY2: 2}[request.headers["x-goog-api-key"]]
            self.calls.append((model, label))
            reply = self.replies.get((model, label), self.gemini)
        if reply is None:
            raise AssertionError(f"unexpected call to {request.url}")
        if isinstance(reply, Exception):
            raise reply
        return reply

    def transport(self):
        return httpx.MockTransport(self)


class Clock:
    def __init__(self, start=1000.0):
        self.now = start

    def __call__(self):
        return self.now


class FailoverTestCase(unittest.TestCase):
    def setUp(self):
        ex.reset_cooldowns()
        rk.reset_cooldowns()
        self.clock = Clock()
        patchers = [umock.patch.object(llm_providers, "_now", self.clock),
                    umock.patch.object(llm_providers, "_wall_now", lambda: SAVED_TIME)]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.store = Path(folder.name) / "answers.json"
        self.env = {**TWO_KEYS, "AI_ANSWER_STORE": str(self.store)}
        for name in ("rainbowbone.explain", "rainbowbone.risk", "rainbowbone.llm"):
            logging.getLogger(name).disabled = True
            self.addCleanup(setattr, logging.getLogger(name), "disabled", False)

    def tearDown(self):
        ex.reset_cooldowns()
        rk.reset_cooldowns()

    def ask(self, mock, env=None, fields=None):
        ex._answers.clear()  # each call runs the chain, so a test sees the chain and not the in-memory answers
        return asyncio.run(explain(ExplainRequest(**(fields or SIM)), self.env if env is None else env,
                                   transport=mock.transport()))

    def ask_risk(self, mock, env=None):
        rk._answers.clear()
        return asyncio.run(rk.analyse(rk.RiskRequest(case_id="Pat001", fe=FE), self.env if env is None else env,
                                      data=rk.load_dataset(), transport=mock.transport()))


def reasons(result):
    return [(f.provider, f.reason) for f in result.fallbacks]


class KeyListTests(unittest.TestCase):
    def test_gemini_api_key_first_then_the_list_without_repeats_or_blanks(self):
        env = {"GEMINI_API_KEY": f" {KEY1} ", "GEMINI_API_KEYS": f"{KEY2}, ,{KEY1},{KEY2} ,"}
        self.assertEqual(gemini_keys(env), [KEY1, KEY2])
        self.assertEqual(gemini_keys({"GEMINI_API_KEYS": f"{KEY2},{KEY1}"}), [KEY2, KEY1])
        self.assertEqual(gemini_keys({"GEMINI_API_KEY": "  ", "GEMINI_API_KEYS": " , "}), [])

    def test_the_list_alone_configures_gemini(self):
        self.assertTrue(GeminiProvider({"GEMINI_API_KEYS": KEY2}).configured)
        self.assertFalse(GeminiProvider({"GEMINI_API_KEYS": " "}).configured)

    def test_repr_has_no_key(self):
        text = repr(GeminiProvider(TWO_KEYS)) + str(vars(GeminiProvider(TWO_KEYS)).keys())
        self.assertNotIn(KEY1, text)
        self.assertIn("keys=2", text)


class KeyFailoverTests(FailoverTestCase):
    def test_a_key_level_error_moves_to_the_next_key_for_the_same_model(self):
        for status in (400, 401, 403):
            with self.subTest(status=status):
                ex.reset_cooldowns()
                mock = KeyMock({(PRIMARY, 1): httpx.Response(status)}, gemini=gemini_reply(GOOD))
                result = self.ask(mock)
                self.assertEqual(mock.calls, [(PRIMARY, 1), (PRIMARY, 2)])
                self.assertEqual((result.provider, result.model, result.served), ("gemini", PRIMARY, "live"))
                self.assertEqual(reasons(result), [])

    def test_a_429_is_never_retried_with_another_key(self):
        mock = KeyMock({(PRIMARY, 1): httpx.Response(429)}, gemini=gemini_reply(GOOD))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), (LITE, 1)])  # key 2 is not used to get around the limit
        self.assertEqual((result.provider, result.model), ("gemini", LITE))
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: HTTP 429")])
        ex.reset_cooldowns()  # a 429 from key 2, after key 1 was refused, ends that model too
        self.store.unlink()  # so Groq answers, not the answer just saved
        mock = KeyMock({(PRIMARY, 1): httpx.Response(403), (PRIMARY, 2): httpx.Response(429),
                        (LITE, 1): httpx.Response(429)}, groq=groq_reply(GOOD_GROQ))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), (PRIMARY, 2), (LITE, 1), "groq"])
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: HTTP 403; key 2: HTTP 429"),
                                           ("gemini", f"{LITE}: key 1: HTTP 429")])

    def test_every_key_on_the_primary_before_the_lite_model_then_groq(self):
        mock = KeyMock(gemini=httpx.Response(403), groq=groq_reply(GOOD_GROQ))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), (PRIMARY, 2), (LITE, 1), (LITE, 2), "groq"])
        self.assertEqual(result.provider, "groq")
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: HTTP 403; key 2: HTTP 403"),
                                           ("gemini", f"{LITE}: key 1: HTTP 403; key 2: HTTP 403")])

    def test_the_lite_model_starts_again_from_key_1(self):
        mock = KeyMock({(PRIMARY, 1): httpx.Response(401), (PRIMARY, 2): httpx.Response(403)},
                       gemini=gemini_reply(GOOD))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), (PRIMARY, 2), (LITE, 1)])
        self.assertEqual((result.provider, result.model), ("gemini", LITE))

    def test_a_model_error_is_not_retried_with_another_key(self):
        for reply, reason in [(httpx.Response(503), "HTTP 503"), (httpx.Response(500), "HTTP 500")]:
            with self.subTest(reason=reason):
                ex.reset_cooldowns()
                mock = KeyMock({(PRIMARY, 1): reply}, gemini=gemini_reply(GOOD))
                result = self.ask(mock)
                self.assertEqual(mock.calls, [(PRIMARY, 1), (LITE, 1)])
                self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: {reason}")])

    def test_a_timeout_leaves_gemini_without_trying_the_next_key(self):
        mock = KeyMock({(PRIMARY, 1): httpx.ReadTimeout("slow")}, gemini=gemini_reply(GOOD),
                       groq=groq_reply(GOOD_GROQ))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), "groq"])
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: timed out after 10 s")])

    def test_one_key_keeps_the_old_reasons(self):
        env = {"GEMINI_API_KEY": KEY1, "GROQ_API_KEY": GROQ, "AI_ANSWER_STORE": str(self.store)}
        result = self.ask(KeyMock(gemini=httpx.Response(429), groq=groq_reply(GOOD_GROQ)), env)
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: HTTP 429"), ("gemini", f"{LITE}: HTTP 429")])


class PerKeyMemoryTests(FailoverTestCase):
    def test_a_refused_key_is_skipped_for_that_model_for_a_minute(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(403)}, gemini=gemini_reply(GOOD)))
        self.clock.now = 1000.0 + 59
        mock = KeyMock(gemini=gemini_reply(GOOD))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 2)])  # key 1 is not called for the primary
        self.assertEqual((result.model, reasons(result)), (PRIMARY, []))
        self.clock.now = 1000.0 + 61
        mock = KeyMock(gemini=gemini_reply(GOOD))
        self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1)])

    def test_a_429_cools_the_model_for_every_key_for_five_minutes(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(429)}, gemini=gemini_reply(GOOD)))
        for elapsed in (61, 299):
            with self.subTest(elapsed=elapsed):
                self.clock.now = 1000.0 + elapsed
                mock = KeyMock(gemini=gemini_reply(GOOD))
                result = self.ask(mock)
                self.assertEqual(mock.calls, [(LITE, 1)])  # neither key asks the primary
                self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: skipped: HTTP 429 less than 300 s ago")])
        self.clock.now = 1000.0 + 301
        mock = KeyMock(gemini=gemini_reply(GOOD))
        self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1)])

    def test_the_memory_is_per_model_so_key_1_still_asks_the_lite_model(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(403), (PRIMARY, 2): httpx.Response(403)},
                         gemini=gemini_reply(GOOD)))
        mock = KeyMock(gemini=gemini_reply(GOOD))
        result = self.ask(mock)
        self.assertEqual(mock.calls, [(LITE, 1)])
        skipped = "skipped: failed less than 60 s ago"
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: key 1: {skipped}; key 2: {skipped}")])

    def test_key_failures_do_not_cool_the_whole_model(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(403), (PRIMARY, 2): httpx.Response(401)},
                         gemini=gemini_reply(GOOD)))
        self.assertEqual(llm_providers._cooldowns, {})
        self.assertEqual(len(llm_providers._key_cooldowns), 2)
        for key_id, model in llm_providers._key_cooldowns:
            self.assertEqual(model, PRIMARY)
            self.assertNotIn(KEY1, key_id)
            self.assertNotIn(KEY2, key_id)
        self.clock.now += 61  # both keys may ask the primary again
        mock = KeyMock(gemini=gemini_reply(GOOD))
        self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1)])

    def test_a_new_key_is_tried_even_while_the_others_cool_down(self):
        env1 = {"GEMINI_API_KEY": KEY1, "GROQ_API_KEY": GROQ, "AI_ANSWER_STORE": str(self.store)}
        self.ask(KeyMock(gemini=httpx.Response(403), groq=groq_reply(GOOD_GROQ)), env1)
        mock = KeyMock(gemini=gemini_reply(GOOD))
        result = self.ask(mock)  # key 2 added (GEMINI_API_KEYS): asked although key 1 is still refused
        self.assertEqual(mock.calls, [(PRIMARY, 2)])
        self.assertEqual((result.provider, result.model, result.served), ("gemini", PRIMARY, "live"))

    def test_both_routes_share_the_key_memory(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(403)}, gemini=gemini_reply(GOOD)))
        mock = KeyMock(gemini=gemini_reply(GOOD_RISK))
        result = self.ask_risk(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 2)])
        self.assertEqual((result.provider, result.model), ("gemini", PRIMARY))


class NoKeyTextTests(FailoverTestCase):
    def fragments(self, key, size=6):
        return {key[i:i + size] for i in range(len(key) - size + 1)}

    def test_no_key_or_key_fragment_in_any_response_log_or_saved_file(self):
        for name in ("rainbowbone.explain", "rainbowbone.risk", "rainbowbone.llm"):
            logging.getLogger(name).disabled = False
        replies = {(PRIMARY, 1): httpx.Response(401, text=f"bad key {KEY1}"),
                   (PRIMARY, 2): httpx.Response(429, text=KEY2),
                   (LITE, 1): httpx.Response(403, json={"error": {"message": KEY1}}),
                   (LITE, 2): httpx.ConnectError(KEY2)}
        with self.assertLogs("rainbowbone", level="WARNING") as logs:
            first = self.ask(KeyMock(gemini=gemini_reply(GOOD)))  # saved under the store
            failed = self.ask(KeyMock(replies, groq=httpx.ConnectError(GROQ)))  # served from the store
            self.store.write_text("{not json " + KEY1)  # a damaged store is logged, never echoed
            third = self.ask(KeyMock(replies, groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((first.served, failed.served, third.provider), ("live", "saved", "groq"))
        logging.getLogger("rainbowbone.llm").disabled = True  # the next read reports the damaged file again
        self.clock.now += llm_providers.RATE_LIMIT_COOLDOWN_S + 1  # every key and model may be asked again
        rewrite = self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        self.assertEqual(rewrite.served, "live")  # and the damaged store was replaced
        dumped = "\n".join([first.model_dump_json(), failed.model_dump_json(), third.model_dump_json(),
                            *logs.output, self.store.read_text()])
        for key in (KEY1, KEY2, GROQ):
            for fragment in self.fragments(key):
                self.assertNotIn(fragment, dumped)
        self.assertIn("key 1", dumped)


class SavedAnswerTests(FailoverTestCase):
    def test_a_saved_gemini_answer_is_served_when_no_gemini_model_answers(self):
        live = self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        self.assertEqual((live.provider, live.model, live.served, live.saved_at), ("gemini", PRIMARY, "live", None))
        mock = KeyMock(gemini=httpx.Response(429), groq=groq_reply(GOOD_GROQ))
        saved = self.ask(mock)
        self.assertEqual(mock.calls, [(PRIMARY, 1), (LITE, 1)])  # Groq not called
        self.assertEqual((saved.provider, saved.model, saved.served), ("gemini", PRIMARY, "saved"))
        self.assertEqual(saved.saved_at, "2026-10-18T14:05:00+00:00")
        self.assertEqual(saved.text, live.text)
        self.assertEqual([f.provider for f in saved.fallbacks], ["gemini", "gemini"])  # why it is not live

    def test_an_entry_records_the_gemini_response_it_came_from(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        entry = next(iter(json.loads(self.store.read_text())["answers"].values()))
        self.assertEqual((entry["provider"], entry["model"], entry["response_id"], entry["model_version"]),
                         ("gemini", PRIMARY, RESPONSE_ID, MODEL_VERSION))

    def test_a_reply_without_its_response_id_or_model_version_is_not_saved(self):
        for body in ({"responseId": RESPONSE_ID}, {"modelVersion": MODEL_VERSION}, {}):
            with self.subTest(body=body):
                ex.reset_cooldowns()
                reply = gemini_reply(GOOD, ids=False)
                reply = httpx.Response(200, json={**reply.json(), **body})
                live = self.ask(KeyMock(gemini=reply))
                self.assertEqual((live.provider, live.served), ("gemini", "live"))
                self.assertFalse(self.store.exists())

    def test_only_the_gemini_provider_saves_or_serves_saved_answers(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        before = self.store.read_text()
        facts = ex.build_facts(ExplainRequest(**SIM))
        store = self.store

        class Other:  # another provider that happens to carry an answer_store
            name, key_name, model, timeout, configured, answer_store = "groq", "GROQ_API_KEY", "m", 1.0, True, store

            def __init__(self, reply):
                self.reply = reply

            async def generate(self, system, user):
                if isinstance(self.reply, Exception):
                    raise self.reply
                return self.reply

        def ask(reply):
            return asyncio.run(llm_providers.ask_models(
                [Other(reply)], ex.SYSTEM_PROMPT, ex.facts_json(facts), lambda t: ex.check(t, facts),
                lambda model, reason: None, kind="explain", facts=ex.facts_json(facts)))

        answer = ask(llm_providers.GeminiText(PLAIN, RESPONSE_ID, MODEL_VERSION))
        self.assertEqual((answer.text, answer.served), (PLAIN, "live"))
        self.assertEqual(self.store.read_text(), before)  # not saved
        self.assertIsNone(ask(llm_providers.ProviderError("HTTP 503", status=503)))  # nor served the Gemini entry

    def test_the_saved_answer_keeps_the_model_that_wrote_it(self):
        self.ask(KeyMock({(PRIMARY, 1): httpx.Response(503)}, gemini=gemini_reply(GOOD)))  # the lite model answers
        self.clock.now += 61
        saved = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((saved.provider, saved.model, saved.served), ("gemini", LITE, "saved"))

    def test_only_identical_facts_get_a_saved_answer(self):
        self.ask(KeyMock(gemini=gemini_reply(PLAIN)))
        failing = KeyMock(gemini=httpx.Response(503), groq=groq_reply(PLAIN_GROQ))
        other = self.ask(failing, fields={**SIM, "max_von_mises_stress_mpa": 42.0})
        self.assertEqual((other.provider, other.served), ("groq", "live"))
        self.clock.now += 61
        self.assertEqual(self.ask(failing, fields={**SIM, "load_newtons": 801.0}).provider, "groq")
        self.clock.now += 61
        self.assertEqual(self.ask(failing).served, "saved")  # the original facts still have theirs

    def test_another_route_or_prompt_gets_no_saved_answer(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        risk = self.ask_risk(KeyMock(gemini=httpx.Response(503), groq=httpx.Response(503)))
        self.assertEqual(risk.provider, "template")  # the explain answer is not a risk answer
        self.clock.now += 61
        with umock.patch.object(ex, "SYSTEM_PROMPT", ex.SYSTEM_PROMPT + " Be brief."):
            changed = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual(changed.provider, "groq")

    def test_risk_answers_are_saved_per_case_and_facts(self):
        self.ask_risk(KeyMock(gemini=gemini_reply(GOOD_RISK)))
        saved = self.ask_risk(KeyMock(gemini=httpx.Response(429), groq=groq_reply(GOOD_RISK)))
        self.assertEqual((saved.provider, saved.model, saved.served), ("gemini", PRIMARY, "saved"))
        self.assertEqual(saved.case_id, "Pat001")
        entry = next(iter(json.loads(self.store.read_text())["answers"].values()))
        self.assertEqual(entry["kind"], "risk-analysis")
        self.assertTrue(entry["facts"].startswith("Pat001:"))

    def test_a_saved_answer_that_no_longer_passes_the_checker_is_not_served(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        data = json.loads(self.store.read_text())
        for entry in data["answers"].values():
            entry["text"] = "The bone reached 61 MPa."  # a number that is not a fact
        self.store.write_text(json.dumps(data))
        result = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((result.provider, result.served), ("groq", "live"))

    def test_groq_and_template_answers_are_never_saved(self):
        self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.clock.now += 61
        self.ask(KeyMock(gemini=httpx.Response(503), groq=httpx.Response(503)))
        self.assertFalse(self.store.exists())

    def test_a_saved_answer_is_served_when_no_key_is_set(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        result = self.ask(KeyMock(), env={"AI_ANSWER_STORE": str(self.store)})
        self.assertEqual((result.provider, result.served), ("gemini", "saved"))
        self.assertEqual(reasons(result), [("gemini", "GEMINI_API_KEY not set")])

    def test_offline_mode_and_a_chain_without_gemini_never_serve_it(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        self.assertEqual(self.ask(KeyMock(), env={**self.env, "AI_OFFLINE": "1"}).provider, "template")
        result = self.ask(KeyMock(groq=groq_reply(GOOD_GROQ)), env={**self.env, "AI_CHAIN": "groq"})
        self.assertEqual(result.provider, "groq")

    def test_relative_store_path_is_under_backend(self):
        path = llm_providers.answer_store_path({"AI_ANSWER_STORE": "data/answers.json"})
        self.assertEqual(path, Path(llm_providers.__file__).resolve().parents[1] / "data" / "answers.json")
        self.assertEqual(llm_providers.answer_store_path({"AI_ANSWER_STORE": str(self.store)}), self.store)


class StoreRobustnessTests(FailoverTestCase):
    def test_a_damaged_store_never_fails_a_request(self):
        for content in ("{not json", "[]", '{"answers": []}', '{"answers": {"x": 5}}', "\x00\x01", ""):
            with self.subTest(content=content):
                ex.reset_cooldowns()
                self.store.write_text(content)
                failed = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
                self.assertEqual(failed.provider, "groq")
                self.clock.now += 61
                live = self.ask(KeyMock(gemini=gemini_reply(GOOD)))
                self.assertEqual(live.served, "live")
                self.assertEqual(len(json.loads(self.store.read_text())["answers"]), 1)  # rewritten whole

    def test_an_entry_with_wrong_fields_is_ignored(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        good = json.loads(self.store.read_text())
        for field, value in [("text", 5), ("model", ""), ("saved_at", "yesterday"), ("facts", "{}"),
                             ("kind", "risk-analysis"), ("provider", "groq"), ("provider", None),
                             ("response_id", ""), ("model_version", None)]:
            with self.subTest(field=field, value=value):
                ex.reset_cooldowns()
                data = json.loads(json.dumps(good))
                for entry in data["answers"].values():
                    entry[field] = value
                self.store.write_text(json.dumps(data))
                result = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
                self.assertEqual(result.provider, "groq")

    def test_an_unwritable_store_still_answers_live(self):
        blocker = self.store.parent / "file"
        blocker.write_text("x")
        env = {**self.env, "AI_ANSWER_STORE": str(blocker / "answers.json")}  # its folder is a file
        result = self.ask(KeyMock(gemini=gemini_reply(GOOD)), env)
        self.assertEqual((result.provider, result.served), ("gemini", "live"))

    def test_a_failed_write_keeps_the_old_file_and_leaves_no_temporary_file(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        before = self.store.read_text()
        with umock.patch.object(llm_providers.json, "dump", side_effect=OSError("disk full")):
            result = self.ask(KeyMock(gemini=gemini_reply(PLAIN)), fields={**SIM, "load_newtons": 801.0})
        self.assertEqual((result.provider, result.served), ("gemini", "live"))
        self.assertEqual(self.store.read_text(), before)
        self.assertEqual(sorted(p.name for p in self.store.parent.iterdir()), ["answers.json"])

    def test_writes_replace_the_file_whole(self):
        with umock.patch.object(llm_providers.os, "replace", wraps=os.replace) as replace:
            self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        replace.assert_called_once()
        source, target = replace.call_args.args
        self.assertEqual((Path(source).parent, Path(target)), (self.store.parent, self.store))
        self.assertEqual(sorted(p.name for p in self.store.parent.iterdir()), ["answers.json"])

    def test_the_store_is_bounded(self):
        with umock.patch.object(llm_providers, "ANSWER_STORE_MAX", 3):
            for load in range(5):
                saved_at = SAVED_TIME.replace(minute=load)
                with umock.patch.object(llm_providers, "_wall_now", lambda: saved_at):
                    result = self.ask(KeyMock(gemini=gemini_reply(PLAIN)), fields={**SIM, "load_newtons": 800.0 + load})
                self.assertEqual(result.provider, "gemini")
        entries = json.loads(self.store.read_text())["answers"].values()
        self.assertEqual(sorted(json.loads(e["facts"])["load_newtons"] for e in entries), [802.0, 803.0, 804.0])


class ChainOrderTests(FailoverTestCase):
    """gemini (live) -> gemini (saved) -> groq -> template."""

    def test_the_chain_order(self):
        live = self.ask(KeyMock(gemini=gemini_reply(GOOD), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((live.provider, live.served), ("gemini", "live"))
        saved = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((saved.provider, saved.served), ("gemini", "saved"))
        self.store.unlink()
        self.clock.now += 61
        groq = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
        self.assertEqual((groq.provider, groq.served, groq.saved_at), ("groq", "live", None))
        self.clock.now += 61
        template = self.ask(KeyMock(gemini=httpx.Response(503), groq=httpx.Response(503)))
        self.assertEqual((template.provider, template.model, template.served), ("template", None, "live"))

    def test_a_live_answer_from_memory_says_cached_and_a_saved_one_is_kept_a_minute(self):
        mock = KeyMock(gemini=gemini_reply(GOOD))
        ex._answers.clear()
        transport = mock.transport()
        first = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        again = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        self.assertEqual((first.served, again.served, again.model, len(mock.calls)), ("live", "cached", PRIMARY, 1))

        ex._answers.clear()
        failing = KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ))
        transport = failing.transport()
        saved = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        self.assertEqual(saved.served, "saved")
        self.clock.now += llm_providers.OTHER_ANSWER_TTL_S - 1
        kept = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        self.assertEqual((kept.served, kept.saved_at), ("saved", saved.saved_at))  # still says saved
        self.assertEqual(len(failing.calls), 2)
        self.clock.now += 2  # past the minute and the 60 s model cooldown: Gemini is asked live again
        recovered = KeyMock(gemini=gemini_reply(GOOD))
        live = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=recovered.transport()))
        self.assertEqual((live.served, recovered.calls), ("live", [(PRIMARY, 1)]))

    def test_a_saved_answer_is_not_written_to_the_ai_log(self):
        logged = []

        async def log_answer(env, endpoint, case_id, answer, *rest):
            logged.append((endpoint, answer.served))
            return None

        with umock.patch.object(ex.ai_log, "log_answer", log_answer):
            live = self.ask(KeyMock(gemini=gemini_reply(GOOD)))
            saved = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_GROQ)))
            self.clock.now += 61
            self.ask_risk(KeyMock(gemini=gemini_reply(GOOD_RISK)))
            risk_saved = self.ask_risk(KeyMock(gemini=httpx.Response(503), groq=groq_reply(GOOD_RISK)))
        self.assertEqual((live.served, saved.served, risk_saved.served), ("live", "saved", "saved"))
        self.assertEqual((saved.logged, risk_saved.logged), (None, None))
        self.assertEqual(logged, [("explain", "live"), ("risk-analysis", "live")])  # no model was called for a saved one

    def test_the_route_returns_served_and_saved_at(self):
        self.ask(KeyMock(gemini=gemini_reply(GOOD)))
        ex._answers.clear()
        failing = KeyMock(gemini=httpx.Response(429), groq=groq_reply(GOOD_GROQ))
        app = FastAPI()
        app.include_router(explain_router)
        app.dependency_overrides[ex.runtime_env] = lambda: self.env
        original = ex.build_providers
        with umock.patch.object(ex, "build_providers", lambda env, transport=None: original(env, failing.transport())):
            body = TestClient(app).post("/api/explain", json=SIM).json()
        self.assertEqual((body["provider"], body["model"], body["served"]), ("gemini", PRIMARY, "saved"))
        self.assertEqual(body["saved_at"], "2026-10-18T14:05:00+00:00")


if __name__ == "__main__":
    unittest.main()
