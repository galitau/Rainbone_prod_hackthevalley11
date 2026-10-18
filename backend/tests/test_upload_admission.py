"""Exercise admission at the ASGI boundary, before multipart parsing or reads."""
import asyncio
import threading
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import main


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_busy_upload_does_not_read_or_parse_the_body(self):
        admission = threading.BoundedSemaphore(1)
        admission.acquire()
        downstream = mock.AsyncMock()
        receive = mock.AsyncMock(side_effect=AssertionError("body must not be consumed"))
        sent = []

        async def send(message):
            sent.append(message)

        with mock.patch.object(main, "UPLOAD_ADMISSION", admission):
            await main.UploadAdmissionMiddleware(downstream)(
                {"type": "http", "method": "POST", "path": "/api/simulate"}, receive, send)
        self.assertEqual(sent[0]["status"], 429)
        self.assertIn((b"retry-after", b"5"), sent[0]["headers"])
        receive.assert_not_called()
        downstream.assert_not_called()
        admission.release()

    async def test_cancellation_releases_admission(self):
        admission = threading.BoundedSemaphore(1)
        entered = asyncio.Event()

        async def downstream(scope, receive, send):
            entered.set()
            await asyncio.Event().wait()

        with mock.patch.object(main, "UPLOAD_ADMISSION", admission):
            task = asyncio.create_task(main.UploadAdmissionMiddleware(downstream)(
                {"type": "http", "method": "POST", "path": "/api/simulate"}, None, None))
            await entered.wait()
            self.assertFalse(admission.acquire(blocking=False))
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertTrue(admission.acquire(blocking=False))
        admission.release()

    async def test_exception_releases_admission(self):
        admission = threading.BoundedSemaphore(1)
        with mock.patch.object(main, "UPLOAD_ADMISSION", admission):
            with self.assertRaisesRegex(RuntimeError, "parse failure"):
                await main.UploadAdmissionMiddleware(mock.AsyncMock(side_effect=RuntimeError("parse failure")))(
                    {"type": "http", "method": "POST", "path": "/api/simulate"}, None, None)
        self.assertTrue(admission.acquire(blocking=False))
        admission.release()


class AdmissionRouteTests(unittest.TestCase):
    def test_busy_engine_preserves_health_and_cors_retry_header(self):
        admission = threading.BoundedSemaphore(1)
        admission.acquire()
        with mock.patch.object(main, "UPLOAD_ADMISSION", admission), TestClient(main.app) as client:
            response = client.post("/api/simulate", content=b"not even multipart", headers={"Origin": "https://rainbone.health"})
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "5")
            self.assertEqual(response.headers["access-control-allow-origin"], "https://rainbone.health")
            self.assertIn("Retry-After", response.headers["access-control-expose-headers"])
            self.assertEqual(client.get("/health").status_code, 200)
        admission.release()

    def test_validation_and_solver_errors_do_not_leak_admission(self):
        admission = threading.BoundedSemaphore(1)
        with mock.patch.object(main, "UPLOAD_ADMISSION", admission), TestClient(main.app) as client:
            self.assertEqual(client.post("/api/simulate").status_code, 422)
            self.assertEqual(client.post("/api/simulate", files={"file": ("bad.txt", b"x")}).status_code, 400)
            self.assertEqual(client.post("/api/simulate", files={"file": ("empty.nii", b"")}).status_code, 400)
            with mock.patch.object(main, "MAX_UPLOAD_BYTES", 1):
                self.assertEqual(client.post("/api/simulate", files={"file": ("big.nii", b"xx")}).status_code, 413)
            with mock.patch.object(main, "simulate_fea", side_effect=main.FEASolverError("bad scan")):
                self.assertEqual(client.post("/api/simulate", files={"file": ("bad.nii", b"unique-invalid")}).status_code, 422)
        self.assertTrue(admission.acquire(blocking=False))
        admission.release()
