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
        result = self.run_question("Which control reveals the interior?", handle)
        self.assertEqual(result.tools_used, ["get_page_guide"])
        self.assertEqual(result.provider, "gemini")
        self.assertIn("Cut-away", result.answer)
        self.assertEqual(len(requests), 2)
        self.assertTrue({"triage", "evidence", "writer", "critic"}.issubset({e.stage for e in result.trace}))
        self.assertTrue(all(e.ms >= 0 for e in result.trace))
        cached = self.run_question("Which control reveals the interior?", handle)
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

    def test_chips_and_followups_use_their_exact_evidence_even_if_native_would_misroute(self):
        examples = [
            ("What does the 47% mean?", "arf0", {"arf0", "arf0_rank"}, "47.1%"),
            ("Why isn't the 11% a fracture chance?", "stress_index", {"stress_index"}, "10.55%"),
            ("How do I cut the bone open?", "cut", {"cut"}, "Cut-away"),
            ("What does the 2.2–3.2× fall ratio mean?", "fall_ratio", {"fall_ratio", "strength"}, "2.17"),
            ("Why is 10.55% not a fracture chance?", "stress_index", {"stress_index"}, "10.55%"),
        ]
        wrong = ask_triage.TriageResult([ask_tools.ToolCall("get_fea_result", {})], "wrong-model", "wrong native route")
        for question, primary, allowed, expected in examples:
            with self.subTest(question=question), mock.patch.object(ask_triage, "triage", return_value=wrong) as triage:
                def handle(request):
                    body = json.loads(request.content)
                    self.assertNotIn("tools", body)
                    user = json.loads(body["contents"][0]["parts"][0]["text"])
                    self.assertEqual(set(user["allowed_statement_ids"]), allowed)
                    self.assertEqual(user["required_statement_id"], primary)
                    self.assertEqual(user["response_example"], {"text": primary})
                    return gemini_reply(primary)
                answer = self.run_question(question, handle)
                triage.assert_not_called()
                self.assertEqual(answer.provider, "gemini")
                self.assertIn(expected, answer.answer)
                self.assertIn("Rules triage", answer.trace[0].summary)

    def test_substrings_do_not_take_over_unknown_question_routing(self):
        for question in ("Explain the 2011 reference", "What is record 147?", "Execute a sample", "Explain 11.81 percent"):
            with self.subTest(question=question):
                self.assertIsNone(ask.known_selection(question))

    def test_builtin_refusal_or_irrelevant_selection_falls_to_correct_rules_answer(self):
        for selection in ("unavailable", "strength", '["arf0"]', "some secret rejected prose"):
            with self.subTest(selection=selection):
                ask._answers.clear()
                llm.reset_cooldowns()
                def handle(request):
                    return groq_reply(selection) if request.url.host == "api.groq.com" else gemini_reply(selection)
                answer = self.run_question("What does the 47% mean?", handle)
                self.assertEqual(answer.provider, "template")
                self.assertIn("47.1%", answer.answer)
                self.assertNotIn("only answer questions", answer.answer)
                summaries = " ".join(e.summary for e in answer.trace)
                self.assertNotIn("secret rejected prose", summaries)
                self.assertTrue(any(e.stage == "critic" and e.summary.startswith("Code critic rejected:") for e in answer.trace))

    def test_strength_comparison_runs_msf_tools_and_keeps_arf0_rank_separate(self):
        question = "How strong is this femur compared with the other women?"
        result = asyncio.run(ask.ask(ask.AskRequest(question=question), {"AI_OFFLINE": "1"}))
        self.assertEqual(result.tools_used, ["get_patient_facts", "compare_with_cohort"])
        self.assertIn("1,339 N", result.answer)
        self.assertIn("75 of the 101", result.answer)
        self.assertEqual(ask_tools.rules_plan(ask.known_selection(question))[-1].args, {"metric": "msf"})
        for phrasing in ("Which rank is she?", "Is this weaker than the other women?", "How strong is it?"):
            self.assertEqual(ask.known_selection(phrasing), "strength")
        self.assertEqual(ask_tools.rules_plan(ask.known_selection("What is the ARF0 rank compared with other women?"))[-1].args,
                         {"metric": "arf0"})

    def test_prediction_question_requires_limit_actual_outcome_and_published_measure(self):
        question = "Is she going to break her hip?"
        expected = "prediction_limit,recorded_outcome,arf0"
        self.assertEqual(ask.known_selection(question), expected)
        seen = []
        def handle(request):
            body = json.loads(request.content)
            if "contents" in body:
                payload = json.loads(body["contents"][0]["parts"][0]["text"])
                payload = payload.get("request", payload)
                self.assertEqual(set(payload["required_statement_ids"]), set(expected.split(",")))
                seen.append(payload)
            return groq_reply("prediction_limit") if request.url.host == "api.groq.com" else gemini_reply("prediction_limit")
        result = self.run_question(question, handle)
        self.assertTrue(seen)
        self.assertEqual(result.provider, "template")
        self.assertIn("cannot predict", result.answer)
        self.assertIn("No fracture was recorded for Pat001", result.answer)
        self.assertIn("47.1%", result.answer)
        self.assertNotIn("hip fracture was recorded", result.answer)
        self.assertLessEqual(len(result.answer.split()), 120)
        for phrasing in ("Will she break her hip?", "Can you predict a fracture?", "What is her fracture chance?"):
            self.assertEqual(ask.known_selection(phrasing), expected)
        self.assertEqual(ask.known_selection("Is 11% her fracture chance?"), "stress_index")
        self.assertEqual(ask.known_selection("Is 47% her fracture chance?"), expected)
        self.assertEqual(ask.known_selection("Does 47% predict whether she will fracture?"), expected)
        self.assertEqual(ask.known_selection("Should I treat her?"), "unavailable")
        original = ask.risk.build_facts
        def fractured(*args, **kwargs):
            return original(*args, **kwargs).model_copy(update={"fractured_within_followup": True})
        with mock.patch.object(ask.risk, "build_facts", side_effect=fractured):
            evidence = ask.build_evidence({})
        self.assertTrue(evidence.statements["recorded_outcome"].text.startswith("A fracture was recorded"))

    def test_provider_rate_limit_and_cooldown_are_distinct_from_critic_rejection(self):
        def handle(request):
            return groq_reply("cut") if request.url.host == "api.groq.com" else httpx.Response(429)
        result = self.run_question("How do I cut the bone open?", handle)
        summaries = " ".join(e.summary for e in result.trace)
        self.assertIn("rate-limited (HTTP 429)", summaries)
        self.assertNotIn("Code critic rejected", summaries)
        self.assertEqual(result.provider, "groq")
        again = self.run_question("Show me the cut-away", handle)
        self.assertIn("cooldown after HTTP 429", " ".join(e.summary for e in again.trace))
        for reason, category in (("GEMINI_API_KEY not set", "provider unconfigured"),
                                 ("timed out after 9 s", "request timeout"),
                                 ("skipped: HTTP 429 less than 300 s ago", "cooldown after HTTP 429"),
                                 ("invalid output: secret user text", "invalid provider output"),
                                 ("rejected: secret user text", "statement selection rejected"),
                                 ("private output", "provider request failed")):
            self.assertEqual(ask.provider_failure_category(reason), category)

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
