"""POST /api/explain: chain order, fall-through, checker, offline template, request validation.

No network: every provider call goes to an httpx.MockTransport. Tests pass an explicit env
mapping, so keys in the developer's environment or backend/.env are never read.
Run from backend/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock as umock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes_explain import router  # noqa: E402
from services import explain as ex  # noqa: E402
from services.explain import (ChainConfigError, ExplainRequest, build_facts, check, explain,  # noqa: E402
                              template_text)
from services.llm_providers import OUTPUT_SCHEMA, GeminiProvider, GroqProvider  # noqa: E402

# Fake key shapes only; they never leave the process.
KEYS = {"GEMINI_API_KEY": "fake-gemini-key-0000000000", "GROQ_API_KEY": "fake-groq-key-0000000000"}
# Test data in the SimulationResponse shape; not a solver output.
SIM = {
    "max_von_mises_stress_mpa": 41.98,
    "average_youngs_modulus_gpa": 17.25,
    "bone_volume_cm3": 408.09,
    "fracture_risk_index_percent": 27.99,
    "load_newtons": 800.0,
    "mesh_vertices": 17361,
    "mesh_faces": 60819,
    "source_filename": "test-femur.nii.gz",
}
GOOD = ("Like a bridge, a bone carries load through its material. In this model it carried 800 newtons, "
        "and the stress near the most loaded spots reached about 42 MPa.")
GEMINI_HOST, GROQ_HOST = "generativelanguage.googleapis.com", "api.groq.com"
PRIMARY, LITE = "gemini-3.8-flash", "gemini-3.5-flash-lite"


def gemini_reply(text, finish="STOP"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps({"text": text})}]},
                                                     "finishReason": finish}]})


def groq_reply(text, finish="stop"):
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"text": text})},
                                                  "finish_reason": finish}]})


class Mock:
    """Scripted replies (a Response, an exception, or a coroutine function) per Gemini model and for Groq.

    `gemini` answers every Gemini model unless `lite` is given for the fallback model.
    """

    def __init__(self, gemini=None, groq=None, lite="same"):
        self.gemini, self.groq = gemini, groq
        self.lite = gemini if lite == "same" else lite
        self.requests = []

    async def __call__(self, request):
        self.requests.append(request)
        if request.url.host == GROQ_HOST:
            reply = self.groq
        else:
            reply = self.lite if f"/models/{LITE}:" in request.url.path else self.gemini
        if reply is None:
            raise AssertionError(f"unexpected call to {request.url}")
        if isinstance(reply, Exception):
            raise reply
        if callable(reply):
            return await reply(request)
        return reply

    @property
    def calls(self):
        return [r.url.host if r.url.host == GROQ_HOST else r.url.path.split("/")[-1].split(":")[0]
                for r in self.requests]

    def transport(self):
        return httpx.MockTransport(self)


def run(request_fields, env, mock=None):
    transport = (mock or Mock()).transport()
    return asyncio.run(explain(ExplainRequest(**request_fields), env, transport=transport))


def reasons(result):
    return [(f.provider, f.reason) for f in result.fallbacks]


class ExplainTestCase(unittest.TestCase):
    def setUp(self):
        ex.reset_cooldowns()
        logging.getLogger("rainbowbone.explain").disabled = True

    def tearDown(self):
        ex.reset_cooldowns()
        logging.getLogger("rainbowbone.explain").disabled = False


class ChainOrderTests(ExplainTestCase):
    def test_no_keys_gives_template_and_says_why(self):
        mock = Mock()
        result = run(SIM, {}, mock)
        self.assertEqual((result.provider, result.model), ("template", None))
        self.assertEqual([f.model_dump() for f in result.fallbacks], [
            {"provider": "gemini", "reason": "GEMINI_API_KEY not set"},
            {"provider": "groq", "reason": "GROQ_API_KEY not set"}])
        self.assertEqual(mock.requests, [])

    def test_gemini_is_tried_first_and_gets_numbers_only(self):
        mock = Mock(gemini=gemini_reply(GOOD), groq=groq_reply(GOOD))
        result = run(SIM, KEYS, mock)
        self.assertEqual((result.provider, result.model, result.fallbacks), ("gemini", PRIMARY, []))
        self.assertEqual(result.text, f"{GOOD} {ex.NOTE}")
        self.assertEqual(mock.calls, [PRIMARY])
        request = mock.requests[0]
        self.assertEqual(str(request.url),
                         f"https://generativelanguage.googleapis.com/v1beta/models/{PRIMARY}:generateContent")
        self.assertEqual(request.headers["x-goog-api-key"], KEYS["GEMINI_API_KEY"])
        self.assertNotIn("key=", str(request.url))
        body = json.loads(request.content)
        self.assertEqual(body["systemInstruction"], {"parts": [{"text": ex.SYSTEM_PROMPT}]})
        self.assertEqual(body["generationConfig"], {"responseMimeType": "application/json",
                                                    "responseJsonSchema": OUTPUT_SCHEMA,
                                                    "thinkingConfig": {"thinkingLevel": "LOW"}})
        sent = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(sent, {"load_newtons": 800.0, "max_von_mises_stress_mpa": 41.98,
                                "average_youngs_modulus_gpa": 17.25, "bone_volume_cm3": 408.09,
                                "illustrative_index_percent": 27.99})
        self.assertNotIn(SIM["source_filename"], request.content.decode())
        self.assertNotIn(str(SIM["mesh_faces"]), request.content.decode())

    def test_gemini_http_error_tries_the_fallback_model(self):
        mock = Mock(gemini=httpx.Response(429), lite=gemini_reply(GOOD), groq=groq_reply(GOOD))
        result = run(SIM, KEYS, mock)
        self.assertEqual((result.provider, result.model), ("gemini", LITE))
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: HTTP 429")])
        self.assertEqual(mock.calls, [PRIMARY, LITE])

    def test_gemini_model_env_and_no_duplicate_fallback(self):
        mock = Mock(gemini=httpx.Response(429), groq=groq_reply(GOOD))
        result = run(SIM, {**KEYS, "GEMINI_MODEL": LITE}, mock)
        self.assertEqual(result.provider, "groq")
        self.assertEqual(mock.calls, [LITE, GROQ_HOST])

    def test_groq_request_shape_and_model_env(self):
        mock = Mock(groq=groq_reply(GOOD))
        result = run(SIM, {"GROQ_API_KEY": KEYS["GROQ_API_KEY"], "GROQ_MODEL": "some/other-model"}, mock)
        self.assertEqual((result.provider, result.model), ("groq", "some/other-model"))
        request = mock.requests[0]
        self.assertEqual(str(request.url), "https://api.groq.com/openai/v1/chat/completions")
        self.assertEqual(request.headers["authorization"], f"Bearer {KEYS['GROQ_API_KEY']}")
        body = json.loads(request.content)
        self.assertEqual(body["model"], "some/other-model")
        self.assertEqual(body["response_format"], {"type": "json_schema", "json_schema": {
            "name": "explanation", "strict": True, "schema": OUTPUT_SCHEMA}})
        self.assertEqual([m["role"] for m in body["messages"]], ["system", "user"])
        self.assertEqual(GroqProvider({}).model, "openai/gpt-oss-120b")
        self.assertEqual(GeminiProvider({}).model, PRIMARY)

    def test_ai_chain_reorders_and_template_is_appended(self):
        mock = Mock(gemini=gemini_reply(GOOD), groq=groq_reply(GOOD))
        result = run(SIM, {**KEYS, "AI_CHAIN": "groq,gemini"}, mock)
        self.assertEqual(result.provider, "groq")
        self.assertEqual(mock.calls, [GROQ_HOST])
        self.assertEqual(ex.chain_order({"AI_CHAIN": " Gemini "}), ("gemini", "template"))
        self.assertEqual(ex.chain_order({}), ("gemini", "groq", "template"))
        self.assertEqual(ex.chain_order({"AI_CHAIN": "", "AI_OFFLINE": "0"}), ("gemini", "groq", "template"))

    def test_ai_chain_template_and_offline_make_no_calls(self):
        for env in ({**KEYS, "AI_CHAIN": "template"}, {**KEYS, "AI_OFFLINE": "1"}):
            mock = Mock()
            result = run(SIM, env, mock)
            self.assertEqual((result.provider, result.fallbacks), ("template", []))
            self.assertEqual(mock.requests, [])

    def test_bad_chain_config_is_refused(self):
        for env in ({"AI_CHAIN": "gemini,vultr"}, {"AI_CHAIN": "groq,groq"}, {"AI_CHAIN": "template,gemini"},
                    {"AI_OFFLINE": "yes"}):
            with self.assertRaises(ChainConfigError):
                ex.chain_order(env)


class FallThroughTests(ExplainTestCase):
    def assert_falls_to_groq(self, gemini, reasons_expected, calls):
        ex.reset_cooldowns()
        mock = Mock(gemini=gemini, groq=groq_reply(GOOD))
        result = run(SIM, KEYS, mock)
        self.assertEqual(result.provider, "groq")
        self.assertEqual(mock.calls, calls)
        self.assertEqual(reasons(result), reasons_expected)
        return result

    def test_http_errors_try_both_gemini_models(self):
        for status in (400, 404, 429, 500, 503):
            with self.subTest(status=status):
                self.assert_falls_to_groq(
                    httpx.Response(status, json={"error": {"message": "x"}}),
                    [("gemini", f"{PRIMARY}: HTTP {status}"), ("gemini", f"{LITE}: HTTP {status}")],
                    [PRIMARY, LITE, GROQ_HOST])

    def test_transport_timeout_leaves_gemini(self):
        self.assert_falls_to_groq(httpx.ReadTimeout("slow"), [("gemini", f"{PRIMARY}: timed out after 10 s")],
                                  [PRIMARY, GROQ_HOST])

    def test_connection_error_leaves_gemini(self):
        self.assert_falls_to_groq(httpx.ConnectError("refused"), [("gemini", f"{PRIMARY}: ConnectError")],
                                  [PRIMARY, GROQ_HOST])

    def test_slow_provider_hits_the_hard_timeout(self):
        async def slow(request):
            await asyncio.sleep(2)
            return gemini_reply(GOOD)

        mock = Mock(gemini=slow, groq=groq_reply(GOOD))
        transport = mock.transport()
        providers = {"gemini": [GeminiProvider(KEYS, transport, timeout=0.05)], "groq": [GroqProvider(KEYS, transport)]}
        result = asyncio.run(explain(ExplainRequest(**SIM), KEYS, providers=providers))
        self.assertEqual(result.provider, "groq")
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: timed out after 0.05 s")])

    def test_failed_model_is_skipped_during_cooldown(self):
        first = Mock(gemini=httpx.ReadTimeout("slow"), groq=groq_reply(GOOD))
        self.assertEqual(run(SIM, KEYS, first).provider, "groq")
        second = Mock(gemini=gemini_reply(GOOD), lite=gemini_reply(GOOD))
        result = run(SIM, KEYS, second)
        self.assertEqual(second.calls, [LITE])
        self.assertEqual(result.model, LITE)
        self.assertEqual(reasons(result), [("gemini", f"{PRIMARY}: skipped: failed less than 60 s ago")])

    def test_rejected_text_does_not_start_a_cooldown(self):
        run(SIM, KEYS, Mock(gemini=gemini_reply("About 61 MPa."), groq=groq_reply(GOOD)))
        mock = Mock(gemini=gemini_reply(GOOD))
        self.assertEqual(run(SIM, KEYS, mock).model, PRIMARY)

    def test_invented_number_is_rejected(self):
        self.assert_falls_to_groq(gemini_reply("The bone lost 60% of its strength at 800 newtons."),
                                  [("gemini", f"{PRIMARY}: rejected: number not in input: 60")],
                                  [PRIMARY, GROQ_HOST])

    def test_spelled_out_and_clinical_wording_rejected(self):
        for text, reason in [("Stress was twice as high.", "spelled-out quantity: 'twice'"),
                             ("This is a fracture.", "blocked wording: 'fractur'"),
                             ("The fracture risk index is 27.99%.", "blocked wording: 'risk'"),
                             ("You should rest.", "blocked wording: 'should'")]:
            with self.subTest(text=text):
                self.assert_falls_to_groq(gemini_reply(text), [("gemini", f"{PRIMARY}: rejected: {reason}")],
                                          [PRIMARY, GROQ_HOST])

    def test_malformed_output_rejected(self):
        for reply, reason in [
            (httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "plain words"}]}}]}),
             "invalid output: not JSON"),
            (httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "{\"words\": \"x\"}"}]}}]}),
             "invalid output: no text field"),
            (gemini_reply("  "), "invalid output: empty text"),
            (gemini_reply(GOOD, finish="MAX_TOKENS"), "cut off at the token limit"),
            (gemini_reply(GOOD, finish="SAFETY"), "finished with SAFETY"),
            (httpx.Response(200, json={"promptFeedback": {}}), "no candidates in the response"),
            (httpx.Response(200, text="<html>"), "response is not JSON"),
        ]:
            with self.subTest(reason=reason):
                self.assert_falls_to_groq(reply, [("gemini", f"{PRIMARY}: {reason}")], [PRIMARY, GROQ_HOST])

    def test_every_provider_failing_gives_template_with_reasons(self):
        mock = Mock(gemini=httpx.Response(503), groq=groq_reply("About 61 MPa."))
        result = run(SIM, KEYS, mock)
        self.assertEqual(result.provider, "template")
        self.assertEqual(reasons(result), [
            ("gemini", f"{PRIMARY}: HTTP 503"), ("gemini", f"{LITE}: HTTP 503"),
            ("groq", "openai/gpt-oss-120b: rejected: number not in input: 61")])

    def test_groq_timeout_and_length_finish_fall_to_template(self):
        for reply, reason in [(httpx.ReadTimeout("slow"), "timed out after 8 s"),
                              (groq_reply(GOOD, finish="length"), "cut off at the token limit")]:
            with self.subTest(reason=reason):
                ex.reset_cooldowns()
                result = run(SIM, {"GROQ_API_KEY": KEYS["GROQ_API_KEY"]}, Mock(groq=reply))
                self.assertEqual(result.provider, "template")
                self.assertEqual(reasons(result)[-1], ("groq", f"openai/gpt-oss-120b: {reason}"))

    def test_keys_never_in_response_or_logs(self):
        logging.getLogger("rainbowbone.explain").disabled = False
        mock = Mock(gemini=httpx.Response(401, text=KEYS["GEMINI_API_KEY"]), groq=httpx.ConnectError(KEYS["GROQ_API_KEY"]))
        with self.assertLogs("rainbowbone.explain", level="WARNING") as logs:
            result = run(SIM, KEYS, mock)
        self.assertEqual(result.provider, "template")
        dumped = result.model_dump_json() + "\n".join(logs.output)
        for key in KEYS.values():
            self.assertNotIn(key, dumped)


class CheckerTests(unittest.TestCase):
    facts = build_facts(ExplainRequest(**SIM))

    def test_facts_and_their_roundings_pass(self):
        for text in ["Stress was 41.98 MPa.", "Stress was 42.0 MPa.", "Stress was 42 MPa.", "Stiffness 17.2 GPa.",
                     "Stiffness 17 GPa.", "An index of 28%.", "A 800 N load on 408 cm3 of bone."]:
            with self.subTest(text=text):
                self.assertIsNone(check(text, self.facts))

    def test_other_numbers_fail(self):
        for text, token in [("Stress was 41.9 MPa.", "41.9"), ("About 5 mm.", "5"), ("Up 1,000 MPa.", "1,000"),
                            ("Load 15mm wide.", "15"), ("A 3D model.", "3"), ("It is 0.8 kN.", "0.8"),
                            ("The 17361 mesh points.", "17361")]:
            with self.subTest(text=text):
                self.assertEqual(check(text, self.facts), f"number not in input: {token}")

    def test_units_are_not_numbers(self):
        self.assertIsNone(check("Volume 408.09 cm3 and cm³.", self.facts))

    def test_length_limit(self):
        self.assertEqual(check("a" * (ex.MAX_CHARS + 1), self.facts), f"over {ex.MAX_CHARS} characters")


class TemplateTests(ExplainTestCase):
    def test_template_is_deterministic_offline_and_plain(self):
        a = run(SIM, {"AI_OFFLINE": "1"})
        b = run(SIM, {"AI_OFFLINE": "1"})
        self.assertEqual(a, b)
        self.assertTrue(a.text.startswith("A bone carries load the way a bridge does"))
        for part in ["408 cm³ of bone", "800 newtons", "reached 42 MPa", "17.2 GPa", "index of 28% is illustrative",
                     ex.NOTE]:
            self.assertIn(part, a.text)

    def test_template_passes_the_checker_for_varied_inputs(self):
        rng = random.Random(7)
        edges = [0.0, 0.004, 0.005, 0.01, 9.995, 99.95, 99.995, 9999.5]
        for _ in range(3000):
            fields = {
                "max_von_mises_stress_mpa": rng.choice(edges + [1e6, rng.uniform(0, 500)]),
                "average_youngs_modulus_gpa": rng.choice(edges + [1e4, rng.uniform(0, 30)]),
                "bone_volume_cm3": rng.choice(edges + [1e5, rng.uniform(0, 2000)]),
                "fracture_risk_index_percent": rng.choice(edges[:6] + [100.0, rng.uniform(0, 100)]),
            }
            if rng.random() < 0.7:
                fields["load_newtons"] = rng.choice(edges + [1e6, rng.uniform(0, 5000)])
            facts = build_facts(ExplainRequest(**fields))
            text = template_text(facts)
            self.assertIsNone(check(text, facts), text)

    def test_note_follows_a_full_stop(self):
        mock = Mock(gemini=gemini_reply("A bone carries 800 newtons"))
        self.assertEqual(run(SIM, KEYS, mock).text, f"A bone carries 800 newtons. {ex.NOTE}")


class RouteTests(ExplainTestCase):
    def client(self, env):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[ex.runtime_env] = lambda: env
        return TestClient(app)

    def test_a_simulate_response_is_accepted_as_is(self):
        from main import SimulationResponse

        self.assertEqual(set(ExplainRequest.model_fields), set(SimulationResponse.model_fields))
        payload = SimulationResponse(**SIM).model_dump()
        response = self.client({}).post("/api/explain", json=payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {"text", "provider", "model", "fallbacks"})
        self.assertEqual((body["provider"], body["model"]), ("template", None))
        self.assertEqual(body["fallbacks"][0], {"provider": "gemini", "reason": "GEMINI_API_KEY not set"})

    def test_metrics_only_and_default_load(self):
        fields = {k: SIM[k] for k in ("max_von_mises_stress_mpa", "average_youngs_modulus_gpa", "bone_volume_cm3",
                                      "fracture_risk_index_percent")}
        response = self.client({}).post("/api/explain", json={**fields, "unknown_field": "ignored"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("800 newtons", response.json()["text"])

    def test_integers_are_accepted_for_decimal_fields(self):
        payload = {"max_von_mises_stress_mpa": 42, "average_youngs_modulus_gpa": 17, "bone_volume_cm3": 408,
                   "fracture_risk_index_percent": 28, "load_newtons": 800}
        response = self.client({}).post("/api/explain", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn("reached 42 MPa", response.json()["text"])

    def test_invalid_requests_are_422(self):
        client = self.client({})
        for payload in [{}, {"load_newtons": 800}, {**SIM, "max_von_mises_stress_mpa": -1},
                        {**SIM, "fracture_risk_index_percent": 100.5}, {**SIM, "bone_volume_cm3": "408"},
                        {**SIM, "average_youngs_modulus_gpa": True}, {**SIM, "mesh_faces": 1.5},
                        {**SIM, "source_filename": 5}, {**SIM, "load_newtons": -800}]:
            with self.subTest(payload=payload):
                self.assertEqual(client.post("/api/explain", json=payload).status_code, 422)

    def test_non_finite_numbers_are_refused(self):
        for value in (float("nan"), float("inf")):
            with self.assertRaises(ValidationError):
                ExplainRequest(**{**SIM, "max_von_mises_stress_mpa": value})

    def test_bad_chain_config_is_500_with_reason(self):
        response = self.client({"AI_CHAIN": "gpt"}).post("/api/explain", json=SIM)
        self.assertEqual(response.status_code, 500)
        self.assertIn("unknown provider 'gpt'", response.json()["detail"])

    def test_main_app_serves_explain_and_keeps_existing_routes(self):
        from main import app

        self.assertTrue({"/health", "/api/simulate", "/api/explain"} <= set(app.openapi()["paths"]))
        app.dependency_overrides[ex.runtime_env] = lambda: {"AI_OFFLINE": "1"}
        try:
            with TestClient(app) as client:
                self.assertEqual(client.get("/health").json(), {"status": "ok", "service": "rainbowbone-fea"})
                self.assertEqual(client.post("/api/explain", json=SIM).json()["provider"], "template")
        finally:
            app.dependency_overrides.clear()


class RuntimeEnvTests(unittest.TestCase):
    def test_backend_env_file_is_read_and_process_env_wins(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, ".env").write_text("GROQ_MODEL=from-file\nAI_OFFLINE=1\n", encoding="utf-8")
            with umock.patch.object(ex, "BACKEND_DIR", Path(folder)), \
                    umock.patch.dict(os.environ, {"AI_OFFLINE": "0"}, clear=True):
                env = ex.runtime_env()
        self.assertEqual((env["GROQ_MODEL"], env["AI_OFFLINE"]), ("from-file", "0"))

    def test_no_env_file_is_fine(self):
        with tempfile.TemporaryDirectory() as folder:
            with umock.patch.object(ex, "BACKEND_DIR", Path(folder)), \
                    umock.patch.dict(os.environ, {"AI_CHAIN": "template"}, clear=True):
                self.assertEqual(ex.runtime_env(), {"AI_CHAIN": "template"})


if __name__ == "__main__":
    unittest.main()
