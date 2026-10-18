"""Offline tests for pipeline.py: no network, no real bucket, no real TotalSegmentator.

Zenodo is a mocked urlopen, S3 is moto, and TotalSegmentator is a fake executable put first on PATH.
Run from the repository root:  python -m unittest discover -s scripts/vultr_pipeline -p "test_*.py" -v
"""
from __future__ import annotations

import base64
import contextlib
import gzip
import hashlib
import io
import json
import os
import shutil
import stat
import struct
import sys
import tarfile
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

ENDPOINT = "https://ewr1.vultrobjects.com"
os.environ.setdefault("MOTO_S3_CUSTOM_ENDPOINTS", ENDPOINT)  # read when moto is imported

import boto3  # noqa: E402
import nibabel as nib  # noqa: E402
import numpy as np  # noqa: E402
from moto import mock_aws  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline  # noqa: E402

RECORD = "4588403"
DATA = "CTPelvic1K_dataset6_data.tar.gz"
MASKS = "CTPelvic1K_dataset6_Anonymized_mask.tar.gz"
BUCKET = "rb-test-bones"
ACCESS_KEY = "TESTACCESSKEY0000000"
SECRET_KEY = "test-secret-not-a-real-key-0000000000000"
S3_ENV = {
    "VULTR_S3_ENDPOINT": ENDPOINT,
    "VULTR_S3_ACCESS_KEY": ACCESS_KEY,
    "VULTR_S3_SECRET_KEY": SECRET_KEY,
    "VULTR_S3_BUCKET": BUCKET,
}

FAKE_TOTALSEGMENTATOR = textwrap.dedent(
    """
    # Stand-in for the TotalSegmentator CLI: same flags, writes one cube mask per --roi_subset class.
    import argparse, json, os, sys
    from pathlib import Path
    import nibabel as nib
    import numpy as np

    if "--version" in sys.argv:
        print("2.18.0")
        sys.exit(0)
    with open(os.environ["FAKE_TS_LOG"], "a") as log:
        log.write(json.dumps(sys.argv[1:]) + "\\n")
    if os.environ.get("FAKE_TS_FAIL"):
        sys.exit(3)
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", dest="input", required=True)
    parser.add_argument("-o", dest="output", required=True)
    parser.add_argument("-rs", "--roi_subset", nargs="+", required=True)
    parser.add_argument("-f", "--fast", action="store_true")
    parser.add_argument("-d", "--device")
    args = parser.parse_args()
    image = nib.load(args.input)
    empty = set(filter(None, os.environ.get("FAKE_TS_EMPTY", "").split(",")))
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    for n, bone in enumerate(args.roi_subset):
        mask = np.zeros(image.shape, dtype=np.uint8)
        if bone not in empty:
            mask[2 + n:8 + n, 3:9, 2:7] = 1
        nib.save(nib.Nifti1Image(mask, image.affine), str(out / f"{bone}.nii.gz"))
    """
)


def nifti_gz(array: np.ndarray, affine: np.ndarray | None = None) -> bytes:
    image = nib.Nifti1Image(array, np.diag([0.8, 0.8, 2.0, 1.0]) if affine is None else affine)
    return gzip.compress(image.to_bytes(), compresslevel=1)


def ct_case(seed: int, shape=(48, 48, 40)) -> bytes:
    # Random HU values barely compress, so each member is a few hundred KB inside the tarball.
    return nifti_gz(np.random.default_rng(seed).integers(-1000, 2000, size=shape, dtype=np.int16))


def tarball(top: str, members: list[tuple[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        directory = tarfile.TarInfo(top)
        directory.type = tarfile.DIRTYPE
        archive.addfile(directory)
        for name, payload in members:
            info = tarfile.TarInfo(f"{top}/{name}")
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    return buffer.getvalue()


class CountingResponse(io.BytesIO):
    def __init__(self, data: bytes, counter: dict, url: str) -> None:
        super().__init__(data)
        self._counter, self._url = counter, url

    def read(self, size=-1):
        data = super().read(size)
        self._counter[self._url] = self._counter.get(self._url, 0) + len(data)
        return data


class FakeZenodo:
    """urlopen stand-in serving the record JSON and the two tarballs; counts bytes read per URL."""

    def __init__(self, data: bytes, masks: bytes, data_md5: str | None = None, mask_md5: str | None = None) -> None:
        self.api_url = pipeline.ZENODO_API.format(record=RECORD)
        self.blobs = {
            f"https://zenodo.org/api/records/{RECORD}/files/{DATA}/content": data,
            f"https://zenodo.org/api/records/{RECORD}/files/{MASKS}/content": masks,
        }
        md5s = {DATA: data_md5 or hashlib.md5(data).hexdigest(), MASKS: mask_md5 or hashlib.md5(masks).hexdigest()}
        self.record = {
            "id": int(RECORD),
            "doi": "10.5281/zenodo.4588403",
            "metadata": {
                "title": "CTPelvic1K Dataset",
                "license": {"id": "cc-by-4.0"},
                "creators": [{"name": "Liu, Pengbo"}],
                "references": ["Pengbo Liu et al. Deep Learning to Segment Pelvic Bones (IJCARS 2021)."],
            },
            "files": [
                {"key": key, "size": len(self.blobs[url]), "checksum": f"md5:{md5s[key]}", "links": {"self": url}}
                for key, url in ((DATA, f"https://zenodo.org/api/records/{RECORD}/files/{DATA}/content"),
                                 (MASKS, f"https://zenodo.org/api/records/{RECORD}/files/{MASKS}/content"))
            ],
        }
        self.bytes_read: dict[str, int] = {}
        self.calls: list[str] = []

    def __call__(self, request, timeout=None):
        url = request.full_url
        self.calls.append(url)
        if url == self.api_url:
            return CountingResponse(json.dumps(self.record).encode(), self.bytes_read, url)
        if url in self.blobs:
            return CountingResponse(self.blobs[url], self.bytes_read, url)
        raise OSError(f"unexpected URL {url}")

    def data_url(self) -> str:
        return f"https://zenodo.org/api/records/{RECORD}/files/{DATA}/content"


def five_case_archives() -> tuple[bytes, bytes]:
    data = tarball(
        "CTPelvic1K_dataset6_data",
        [("README.txt", b"not a scan")] + [(f"dataset6_CLINIC_{i:04d}_data.nii.gz", ct_case(i)) for i in (60, 7, 12, 3, 41)],
    )
    masks = tarball(
        "ipcai2021_dataset6_Anonymized",
        [(f"dataset6_CLINIC_{i:04d}_mask_4label.nii.gz", nifti_gz(np.zeros((48, 48, 40), np.uint8))) for i in (3, 7, 12, 41, 60)],
    )
    return data, masks


def read_vtp_array(xml: str, name: str, dtype) -> np.ndarray:
    start = xml.index(f'Name="{name}"')
    body = xml[xml.index(">", start) + 1: xml.index("</DataArray>", start)]
    raw = base64.b64decode(body)
    (length,) = struct.unpack("<I", raw[:4])
    assert length == len(raw) - 4, "VTK header byte count must match the payload"
    return np.frombuffer(raw[4:], dtype=dtype)


class TempDirTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="rb-pipeline-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)


class ZenodoTests(TempDirTest):
    def test_resolves_urls_sizes_and_checksums_from_the_record(self):
        data, masks = five_case_archives()
        zenodo = FakeZenodo(data, masks)
        with mock.patch.object(pipeline, "urlopen", zenodo):
            dataset, files = pipeline.resolve_record(RECORD, [DATA, MASKS])
        self.assertEqual(files[DATA].url, zenodo.data_url())
        self.assertEqual(files[DATA].size, len(data))
        self.assertEqual(files[DATA].md5, hashlib.md5(data).hexdigest())
        self.assertEqual(dataset["licence"], "cc-by-4.0")
        self.assertEqual(dataset["doi_url"], "https://doi.org/10.5281/zenodo.4588403")

    def test_unknown_file_name_lists_what_the_record_has(self):
        zenodo = FakeZenodo(*five_case_archives())
        with mock.patch.object(pipeline, "urlopen", zenodo):
            with self.assertRaises(pipeline.PipelineError) as caught:
                pipeline.resolve_record(RECORD, ["dataset6_CLINIC.zip"])
        self.assertIn("dataset6_CLINIC.zip", str(caught.exception))
        self.assertIn(DATA, str(caught.exception))

    def test_case_ids_match_scans_and_reference_masks(self):
        self.assertEqual(pipeline.case_id_for("CTPelvic1K_dataset6_data/dataset6_CLINIC_0060_data.nii.gz"), "dataset6_CLINIC_0060")
        self.assertEqual(pipeline.case_id_for("x/dataset6_CLINIC_0060_mask_4label.nii.gz"), "dataset6_CLINIC_0060")
        self.assertIsNone(pipeline.case_id_for("x/README.txt"))
        self.assertIsNone(pipeline.case_id_for("x/../.hidden.nii.gz"))


class StreamingTests(TempDirTest):
    def test_stops_reading_after_n_cases(self):
        data, masks = five_case_archives()
        zenodo = FakeZenodo(data, masks)
        with mock.patch.object(pipeline, "urlopen", zenodo):
            _, files = pipeline.resolve_record(RECORD, [DATA])
            result = pipeline.stream_extract_cases(files[DATA], self.tmp / "ct", limit=2)
        names = [case["file"] for case in result["cases"]]
        self.assertEqual(names, ["dataset6_CLINIC_0060_data.nii.gz", "dataset6_CLINIC_0007_data.nii.gz"])
        self.assertEqual(sorted(p.name for p in (self.tmp / "ct").iterdir()), sorted(names))
        self.assertLess(zenodo.bytes_read[zenodo.data_url()], len(data) * 0.75)
        self.assertFalse(result["archive_md5_verified"])
        for case in result["cases"]:
            path = self.tmp / "ct" / case["file"]
            self.assertEqual(case["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(case["bytes"], path.stat().st_size)

    def test_reading_the_whole_archive_checks_its_md5(self):
        zenodo = FakeZenodo(*five_case_archives())
        with mock.patch.object(pipeline, "urlopen", zenodo):
            _, files = pipeline.resolve_record(RECORD, [DATA])
            result = pipeline.stream_extract_cases(files[DATA], self.tmp / "ct", limit=1, verify_archive=True)
        self.assertTrue(result["archive_md5_verified"])
        self.assertEqual(result["archive_bytes_read"], files[DATA].size)

    def test_md5_mismatch_raises_and_removes_extracted_cases(self):
        data, masks = five_case_archives()
        zenodo = FakeZenodo(data, masks, data_md5="0" * 32)
        with mock.patch.object(pipeline, "urlopen", zenodo):
            _, files = pipeline.resolve_record(RECORD, [DATA])
            with self.assertRaises(pipeline.ChecksumError):
                pipeline.stream_extract_cases(files[DATA], self.tmp / "ct", limit=2, verify_archive=True)
        self.assertEqual(list((self.tmp / "ct").iterdir()), [])

    def test_small_download_md5_mismatch_leaves_no_file(self):
        data, masks = five_case_archives()
        zenodo = FakeZenodo(data, masks, mask_md5="f" * 32)
        with mock.patch.object(pipeline, "urlopen", zenodo):
            _, files = pipeline.resolve_record(RECORD, [MASKS])
            with self.assertRaises(pipeline.ChecksumError):
                pipeline.download_verified(files[MASKS], self.tmp / "downloads")
        self.assertEqual(list((self.tmp / "downloads").iterdir()), [])

    def test_corrupt_member_is_rejected(self):
        bad = ct_case(1)[:-8] + b"\0" * 8  # damaged gzip trailer (CRC-32 and length)
        data = tarball("d", [("dataset6_CLINIC_0001_data.nii.gz", bad)])
        zenodo = FakeZenodo(data, tarball("m", []))
        with mock.patch.object(pipeline, "urlopen", zenodo):
            _, files = pipeline.resolve_record(RECORD, [DATA])
            with self.assertRaises(pipeline.ChecksumError):
                pipeline.stream_extract_cases(files[DATA], self.tmp / "ct", limit=1)
        self.assertEqual(list((self.tmp / "ct").iterdir()), [])


class MeshTests(TempDirTest):
    def test_sphere_mesh_is_closed_outward_and_in_world_millimetres(self):
        grid = np.indices((40, 40, 20)).astype(float)
        spacing = np.array([0.8, 0.8, 2.0])
        centre = np.array([20, 20, 10])
        radius_mm = 10.0
        distance = np.sqrt((((grid.T - centre) * spacing) ** 2).sum(axis=-1)).T
        mask = (distance <= radius_mm).astype(np.uint8)
        # Mirrored x axis (negative determinant), as in many CT headers.
        affine = np.diag([-0.8, 0.8, 2.0, 1.0])
        affine[:3, 3] = [100.0, -50.0, 30.0]
        path = self.tmp / "sphere.nii.gz"
        path.write_bytes(nifti_gz(mask, affine))
        mesh = pipeline.mask_to_mesh(path, step_size=1)
        volume = pipeline.signed_volume(mesh["verts"].astype(float), mesh["faces"])
        self.assertGreater(volume, 0)
        self.assertAlmostEqual(volume / 1000.0, mesh["volume_ml"], delta=0.1 * mesh["volume_ml"])
        world_centre = affine[:3, :3] @ centre + affine[:3, 3]
        self.assertTrue(np.allclose(mesh["verts"].mean(axis=0), world_centre, atol=1.0))
        self.assertTrue(np.allclose(np.linalg.norm(mesh["normals"], axis=1), 1.0, atol=1e-4))
        outward = ((mesh["verts"] - world_centre) * mesh["normals"]).sum(axis=1)
        self.assertGreater((outward > 0).mean(), 0.99)

    def test_vtp_round_trip(self):
        mask = np.zeros((12, 12, 12), np.uint8)
        mask[3:9, 4:8, 2:10] = 1
        path = self.tmp / "box.nii.gz"
        path.write_bytes(nifti_gz(mask))
        mesh = pipeline.mask_to_mesh(path, step_size=1)
        out = self.tmp / "box.vtp"
        pipeline.write_vtp(out, mesh["verts"], mesh["faces"], mesh["normals"])
        xml = out.read_text()
        self.assertIn('header_type="UInt32"', xml)
        self.assertTrue(np.array_equal(read_vtp_array(xml, "Points", "<f4").reshape(-1, 3), mesh["verts"]))
        self.assertTrue(np.array_equal(read_vtp_array(xml, "connectivity", "<i4").reshape(-1, 3), mesh["faces"]))
        offsets = read_vtp_array(xml, "offsets", "<i4")
        self.assertEqual(offsets[-1], 3 * len(mesh["faces"]))

    def test_tiny_bone_falls_back_to_step_one_and_empty_mask_has_no_mesh(self):
        mask = np.zeros((20, 20, 20), np.uint8)
        mask[10, 10, 10] = 1
        path = self.tmp / "dot.nii.gz"
        path.write_bytes(nifti_gz(mask))
        mesh = pipeline.mask_to_mesh(path, step_size=4)
        self.assertEqual(mesh["voxels"], 1)
        self.assertGreater(len(mesh["faces"]), 0)
        path.write_bytes(nifti_gz(np.zeros((20, 20, 20), np.uint8)))
        self.assertNotIn("faces", pipeline.mask_to_mesh(path))


class UploadTests(TempDirTest):
    def setUp(self) -> None:
        super().setUp()
        patcher = mock_aws()
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = pipeline.make_s3_client(pipeline.s3_settings_from_env(S3_ENV))
        self.client.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"})

    def items(self) -> list[pipeline.UploadItem]:
        result = []
        for name, body in (("a.nii.gz", b"mask"), ("a.vtp", b"<VTKFile/>"), ("manifest.json", b"{}")):
            path = self.tmp / name
            if not path.exists():
                path.write_bytes(body)
            result.append(pipeline.UploadItem(path, f"ctpelvic1k/x/{name}", pipeline.sha256_file(path), pipeline.content_type_for(name)))
        return result

    def test_upload_is_private_typed_and_idempotent(self):
        first = pipeline.upload_items(self.client, BUCKET, self.items())
        self.assertEqual((first["uploaded"], first["skipped"]), (3, 0))
        head = self.client.head_object(Bucket=BUCKET, Key="ctpelvic1k/x/a.vtp")
        self.assertEqual(head["ContentType"], "application/xml")
        self.assertEqual(head["Metadata"]["sha256"], hashlib.sha256(b"<VTKFile/>").hexdigest())
        self.assertEqual(self.client.head_object(Bucket=BUCKET, Key="ctpelvic1k/x/a.nii.gz")["ContentType"], "application/gzip")
        grants = self.client.get_object_acl(Bucket=BUCKET, Key="ctpelvic1k/x/a.nii.gz")["Grants"]
        self.assertEqual([g["Permission"] for g in grants], ["FULL_CONTROL"])
        self.assertNotIn("URI", grants[0]["Grantee"])  # no AllUsers / AuthenticatedUsers grant

        second = pipeline.upload_items(self.client, BUCKET, self.items())
        self.assertEqual((second["uploaded"], second["skipped"]), (0, 3))

        (self.tmp / "a.vtp").write_bytes(b"<VTKFile changed/>")
        third = pipeline.upload_items(self.client, BUCKET, self.items())
        self.assertEqual((third["uploaded"], third["skipped"]), (1, 2))

    def test_region_follows_vultr_hostname(self):
        self.assertEqual(pipeline.region_for("https://ewr1.vultrobjects.com"), "ewr1")
        self.assertEqual(pipeline.region_for("http://127.0.0.1:9200"), "us-east-1")
        self.assertEqual(pipeline.s3_settings_from_env({**S3_ENV, "VULTR_S3_ENDPOINT": "sjc1.vultrobjects.com"})["endpoint"],
                         "https://sjc1.vultrobjects.com")


class CommandLineTests(TempDirTest):
    def setUp(self) -> None:
        super().setUp()
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        script = self.bin / "fake_totalsegmentator.py"
        script.write_text(FAKE_TOTALSEGMENTATOR)
        if os.name == "nt":
            (self.bin / "TotalSegmentator.bat").write_text(f'@"{sys.executable}" "{script}" %*\n')
        else:
            launcher = self.bin / "TotalSegmentator"
            launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n')
            launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        self.ts_log = self.tmp / "ts_calls.jsonl"
        self.work = self.tmp / "work"
        self.zenodo = FakeZenodo(*five_case_archives())
        env = {"PATH": str(self.bin) + os.pathsep + os.environ.get("PATH", ""), "FAKE_TS_LOG": str(self.ts_log)}
        patcher = mock.patch.dict(os.environ, env)
        patcher.start()
        self.addCleanup(patcher.stop)
        for name in pipeline.ENV_VARS:
            os.environ.pop(name, None)
        url_patch = mock.patch.object(pipeline, "urlopen", self.zenodo)
        url_patch.start()
        self.addCleanup(url_patch.stop)

    def main(self, *extra: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = pipeline.main(["--work-dir", str(self.work), *extra])
        return code, out.getvalue(), err.getvalue()

    def ts_calls(self) -> list[list[str]]:
        return [json.loads(line) for line in self.ts_log.read_text().splitlines()] if self.ts_log.exists() else []

    def test_missing_env_vars_fail_before_any_download(self):
        os.environ["VULTR_S3_BUCKET"] = BUCKET
        code, _, err = self.main("--cases", "1")
        self.assertEqual(code, 2)
        self.assertIn("VULTR_S3_ENDPOINT, VULTR_S3_ACCESS_KEY, VULTR_S3_SECRET_KEY", err)
        self.assertNotIn("VULTR_S3_BUCKET,", err)
        self.assertIn("--skip-upload", err)
        self.assertEqual(self.zenodo.calls, [])
        self.assertFalse(self.work.exists())

    def test_dry_run_only_reads_the_record(self):
        code, out, _ = self.main("--cases", "3", "--fast", "--device", "mps", "--dry-run")
        self.assertEqual(code, 0)
        plan = json.loads(out)
        self.assertEqual(plan["command"][-4:], ["femur_right", "--fast", "--device", "mps"])
        self.assertEqual(plan["data_file"]["checksum"], f"md5:{hashlib.md5(self.zenodo.blobs[self.zenodo.data_url()]).hexdigest()}")
        self.assertEqual(self.zenodo.calls, [self.zenodo.api_url])
        self.assertEqual(self.ts_calls(), [])
        self.assertFalse(self.work.exists())

    def test_work_dir_inside_the_repository_is_refused(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            code = pipeline.main(["--work-dir", str(pipeline.REPO_ROOT / "public" / "scans"), "--skip-upload"])
        self.assertEqual(code, 2)
        self.assertIn("inside the repository", err.getvalue())

    def test_bone_names_that_are_not_class_names_are_refused(self):
        with contextlib.redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit) as caught:
            pipeline.parse_args(["--work-dir", str(self.work), "--bones", "sacrum", "../escape"])
        self.assertEqual(caught.exception.code, 2)
        self.assertIn("../escape", err.getvalue())

    def test_totalsegmentator_failure_is_reported(self):
        os.environ["FAKE_TS_FAIL"] = "1"
        code, _, err = self.main("--skip-upload")
        self.assertEqual(code, 1)
        self.assertIn("TotalSegmentator exited with code 3", err)

    @mock_aws()
    def test_end_to_end_upload_then_rerun(self):
        os.environ.update(S3_ENV)
        os.environ["FAKE_TS_EMPTY"] = "femur_right"
        boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT).create_bucket(
            Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"}
        )
        code, out, err = self.main("--cases", "2", "--fast", "--device", "cpu")
        self.assertEqual(code, 0, err)

        calls = self.ts_calls()
        self.assertEqual(len(calls), 2)
        for call in calls:
            roi = call[call.index("--roi_subset") + 1: call.index("--roi_subset") + 6]
            self.assertEqual(roi, ["sacrum", "hip_left", "hip_right", "femur_left", "femur_right"])
            self.assertIn("--fast", call)
            self.assertEqual(call[call.index("--device") + 1], "cpu")

        s3 = boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT)
        manifest = json.loads(s3.get_object(Bucket=BUCKET, Key="ctpelvic1k/manifest.json")["Body"].read())
        self.assertEqual(manifest["dataset"]["licence"], "cc-by-4.0")
        self.assertIn("ryai.230024", manifest["segmentation_tool"]["citation"])
        self.assertEqual([c["case_id"] for c in manifest["cases"]], ["dataset6_CLINIC_0007", "dataset6_CLINIC_0060"])
        case = manifest["cases"][0]
        self.assertEqual(case["bones_without_voxels"], ["femur_right"])
        self.assertFalse(case["source"]["archive_md5_verified"])
        self.assertEqual(case["segmentation"]["command"][:5], ["TotalSegmentator", "-i", "<ct.nii.gz>", "-o", "<output_dir>"])
        for key in ("extract", "totalsegmentator", "meshes"):
            self.assertIsInstance(case["timings_seconds"][key], float)
        kinds = sorted((f["kind"], f["bone"]) for f in case["files"] if f["bone"] == "sacrum" or f["kind"] == "reference_mask")
        self.assertEqual(kinds, [("mask", "sacrum"), ("mesh", "sacrum"), ("reference_mask", None)])
        for entry in case["files"]:
            body = s3.get_object(Bucket=BUCKET, Key=entry["key"])["Body"].read()
            self.assertEqual(hashlib.sha256(body).hexdigest(), entry["sha256"])
            self.assertEqual(len(body), entry["bytes"])
        self.assertNotIn(str(self.tmp), json.dumps(manifest))  # no local paths in the published manifest
        first = json.loads(out[out.rindex("\n{"):])["upload"]
        self.assertEqual(first["skipped"], 0)

        # Second run: no new download of the CT tarball, no new segmentation, only the manifest re-uploaded.
        data_bytes = self.zenodo.bytes_read[self.zenodo.data_url()]
        code, out, err = self.main("--cases", "2", "--fast", "--device", "cpu")
        self.assertEqual(code, 0, err)
        self.assertEqual(self.zenodo.bytes_read[self.zenodo.data_url()], data_bytes)
        self.assertEqual(len(self.ts_calls()), 2)
        second = json.loads(out[out.rindex("\n{"):])["upload"]
        self.assertLessEqual(second["uploaded"], 1)  # manifest.json, whose timestamp and timings change
        self.assertEqual(second["uploaded"] + second["skipped"], first["uploaded"])
        self.assertIn("unchanged ctpelvic1k/dataset6_CLINIC_0060/meshes/sacrum.vtp", out)


if __name__ == "__main__":
    unittest.main()
