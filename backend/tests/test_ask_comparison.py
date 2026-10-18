"""Cohort comparison completeness and truthful critic trace; local provider fixtures only."""
import asyncio
from pathlib import Path
import tempfile
import unittest

import httpx

from services import ask, ask_tools, llm_providers as llm
from tests.test_gemini_failover import TWO_KEYS, gemini_reply, groq_reply


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        ask._answers.clear()
        llm.reset_cooldowns()
        self.addCleanup(ask._answers.clear)
        self.addCleanup(llm.reset_cooldowns)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env = {**TWO_KEYS, "AI_ANSWER_STORE": str(Path(directory.name) / "answers.json")}

    def run_question(self, question, selection):
        def handler(request):
            return groq_reply(selection) if request.url.host == "api.groq.com" else gemini_reply(selection)
        return asyncio.run(ask.ask(ask.AskRequest(question=question), self.env,
                                  transport=httpx.MockTransport(handler)))

    def test_generic_comparison_requires_both_measures_even_if_model_omits_one(self):
        question = "How does she compare with the other women?"
        self.assertEqual(ask.known_selection(question), "arf0_rank,strength")
        plan = ask_tools.rules_plan(ask.known_selection(question))
        self.assertEqual([call.args["metric"] for call in plan if call.name == "compare_with_cohort"], ["arf0", "msf"])
        for incomplete in ("arf0_rank", "strength"):
            with self.subTest(incomplete=incomplete):
                ask._answers.clear()
                result = self.run_question(question, incomplete)
                self.assertEqual(result.provider, "template")
                self.assertIn("ARF0 is higher than 56", result.answer)
                self.assertIn("Pat001's femur has a minimum sidefall strength of 1,339 N", result.answer)
                self.assertIn("75 of the 101 women had a stronger femur", result.answer)
                self.assertNotIn("Its minimum", result.answer)
                self.assertLessEqual(len(result.answer.split()), 120)

    def test_specific_metrics_and_privacy_medical_priority_are_preserved(self):
        for question, expected in (
            ("How strong is this femur compared with the other women?", "strength"),
            ("Compare her MSF with the other women", "strength"),
            ("How does her ARF0 compare with the other women?", "arf0,arf0_rank"),
            ("How does her risk compare with the other women?", "arf0,arf0_rank"),
            ("Which rank is she?", "arf0_rank,strength"),
            ("Should she compare surgery options?", "unavailable"),
            ("Where does she live compared with other women?", "unavailable"),
            ("How does her 11% compare with the other women?", "stress_index"),
        ):
            with self.subTest(question=question):
                self.assertEqual(ask.known_selection(question), expected)

    def test_successful_model_selection_emits_one_pass_after_writer(self):
        result = self.run_question("How does she compare with the other women?", "arf0_rank,strength")
        self.assertEqual(result.provider, "gemini")
        passes = [i for i, event in enumerate(result.trace) if event.stage == "critic" and "checked" in event.summary]
        self.assertEqual(len(passes), 1)
        writer = next(i for i, event in enumerate(result.trace) if event.stage == "writer" and "returned" in event.summary)
        self.assertGreater(passes[0], writer)

    def test_actual_rejections_remain_visible_before_single_final_pass(self):
        result = self.run_question("How does she compare with the other women?", "strength")
        rejections = [event for event in result.trace if event.stage == "critic" and "rejected" in event.summary]
        passes = [event for event in result.trace if event.stage == "critic" and "checked" in event.summary]
        self.assertEqual(len(rejections), 3)  # Gemini, its single rewrite, Groq.
        self.assertEqual(len(passes), 1)  # Checked deterministic fallback.
        self.assertIn("Template", passes[0].summary)
