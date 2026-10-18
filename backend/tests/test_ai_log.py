"""The AI audit log without a database: a fake connection stands in for psycopg (as in test_history).

Run from backend/:  python -m unittest tests.test_ai_log -v
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import unittest
from datetime import datetime, timezone
from unittest import mock
from uuid import UUID, uuid4

import psycopg
from fastapi.testclient import TestClient

import main
from services import ai_log, clinical_store, history
from services import explain as ex
from services import risk as rk
from services.settings import runtime_env
from tests.test_explain import SIM
from tests.test_history import FAKE_URL, FakeConnection, FakeConnector

FACTS = '{"load_newtons":800.0}'
TEXT = "In this computer model, 408 cm³ of bone carried a load of 800 newtons."
ANSWER = dict(endpoint="explain", case_id="Pat001", provider="gemini", model="gemini-3.5-flash", facts_json=FACTS,
              text=TEXT, latency_ms=812.5, grounding_store="vultr-object-storage",
              fallbacks=[{"provider": "groq", "reason": "GROQ_API_KEY not set"}])


class AiLogTestCase(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ[history.DATABASE_URL_ENV] = ""  # empty also overrides a DATABASE_URL in backend/.env
        self.connector = FakeConnector()
        for module in (history, ai_log):  # ai_log writes through its own short-timeout connection
            connect = mock.patch.object(module, "_connect", self.connector)
            connect.start()
            self.addCleanup(connect.stop)
        ai_log.reset_skip()
        self.addCleanup(ai_log.reset_skip)

    def inserts(self):
        return [params for sql, params in self.connector.conn.executed if sql.startswith("INSERT INTO ai_analyses")]


class RecordTests(AiLogTestCase):
    def test_without_database_url_nothing_is_written(self):
        self.assertIsNone(ai_log.record_answer({}, **ANSWER))
        self.assertIsNone(ai_log.record_answer({"DATABASE_URL": "  "}, **ANSWER))
        self.assertEqual(self.connector.urls, [])

    def test_one_row_with_hashes_and_no_text(self):
        logged = ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER)
        [(timeout_sql, _), (sql, params)] = self.connector.conn.executed
        self.assertEqual(timeout_sql, "SET LOCAL statement_timeout = 1500")
        self.assertTrue(sql.startswith("INSERT INTO ai_analyses ("))
        self.assertEqual(set(params), set(ai_log.COLUMNS) - {"time"})
        self.assertEqual(logged.model_dump(), {"id": str(params["id"]), "store": "tiger"})
        self.assertIsInstance(params["id"], UUID)
        self.assertEqual(params["facts_sha256"], hashlib.sha256(FACTS.encode()).hexdigest())
        self.assertEqual(params["text_sha256"], hashlib.sha256(TEXT.encode()).hexdigest())
        self.assertEqual((params["endpoint"], params["case_id"], params["provider"], params["model"],
                          params["latency_ms"], params["grounding_store"]),
                         ("explain", "Pat001", "gemini", "gemini-3.5-flash", 812.5, "vultr-object-storage"))
        self.assertEqual(params["fallbacks"].obj, [{"provider": "groq", "reason": "GROQ_API_KEY not set"}])
        self.assertNotIn(TEXT, repr(params))
        self.assertTrue(self.connector.conn.closed)

    def test_a_failed_write_is_logged_with_the_password_masked_and_returns_none(self):
        self.connector.error = psycopg.OperationalError("auth failed for not-a-real-password")
        with self.assertLogs("rainbowbone.ai_log", "WARNING") as logs:
            self.assertIsNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))
        self.assertNotIn("not-a-real-password", logs.output[0])
        self.assertIn("auth failed for ***", logs.output[0])

    def test_a_missing_table_does_not_raise(self):
        self.connector.conn = FakeConnection(error=psycopg.errors.UndefinedTable("ai_analyses"))
        with self.assertLogs("rainbowbone.ai_log", "WARNING"):
            self.assertIsNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))

    def test_a_rejected_fragment_is_not_stored(self):
        fallbacks = [{"provider": "gemini", "reason": "gemini-3.8-flash: rejected: blocked wording: 'will'"},
                     {"provider": "gemini", "reason": "stub-model: rejected: number not in input: 3"},
                     {"provider": "groq", "reason": "llama: rejected: over 600 characters"},
                     {"provider": "groq", "reason": "HTTP 429"}]
        ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **{**ANSWER, "fallbacks": fallbacks})
        [row] = self.inserts()
        self.assertEqual([f["reason"] for f in row["fallbacks"].obj],
                         ["gemini-3.8-flash: rejected: blocked wording", "stub-model: rejected: number not in input",
                          "llama: rejected: over 600 characters", "HTTP 429"])

    def test_after_a_failure_the_log_is_skipped_for_a_while(self):
        self.connector.error = psycopg.OperationalError("connection refused")
        with self.assertLogs("rainbowbone.ai_log", "WARNING"):
            self.assertIsNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))
        self.connector.error = None
        self.assertIsNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))
        self.assertEqual(len(self.connector.urls), 1)  # the second answer did not try the database
        ai_log.reset_skip()
        self.assertIsNotNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))

    def test_a_hanging_database_costs_an_answer_at_most_log_wait_s(self):
        def hang(url):
            time.sleep(3.5)
            raise psycopg.OperationalError("connection timeout expired")

        answer = ex.ExplainResponse(text=TEXT, provider="template", model=None, fallbacks=[])

        async def answer_logged():  # timed inside the loop: asyncio.run also waits for the worker thread to end
            started = time.perf_counter()
            logged = await ai_log.log_answer({"DATABASE_URL": FAKE_URL}, "explain", None, answer, FACTS, started, None)
            return logged, time.perf_counter() - started

        with mock.patch.object(ai_log, "_connect", hang), self.assertLogs("rainbowbone.ai_log", "WARNING"):
            logged, elapsed = asyncio.run(answer_logged())
        self.assertIsNone(logged)
        self.assertLess(elapsed, 3.0)
        self.assertIsNone(ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER))  # skipped, not hanging again

    def test_an_answer_that_missed_its_row_is_kept_briefly(self):
        logged = ai_log.Logged(id=str(uuid4()))
        self.assertEqual(ai_log.kept_for(3600.0, logged, {"DATABASE_URL": FAKE_URL}), 3600.0)
        self.assertEqual(ai_log.kept_for(3600.0, None, {}), 3600.0)
        self.assertEqual(ai_log.kept_for(3600.0, None, {"DATABASE_URL": FAKE_URL}), ai_log.MISSED_LOG_TTL_S)
        self.assertEqual(ai_log.kept_for(30.0, None, {"DATABASE_URL": FAKE_URL}), 30.0)


ROW = {"time": datetime(2026, 10, 18, 8, 0, tzinfo=timezone.utc), "id": uuid4(), "endpoint": "risk-analysis",
       "case_id": "Pat001", "provider": "template", "model": None, "facts_sha256": "a" * 64, "text_sha256": "b" * 64,
       "latency_ms": 3.5, "grounding_store": "local-backup", "fallbacks": []}


class RouteTests(AiLogTestCase):
    def test_returns_the_latest_rows_without_text(self):
        os.environ[history.DATABASE_URL_ENV] = FAKE_URL
        self.connector.conn = FakeConnection(results=[[ROW]])
        response = TestClient(main.app).get("/api/ai-log?limit=5")
        self.assertEqual(response.status_code, 200, response.text)
        [(sql, params)] = self.connector.conn.executed
        self.assertIn("FROM ai_analyses ORDER BY time DESC LIMIT %s", sql)
        self.assertEqual(params, (5,))
        [row] = response.json()["rows"]
        self.assertEqual(set(row), set(ai_log.COLUMNS))
        self.assertEqual((row["id"], row["grounding_store"]), (str(ROW["id"]), "local-backup"))
        self.assertNotIn("not-a-real-password", response.text)

    def test_limit_is_bounded(self):
        client = TestClient(main.app)
        for limit in (0, 201, "x"):
            with self.subTest(limit=limit):
                self.assertEqual(client.get(f"/api/ai-log?limit={limit}").status_code, 422)

    def test_503_without_database_url(self):
        response = TestClient(main.app).get("/api/ai-log")
        self.assertEqual(response.status_code, 503)
        self.assertIn("DATABASE_URL", response.json()["detail"])

    def test_503_with_migrate_hint_when_the_table_is_missing(self):
        os.environ[history.DATABASE_URL_ENV] = FAKE_URL
        self.connector.conn = FakeConnection(error=psycopg.errors.UndefinedTable("ai_analyses"))
        response = TestClient(main.app).get("/api/ai-log")
        self.assertEqual(response.status_code, 503)
        self.assertIn("python -m services.history migrate", response.json()["detail"])


class AnswerLoggingTests(AiLogTestCase):
    """POST /api/explain and /api/risk-analysis log each produced answer once; a kept answer is not logged again."""

    def setUp(self):
        super().setUp()
        for reset in (ex.reset_cooldowns, rk.reset_cooldowns, clinical_store.reset_cache):
            reset()
            self.addCleanup(reset)
        self.env = {"AI_OFFLINE": "1", "DATABASE_URL": FAKE_URL}  # no VULTR_S3_*: the bundled copies answer
        main.app.dependency_overrides[runtime_env] = lambda: self.env
        main.app.dependency_overrides[ex.runtime_env] = lambda: self.env
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        quiet = logging.getLogger("rainbowbone.clinical")  # each read without VULTR_S3_* warns about the fallback
        quiet.disabled = True
        self.addCleanup(setattr, quiet, "disabled", False)

    def test_explain_logs_one_row_per_produced_answer(self):
        first = self.client.post("/api/explain", json=SIM).json()
        self.assertEqual(set(first["logged"]), {"id", "store"})
        self.assertEqual(first["logged"]["store"], "tiger")
        [row] = self.inserts()
        self.assertEqual((str(row["id"]), row["endpoint"], row["case_id"], row["provider"], row["grounding_store"]),
                         (first["logged"]["id"], "explain", None, "template", None))
        self.assertEqual(row["text_sha256"], hashlib.sha256(first["text"].encode()).hexdigest())
        again = self.client.post("/api/explain", json=SIM).json()
        self.assertEqual(again["logged"], first["logged"])  # the kept answer, not a second row
        self.assertEqual(len(self.inserts()), 1)
        by_case = self.client.post("/api/explain", json={"case_id": "Pat001"}).json()
        self.assertEqual(len(self.inserts()), 2)
        self.assertEqual((self.inserts()[1]["case_id"], self.inserts()[1]["grounding_store"]),
                         ("Pat001", "local-backup"))
        self.assertEqual(by_case["grounding"]["store"], "local-backup")
        self.assertNotEqual(by_case["logged"]["id"], first["logged"]["id"])

    def test_equal_numbers_by_case_id_get_their_own_row(self):
        """The case's numbers sent as numbers, then by case_id: two rows, each recording its own source."""
        metrics = json.loads(clinical_store.CATALOGUE["pat001-femur-manifest"].local.read_bytes())["metrics"]
        sent = {"load_newtons": metrics["load_newtons"], "max_von_mises_stress_mpa": metrics["max_nodal_von_mises_mpa"],
                "average_youngs_modulus_gpa": metrics["youngs_modulus_mpa"] / 1000,
                "bone_volume_cm3": metrics["volume_cm3"],
                "fracture_risk_index_percent": metrics["max_nodal_von_mises_mpa"] / ex.ASSUMED_STRENGTH_MPA * 100}
        by_numbers = self.client.post("/api/explain", json=sent).json()
        by_case = self.client.post("/api/explain", json={"case_id": "Pat001"}).json()
        self.assertEqual(by_case["text"], by_numbers["text"])  # the same facts
        first, second = self.inserts()
        self.assertEqual((first["case_id"], first["grounding_store"]), (None, None))
        self.assertEqual((second["case_id"], second["grounding_store"]), ("Pat001", by_case["grounding"]["store"]))
        self.assertEqual(by_case["logged"]["id"], str(second["id"]))
        self.assertEqual(first["facts_sha256"], second["facts_sha256"])

    def test_an_answer_that_missed_its_row_is_produced_and_logged_again(self):
        """Even an answer otherwise kept for an hour (as Gemini's is) is kept only a minute without its row."""
        hour = mock.patch.object(rk, "answer_ttl", return_value=3600.0)
        hour.start()
        self.addCleanup(hour.stop)
        self.connector.error = psycopg.OperationalError("relation ai_analyses does not exist")
        with self.assertLogs("rainbowbone.ai_log", "WARNING"):
            self.assertIsNone(self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()["logged"])
        self.connector.error = None
        ai_log.reset_skip()
        self.assertIsNone(self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()["logged"])  # kept
        with mock.patch("services.llm_providers._now", return_value=time.monotonic() + ai_log.MISSED_LOG_TTL_S + 1):
            again = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        [row] = self.inserts()
        self.assertEqual(again["logged"]["id"], str(row["id"]))

    def test_risk_analysis_logs_one_row_per_produced_answer(self):
        first = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        [row] = self.inserts()
        self.assertEqual((str(row["id"]), row["endpoint"], row["case_id"], row["grounding_store"]),
                         (first["logged"]["id"], "risk-analysis", "Pat001", "local-backup"))
        self.assertEqual(row["facts_sha256"],
                         hashlib.sha256(rk.facts_json(rk.RiskFacts(**first["facts"])).encode()).hexdigest())
        self.assertEqual(self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()["logged"],
                         first["logged"])
        self.assertEqual(len(self.inserts()), 1)

    def test_same_facts_from_a_different_source_digest_get_a_new_analysis(self):
        dataset, grounding = rk.load_grounded_dataset({})
        with mock.patch.object(rk, "load_grounded_dataset", return_value=(dataset, grounding)):
            first = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        changed = grounding.model_copy(update={"sha256": "0" * 64})
        with mock.patch.object(rk, "load_grounded_dataset", return_value=(dataset, changed)):
            second = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        self.assertNotEqual(first["logged"]["id"], second["logged"]["id"])
        self.assertEqual(len(self.inserts()), 2)

    def test_invalid_kept_risk_answer_is_recomputed(self):
        self.client.post("/api/risk-analysis", json={"case_id": "Pat001"})
        [(key, (expires, answer))] = rk._answers._entries.items()
        invalid = "Its ARF0 is 47.1 percent, which is weaker than 75 of the 101 women."
        rk._answers._entries[key] = (expires, answer.model_copy(update={"text": invalid + " " + rk.NOTE}))
        response = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        self.assertEqual(response["provider"], "template")
        self.assertNotIn(invalid, response["text"])
        self.assertEqual(len(self.inserts()), 2)

    def test_a_failed_log_never_breaks_the_answer(self):
        self.connector.error = psycopg.OperationalError("connection refused")
        with self.assertLogs("rainbowbone.ai_log", "WARNING"):
            for path, body in (("/api/explain", SIM), ("/api/risk-analysis", {"case_id": "Pat001"})):
                response = self.client.post(path, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIsNone(response.json()["logged"])
                self.assertTrue(response.json()["text"])

    def test_without_database_url_logged_is_null(self):
        self.env = {"AI_OFFLINE": "1"}
        for path, body in (("/api/explain", {"case_id": "Pat001"}), ("/api/risk-analysis", {"case_id": "Pat001"})):
            self.assertIsNone(self.client.post(path, json=body).json()["logged"])
        self.assertEqual(self.connector.urls, [])


class MigrationTests(unittest.TestCase):
    def test_002_is_applied_after_001_by_the_migrate_command(self):
        names = [p.name for p in history.migration_files()]
        self.assertEqual(names[:2], ["001_simulation_runs.sql", "002_ai_analyses.sql"])

    def test_002_is_idempotent_and_has_every_logged_column(self):
        sql = (history.MIGRATIONS_DIR / "002_ai_analyses.sql").read_text(encoding="utf-8")
        code = "\n".join(line.split("--")[0] for line in sql.splitlines())
        for statement in filter(str.strip, code.split(";")):
            with self.subTest(statement=statement.strip().splitlines()[0]):
                self.assertRegex(statement, r"IF NOT EXISTS|if_not_exists => TRUE")
        self.assertIn("create_hypertable('ai_analyses'", code)
        table = re.search(r"CREATE TABLE IF NOT EXISTS ai_analyses \((.*?)\n\);", code, re.S).group(1)
        self.assertEqual([line.split()[0] for line in table.strip().splitlines()], list(ai_log.COLUMNS))


if __name__ == "__main__":
    unittest.main()
