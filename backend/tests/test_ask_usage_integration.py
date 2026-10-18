"""Usage integration with local HTTP fixtures only; no real provider or storage calls."""
import asyncio
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

import httpx

from services import ask, ask_triage, llm_providers as llm
from services.ask_usage import UsageCollector
from tests.test_ask_pipeline import function_reply
from tests.test_gemini_failover import TWO_KEYS, gemini_reply, groq_reply


def counted(response, *, groq=False):
    data = response.json()
    data["usage" if groq else "usageMetadata"] = (
        {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15} if groq else
        {"promptTokenCount": 10, "candidatesTokenCount": 3, "thoughtsTokenCount": 2, "totalTokenCount": 15})
    return httpx.Response(200, json=data)


class AskUsageIntegrationTests(unittest.TestCase):
    def setUp(self):
        ask._answers.clear()
        llm.reset_cooldowns()
        self.addCleanup(ask._answers.clear)
        self.addCleanup(llm.reset_cooldowns)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env = {**TWO_KEYS, "AI_ANSWER_STORE": str(Path(directory.name) / "answers.json")}

    def run_ask(self, question, handler):
        return asyncio.run(ask.ask(ask.AskRequest(question=question), self.env, transport=httpx.MockTransport(handler)))

    def test_native_and_writer_sum_then_cache_is_zero(self):
        def handler(request):
            body = json.loads(request.content)
            if "tools" in body:
                return counted(function_reply([{"name": "get_page_guide", "args": {"topic": "cut"}}]))
            return counted(gemini_reply("cut"))
        question = "Which control reveals the interior?"
        result = self.run_ask(question, handler)
        self.assertEqual([c.stage for c in result.workflow_usage.calls], ["triage", "writer"])
        self.assertEqual(result.workflow_usage.reported_totals.total_tokens, 30)
        self.assertEqual(result.workflow_usage.reported_totals.output_tokens, 10)
        self.assertEqual(result.usage.total_tokens, 15)
        self.assertTrue(result.workflow_usage.complete)
        cached = self.run_ask(question, lambda _: self.fail("cache must not call model"))
        self.assertEqual(cached.workflow_usage.reuse, "cache")
        self.assertEqual(cached.workflow_usage.reported_totals.total_tokens, 0)
        self.assertEqual(cached.usage.total_tokens, 15)
        self.assertEqual(cached.usage.served, "cached")

    def test_rejected_rewrite_and_groq_are_each_counted_once(self):
        def handler(request):
            if request.url.host == "api.groq.com":
                return counted(groq_reply("arf0"), groq=True)
            return counted(gemini_reply("cut"))
        result = self.run_ask("What does the 47% mean?", handler)
        self.assertEqual([c.provider for c in result.workflow_usage.calls], ["gemini", "gemini", "groq"])
        self.assertEqual(result.workflow_usage.reported_totals.total_tokens, 45)
        self.assertTrue(result.workflow_usage.complete)
        self.assertEqual(result.usage.provider, "groq")

    def test_saved_writer_keeps_fresh_triage_and_no_saved_call_event(self):
        question = "Which control reveals the interior?"
        def handler(request):
            if "tools" in json.loads(request.content):
                return counted(function_reply([{"name": "get_page_guide", "args": {"topic": "cut"}}]))
            return counted(gemini_reply("cut"))
        self.run_ask(question, handler)
        ask._answers.clear()
        def unavailable_writer(request):
            if "tools" in json.loads(request.content):
                return handler(request)
            return httpx.Response(429)
        result = self.run_ask(question, unavailable_writer)
        self.assertEqual(result.served, "saved")
        self.assertEqual([c.stage for c in result.workflow_usage.calls], ["triage"])
        self.assertEqual(result.workflow_usage.reported_totals.total_tokens, 15)
        self.assertEqual(result.usage.total_tokens, 15)
        self.assertEqual(result.usage.served, "saved")
        self.assertFalse(result.workflow_usage.complete)
        self.assertEqual(result.workflow_usage.incomplete_reasons, ["failed_attempt"])

    def test_missing_usage_and_timeout_are_incomplete_but_skips_are_not(self):
        result = self.run_ask("What does the 47% mean?", lambda _: gemini_reply("arf0"))
        self.assertFalse(result.workflow_usage.complete)
        self.assertIsNone(result.workflow_usage.reported_totals.total_tokens)
        ask._answers.clear()
        async def timeout(_):
            await asyncio.sleep(1)
        with mock.patch.object(ask, "PROVIDER_BUDGET_S", .02):
            result = self.run_ask("How do I cut the bone open?", timeout)
        self.assertIn("request_timeout", result.workflow_usage.incomplete_reasons)
        empty = asyncio.run(ask.ask(ask.AskRequest(question="What does the 11% mean?"), {}))
        self.assertTrue(empty.workflow_usage.complete)
        self.assertEqual(empty.workflow_usage.reported_totals.total_tokens, 0)

    def test_native_invalid_plan_is_counted_before_validation(self):
        collector = UsageCollector()
        provider = llm.GeminiProvider(self.env, transport=httpx.MockTransport(
            lambda _: counted(function_reply([{"name": "unknown", "args": {}}]))))
        result = asyncio.run(ask_triage.triage([provider], "unknown question", None, time.perf_counter() + 1,
            on_usage=lambda p, m, u: collector.record("triage", p, m, u), on_failure=collector.mark_incomplete))
        self.assertEqual(result.calls, [])
        self.assertTrue(collector.snapshot().complete)
        self.assertEqual(collector.snapshot().reported_totals.total_tokens, 15)

    def test_observer_failure_cannot_discard_answer(self):
        provider = llm.GeminiProvider(self.env, transport=httpx.MockTransport(lambda _: counted(gemini_reply("arf0"))))
        def broken(*_):
            raise RuntimeError("private instrumentation error")
        result = asyncio.run(llm.ask_models([provider], "system", "question", lambda _: None, lambda *_: None,
                                           kind="test", facts="hash", on_usage=broken))
        self.assertEqual(result.text, "arf0")

    def test_inflight_follower_does_not_own_producer_usage(self):
        async def scenario():
            entered, release = asyncio.Event(), asyncio.Event()
            async def handler(_):
                entered.set()
                await release.wait()
                return counted(gemini_reply("arf0"))
            request = ask.AskRequest(question="What does the 47% mean?")
            transport = httpx.MockTransport(handler)
            first = asyncio.create_task(ask.ask(request, self.env, transport=transport))
            await entered.wait()
            second = asyncio.create_task(ask.ask(request, self.env, transport=transport))
            # Wait until follower has completed evidence loading and is awaiting the shared producer.
            for _ in range(20):
                await asyncio.sleep(.001)
            release.set()
            return await asyncio.gather(first, second)
        producer, follower = asyncio.run(scenario())
        self.assertEqual(producer.workflow_usage.reported_totals.total_tokens, 15)
        self.assertEqual(follower.workflow_usage.reuse, "in_flight")
        self.assertEqual(follower.workflow_usage.reported_totals.total_tokens, 0)
        self.assertEqual(follower.usage.total_tokens, 15)
