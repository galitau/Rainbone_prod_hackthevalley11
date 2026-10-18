"""Native Gemini function-call protocol and actual bounded tool dispatch, with mock HTTP only."""
from __future__ import annotations

import asyncio
import json
import time
import threading
import unittest
from unittest import mock

import httpx

from services import ask, ask_tools, ask_triage, llm_providers as llm
from tests.test_gemini_failover import TWO_KEYS, gemini_reply, groq_reply


def function_reply(calls):
    return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {
        "parts": [{"functionCall": call} for call in calls]}}]})


class NativeTriageTests(unittest.TestCase):
    def setUp(self):
        llm.reset_cooldowns()
        self.addCleanup(llm.reset_cooldowns)

    def triage(self, handler):
        provider = llm.GeminiProvider(TWO_KEYS, transport=httpx.MockTransport(handler))
        return provider, asyncio.run(ask_triage.triage([provider], "How do I cut the bone open?", "/dashboard",
                                                      time.perf_counter() + 25))

    def test_native_wire_contract_not_json_text_imitation(self):
        seen = []
        def handle(request):
            body = json.loads(request.content)
            seen.append(body)
            self.assertEqual(body["toolConfig"]["functionCallingConfig"]["mode"], "ANY")
            self.assertEqual(len(body["tools"][0]["functionDeclarations"]), 5)
            self.assertNotIn("responseJsonSchema", body["generationConfig"])
            return function_reply([{"name": "get_page_guide", "args": {"topic": "cut"}}])
        _, result = self.triage(handle)
        self.assertEqual(result.calls, [ask_tools.ToolCall("get_page_guide", {"topic": "cut"})])
        self.assertIn("Gemini native function-call", result.summary)
        self.assertEqual(len(seen), 1)

    def test_invalid_or_excess_calls_fall_back_without_execution(self):
        cases = [
            [{"name": "run_sql", "args": {"sql": "DROP TABLE"}}],
            [{"name": "get_patient_facts", "args": {"case_id": "Pat004"}}],
            [{"name": "get_page_guide", "args": {"topic": "cut", "url": "https://evil.test"}}],
            [{"name": "get_fea_result", "args": {}}] * 5,
            [{"name": "get_fea_result", "args": {}}] * 2,
        ]
        for calls in cases:
            with self.subTest(calls=calls), mock.patch.object(ask_tools, "execute") as execute:
                _, result = self.triage(lambda request: function_reply(calls))
                self.assertEqual(result.calls, [])
                self.assertIn("Rules triage", result.summary)
                execute.assert_not_called()

    def test_rate_limit_is_shared_and_does_not_rotate_keys(self):
        calls = []
        def handle(request):
            calls.append(True)
            return httpx.Response(429)
        provider, result = self.triage(handle)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result.calls, [])
        self.assertIn("429", llm.cooldown_reason(provider))

    def test_unsupported_tools_do_not_disable_normal_writer(self):
        provider, result = self.triage(lambda request: httpx.Response(400))
        self.assertEqual(result.calls, [])
        self.assertIsNone(llm.cooldown_reason(provider))

    def test_native_budget_is_bounded(self):
        async def handle(request):
            await asyncio.sleep(5)
        started = time.perf_counter()
        with mock.patch.object(ask_triage, "TRIAGE_BUDGET_S", .01):
            _, result = self.triage(handle)
        self.assertEqual(result.calls, [])
        self.assertLess(time.perf_counter() - started, .5)

    def test_malformed_native_payload_falls_back(self):
        for data in (None, [], {}, {"candidates": []}, {"candidates": None},
                     {"candidates": [{"content": {"parts": None}}]}):
            with self.subTest(data=data):
                _, result = self.triage(lambda request: httpx.Response(200, json=data))
                self.assertEqual(result.calls, [])
                self.assertIn("Rules triage", result.summary)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        ask._answers.clear()
        llm.reset_cooldowns()
        self.addCleanup(ask._answers.clear)
        self.addCleanup(llm.reset_cooldowns)

    def run_question(self, question, handler):
        return asyncio.run(ask.ask(ask.AskRequest(question=question), TWO_KEYS, transport=httpx.MockTransport(handler)))

    def test_native_triage_executes_tool_then_scoped_writer_and_code_critic(self):
        requests = []
        def handle(request):
            body = json.loads(request.content)
            requests.append(body)
            if "tools" in body:
                return function_reply([{"name": "get_page_guide", "args": {"topic": "cut"}}])
            user = json.loads(body["contents"][0]["parts"][0]["text"])
            self.assertEqual(user["tool_outputs"][0]["tool"], "get_page_guide")
            self.assertEqual(set(user["tool_outputs"][0]["statements"]), {"cut"})
            self.assertNotIn("arf0", json.dumps(user["tool_outputs"]))
            return gemini_reply("cut")
        result = self.run_question("How do I cut the bone open?", handle)
        self.assertEqual(result.tools_used, ["get_page_guide"])
        self.assertEqual(result.provider, "gemini")
        self.assertIn("Cut-away", result.answer)
        self.assertEqual(len(requests), 2)
        self.assertTrue({"triage", "evidence", "writer", "critic"}.issubset({e.stage for e in result.trace}))
        self.assertTrue(all(e.ms >= 0 for e in result.trace))
        cached = self.run_question("How do I cut the bone open?", handle)
        self.assertEqual([e.stage for e in cached.trace], ["cache"])
        self.assertEqual(len(requests), 2)

    def test_unretrieved_statement_rejected_one_rewrite_then_groq(self):
        writers = []
        def handle(request):
            body = json.loads(request.content)
            if "tools" in body:
                return function_reply([{"name": "get_fea_result", "args": {}}])
            writers.append(body)
            if request.url.host == "api.groq.com":
                return groq_reply("stress_index")
            return gemini_reply("arf0")  # known globally, absent from selected tool outputs
        result = self.run_question("Why isn't the 11% a fracture chance?", handle)
        self.assertEqual(result.provider, "groq")
        self.assertEqual(len(writers), 3)  # Gemini + one rewrite + Groq
        self.assertEqual(sum("revision" in json.loads(body["contents"][0]["parts"][0]["text"])
                             for body in writers if "contents" in body), 1)
        self.assertIn("10.55%", result.answer)
        self.assertTrue(any("rejected" in e.summary for e in result.trace if e.stage == "critic"))

    def test_rules_routing_is_labeled_and_runs_real_evidence_tools(self):
        result = asyncio.run(ask.ask(ask.AskRequest(question="What does the 47% mean?"), {"AI_OFFLINE": "1"}))
        self.assertIn("Rules triage", result.trace[0].summary)
        self.assertEqual(result.tools_used, ["get_patient_facts", "compare_with_cohort"])
        self.assertIn("47.1%", result.answer)
        self.assertEqual(result.provider, "template")
        self.assertTrue(any(e.tool == "compare_with_cohort" for e in result.trace))

    def test_evidence_timeout_keeps_worker_capacity_until_real_work_finishes(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        def slow():
            entered.set()
            release.wait(2)
            finished.set()
        async def scenario():
            slots = threading.BoundedSemaphore(1)
            with mock.patch.object(ask, "_evidence_slots", slots):
                from services.clinical_store import ClinicalDataUnavailable
                try:
                    with self.assertRaises(ClinicalDataUnavailable):
                        await ask.bounded_evidence(slow, deadline=time.perf_counter() + .02)
                    self.assertTrue(entered.is_set())
                    with self.assertRaises(ask.AskBusy):
                        await ask.bounded_evidence(lambda: None, deadline=time.perf_counter() + 1)
                finally:
                    release.set()
                    await asyncio.to_thread(finished.wait, 1)
                    # Callback releases the exact semaphore only after the original thread finishes.
                    for _ in range(50):
                        if slots.acquire(blocking=False):
                            slots.release()
                            break
                        await asyncio.sleep(.001)
                    else:
                        self.fail("evidence worker slot was not released")
        asyncio.run(scenario())
