"""Simulation history without a database: a fake connection stands in for psycopg.

Run from backend/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock
from uuid import uuid4

import psycopg
from fastapi.testclient import TestClient

import main
from services import history, settings

SAMPLE_SCAN = Path(__file__).resolve().parents[2] / "public" / "sample_bone.nii.gz"
FAKE_URL = "postgresql://user:not-a-real-password@127.0.0.1:1/history"
REAL_CONNECT = history._connect

# Test data in the SimulationResponse shape; not a solver output.
RESULT = {
    "max_von_mises_stress_mpa": 12.5,
    "average_youngs_modulus_gpa": 17.25,
    "bone_volume_cm3": 3.5,
    "fracture_risk_index_percent": 8.33,
    "load_newtons": 800.0,
    "mesh_vertices": 120,
    "mesh_faces": 236,
    "source_filename": "test.nii.gz",
}


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return list(self._rows)


class FakeConnection:
    """Records execute() calls and answers SELECTs from a queue of row lists."""

    def __init__(self, results=(), error=None):
        self.executed: list[tuple[str, object]] = []
        self.results = list(results)
        self.error = error
        self.closed = False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        if self.error is not None:
            raise self.error
        return FakeCursor(self.results.pop(0) if self.results else [])

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.closed = True
        return False


class FakeConnector:
    def __init__(self, conn=None, error=None):
        self.conn = conn or FakeConnection()
        self.error = error
        self.urls: list[str] = []

    def __call__(self, url):
        self.urls.append(url)
        if self.error is not None:
            raise self.error
        return self.conn


class HistoryTestCase(unittest.TestCase):
    """Starts every test with DATABASE_URL empty and the real connector replaced by a recording fake."""

    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ[history.DATABASE_URL_ENV] = ""  # empty also overrides a DATABASE_URL in backend/.env
        self.connector = FakeConnector()
        connect = mock.patch.object(history, "_connect", self.connector)
        connect.start()
        self.addCleanup(connect.stop)

    def use_database(self, conn=None, error=None):
        os.environ[history.DATABASE_URL_ENV] = FAKE_URL
        self.connector.conn = conn or FakeConnection()
        self.connector.error = error
        return self.connector.conn


class SaveTests(HistoryTestCase):
    def test_without_database_url_nothing_is_saved(self):
        self.assertFalse(history.save_simulation_run(RESULT, solve_ms=1.0))
        self.assertEqual(self.connector.urls, [])

    def test_insert_carries_every_response_field_and_solver_info(self):
        conn = self.use_database()
        self.assertTrue(history.save_simulation_run(RESULT, solve_ms=42.0))
        self.assertEqual(self.connector.urls, [FAKE_URL])
        self.assertTrue(conn.closed)
        [(sql, params)] = conn.executed
        self.assertTrue(sql.startswith("INSERT INTO simulation_runs ("))
        for name, value in RESULT.items():
            self.assertEqual(params[name], value, name)
        self.assertEqual(set(main.SimulationResponse.model_fields), set(history.RESULT_COLUMNS))
        self.assertEqual(params["solver"], "services.fea_solver.simulate_fea")
        self.assertEqual(set(params["solver_versions"].obj), set(history.SOLVER_PACKAGES))
        self.assertEqual(params["solve_ms"], 42.0)

    def test_connection_failure_is_logged_not_raised(self):
        self.use_database(error=psycopg.OperationalError("connection refused"))
        with self.assertLogs("rainbowbone.history", "WARNING") as logs:
            self.assertFalse(history.save_simulation_run(RESULT))
        self.assertIn("OperationalError: connection refused", logs.output[0])

    def test_insert_failure_is_logged_not_raised(self):
        self.use_database(FakeConnection(error=psycopg.errors.UndefinedTable("simulation_runs")))
        with self.assertLogs("rainbowbone.history", "WARNING"):
            self.assertFalse(history.save_simulation_run(RESULT))

    def test_logged_message_masks_the_password(self):
        self.use_database(error=psycopg.OperationalError("auth failed for not-a-real-password"))
        with self.assertLogs("rainbowbone.history", "WARNING") as logs:
            history.save_simulation_run(RESULT)
        self.assertNotIn("not-a-real-password", logs.output[0])
        self.assertIn("auth failed for ***", logs.output[0])


class FetchTests(HistoryTestCase):
    def test_without_database_url_history_is_unavailable(self):
        with self.assertRaisesRegex(history.HistoryUnavailable, "DATABASE_URL"):
            history.fetch_history(5)
        self.assertEqual(self.connector.urls, [])

    def test_series_runs_and_hourly_are_oldest_first(self):
        now = datetime(2026, 10, 18, 2, 5, 13, tzinfo=timezone.utc)
        newest = {**RESULT, "time": now, "run_id": uuid4(), "solver": history.SOLVER,
                  "solver_versions": {}, "solve_ms": 1.0}
        oldest = {**newest, "time": now - timedelta(minutes=1), "run_id": uuid4(),
                  "max_von_mises_stress_mpa": 10.0}
        hourly = [{"bucket": now.replace(minute=0, second=0), "runs": 2,
                   "avg_max_von_mises_stress_mpa": 11.25, "max_max_von_mises_stress_mpa": 12.5}]
        conn = self.use_database(FakeConnection(results=[[newest, oldest], hourly]))
        out = history.fetch_history(2)
        self.assertEqual(out["series"], [{"label": "Oct 18 02:04:13 UTC", "value": 10.0},
                                         {"label": "Oct 18 02:05:13 UTC", "value": 12.5}])
        self.assertEqual(out["runs"], [oldest, newest])
        self.assertEqual(out["hourly"], hourly)
        self.assertEqual([params for _, params in conn.executed], [(2,), (2,)])

    def test_missing_schema_points_at_the_migrate_command(self):
        self.use_database(FakeConnection(error=psycopg.errors.UndefinedTable("simulation_runs")))
        with self.assertRaisesRegex(history.HistoryUnavailable, "python -m services.history migrate"):
            history.fetch_history(5)

    def test_unreachable_database_is_unavailable(self):
        self.use_database(error=psycopg.OperationalError("connection refused"))
        with self.assertLogs("rainbowbone.history", "WARNING"):
            with self.assertRaisesRegex(history.HistoryUnavailable, "unavailable"):
                history.fetch_history(5)


class RouteTests(HistoryTestCase):
    def setUp(self):
        super().setUp()
        self.client = TestClient(main.app)

    def test_history_is_503_without_database_url(self):
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 503)
        self.assertIn("DATABASE_URL", response.json()["detail"])

    def test_history_shape(self):
        run = {**RESULT, "time": datetime(2026, 10, 18, 2, 5, 13, tzinfo=timezone.utc), "run_id": uuid4(),
               "solver": history.SOLVER, "solver_versions": {"sfepy": "2026.3"}, "solve_ms": 3.0}
        self.use_database(FakeConnection(results=[[run], []]))
        response = self.client.get("/api/history", params={"limit": 1})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["series"], [{"label": "Oct 18 02:05:13 UTC", "value": 12.5}])
        self.assertEqual(body["runs"][0]["run_id"], str(run["run_id"]))
        self.assertEqual(body["runs"][0]["source_filename"], "test.nii.gz")
        self.assertEqual(body["hourly"], [])

    def test_limit_is_validated(self):
        self.assertEqual(self.client.get("/api/history", params={"limit": 0}).status_code, 422)
        self.assertEqual(self.client.get("/api/history", params={"limit": 501}).status_code, 422)

    def test_startup_does_not_touch_the_database(self):
        self.use_database()
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/health").status_code, 200)
        self.assertEqual(self.connector.urls, [])


class SimulateWiringTests(HistoryTestCase):
    def setUp(self):
        super().setUp()
        self.client = TestClient(main.app)

    def post_scan(self):
        return self.client.post("/api/simulate", files={"file": ("test.nii.gz", b"stub", "application/gzip")})

    def test_successful_simulation_is_saved_with_the_returned_values(self):
        conn = self.use_database()
        with mock.patch.object(main, "simulate_fea", return_value=dict(RESULT)):
            response = self.post_scan()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), RESULT)
        [(sql, params)] = conn.executed
        self.assertEqual({name: params[name] for name in RESULT}, RESULT)
        self.assertGreaterEqual(params["solve_ms"], 0.0)

    def test_failed_save_does_not_change_the_response(self):
        with mock.patch.object(main, "simulate_fea", return_value=dict(RESULT)):
            without_db = self.post_scan()
            self.use_database(error=psycopg.OperationalError("connection refused"))
            with self.assertLogs("rainbowbone.history", "WARNING"):
                with_dead_db = self.post_scan()
        self.assertEqual((with_dead_db.status_code, with_dead_db.json()), (200, RESULT))
        self.assertEqual((without_db.status_code, without_db.json()), (200, RESULT))

    def test_solver_error_is_not_saved(self):
        conn = self.use_database()
        error = main.FEASolverError("Unable to read the uploaded NIfTI volume.")
        with mock.patch.object(main, "simulate_fea", side_effect=error):
            response = self.post_scan()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(conn.executed, [])

    def test_real_endpoint_answers_the_same_with_or_without_history(self):
        files = {"file": (SAMPLE_SCAN.name, SAMPLE_SCAN.read_bytes(), "application/gzip")}
        without_db = self.client.post("/api/simulate", files=files)
        conn = self.use_database()
        with_db = self.client.post("/api/simulate", files=files)
        self.assertEqual((with_db.status_code, with_db.json()), (without_db.status_code, without_db.json()))
        self.assertEqual(len(conn.executed), 1 if with_db.status_code == 200 else 0)


class WithoutPsycopgTests(HistoryTestCase):
    """psycopg is imported lazily: a missing install disables history, never the API."""

    def setUp(self):
        super().setUp()
        blocked = mock.patch.dict(sys.modules, {name: None for name in
                                                ("psycopg", "psycopg.rows", "psycopg.conninfo", "psycopg.types.json")})
        blocked.start()
        self.addCleanup(blocked.stop)
        os.environ[history.DATABASE_URL_ENV] = FAKE_URL

    def test_save_logs_and_returns_false(self):
        with self.assertLogs("rainbowbone.history", "WARNING") as logs:
            self.assertFalse(history.save_simulation_run(RESULT, connect=REAL_CONNECT))
        self.assertIn("ModuleNotFoundError", logs.output[0])

    def test_history_says_psycopg_is_missing(self):
        with self.assertRaisesRegex(history.HistoryUnavailable, "psycopg"):
            history.fetch_history(5)


class ConfigurationTests(unittest.TestCase):
    def test_database_url_is_read_from_backend_env_and_process_env_wins(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, ".env").write_text("DATABASE_URL=postgresql://from-file/db\n", encoding="utf-8")
            with mock.patch.object(settings, "BACKEND_DIR", Path(folder)):
                with mock.patch.dict(os.environ, clear=True):
                    self.assertEqual(history.database_url(), "postgresql://from-file/db")
                with mock.patch.dict(os.environ, {history.DATABASE_URL_ENV: "postgresql://from-process/db"},
                                     clear=True):
                    self.assertEqual(history.database_url(), "postgresql://from-process/db")
                with mock.patch.dict(os.environ, {history.DATABASE_URL_ENV: ""}, clear=True):
                    self.assertIsNone(history.database_url())


class MigrateCommandTests(HistoryTestCase):
    def test_migration_files(self):
        self.assertEqual([p.name for p in history.migration_files()], ["001_simulation_runs.sql"])

    def test_migrate_requires_database_url(self):
        with mock.patch.object(history, "apply_migrations") as apply:
            with mock.patch("sys.stderr"):
                self.assertEqual(history.main(["migrate"]), 2)
        apply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
