"""Local accounting tests: no model calls, environment credentials or storage."""
import unittest

from pydantic import ValidationError

from services.ask_usage import TokenCounts, UsageCollector, empty_usage


class UsageCollectorTests(unittest.TestCase):
    def test_mixed_models_and_stages_sum_each_report_once(self):
        collector = UsageCollector()
        collector.record("triage", "gemini", "triage-model",
                         {"prompt_tokens": 10, "output_tokens": 6, "thinking_tokens": 4, "total_tokens": 16})
        collector.record("writer", "groq", "writer-model",
                         {"prompt_tokens": 20, "output_tokens": 3, "total_tokens": 23})
        result = collector.snapshot()
        self.assertEqual(result.reported_totals.model_dump(),
                         {"prompt_tokens": 30, "output_tokens": 9, "thinking_tokens": 4, "total_tokens": 39})
        self.assertTrue(result.complete)
        self.assertEqual([(c.stage, c.provider, c.model) for c in result.calls],
                         [("triage", "gemini", "triage-model"), ("writer", "groq", "writer-model")])

    def test_identical_rejected_and_rewrite_generations_are_not_deduplicated(self):
        collector = UsageCollector()
        report = {"prompt_tokens": 2, "output_tokens": 1, "total_tokens": 3}
        # Caller observes each returned generation once, including a rejected selection and its rewrite.
        collector.record("writer", "gemini", "model", report)
        collector.record("writer", "gemini", "model", report)
        self.assertEqual(len(collector.snapshot().calls), 2)
        self.assertEqual(collector.snapshot().reported_totals.total_tokens, 6)

    def test_partial_counts_are_independent_unknowns_not_inferred(self):
        collector = UsageCollector()
        collector.record("triage", "gemini", "model", {"prompt_tokens": 9, "thinking_tokens": 2})
        collector.record("writer", "groq", "model", {"output_tokens": 7, "total_tokens": 10})
        result = collector.snapshot()
        self.assertEqual(result.reported_totals.prompt_tokens, 9)
        self.assertEqual(result.reported_totals.output_tokens, 7)
        self.assertEqual(result.reported_totals.total_tokens, 10)
        self.assertIsNone(result.calls[0].usage.output_tokens)
        self.assertIsNone(result.calls[0].usage.total_tokens)
        self.assertFalse(result.complete)
        self.assertEqual(result.incomplete_reasons, ["missing_usage"])

    def test_missing_and_malformed_usage_never_becomes_zero(self):
        for usage in (None, [], "private response", {}, {"total_tokens": True},
                      {"prompt_tokens": -1, "output_tokens": "3", "total_tokens": 1.5}):
            with self.subTest(usage=usage):
                collector = UsageCollector()
                collector.record("writer", "gemini", "model", usage)
                result = collector.snapshot()
                self.assertIsNone(result.calls[0].usage)
                self.assertIsNone(result.reported_totals.total_tokens)
                self.assertFalse(result.complete)
                self.assertNotIn("private response", result.model_dump_json())

    def test_known_zero_is_distinct_from_unknown(self):
        collector = UsageCollector()
        collector.record("writer", "groq", "model", TokenCounts(prompt_tokens=0, output_tokens=0, total_tokens=0))
        result = collector.snapshot()
        self.assertTrue(result.complete)
        self.assertEqual(result.reported_totals.total_tokens, 0)
        self.assertIsNone(result.reported_totals.thinking_tokens)

    def test_failures_are_bounded_fixed_categories_and_not_fabricated_calls(self):
        collector = UsageCollector()
        for _ in range(4):
            collector.mark_incomplete("request_timeout")
        collector.mark_incomplete("failed_attempt")
        with self.assertRaisesRegex(ValueError, "Unknown usage completeness category"):
            collector.mark_incomplete("secret response body")
        result = collector.snapshot()
        self.assertEqual(result.calls, [])
        self.assertFalse(result.complete)
        self.assertEqual(result.incomplete_reasons, ["request_timeout", "failed_attempt"])
        self.assertIsNone(result.reported_totals.total_tokens)
        self.assertNotIn("secret", result.model_dump_json())

    def test_cache_and_inflight_reuse_start_no_new_work(self):
        for reuse in ("none", "cache", "in_flight"):
            result = empty_usage(reuse)
            self.assertEqual(result.scope, "current_request")
            self.assertEqual(result.reuse, reuse)
            self.assertEqual(result.calls, [])
            self.assertTrue(result.complete)
            self.assertEqual(set(result.reported_totals.model_dump().values()), {0})
        self.assertEqual(UsageCollector().snapshot(), empty_usage())

    def test_snapshots_do_not_mutate_the_collector_or_each_other(self):
        collector = UsageCollector()
        collector.record("writer", "groq", "model", {"total_tokens": 3})
        first = collector.snapshot()
        first.calls.clear()
        first.incomplete_reasons.clear()
        second = collector.snapshot()
        self.assertEqual(len(second.calls), 1)
        self.assertEqual(second.incomplete_reasons, ["missing_usage"])
        with self.assertRaises(ValidationError):
            second.calls[0].usage.total_tokens = 12

    def test_serialized_counts_reject_negative_boolean_and_float(self):
        for value in (-1, True, 1.5, "2"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                TokenCounts(total_tokens=value)
