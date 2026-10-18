"""Token usage of AI answers: Gemini usageMetadata and Groq usage parsing (services.llm_providers) and the `usage`
object of POST /api/explain and /api/risk-analysis (live, cached, saved, template, missing usage).

No network: every call goes to an httpx.MockTransport (the KeyMock of test_gemini_failover), with fake keys.
Run from backend/:  python -m unittest discover -s tests -t .
"""
from __future__ import annotations

import asyncio
import json
import unittest
from unittest import mock as umock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes_explain import router as explain_router
from routes_risk import router as risk_router
from services import explain as ex
from services import risk as rk
from services.explain import ExplainRequest, explain
from services.llm_providers import GeminiProvider, GroqProvider, gemini_usage, openai_usage, usage_of
from services.settings import runtime_env
from tests.test_gemini_failover import (FE, GOOD, GOOD_GROQ, GOOD_RISK, GROQ, KEY1, PRIMARY, SIM, FailoverTestCase,
                                        KeyMock, gemini_reply)

# A generateContent usageMetadata as the REST API sends it (ai.google.dev/api/generate-content#UsageMetadata):
# totalTokenCount is prompt + tool-use prompt + thoughts + response candidates.
GEMINI_META = {"promptTokenCount": 480, "candidatesTokenCount": 92, "thoughtsTokenCount": 40, "totalTokenCount": 612}
GEMINI_USAGE = {"prompt_tokens": 480, "output_tokens": 132, "thinking_tokens": 40, "total_tokens": 612}
GROQ_BLOCK = {"prompt_tokens": 300, "completion_tokens": 120, "total_tokens": 420}


def gemini_with_usage(text, meta=GEMINI_META):
    reply = gemini_reply(text)
    body = reply.json()
    if meta is not None:
        body["usageMetadata"] = meta
    return httpx.Response(200, json=body)


def groq_with_usage(text, usage=GROQ_BLOCK):
    body = {"choices": [{"message": {"content": json.dumps({"text": text})}, "finish_reason": "stop"}]}
    if usage is not None:
        body["usage"] = usage
    return httpx.Response(200, json=body)


class ParsingTests(unittest.TestCase):
    def test_gemini_usage_metadata(self):
        self.assertEqual(gemini_usage({"usageMetadata": GEMINI_META}), GEMINI_USAGE)

    def test_gemini_without_thinking_tokens(self):
        meta = {"promptTokenCount": 480, "candidatesTokenCount": 132, "totalTokenCount": 612}
        self.assertEqual(gemini_usage({"usageMetadata": meta}),
                         {"prompt_tokens": 480, "output_tokens": 132, "thinking_tokens": None, "total_tokens": 612})

    def test_gemini_total_missing_is_the_sum_of_what_was_reported(self):
        meta = {"promptTokenCount": 480, "candidatesTokenCount": 92, "thoughtsTokenCount": 40}
        self.assertEqual(gemini_usage({"usageMetadata": meta})["total_tokens"], 612)

    def test_missing_or_malformed_usage_is_none_or_unknown(self):
        for data in (None, [], "x", {}, {"usageMetadata": None}, {"usageMetadata": {}}, {"usageMetadata": [1, 2]},
                     {"usageMetadata": {"promptTokenCount": "480", "totalTokenCount": -1}},
                     {"usageMetadata": {"promptTokenCount": True}}):
            with self.subTest(data=data):
                self.assertIsNone(gemini_usage(data))
        partial = gemini_usage({"usageMetadata": {"promptTokenCount": 480, "candidatesTokenCount": "92"}})
        self.assertEqual(partial, {"prompt_tokens": 480, "output_tokens": None, "thinking_tokens": None,
                                   "total_tokens": None})

    def test_groq_usage(self):
        self.assertEqual(openai_usage({"usage": GROQ_BLOCK}),
                         {"prompt_tokens": 300, "output_tokens": 120, "thinking_tokens": None, "total_tokens": 420})
        for data in (None, {}, {"usage": None}, {"usage": {}}, {"usage": {"prompt_tokens": 1.5}}):
            with self.subTest(data=data):
                self.assertIsNone(openai_usage(data))

    def test_usage_of_plain_text_is_none(self):
        self.assertIsNone(usage_of("text"))


class ProviderTests(unittest.TestCase):
    def generate(self, provider):
        return asyncio.run(provider.generate("system", "user"))

    def test_gemini_text_carries_its_usage(self):
        mock = KeyMock(gemini=gemini_with_usage(GOOD))
        text = self.generate(GeminiProvider({"GEMINI_API_KEY": KEY1}, mock.transport()))
        self.assertEqual((str(text), text.usage), (GOOD, GEMINI_USAGE))

    def test_a_gemini_reply_without_usage_still_answers(self):
        mock = KeyMock(gemini=gemini_with_usage(GOOD, meta=None))
        text = self.generate(GeminiProvider({"GEMINI_API_KEY": KEY1}, mock.transport()))
        self.assertEqual((str(text), text.usage), (GOOD, None))

    def test_groq_text_carries_its_usage_and_answers_without_it(self):
        provider = GroqProvider({"GROQ_API_KEY": GROQ}, KeyMock(groq=groq_with_usage(GOOD_GROQ)).transport())
        self.assertEqual(self.generate(provider).usage["total_tokens"], 420)
        provider = GroqProvider({"GROQ_API_KEY": GROQ}, KeyMock(groq=groq_with_usage(GOOD_GROQ, None)).transport())
        text = self.generate(provider)
        self.assertEqual((str(text), text.usage), (GOOD_GROQ, None))


class ResponseUsageTests(FailoverTestCase):
    def test_a_live_gemini_answer_reports_its_tokens(self):
        result = self.ask(KeyMock(gemini=gemini_with_usage(GOOD)))
        self.assertEqual((result.provider, result.served), ("gemini", "live"))
        self.assertEqual(result.usage.model_dump(), {**GEMINI_USAGE, "provider": "gemini", "model": PRIMARY,
                                                     "source": "live", "served": "live", "new_tokens": 612})

    def test_a_kept_answer_reports_the_tokens_it_was_written_with_and_no_new_ones(self):
        mock = KeyMock(gemini=gemini_with_usage(GOOD))
        ex._answers.clear()
        transport = mock.transport()
        first = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        again = asyncio.run(explain(ExplainRequest(**SIM), self.env, transport=transport))
        self.assertEqual(len(mock.calls), 1)
        self.assertEqual((first.usage.served, first.usage.new_tokens), ("live", 612))
        self.assertEqual((again.served, again.usage.served, again.usage.new_tokens, again.usage.total_tokens),
                         ("cached", "cached", 0, 612))

    def test_a_saved_answer_keeps_the_usage_of_the_call_that_wrote_it(self):
        self.ask(KeyMock(gemini=gemini_with_usage(GOOD)))
        entry = next(iter(json.loads(self.store.read_text())["answers"].values()))
        self.assertEqual(entry["usage"], GEMINI_USAGE)
        saved = self.ask(KeyMock(gemini=httpx.Response(429), groq=groq_with_usage(GOOD_GROQ)))
        self.assertEqual((saved.provider, saved.served), ("gemini", "saved"))
        self.assertEqual((saved.usage.total_tokens, saved.usage.served, saved.usage.new_tokens), (612, "saved", 0))

    def test_a_saved_answer_from_an_older_file_has_no_usage(self):
        self.ask(KeyMock(gemini=gemini_with_usage(GOOD)))
        data = json.loads(self.store.read_text())
        for entry in data["answers"].values():
            del entry["usage"]
        self.store.write_text(json.dumps(data))
        saved = self.ask(KeyMock(gemini=httpx.Response(429), groq=groq_with_usage(GOOD_GROQ)))
        self.assertEqual((saved.served, saved.usage), ("saved", None))

    def test_groq_reports_its_own_tokens(self):
        result = self.ask(KeyMock(gemini=httpx.Response(503), groq=groq_with_usage(GOOD_GROQ)))
        self.assertEqual((result.provider, result.usage.provider, result.usage.total_tokens, result.usage.new_tokens),
                         ("groq", "groq", 420, 420))

    def test_the_template_and_a_reply_without_usage_have_none(self):
        template = self.ask(KeyMock(gemini=httpx.Response(503), groq=httpx.Response(503)))
        self.assertEqual((template.provider, template.usage), ("template", None))
        self.clock.now += 301
        bare = self.ask(KeyMock(gemini=gemini_with_usage(GOOD, meta=None)))
        self.assertEqual((bare.provider, bare.served, bare.usage), ("gemini", "live", None))

    def test_risk_analysis_reports_usage_live_then_cached(self):
        mock = KeyMock(gemini=gemini_with_usage(GOOD_RISK))
        rk._answers.clear()
        transport = mock.transport()

        def run():
            return asyncio.run(rk.analyse(rk.RiskRequest(case_id="Pat001", fe=FE), self.env, data=rk.load_dataset(),
                                          transport=transport))
        live, kept = run(), run()
        self.assertEqual(len(mock.calls), 1)
        self.assertEqual((live.usage.total_tokens, live.usage.new_tokens, live.usage.model), (612, 612, PRIMARY))
        self.assertEqual((kept.served, kept.usage.served, kept.usage.new_tokens), ("cached", "cached", 0))

    def test_the_routes_return_usage(self):
        mock = KeyMock(gemini=gemini_with_usage(GOOD))
        app = FastAPI()
        app.include_router(explain_router)
        app.dependency_overrides[ex.runtime_env] = lambda: self.env
        original = ex.build_providers
        with umock.patch.object(ex, "build_providers", lambda env, transport=None: original(env, mock.transport())):
            body = TestClient(app).post("/api/explain", json=SIM).json()
        self.assertEqual(body["usage"], {**GEMINI_USAGE, "provider": "gemini", "model": PRIMARY, "source": "live",
                                         "served": "live", "new_tokens": 612})

        risk = KeyMock(gemini=gemini_with_usage(GOOD_RISK))
        app = FastAPI()
        app.include_router(risk_router)
        app.dependency_overrides[runtime_env] = lambda: self.env
        with umock.patch.object(rk, "build_providers", lambda env, transport=None: original(env, risk.transport())):
            body = TestClient(app).post("/api/risk-analysis", json={"case_id": "Pat001", "fe": FE}).json()
        self.assertEqual((body["provider"], body["usage"]["total_tokens"], body["usage"]["served"]),
                         ("gemini", 612, "live"))


if __name__ == "__main__":
    unittest.main()
