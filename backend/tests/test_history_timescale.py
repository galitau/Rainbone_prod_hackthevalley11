"""Simulation history on a real TimescaleDB, in a throwaway local container.

Starts timescale/timescaledb:latest-pg16 with Docker on a free 127.0.0.1 port, applies the migration,
saves simulations through POST /api/simulate, reads GET /api/history, then removes the container.
Skipped, with the reason, when Docker is not available. Never uses DATABASE_URL from the environment.

Docker is found from the DOCKER environment variable, then `docker` on PATH, then ~/.docker/bin/docker.
Run from backend/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import hashlib
import os
import shutil
import socket
import subprocess
import time
import unittest
import uuid
from pathlib import Path
from typing import Optional
from unittest import mock

import psycopg
from fastapi.testclient import TestClient

import main
from services import ai_log, history

IMAGE = "timescale/timescaledb:latest-pg16"
READY_TIMEOUT_SECONDS = 120.0

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


def _docker() -> Optional[str]:
    candidates = [os.environ.get("DOCKER"), shutil.which("docker"), str(Path.home() / ".docker" / "bin" / "docker")]
    return next((c for c in candidates if c and (Path(c).exists() or shutil.which(c))), None)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_ready(url: str) -> None:
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    while True:
        try:
            with psycopg.connect(url, connect_timeout=2) as conn:
                conn.execute("SELECT 1")
            return
        except psycopg.OperationalError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.5)


class TimescaleHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        docker = _docker()
        if docker is None:
            raise unittest.SkipTest("Docker CLI not found (set DOCKER or put docker on PATH)")
        info = subprocess.run([docker, "info"], capture_output=True, text=True)
        if info.returncode != 0:
            raise unittest.SkipTest("Docker daemon is not running (`docker info` failed)")
        name = f"rainbowbone-history-test-{uuid.uuid4().hex[:8]}"
        port = _free_port()
        run = subprocess.run(
            [docker, "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1:{port}:5432",
             "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE],
            capture_output=True, text=True,
        )
        if run.returncode != 0:
            raise unittest.SkipTest(f"could not start {IMAGE}: {run.stderr.strip()[-300:]}")
        cls.addClassCleanup(subprocess.run, [docker, "rm", "-f", name], capture_output=True)
        cls.server = f"postgresql://postgres@127.0.0.1:{port}"
        cls.url = f"{cls.server}/postgres"
        _wait_ready(cls.url)
        cls.applied = history.apply_migrations(cls.url)

    def setUp(self):
        env = mock.patch.dict(os.environ, {history.DATABASE_URL_ENV: self.url})
        env.start()
        self.addCleanup(env.stop)
        self.client = TestClient(main.app)

    def query(self, sql, params=None):
        with psycopg.connect(self.url) as conn:
            return conn.execute(sql, params).fetchall()

    def post_scan(self):
        main._simulate_results.clear()  # a real solve each time: a reused result saves no row
        self.addCleanup(main._simulate_results.clear)
        with mock.patch.object(main, "simulate_fea", return_value=dict(RESULT)):
            return self.client.post("/api/simulate", files={"file": ("test.nii.gz", b"stub", "application/gzip")})

    def test_migration_creates_hypertable_aggregate_and_policy_and_reruns_cleanly(self):
        self.assertEqual(self.applied, ["001_simulation_runs.sql", "002_ai_analyses.sql", "003_ai_tools.sql"])
        self.assertEqual(history.apply_migrations(self.url), ["001_simulation_runs.sql", "002_ai_analyses.sql", "003_ai_tools.sql"])
        self.assertEqual(self.query("SELECT hypertable_name FROM timescaledb_information.hypertables "
                                    "WHERE hypertable_name = 'simulation_runs'"), [("simulation_runs",)])
        self.assertEqual(self.query("SELECT view_name, hypertable_name, materialized_only "
                                    "FROM timescaledb_information.continuous_aggregates"),
                         [("simulation_runs_hourly", "simulation_runs", False)])
        self.assertEqual(len(self.query("SELECT job_id FROM timescaledb_information.jobs "
                                        "WHERE proc_name = 'policy_refresh_continuous_aggregate'")), 1)

    def test_ai_answers_are_logged_in_their_hypertable_and_read_back(self):
        self.assertEqual(self.query("SELECT hypertable_name FROM timescaledb_information.hypertables "
                                    "WHERE hypertable_name = 'ai_analyses'"), [("ai_analyses",)])
        logged = ai_log.record_answer({history.DATABASE_URL_ENV: self.url}, endpoint="explain", case_id="Pat001",
                                      provider="template", model=None, facts_json="{}", text="text", latency_ms=1.5,
                                      grounding_store="local-backup",
                                      fallbacks=[{"provider": "gemini", "reason": "GEMINI_API_KEY not set"}])
        self.assertIsNotNone(logged)
        response = self.client.get("/api/ai-log?limit=1")
        self.assertEqual(response.status_code, 200, response.text)
        [row] = response.json()["rows"]
        self.assertEqual((row["id"], row["endpoint"], row["case_id"], row["grounding_store"], row["latency_ms"]),
                         (logged.id, "explain", "Pat001", "local-backup", 1.5))
        self.assertEqual(row["fallbacks"], [{"provider": "gemini", "reason": "GEMINI_API_KEY not set"}])
        self.assertEqual(row["text_sha256"], hashlib.sha256(b"text").hexdigest())

    def test_ask_tool_names_are_saved_and_read_back_without_arguments(self):
        ai_log.reset_skip()
        logged = ai_log.record_answer({history.DATABASE_URL_ENV: self.url}, endpoint="ask", case_id="Pat001",
            provider="template", model=None, facts_json="{}", text="checked text", latency_ms=2,
            grounding_store="local-backup", fallbacks=[], tools_used=["get_page_guide", "get_dataset_info"])
        self.assertIsNotNone(logged)
        rows = self.client.get("/api/ai-log?limit=1").json()["rows"]
        self.assertEqual(rows[0]["id"], logged.id)
        self.assertEqual(rows[0]["tools_used"], ["get_page_guide", "get_dataset_info"])
        self.assertEqual(self.query("SELECT COALESCE(to_jsonb(legacy)->'tools_used', '[]'::jsonb) "
                                    "FROM (SELECT 1 AS id) AS legacy"), [([], )])

    def test_simulate_saves_and_history_serves_the_saved_run(self):
        before = self.query("SELECT count(*) FROM simulation_runs")[0][0]
        response = self.post_scan()
        self.assertEqual(response.status_code, 200)
        self.assertEqual({name: response.json()[name] for name in RESULT}, RESULT)
        self.assertEqual(self.query("SELECT count(*) FROM simulation_runs")[0][0], before + 1)

        history_response = self.client.get("/api/history", params={"limit": 3})
        self.assertEqual(history_response.status_code, 200)
        body = history_response.json()
        self.assertEqual(body["series"][-1]["value"], RESULT["max_von_mises_stress_mpa"])
        self.assertTrue(body["series"][-1]["label"].endswith(" UTC"))
        latest = body["runs"][-1]
        self.assertEqual({name: latest[name] for name in RESULT}, RESULT)
        self.assertEqual(latest["solver"], "services.fea_solver.simulate_fea")
        self.assertEqual(latest["run_id"], response.json()["run_id"])
        self.assertEqual(latest["input_sha256"], response.json()["input_sha256"])
        exact = self.client.get("/api/history", params={"run_id": response.json()["run_id"]}).json()
        self.assertEqual(exact["persistence"], "saved")
        self.assertEqual(len(exact["runs"]), 1)
        self.assertEqual(set(latest["solver_versions"]), {*history.SOLVER_PACKAGES, "segmentation", "input_sha256"})
        self.assertGreaterEqual(latest["solve_ms"], 0.0)

        (bucket, runs, avg_stress, max_stress), = self.query(
            "SELECT time_bucket(INTERVAL '1 hour', time), count(*), avg(max_von_mises_stress_mpa), "
            "max(max_von_mises_stress_mpa) FROM simulation_runs GROUP BY 1 ORDER BY 1 DESC LIMIT 1")
        hour = body["hourly"][-1]
        self.assertEqual(hour["runs"], runs)
        self.assertAlmostEqual(hour["avg_max_von_mises_stress_mpa"], avg_stress)
        self.assertAlmostEqual(hour["max_max_von_mises_stress_mpa"], max_stress)

    def test_series_is_limited_and_oldest_first(self):
        for _ in range(3):
            self.assertEqual(self.post_scan().status_code, 200)
        body = self.client.get("/api/history", params={"limit": 2}).json()
        self.assertEqual(len(body["series"]), 2)
        self.assertEqual(len(body["runs"]), 2)
        times = [run["time"] for run in body["runs"]]
        self.assertEqual(times, sorted(times))
        newest = self.query("SELECT run_id FROM simulation_runs ORDER BY time DESC LIMIT 1")[0][0]
        self.assertEqual(body["runs"][-1]["run_id"], str(newest))

    def test_unmigrated_database_gives_503_and_simulate_still_succeeds(self):
        name = f"empty_{uuid.uuid4().hex[:8]}"
        with psycopg.connect(self.url, autocommit=True) as conn:
            conn.execute(f'CREATE DATABASE "{name}"')
        os.environ[history.DATABASE_URL_ENV] = f"{self.server}/{name}"
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 503)
        self.assertIn("python -m services.history migrate", response.json()["detail"])
        with self.assertLogs("rainbowbone.history", "WARNING"):
            simulated = self.post_scan()
        self.assertEqual(simulated.status_code, 200)
        self.assertEqual({name: simulated.json()[name] for name in RESULT}, RESULT)

    def test_unreachable_database_gives_503_and_simulate_still_succeeds(self):
        os.environ[history.DATABASE_URL_ENV] = f"postgresql://postgres@127.0.0.1:{_free_port()}/postgres"
        with self.assertLogs("rainbowbone.history", "WARNING"):
            response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 503)
        with self.assertLogs("rainbowbone.history", "WARNING"):
            simulated = self.post_scan()
        self.assertEqual(simulated.status_code, 200)
        self.assertEqual({name: simulated.json()[name] for name in RESULT}, RESULT)


if __name__ == "__main__":
    unittest.main()
