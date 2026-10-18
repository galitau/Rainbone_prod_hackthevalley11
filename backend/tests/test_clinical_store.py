"""The clinical/ research data in object storage without a real bucket: moto stands in for Vultr.

Covers scripts/vultr_pipeline/publish_clinical.py (upload) and services/clinical_store.py (verified read with
the bundled backup copy). Run from backend/:  python -m unittest tests.test_clinical_store -v
"""
from __future__ import annotations

import contextlib
import dataclasses
import hashlib
import importlib.util
import io
import json
import os
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

ENDPOINT = "https://ewr1.vultrobjects.com"
os.environ.setdefault("MOTO_S3_CUSTOM_ENDPOINTS", ENDPOINT)  # read when moto is imported

import boto3  # noqa: E402
from botocore.exceptions import ClientError, EndpointConnectionError  # noqa: E402

try:
    from moto import mock_aws  # noqa: E402
except ImportError:  # moto is a test-only dependency (backend/requirements-dev.txt)
    raise unittest.SkipTest("moto not installed: pip install -r requirements-dev.txt") from None

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from services import clinical_store as cs  # noqa: E402
from services import explain as ex  # noqa: E402
from services import risk as rk  # noqa: E402
from services.settings import runtime_env  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "publish_clinical", REPO_ROOT / "scripts" / "vultr_pipeline" / "publish_clinical.py")
publish_clinical = importlib.util.module_from_spec(_spec)
sys.modules["publish_clinical"] = publish_clinical  # dataclasses look their module up there
_spec.loader.exec_module(publish_clinical)

BUCKET = "rb-test-clinical"
ACCESS_KEY = "TESTACCESSKEY0000000"
SECRET_KEY = "test-secret-not-a-real-key-0000000000000"
S3_ENV = {
    "VULTR_S3_ENDPOINT": ENDPOINT,
    "VULTR_S3_ACCESS_KEY": ACCESS_KEY,
    "VULTR_S3_SECRET_KEY": SECRET_KEY,
    "VULTR_S3_BUCKET": BUCKET,
}
SECRETS = (ACCESS_KEY, SECRET_KEY, BUCKET, ENDPOINT, "vultrobjects")
RISK_KEY = "clinical/hfvalid/hfvalid-risk.json"
FEMUR_KEY = "clinical/hfvalid/pat001-femur-manifest.json"


def local(name: str) -> bytes:
    return cs.CATALOGUE[name].local.read_bytes()


def run_main(argv: list[str], env: dict[str, str]) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.dict(os.environ), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        for name in cs.ENV_VARS:
            os.environ.pop(name, None)
        os.environ.update(env)
        code = publish_clinical.main(argv)
    return code, out.getvalue(), err.getvalue()


class StoreTestCase(unittest.TestCase):
    def setUp(self) -> None:
        cs.reset_cache()
        self.addCleanup(cs.reset_cache)

    def assertNoSecrets(self, text: str) -> None:
        for secret in SECRETS:
            self.assertNotIn(secret, text)


class PinAndIndexTests(StoreTestCase):
    def test_every_bundled_copy_matches_the_sha256_pinned_next_to_it(self):
        for name, entry in cs.CATALOGUE.items():
            with self.subTest(name=name):
                self.assertEqual(hashlib.sha256(entry.local.read_bytes()).hexdigest(), cs.pinned_sha256(entry))
                # sha256sum format, so `shasum -a 256 -c <file>.sha256` checks it from the file's folder
                self.assertEqual(entry.pin_path.read_text(encoding="utf-8"),
                                 f"{cs.pinned_sha256(entry)}  {entry.local.name}\n")

    def test_catalogue_keys(self):
        self.assertEqual({e.key for e in cs.CATALOGUE.values()}, {RISK_KEY, FEMUR_KEY})
        self.assertEqual(cs.INDEX_KEY, "clinical/index.json")

    def test_index_is_deterministic_and_describes_each_file(self):
        files = {name: local(name) for name in cs.CATALOGUE}
        first = cs.build_index(files)
        self.assertEqual(first, cs.build_index(dict(reversed(list(files.items())))))
        index = json.loads(first)
        self.assertEqual(index["data"], "de-identified public research data, not patient records")
        for name, data in files.items():
            with self.subTest(name=name):
                entry = index["files"][name]
                self.assertEqual(entry["key"], cs.CATALOGUE[name].key)
                self.assertEqual(entry["sha256"], hashlib.sha256(data).hexdigest())
                self.assertEqual(entry["bytes"], len(data))
                self.assertEqual(entry["licence"], "CC BY 4.0")
                self.assertEqual(entry["source"]["doi"], "10.6092/unibo/amsacta/8431")
                self.assertIn("HFValid collection", entry["source"]["citation"])
                self.assertEqual(entry["data"], "de-identified public research data, not patient records")
        # Matches the dataset's own source block, so the index cannot drift from what the risk card cites.
        risk_source = json.loads(files["hfvalid-risk"])["source"]
        self.assertEqual((risk_source["citation"], risk_source["doi"], risk_source["license"]),
                         (cs.SOURCE["citation"], cs.SOURCE["doi"], cs.LICENCE))

    def test_dry_run_needs_no_credentials_and_puts_the_index_last(self):
        code, out, err = run_main(["--dry-run"], {})
        self.assertEqual((code, err), (0, ""))
        summary = json.loads(out)
        self.assertTrue(summary["dry_run"])
        self.assertEqual([o["key"] for o in summary["objects"]], [RISK_KEY, FEMUR_KEY, cs.INDEX_KEY])
        self.assertEqual(summary["objects"][0]["sha256"], hashlib.sha256(local("hfvalid-risk")).hexdigest())
        self.assertEqual(json.loads(run_main(["--dry-run"], {})[1]), summary)  # deterministic

    def test_missing_configuration_exits_2_naming_only_the_missing_variables(self):
        code, out, err = run_main([], {k: v for k, v in S3_ENV.items() if k != "VULTR_S3_SECRET_KEY"})
        self.assertEqual((code, out), (2, ""))
        self.assertIn("VULTR_S3_SECRET_KEY", err)
        self.assertNotIn("VULTR_S3_BUCKET", err)
        self.assertNoSecrets(err)

    def test_a_file_that_does_not_match_its_pin_is_not_published(self):
        with mock.patch.object(publish_clinical, "pinned_sha256", return_value="0" * 64):
            code, out, err = run_main(["--dry-run"], {})
        self.assertEqual(code, 1)
        self.assertIn("does not match the sha256 pinned", err)

    def test_unknown_name_is_a_key_error(self):
        with self.assertRaises(KeyError):
            cs.get_clinical_json("patients", {})


@mock_aws
class BucketTests(StoreTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.s3 = boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT,
                               aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY)
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"})

    def publish(self) -> dict:
        code, out, err = run_main([], S3_ENV)
        self.assertEqual((code, err), (0, ""), err)
        self.assertNoSecrets(out)
        return json.loads(out)

    def test_publish_uploads_private_objects_then_skips_unchanged_ones(self):
        first = self.publish()
        self.assertEqual([(o["key"], o["action"], o["verified"]) for o in first["objects"]],
                         [(RISK_KEY, "uploaded", True), (FEMUR_KEY, "uploaded", True), (cs.INDEX_KEY, "uploaded", True)])
        for obj in first["objects"]:
            with self.subTest(key=obj["key"]):
                head = self.s3.head_object(Bucket=BUCKET, Key=obj["key"])
                self.assertEqual(head["Metadata"]["sha256"], obj["sha256"])
                self.assertEqual(head["ContentType"], "application/json")
                grants = self.s3.get_object_acl(Bucket=BUCKET, Key=obj["key"])["Grants"]
                self.assertEqual([g["Permission"] for g in grants], ["FULL_CONTROL"])  # the owner only
                self.assertNotIn("URI", grants[0]["Grantee"])  # no AllUsers / AuthenticatedUsers group
        self.assertEqual(self.s3.get_object(Bucket=BUCKET, Key=RISK_KEY)["Body"].read(), local("hfvalid-risk"))
        second = self.publish()
        self.assertEqual([o["action"] for o in second["objects"]], ["unchanged"] * 3)

    def test_reads_verified_objects_from_the_bucket(self):
        self.publish()
        for name, key in (("hfvalid-risk", RISK_KEY), ("pat001-femur-manifest", FEMUR_KEY)):
            with self.subTest(name=name):
                data, grounding = cs.get_clinical_json(name, S3_ENV)
                self.assertEqual(data, json.loads(local(name)))
                self.assertEqual(grounding.model_dump(), {
                    "store": "vultr-object-storage", "key": key, "sha256": cs.pinned_sha256(cs.CATALOGUE[name]),
                    "verified": True, "reason": None})
                self.assertNoSecrets(grounding.model_dump_json())

    def test_a_changed_object_falls_back_to_the_bundled_copy(self):
        self.publish()
        tampered = local("hfvalid-risk").replace(b'"arf0_percent": 47.10747422', b'"arf0_percent": 7.10747422')
        self.assertNotEqual(tampered, local("hfvalid-risk"))
        self.s3.put_object(Bucket=BUCKET, Key=RISK_KEY, Body=tampered, ACL="private")
        with self.assertLogs("rainbowbone.clinical", "WARNING") as logs:
            data, grounding = cs.get_clinical_json("hfvalid-risk", S3_ENV)
        self.assertEqual(data, json.loads(local("hfvalid-risk")))
        self.assertEqual((grounding.store, grounding.verified), ("local-backup", True))
        self.assertEqual(grounding.reason, f"{RISK_KEY} does not match its pinned sha256")
        self.assertNoSecrets("\n".join(logs.output))

    def test_a_changed_object_with_a_matching_index_still_falls_back(self):
        """The index cannot vouch for itself: its sha256 must be the one pinned in the repository."""
        self.publish()
        tampered = local("hfvalid-risk").replace(b'"arf0_percent": 47.10747422', b'"arf0_percent": 7.10747422')
        index = json.loads(self.s3.get_object(Bucket=BUCKET, Key=cs.INDEX_KEY)["Body"].read())
        index["files"]["hfvalid-risk"].update(sha256=hashlib.sha256(tampered).hexdigest(), bytes=len(tampered))
        self.s3.put_object(Bucket=BUCKET, Key=RISK_KEY, Body=tampered)
        self.s3.put_object(Bucket=BUCKET, Key=cs.INDEX_KEY, Body=json.dumps(index).encode())
        data, grounding = cs.get_clinical_json("hfvalid-risk", S3_ENV)
        self.assertEqual(data["subjects"]["Pat001"]["arf0_percent"], 47.10747422)
        self.assertEqual(grounding.store, "local-backup")
        self.assertIn("not the one pinned in the repository", grounding.reason)

    def test_missing_objects_fall_back_with_the_status_only(self):
        with self.assertLogs("rainbowbone.clinical", "WARNING"):
            data, grounding = cs.get_clinical_json("pat001-femur-manifest", S3_ENV)
        self.assertEqual(data["case_id"], "Pat001")
        self.assertEqual(grounding.store, "local-backup")
        self.assertEqual(grounding.reason, f"object storage answered 404 NoSuchKey for {cs.INDEX_KEY}")

    def test_a_bucket_read_is_kept_for_ten_minutes(self):
        self.publish()
        clock = [1000.0]
        with mock.patch.object(cs, "_now", lambda: clock[0]):
            self.assertEqual(cs.get_clinical_json("hfvalid-risk", S3_ENV)[1].store, "vultr-object-storage")
            self.s3.delete_object(Bucket=BUCKET, Key=RISK_KEY)
            clock[0] += cs.CACHE_TTL_S - 1
            self.assertEqual(cs.get_clinical_json("hfvalid-risk", S3_ENV)[1].store, "vultr-object-storage")
            clock[0] += 2
            with self.assertLogs("rainbowbone.clinical", "WARNING"):
                self.assertEqual(cs.get_clinical_json("hfvalid-risk", S3_ENV)[1].store, "local-backup")
            # The fallback is kept for a minute only, then the bucket is asked again.
            self.publish()
            clock[0] += cs.FALLBACK_TTL_S - 1
            self.assertEqual(cs.get_clinical_json("hfvalid-risk", S3_ENV)[1].store, "local-backup")
            clock[0] += 2
            self.assertEqual(cs.get_clinical_json("hfvalid-risk", S3_ENV)[1].store, "vultr-object-storage")
        self.assertLessEqual(len(cs._cache), len(cs.CATALOGUE))


@mock_aws
class GroundedAnswerTests(StoreTestCase):
    """The AI endpoints word facts read from the bucket, and say so; without it they use the bundled copy."""

    def setUp(self) -> None:
        super().setUp()
        for reset in (ex.reset_cooldowns, rk.reset_cooldowns):
            reset()
            self.addCleanup(reset)
        self.s3 = boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT,
                               aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY)
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"})
        self.assertEqual(run_main([], S3_ENV)[0], 0)
        self.env = {"AI_OFFLINE": "1", **S3_ENV}
        main.app.dependency_overrides[runtime_env] = lambda: self.env
        main.app.dependency_overrides[ex.runtime_env] = lambda: self.env
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)

    def test_risk_analysis_reads_the_table_from_the_bucket(self):
        body = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        self.assertEqual(body["grounding"], {"store": "vultr-object-storage", "key": RISK_KEY, "verified": True,
                                             "sha256": cs.pinned_sha256(cs.CATALOGUE["hfvalid-risk"]), "reason": None})
        self.assertEqual(body["facts"]["arf0_percent"], 47.1)
        self.assertNoSecrets(json.dumps(body))

    def test_risk_analysis_falls_back_when_the_bucket_is_changed(self):
        self.s3.put_object(Bucket=BUCKET, Key=RISK_KEY, Body=b'{"subjects": {}}')
        with self.assertLogs("rainbowbone.clinical", "WARNING"):
            body = self.client.post("/api/risk-analysis", json={"case_id": "Pat001"}).json()
        self.assertEqual(body["grounding"]["store"], "local-backup")
        self.assertEqual(body["grounding"]["reason"], f"{RISK_KEY} does not match its pinned sha256")
        self.assertEqual(body["facts"]["arf0_percent"], 47.1)

    def test_explain_with_a_case_id_reads_the_femur_numbers_from_the_bucket(self):
        manifest = json.loads(local("pat001-femur-manifest"))
        metrics = manifest["metrics"]
        # The numbers the dashboard sends (frontend/lib/model.ts FEMUR_EXPLAIN_REQUEST), from the same manifest.
        sent = {"load_newtons": metrics["load_newtons"], "max_von_mises_stress_mpa": metrics["max_nodal_von_mises_mpa"],
                "average_youngs_modulus_gpa": metrics["youngs_modulus_mpa"] / 1000,
                "bone_volume_cm3": metrics["volume_cm3"],
                "fracture_risk_index_percent": metrics["max_nodal_von_mises_mpa"] / 150 * 100}
        by_case = self.client.post("/api/explain", json={"case_id": "Pat001"}).json()
        self.assertEqual(by_case["grounding"]["store"], "vultr-object-storage")
        self.assertTrue(by_case["grounding"]["verified"])
        self.assertEqual(by_case["grounding"]["key"], FEMUR_KEY)
        by_numbers = self.client.post("/api/explain", json=sent).json()
        self.assertIsNone(by_numbers["grounding"])
        self.assertEqual(by_case["text"], by_numbers["text"])  # the same facts, so the same template text
        self.assertIn("408 cm³", by_case["text"])
        # Numbers sent with a case_id are not used: the case's own are.
        mixed = self.client.post("/api/explain", json={**sent, "bone_volume_cm3": 1.5, "case_id": "Pat001"}).json()
        self.assertEqual(mixed["text"], by_case["text"])

    def test_explain_case_errors(self):
        self.assertEqual(self.client.post("/api/explain", json={"case_id": "Pat002"}).status_code, 404)
        for body in ({"case_id": ""}, {"case_id": 1}, {"case_id": None}, {}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/api/explain", json=body).status_code, 422)

    def test_the_index_strength_matches_the_solver(self):
        from services.fea_solver import ASSUMED_STRENGTH_MPA

        self.assertEqual(ex.ASSUMED_STRENGTH_MPA, ASSUMED_STRENGTH_MPA)


class FallbackTests(StoreTestCase):
    """Bucket failures with a stub client: each falls back and the reason names no secret."""

    def read(self, client) -> tuple:
        with self.assertLogs("rainbowbone.clinical", "WARNING") as logs:
            data, grounding = cs.get_clinical_json("hfvalid-risk", S3_ENV, client=client)
        self.assertEqual(data, json.loads(local("hfvalid-risk")))
        self.assertEqual(grounding.store, "local-backup")
        self.assertTrue(grounding.verified)
        self.assertEqual(grounding.sha256, hashlib.sha256(local("hfvalid-risk")).hexdigest())
        self.assertNoSecrets(grounding.model_dump_json() + "\n".join(logs.output))
        return grounding

    def test_not_configured(self):
        with self.assertLogs("rainbowbone.clinical", "WARNING"):
            data, grounding = cs.get_clinical_json("hfvalid-risk", {"VULTR_S3_BUCKET": BUCKET})
        self.assertEqual(grounding.reason, "object storage not configured (VULTR_S3_* not set)")
        self.assertEqual(grounding.key, RISK_KEY)

    def test_access_denied(self):
        client = mock.Mock()
        client.get_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": f"denied for {BUCKET} with {ACCESS_KEY}"},
             "ResponseMetadata": {"HTTPStatusCode": 403}}, "GetObject")
        self.assertEqual(self.read(client).reason, f"object storage answered 403 AccessDenied for {cs.INDEX_KEY}")

    def test_unreachable(self):
        client = mock.Mock()
        client.get_object.side_effect = EndpointConnectionError(endpoint_url=ENDPOINT)
        self.assertEqual(self.read(client).reason, "object storage unreachable (EndpointConnectionError)")

    def test_any_other_error(self):
        client = mock.Mock()
        client.get_object.side_effect = RuntimeError(f"{SECRET_KEY} at {ENDPOINT}")
        self.assertEqual(self.read(client).reason, "object storage read failed (RuntimeError)")

    def test_index_without_the_entry(self):
        client = mock.Mock()
        client.get_object.return_value = {"Body": io.BytesIO(b'{"files": {}}')}
        self.assertEqual(self.read(client).reason, f"{cs.INDEX_KEY} has no usable entry for hfvalid-risk")

    def test_one_short_attempt_per_object(self):
        client = cs.make_client(cs.s3_settings(S3_ENV))
        self.assertEqual(client.meta.config.retries["total_max_attempts"], 1)
        self.assertLessEqual(client.meta.config.connect_timeout, 1)
        self.assertLessEqual(client.meta.config.read_timeout, 1.5)

    def test_concurrent_misses_share_one_read(self):
        def slow_failure(**kwargs):
            time.sleep(0.3)
            raise EndpointConnectionError(endpoint_url=ENDPOINT)

        client = mock.Mock()
        client.get_object.side_effect = slow_failure
        results = []

        def read():
            results.append(cs.get_clinical_json("hfvalid-risk", S3_ENV, client=client)[1])

        with self.assertLogs("rainbowbone.clinical", "WARNING") as logs:
            threads = [threading.Thread(target=read) for _ in range(5)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        self.assertEqual(client.get_object.call_count, 1)
        self.assertEqual(len(logs.output), 1)
        self.assertEqual({g.reason for g in results}, {"object storage unreachable (EndpointConnectionError)"})

    def test_bundled_copy_missing_too_is_unavailable(self):
        entry = cs.CATALOGUE["hfvalid-risk"]
        missing = dataclasses.replace(entry, local=entry.local.with_name("missing.json"))
        with mock.patch.dict(cs.CATALOGUE, {"hfvalid-risk": missing}), self.assertLogs("rainbowbone.clinical"):
            with self.assertRaises(cs.ClinicalDataUnavailable):
                cs.get_clinical_json("hfvalid-risk", {})


if __name__ == "__main__":
    unittest.main()
