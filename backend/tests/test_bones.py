"""GET /api/bones without a real bucket: moto stands in for Vultr Object Storage.

Run from backend/:  python -m unittest tests.test_bones -v
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

ENDPOINT = "https://ewr1.vultrobjects.com"
os.environ.setdefault("MOTO_S3_CUSTOM_ENDPOINTS", ENDPOINT)  # read when moto is imported

import boto3  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from moto import mock_aws  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402
import routes_bones  # noqa: E402

BUCKET = "rb-test-bones"
ACCESS_KEY = "TESTACCESSKEY0000000"
SECRET_KEY = "test-secret-not-a-real-key-0000000000000"
S3_ENV = {
    "VULTR_S3_ENDPOINT": ENDPOINT,
    "VULTR_S3_ACCESS_KEY": ACCESS_KEY,
    "VULTR_S3_SECRET_KEY": SECRET_KEY,
    "VULTR_S3_BUCKET": BUCKET,
}
# Test data in the shape pipeline.py writes; not a pipeline output.
MANIFEST = {
    "schema": "rainbowbone.bones/v1",
    "generated_at": "2026-10-18T03:00:00Z",
    "dataset": {"title": "CTPelvic1K Dataset", "licence": "cc-by-4.0", "doi": "10.5281/zenodo.4588403"},
    "segmentation_tool": {"name": "TotalSegmentator", "licence": "Apache-2.0"},
    "mesh": {"format": "VTK XML PolyData (.vtp)"},
    "notice": "Research data. Not for clinical use.",
    "cases": [
        {
            "case_id": "dataset6_CLINIC_0060",
            "timings_seconds": {"totalsegmentator": 12.5},
            "files": [
                {"kind": "mask", "bone": "sacrum", "key": "ctpelvic1k/dataset6_CLINIC_0060/masks/sacrum.nii.gz",
                 "bytes": 4, "sha256": "a" * 64, "content_type": "application/gzip", "volume_ml": 101.5},
                {"kind": "mesh", "bone": "sacrum", "key": "ctpelvic1k/dataset6_CLINIC_0060/meshes/sacrum.vtp",
                 "bytes": 10, "sha256": "b" * 64, "content_type": "application/xml", "triangles": 1200},
                {"kind": "mesh", "bone": "x", "key": "private/other-project.bin",
                 "bytes": 1, "sha256": "c" * 64, "content_type": "application/octet-stream"},
            ],
        }
    ],
}


def clear_s3_env() -> None:
    for name in routes_bones.ENV_VARS:
        os.environ.pop(name, None)


class MissingConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = mock.patch.dict(os.environ, {})
        patcher.start()
        self.addCleanup(patcher.stop)
        clear_s3_env()
        self.client = TestClient(main.app)

    def test_503_names_every_missing_variable(self):
        response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 503)
        detail = response.json()["detail"]
        for name in routes_bones.ENV_VARS:
            self.assertIn(name, detail)

    def test_503_names_only_what_is_missing_and_never_echoes_values(self):
        os.environ.update({k: v for k, v in S3_ENV.items() if k != "VULTR_S3_SECRET_KEY"})
        os.environ["VULTR_S3_SECRET_KEY"] = "   "
        response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 503)
        self.assertIn("VULTR_S3_SECRET_KEY", response.json()["detail"])
        self.assertNotIn("VULTR_S3_BUCKET", response.json()["detail"])
        for value in (ACCESS_KEY, BUCKET, ENDPOINT):
            self.assertNotIn(value, response.text)


@mock_aws
class PresignedUrlTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = mock.patch.dict(os.environ, S3_ENV)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.s3 = boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT,
                               aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY)
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"})
        self.client = TestClient(main.app)

    def put_manifest(self, body: bytes) -> None:
        self.s3.put_object(Bucket=BUCKET, Key=routes_bones.MANIFEST_KEY, Body=body, ACL="private")

    def test_returns_manifest_with_short_lived_presigned_urls(self):
        self.put_manifest(json.dumps(MANIFEST).encode())
        with self.assertNoLogs("routes_bones", level="WARNING"):
            response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["expires_in_seconds"], 900)
        self.assertEqual(payload["dataset"]["licence"], "cc-by-4.0")
        self.assertNotIn(SECRET_KEY, response.text)

        files = payload["cases"][0]["files"]
        self.assertEqual([f["key"] for f in files], [f["key"] for f in MANIFEST["cases"][0]["files"][:2]])
        self.assertEqual(files[0]["volume_ml"], 101.5)  # extra manifest fields pass through
        self.assertEqual(payload["cases"][0]["timings_seconds"], {"totalsegmentator": 12.5})
        for entry in files:
            url = urlparse(entry["url"])
            query = parse_qs(url.query)
            self.assertEqual(f"{url.scheme}://{url.netloc}", ENDPOINT)
            self.assertEqual(url.path, f"/{BUCKET}/{entry['key']}")
            self.assertEqual(query["X-Amz-Algorithm"], ["AWS4-HMAC-SHA256"])
            self.assertEqual(query["X-Amz-Expires"], ["900"])
            self.assertEqual(query["X-Amz-SignedHeaders"], ["host"])
            self.assertRegex(query["X-Amz-Credential"][0], rf"^{ACCESS_KEY}/\d{{8}}/ewr1/s3/aws4_request$")
            self.assertRegex(query["X-Amz-Signature"][0], r"^[0-9a-f]{64}$")

    def test_404_when_the_pipeline_has_not_uploaded_a_manifest(self):
        response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 404)
        self.assertIn("ctpelvic1k/manifest.json", response.json()["detail"])

    def test_502_for_a_manifest_that_is_not_json(self):
        self.put_manifest(b"<html>not a manifest</html>")
        response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 502)

    def test_502_for_a_manifest_without_a_case_list(self):
        self.put_manifest(json.dumps({"cases": {"not": "a list"}}).encode())
        self.assertEqual(self.client.get("/api/bones").status_code, 502)

    def test_502_without_leaking_keys_when_the_bucket_is_wrong(self):
        with mock.patch.dict(os.environ, {"VULTR_S3_BUCKET": "no-such-bucket"}):
            with self.assertLogs("routes_bones", level="WARNING") as logs:
                response = self.client.get("/api/bones")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Object storage request failed.")
        for line in logs.output:
            self.assertNotIn(SECRET_KEY, line)
            self.assertNotIn(ACCESS_KEY, line)


if __name__ == "__main__":
    unittest.main()
