"""The AI audit log without a database: a fake connection stands in for psycopg (as in test_history).

Run from backend/:  python -m unittest tests.test_ai_log -v
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
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
        connect = mock.patch.object(history, "_connect", self.connector)
        connect.start()
        self.addCleanup(connect.stop)


class RecordTests(AiLogTestCase):
    def test_without_database_url_nothing_is_written(self):
        self.assertIsNone(ai_log.record_answer({}, **ANSWER))
        self.assertIsNone(ai_log.record_answer({"DATABASE_URL": "  "}, **ANSWER))
        self.assertEqual(self.connector.urls, [])

    def test_one_row_with_hashes_and_no_text(self):
        logged = ai_log.record_answer({"DATABASE_URL": FAKE_URL}, **ANSWER)
        [(sql, params)] = self.connector.conn.executed
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

    def inserts(self):
        return [params for sql, params in self.connector.conn.executed if sql.startswith("INSERT INTO ai_analyses")]

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
