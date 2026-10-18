"""Real graph parity and failure recovery. Provider and audit fixtures are local only."""
import asyncio
from contextlib import nullcontext
import tempfile
from pathlib import Path
import unittest
from unittest import mock

import httpx

from services import ask, ask_graph, ai_log, llm_providers as llm
from tests.test_ask_usage_integration import counted
from tests.test_gemini_failover import TWO_KEYS, gemini_reply, groq_reply


class GraphTests(unittest.TestCase):
    def test_real_graph_has_five_nodes_and_conditional_retry(self):
        visited = []
        async def stage(name):
            visited.append(name)
            if name == "critic":
                return "writer" if visited.count("writer") == 1 else "audit"
            return {"triage": "evidence", "evidence": "writer", "writer": "critic", "audit": "end"}[name]
        stages = {name: (lambda name=name: stage(name)) for name in ask_graph.STAGES}
        graph = ask_graph.compile_graph(ask_graph.Execution(stages))
        self.assertTrue(set(ask_graph.STAGES).issubset(graph.get_graph().nodes))
        self.assertEqual(asyncio.run(ask_graph.run(stages)), ask_graph.LANGGRAPH)
        self.assertEqual(visited, ["triage", "evidence", "writer", "critic", "writer", "critic", "audit"])

    def test_ambient_langsmith_tracing_is_disabled_during_real_nodes(self):
        from langsmith import tracing_context
        from langsmith.run_helpers import get_tracing_context
        observed = []
        async def stage(name):
            observed.append(get_tracing_context()["enabled"])
            return {"triage": "evidence", "evidence": "writer", "writer": "critic",
                    "critic": "audit", "audit": "end"}[name]
        stages = {name: (lambda name=name: stage(name)) for name in ask_graph.STAGES}
        with tracing_context(enabled=True):
            result = asyncio.run(ask_graph.run(stages))
        self.assertEqual(result, ask_graph.LANGGRAPH)
        self.assertEqual(observed, [False] * 5)

    def test_business_failure_and_cancellation_are_not_retried(self):
        for error in (ask.AskBusy("busy"), asyncio.CancelledError()):
            calls = []
            async def triage():
                calls.append("triage")
                raise error
            with self.subTest(error=type(error).__name__), self.assertRaises(type(error)):
                asyncio.run(ask_graph.run({"triage": triage}))
            self.assertEqual(calls, ["triage"])


class AskGraphParityTests(unittest.TestCase):
    def setUp(self):
        ask._answers.clear()
        llm.reset_cooldowns()
        self.addCleanup(ask._answers.clear)
        self.addCleanup(llm.reset_cooldowns)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env = {**TWO_KEYS, "AI_ANSWER_STORE": str(Path(directory.name) / "answers.json")}

    def run_answer(self, *, builtin=False, fault_after=None, reject=False):
        ask._answers.clear()
        llm.reset_cooldowns()
        requests = []
        def handler(request):
            requests.append(request.url.host)
            if request.url.host == "api.groq.com":
                return counted(groq_reply("arf0"), groq=True)
            return counted(gemini_reply("private rejected prose" if reject else "arf0"))
        original = ask_graph.Execution.run_stage
        raised = False
        async def fault(execution, name):
            nonlocal raised
            result = await original(execution, name)
            if name == fault_after and not raised:
                raised = True
                raise RuntimeError("framework failed after completed stage")
            return result
        patch = (mock.patch.object(ask_graph, "compile_graph", side_effect=ImportError("not installed")) if builtin else
                 mock.patch.object(ask_graph.Execution, "run_stage", fault) if fault_after else nullcontext())
        with patch, mock.patch.object(ai_log, "log_answer", return_value=ai_log.Logged(id="committed-once")) as log:
            result = asyncio.run(ask.ask(ask.AskRequest(question="What does the 47% mean?"), self.env,
                                        transport=httpx.MockTransport(handler)))
        return result, requests, log.call_count

    def test_graph_builtin_answer_trace_and_rewrite_fallback_parity(self):
        graph, graph_requests, graph_logs = self.run_answer(reject=True)
        builtin, builtin_requests, builtin_logs = self.run_answer(builtin=True, reject=True)
        self.assertEqual(graph.answer, builtin.answer)
        self.assertEqual(graph.provider, "groq")
        self.assertEqual(graph_requests, builtin_requests)
        self.assertEqual(len(graph_requests), 3)
        self.assertEqual(graph_logs, builtin_logs)
        self.assertEqual(graph.workflow_usage, builtin.workflow_usage)
        def trace(response):
            return [(e.stage, e.tool, e.summary) for e in response.trace if e.stage != "orchestrator"]
        self.assertEqual(trace(graph), trace(builtin))
        self.assertEqual(graph.trace[-1].summary, ask_graph.LANGGRAPH)
        self.assertEqual(builtin.trace[-1].summary, ask_graph.BUILTIN)
        store = Path(self.env["AI_ANSWER_STORE"])
        self.assertFalse(store.exists() and "private rejected prose" in store.read_text())

    def test_framework_fault_after_writer_or_audit_never_replays_side_effects(self):
        for stage in ("writer", "audit"):
            with self.subTest(stage=stage):
                result, requests, logs = self.run_answer(fault_after=stage)
                self.assertEqual(len(requests), 1)
                self.assertEqual(logs, 1)
                self.assertEqual(result.logged.id, "committed-once")
                self.assertEqual(result.workflow_usage.reported_totals.total_tokens, 15)
                self.assertEqual(len(result.workflow_usage.calls), 1)
                self.assertEqual(result.trace[-1].summary, ask_graph.BUILTIN)

    def test_cached_trace_discloses_original_graph_without_running_again(self):
        result, _, _ = self.run_answer()
        with mock.patch.object(ask_graph, "run", side_effect=AssertionError("must not rerun")):
            cached = asyncio.run(ask.ask(ask.AskRequest(question="What does the 47% mean?"), self.env,
                                         transport=httpx.MockTransport(lambda _: self.fail("no model"))))
        self.assertIn("original generation; not rerun", cached.trace[0].summary)
        self.assertIn(ask_graph.LANGGRAPH, cached.trace[0].summary)
        self.assertEqual(cached.workflow_usage.reported_totals.total_tokens, 0)
