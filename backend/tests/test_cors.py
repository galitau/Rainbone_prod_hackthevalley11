"""CORS: which browser origins may call the API (CORS_ALLOW_ORIGINS, CORS_ALLOW_ORIGIN_REGEX).

Run from backend/: python -m unittest -v
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from services.settings import runtime_env  # noqa: E402

PRODUCTION = "https://rainbone.health"
UNKNOWN = "https://not-rainbone.example"


def _main_cors() -> dict[str, object]:
    return next(m.kwargs for m in main.app.user_middleware if m.cls is CORSMiddleware)


def client(env: dict[str, str]) -> TestClient:
    """An app with main's CORS options, except the origins, which come from env."""
    app = FastAPI()
    app.get("/health")(main.health)
    app.add_middleware(CORSMiddleware, **{**_main_cors(), **main.cors_origins(env)})
    return TestClient(app)


def preflight(test_client: TestClient, origin: str):
    return test_client.options("/api/simulate", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})


class CorsTest(unittest.TestCase):
    def test_main_app_reads_its_origins_from_the_environment(self):
        self.assertEqual({k: _main_cors()[k] for k in ("allow_origins", "allow_origin_regex")},
                         main.cors_origins(runtime_env()))

    def test_methods_headers_and_credentials_are_unchanged(self):
        cors = _main_cors()
        self.assertEqual(cors["allow_methods"], ["POST", "GET"])
        self.assertEqual(cors["allow_headers"], ["*"])
        self.assertIs(cors["allow_credentials"], True)

    def test_the_reused_header_is_readable_by_the_page(self):
        # Without expose_headers a cross-origin fetch cannot read X-Simulate-Reused.
        self.assertEqual(_main_cors()["expose_headers"], [main.REUSED_HEADER, "Retry-After"])

    def test_defaults_allow_local_dev_and_the_production_site(self):
        self.assertEqual(main.cors_origins({}), main.cors_origins({"CORS_ALLOW_ORIGINS": " ", "CORS_ALLOW_ORIGIN_REGEX": ""}))
        test_client = client({})
        for origin in ("http://localhost:3000", PRODUCTION, "https://www.rainbone.health"):
            with self.subTest(origin=origin):
                response = preflight(test_client, origin)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["access-control-allow-origin"], origin)
                self.assertEqual(response.headers["access-control-allow-credentials"], "true")
        response = test_client.get("/health", headers={"Origin": PRODUCTION})
        self.assertEqual(response.headers["access-control-allow-origin"], PRODUCTION)

    def test_unknown_origin_is_refused(self):
        test_client = client({})
        response = preflight(test_client, UNKNOWN)
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("access-control-allow-origin", response.headers)
        self.assertNotIn("access-control-allow-origin", test_client.get("/health", headers={"Origin": UNKNOWN}).headers)

    def test_env_list_replaces_the_defaults(self):
        test_client = client({"CORS_ALLOW_ORIGINS": " https://staging.example.org , https://other.example/ "})
        for origin in ("https://staging.example.org", "https://other.example"):
            with self.subTest(origin=origin):
                self.assertEqual(preflight(test_client, origin).headers["access-control-allow-origin"], origin)
        self.assertEqual(preflight(test_client, PRODUCTION).status_code, 400)

    def test_env_regex_adds_matching_origins(self):
        test_client = client({"CORS_ALLOW_ORIGIN_REGEX": r"https://rainbone-[a-z0-9-]+\.vercel\.app"})
        preview = "https://rainbone-abc123.vercel.app"
        self.assertEqual(preflight(test_client, preview).headers["access-control-allow-origin"], preview)
        self.assertEqual(preflight(test_client, PRODUCTION).status_code, 200)
        # The whole origin must match, not a prefix of it.
        self.assertEqual(preflight(test_client, preview + ".evil.example").status_code, 400)


if __name__ == "__main__":
    unittest.main()
