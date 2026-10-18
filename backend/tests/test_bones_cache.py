"""Cache behavior: one storage read per window, correct URL expiry, no stale errors."""
import threading
import unittest
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest import mock

from fastapi import HTTPException
import routes_bones as bones


class BonesCacheTests(unittest.TestCase):
    def setUp(self):
        self.settings = {"endpoint": "https://example.invalid", "bucket": "test", "access_key": "test-key", "secret_key": "test-secret"}
        self.now = datetime(2026, 10, 18, tzinfo=timezone.utc)
        self.clock = mock.Mock()
        self.clock.now.return_value = self.now
        self.response = bones.BonesResponse(expires_in_seconds=900, expires_at=self.now + timedelta(seconds=900), manifest_key=bones.MANIFEST_KEY, cases=[])
        for patch in [mock.patch.object(bones, "_manifest_cache", None),
                      mock.patch.object(bones, "_inflight", {}),
                      mock.patch.object(bones, "_settings", return_value=self.settings),
                      mock.patch.object(bones, "datetime", self.clock)]:
            patch.start()
            self.addCleanup(patch.stop)

    def test_cache_hit_uses_remaining_url_lifetime_and_preserves_expiry(self):
        with mock.patch.object(bones, "_read_bones", return_value=self.response) as read:
            first = bones.list_bones()
            self.clock.now.return_value = self.now + timedelta(seconds=12)
            second = bones.list_bones()
        read.assert_called_once()
        self.assertEqual(first.expires_in_seconds, 900)
        self.assertEqual(second.expires_in_seconds, 888)
        self.assertEqual(second.expires_at, first.expires_at)

    def test_expired_cache_refetches_and_does_not_serve_stale_data_on_failure(self):
        with mock.patch.object(bones.time, "monotonic", return_value=100) as clock, mock.patch.object(bones, "_read_bones", return_value=self.response) as read:
            bones.list_bones()
            clock.return_value = 100 + bones.MANIFEST_CACHE_SECONDS
            read.side_effect = HTTPException(502, "Object storage request failed.")
            with self.assertRaises(HTTPException):
                bones.list_bones()
            self.assertIsNone(bones._manifest_cache)
            read.side_effect = None
            bones.list_bones()
            self.assertEqual(read.call_count, 3)

    def test_storage_configuration_or_credentials_change_refetches(self):
        with mock.patch.object(bones, "_read_bones", return_value=self.response) as read:
            bones.list_bones()
            for field in ["endpoint", "bucket", "access_key", "secret_key"]:
                self.settings[field] += "-changed"
                bones.list_bones()
            self.assertEqual(read.call_count, 5)

    def test_expired_signed_urls_are_never_returned_even_inside_cache_window(self):
        with mock.patch.object(bones, "_read_bones", return_value=self.response) as read:
            bones.list_bones()
            self.clock.now.return_value = self.now + timedelta(seconds=901)
            bones.list_bones()
            self.assertEqual(read.call_count, 2)

    def test_callers_cannot_mutate_cached_response(self):
        with mock.patch.object(bones, "_read_bones", return_value=self.response):
            first = bones.list_bones()
            first.dataset["name"] = "changed by caller"
            self.assertEqual(bones.list_bones().dataset, {})

    def test_concurrent_misses_share_one_read(self):
        entered = threading.Event()
        release = threading.Event()
        def read(_):
            entered.set()
            if not release.wait(5):
                raise AssertionError("test did not release storage read")
            return self.response
        with mock.patch.object(bones, "_read_bones", side_effect=read) as storage:
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(bones.list_bones) for _ in range(4)]
                self.assertTrue(entered.wait(5))
                release.set()
                results = [future.result(timeout=5) for future in futures]
        self.assertEqual(storage.call_count, 1)
        self.assertEqual(len(results), 4)

    def test_concurrent_failure_is_shared_and_later_request_can_retry(self):
        entered = threading.Event()
        release = threading.Event()
        waiting = threading.Event()
        guard = threading.Lock()
        count = 0
        pending = Future()
        original_result = pending.result
        def wait_for_result():
            nonlocal count
            with guard:
                count += 1
                if count == 3:
                    waiting.set()
            return original_result(timeout=5)
        def read(_):
            entered.set()
            if not release.wait(5):
                raise AssertionError("test did not release storage read")
            raise HTTPException(502, "Object storage request failed.")
        with mock.patch.object(bones, "_read_bones", side_effect=read) as storage, mock.patch.object(bones, "Future", return_value=pending), mock.patch.object(pending, "result", side_effect=wait_for_result):
            with ThreadPoolExecutor(max_workers=4) as pool:
                requests = [pool.submit(bones.list_bones) for _ in range(4)]
                try:
                    self.assertTrue(entered.wait(5))
                    self.assertTrue(waiting.wait(5))
                finally:
                    release.set()
                for request in requests:
                    with self.assertRaises(HTTPException) as raised:
                        request.result(timeout=5)
                    self.assertEqual(raised.exception.status_code, 502)
            self.assertEqual(storage.call_count, 1)
        self.assertIsNone(bones._manifest_cache)
        with mock.patch.object(bones, "_read_bones", return_value=self.response) as recovered:
            self.assertEqual(bones.list_bones().expires_in_seconds, 900)
            recovered.assert_called_once()


if __name__ == "__main__":
    unittest.main()
