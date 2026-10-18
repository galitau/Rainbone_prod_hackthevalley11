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


class SplitAdmissionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        import httpx
        self.httpx = httpx
        main._simulate_results.clear()
        self.addCleanup(main._simulate_results.clear)
        self.uploads = threading.BoundedSemaphore(2)
        self.solves = threading.BoundedSemaphore(1)
        for name, value in (("UPLOAD_ADMISSION", self.uploads), ("SOLVE_ADMISSION", self.solves),
                            ("SOLVE_LIMITER", main.anyio.CapacityLimiter(1)),
                            ("save_simulation_run", mock.Mock())):
            patcher = mock.patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def client(self):
        return self.httpx.AsyncClient(transport=self.httpx.ASGITransport(app=main.app), base_url="http://test")

    async def post(self, client, payload=b"cached"):
        return await client.post("/api/simulate", files={"file": ("scan.nii", payload)})

    @staticmethod
    def result(payload, filename):
        from tests.test_simulate import fake_result
        return fake_result(filename)

    async def test_cached_repost_bypasses_full_solve_admission(self):
        with mock.patch.object(main, "simulate_fea", side_effect=self.result) as solve:
            async with self.client() as client:
                self.assertEqual((await self.post(client)).status_code, 200)
                self.solves.acquire()
                try:
                    cached = await self.post(client)
                    refused = await self.post(client, b"new")
                finally:
                    self.solves.release()
        self.assertEqual(cached.status_code, 200)
        self.assertEqual(cached.headers[main.REUSED_HEADER], "1")
        self.assertEqual(refused.status_code, 429)
        self.assertEqual(refused.headers["retry-after"], "5")
        self.assertEqual(solve.call_count, 1)

    async def test_slow_body_does_not_block_cached_repost(self):
        entered, finish = asyncio.Event(), asyncio.Event()
        async def chunks():
            yield b'--x\r\nContent-Disposition: form-data; name="file"; filename="slow.nii"\r\n\r\n'
            entered.set()
            await finish.wait()
            yield b'slow\r\n--x--\r\n'
        with mock.patch.object(main, "simulate_fea", side_effect=self.result):
            async with self.client() as client:
                await self.post(client)
                slow = asyncio.create_task(client.post("/api/simulate", content=chunks(),
                    headers={"Content-Type": "multipart/form-data; boundary=x"}))
                try:
                    await asyncio.wait_for(entered.wait(), 2)
                    cached = await asyncio.wait_for(self.post(client), 2)
                    self.assertEqual(cached.status_code, 200)
                    self.assertEqual(cached.headers[main.REUSED_HEADER], "1")
                finally:
                    finish.set()
                    await slow

    async def test_slow_database_holds_neither_upload_nor_solve_slot(self):
        entered, finish = threading.Event(), threading.Event()
        def save(*args, **kwargs):
            entered.set()
            finish.wait(5)
        with mock.patch.object(main, "simulate_fea", side_effect=self.result), mock.patch.object(main, "save_simulation_run", side_effect=save):
            async with self.client() as client:
                pending = asyncio.create_task(self.post(client))
                try:
                    self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                    self.assertTrue(self.solves.acquire(blocking=False))
                    self.solves.release()
                    self.assertTrue(self.uploads.acquire(blocking=False))
                    self.assertTrue(self.uploads.acquire(blocking=False))
                    self.uploads.release(); self.uploads.release()
                    self.assertEqual((await asyncio.wait_for(self.post(client), 2)).status_code, 200)
                finally:
                    finish.set()
                    await pending

    async def test_body_timeout_is_408_and_closes_partial_spool(self):
        import tempfile
        import starlette.formparsers
        opened = []
        original = tempfile.SpooledTemporaryFile
        def spool(*args, **kwargs):
            value = original(*args, **kwargs)
            opened.append(value)
            return value
        async def chunks():
            yield b'--x\r\nContent-Disposition: form-data; name="file"; filename="slow.nii"\r\n\r\npartial'
            await asyncio.Event().wait()
        with mock.patch.object(main, "UPLOAD_BODY_SECONDS", .02), mock.patch.object(starlette.formparsers, "SpooledTemporaryFile", side_effect=spool):
            async with self.client() as client:
                response = await client.post("/api/simulate", content=chunks(), headers={"Content-Type": "multipart/form-data; boundary=x"})
        self.assertEqual(response.status_code, 408)
        self.assertTrue(opened)
        self.assertTrue(all(file.closed for file in opened))
        self.assertTrue(self.uploads.acquire(blocking=False)); self.uploads.release()
        self.assertTrue(self.solves.acquire(blocking=False)); self.solves.release()

    async def test_running_worker_retains_slot_until_done_after_cancellation(self):
        import io
        from starlette.datastructures import UploadFile
        entered, finish, stopped = threading.Event(), threading.Event(), threading.Event()
        def solve(payload, filename):
            entered.set()
            try:
                finish.wait(5)
                return self.result(payload, filename)
            finally:
                stopped.set()
        with mock.patch.object(main, "simulate_fea", side_effect=solve):
            task = asyncio.create_task(main.simulate(UploadFile(io.BytesIO(b"cancel"), filename="cancel.nii"), main.BackgroundTasks(), main.Response()))
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertFalse(self.solves.acquire(blocking=False))
            finally:
                finish.set()
                await asyncio.to_thread(stopped.wait, 2)
                for _ in range(100):
                    if self.solves.acquire(blocking=False):
                        self.solves.release()
                        break
                    await asyncio.sleep(.001)
                else:
                    self.fail("running solve leaked its slot")

    async def test_cancelled_queue_releases_slot_without_running_solver(self):
        import io
        from starlette.datastructures import UploadFile
        await main.SOLVE_LIMITER.acquire()
        try:
            with mock.patch.object(main, "simulate_fea") as solve:
                task = asyncio.create_task(main.simulate(UploadFile(io.BytesIO(b"queued"), filename="queued.nii"), main.BackgroundTasks(), main.Response()))
                for _ in range(100):
                    if main.SOLVE_LIMITER.statistics().tasks_waiting:
                        break
                    await asyncio.sleep(.001)
                self.assertEqual(main.SOLVE_LIMITER.statistics().tasks_waiting, 1)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(self.solves.acquire(blocking=False)); self.solves.release()
                solve.assert_not_called()
        finally:
            main.SOLVE_LIMITER.release()

    async def test_cancelled_running_worker_cannot_overlap_a_second_solve(self):
        import io
        from starlette.datastructures import UploadFile
        first_entered, finish_first, second_entered = threading.Event(), threading.Event(), threading.Event()
        def solve(payload, filename):
            if payload == b"first":
                first_entered.set()
                finish_first.wait(5)
            else:
                second_entered.set()
            return self.result(payload, filename)
        def request(payload):
            return main.simulate(UploadFile(io.BytesIO(payload), filename="scan.nii"), main.BackgroundTasks(), main.Response())
        with mock.patch.object(main, "SOLVE_ADMISSION", threading.BoundedSemaphore(3)), mock.patch.object(main, "simulate_fea", side_effect=solve):
            first = asyncio.create_task(request(b"first"))
            second = None
            try:
                self.assertTrue(await asyncio.to_thread(first_entered.wait, 2))
                first.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await first
                second = asyncio.create_task(request(b"second"))
                self.assertFalse(await asyncio.to_thread(second_entered.wait, .05))
            finally:
                finish_first.set()
                if second:
                    await asyncio.wait_for(second, 2)
            self.assertTrue(second_entered.is_set())
