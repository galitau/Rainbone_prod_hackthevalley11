"""Native routing failures have safe categories and preserve provider cooldowns."""
import asyncio
import time
import unittest
import httpx
from services import ask_triage, llm_providers as llm
from tests.test_gemini_failover import TWO_KEYS

class TriageDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        llm.reset_cooldowns()
        self.addCleanup(llm.reset_cooldowns)

    def test_rate_limit_is_visible_then_skipped_without_a_new_call(self):
        seen=[]
        def reply(request):
            seen.append(request)
            return httpx.Response(429)
        provider=llm.GeminiProvider(TWO_KEYS,transport=httpx.MockTransport(reply))
        def run():
            return asyncio.run(ask_triage.triage([provider], 'Tell me about the reference participant', None, time.perf_counter()+25))
        self.assertIn('HTTP 429',run().summary)
        self.assertIn('HTTP 429 cooldown',run().summary)
        self.assertEqual(len(seen),1)

    def test_invalid_plan_category_does_not_echo_its_contents(self):
        marker='private-question-fragment'
        provider=llm.GeminiProvider(TWO_KEYS,transport=httpx.MockTransport(lambda r:httpx.Response(200,json={
            'candidates':[{'content':{'parts':[{'functionCall':{'name':marker,'args':{}}}]}}]})))
        result=asyncio.run(ask_triage.triage([provider],marker,None,time.perf_counter()+25))
        self.assertIn('invalid native tool response',result.summary)
        self.assertNotIn(marker,result.summary)
