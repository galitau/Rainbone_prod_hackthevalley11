"""Offline tests for pipeline.py: no network, no real bucket, no real TotalSegmentator.

Zenodo is a mocked urlopen, S3 is moto, and TotalSegmentator is a fake executable put first on PATH.
Run from the repository root:  python -m unittest discover -s scripts/vultr_pipeline -p "test_*.py" -v
"""
from __future__ import annotations

import contextlib
import gzip
import hashlib
import io
import json
import os
import shutil
import stat
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
import vtk  # noqa: E402
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
    parser.add_argument("-rp", "--report")
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
    if args.report:
        report = {"totalsegmentator_version": "2.18.0", "nnunetv2_version": "fake", "torch_version": "fake",
                  "task": "total", "device": args.device or "gpu", "fast": args.fast,
                  "roi_subset": args.roi_subset, "runtime_seconds": 0.01}
        Path(args.report).write_text(json.dumps(report))
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


def read_vtp(path: Path):
    reader = vtk.vtkXMLPolyDataReader()
    reader.SetFileName(str(path))
    reader.Update()
    return reader.GetOutput()


def sphere_mask(shape=(40, 40, 20), spacing=(0.8, 0.8, 2.0), centre=(20, 20, 10), radius_mm=10.0) -> np.ndarray:
    grid = np.indices(shape).astype(float)
    distance = np.sqrt((((grid.T - np.array(centre)) * np.array(spacing)) ** 2).sum(axis=-1)).T
    return distance <= radius_mm


# Key sets of the manifest that the data run wrote to rb-data/ctpelvic1k/processed/manifest.json
# (the format both the pipeline and backend/routes_bones.py use).
MANIFEST_KEYS = {"generated_utc", "dataset", "segmentation_tool", "mesh_method", "cases"}
# The dataset record also has license_url and changes (CC BY 4.0 s.3(a)(1)(B)-(C)), which that run predates.
DATASET_KEYS = {"name", "zenodo_record", "doi", "license", "license_url", "changes", "creators", "citation",
                "citation_preprint", "repository", "expert_label_map", "expert_label_map_source", "description",
                "source_archives", "acquisition_note"}
TOOL_KEYS = {"name", "version", "license", "citation", "also_cite", "repository", "disclaimer"}
CASE_KEYS = {"case_id", "source_file", "expert_mask_file", "bones", "files", "segmentation", "validation"}
SOURCE_FILE_KEYS = {"archive", "archive_member", "bytes", "sha256", "shape_ijk", "spacing_mm", "orientation"}
EXPERT_FILE_KEYS = {"archive", "archive_member", "bytes", "sha256", "volume_ml"}
BONE_KEYS = {"name", "source_ts_classes", "voxels", "volume_ml", "connected_components", "touches_scan_z_limit"}
MASK_FILE_KEYS = {"path", "kind", "ts_class", "format", "bytes", "sha256"}
MESH_FILE_KEYS = {"path", "kind", "bone", "format", "bytes", "sha256", "points", "triangles",
                  "triangles_before_decimation", "marching_cubes_triangles", "decimation", "triangle_budget",
                  "normals_outward", "watertight", "boundary_edges", "nonmanifold_edges", "bounds_ras_mm",
                  "surface_area_mm2", "enclosed_volume_ml"}
SEGMENTATION_KEYS = {"tool", "version", "nnunetv2_version", "torch_version", "task", "roi_subset", "fast", "device",
                     "wall_s", "tool_reported_runtime_s", "attempts", "cpu_benchmark_same_settings",
                     "first_run_wall_s_incl_weight_download", "first_run_note"}
VALIDATION_KEYS = {"metric", "expert_grid_identical_to_ts_grid", "dice", "dice_pelvis_union_sacrum_hips",
                   "lr_cross_check_dice", "expert_lr_names_swapped_vs_totalsegmentator", "dice_overlap_matched",
                   "centroid_x_ras_mm", "not_compared", "informational_dice_vertebrae_L5_vs_expert_lumbar_vertebra"}
ROI = ["sacrum", "vertebrae_S1", "hip_left", "hip_right", "femur_left", "femur_right", "vertebrae_L5"]


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
        self.assertEqual(dataset["license"], "cc-by-4.0")
        self.assertEqual(dataset["doi"], "10.5281/zenodo.4588403")
        self.assertEqual(dataset["zenodo_record"], "https://zenodo.org/records/4588403")
        self.assertIn("IJCARS", dataset["citation"])

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
    def test_sphere_mesh_is_watertight_outward_and_in_world_millimetres(self):
        mask = sphere_mask()
        for flip in (False, True):  # a mirrored x axis (negative determinant) is common in CT headers
            affine = np.diag([-0.8 if flip else 0.8, 0.8, 2.0, 1.0])
            affine[:3, 3] = [100.0, -50.0, 30.0]
            poly, info = pipeline.mesh_from_mask(mask, affine, target_tris=100000)
            self.assertTrue(info["watertight"])
            self.assertTrue(info["normals_outward"])
            self.assertEqual((info["boundary_edges"], info["nonmanifold_edges"]), (0, 0))
            self.assertEqual(info["decimation"], "none")
            mask_ml = mask.sum() * 0.8 * 0.8 * 2.0 / 1000.0
            self.assertAlmostEqual(info["enclosed_volume_ml"], mask_ml, delta=0.05 * mask_ml)
            world_centre = affine[:3, :3] @ np.array([20, 20, 10]) + affine[:3, 3]
            bounds = np.array(info["bounds_ras_mm"]).reshape(3, 2)
            self.assertTrue(np.allclose(bounds.mean(axis=1), world_centre, atol=1.0), (flip, bounds))
            self.assertTrue(np.allclose(bounds[:, 1] - bounds[:, 0], 20.0, atol=2.5), (flip, bounds))
            normals = poly.GetPointData().GetNormals()
            self.assertEqual(normals.GetNumberOfTuples(), poly.GetNumberOfPoints())

    def test_meshes_above_the_budget_are_decimated_and_stay_watertight(self):
        # At 500 triangles quadric decimation tears this small sphere; the ladder falls back to
        # topology-preserving DecimatePro, which may stop above the budget but stays closed.
        for budget in (2000, 500):
            _, info = pipeline.mesh_from_mask(sphere_mask(), np.diag([0.8, 0.8, 2.0, 1.0]), target_tris=budget)
            self.assertGreater(info["triangles_before_decimation"], budget)
            self.assertNotEqual(info["decimation"], "none")
            self.assertLess(info["triangles"], info["triangles_before_decimation"])
            self.assertTrue(info["watertight"] and info["normals_outward"], (budget, info))

    def test_vtp_is_zlib_binary_and_reads_back(self):
        poly, info = pipeline.mesh_from_mask(sphere_mask(), np.diag([0.8, 0.8, 2.0, 1.0]), target_tris=100000)
        out = self.tmp / "sphere.vtp"
        pipeline.write_vtp(poly, out)
        head = out.read_bytes()[:400].decode("ascii", "replace")
        self.assertIn('compressor="vtkZLibDataCompressor"', head)
        self.assertIn('header_type="UInt32"', head)
        back = read_vtp(out)
        self.assertEqual(back.GetNumberOfPoints(), info["points"])
        self.assertEqual(back.GetNumberOfPolys(), info["triangles"])
        self.assertIsNotNone(back.GetPointData().GetNormals())

    def test_union_of_classes(self):
        self.assertEqual(pipeline.roi_classes(pipeline.DEFAULT_BONES), ROI)
        self.assertEqual(pipeline.roi_classes(["sacrum", "rib_left_1"]), ["sacrum", "vertebrae_S1", "rib_left_1"])


class ValidationTests(unittest.TestCase):
    def test_swapped_hip_names_and_sacrum_with_s1(self):
        shape = (30, 10, 10)
        ts = {name: np.zeros(shape, bool) for name in ("sacrum", "vertebrae_S1", "hip_left", "hip_right", "vertebrae_L5")}
        ts["sacrum"][12:18, :, 0:5] = True
        ts["vertebrae_S1"][12:18, :, 5:8] = True
        ts["hip_left"][0:8] = True  # low x
        ts["hip_right"][22:30] = True  # high x
        expert = np.zeros(shape, np.int16)
        expert[12:18, :, 0:8] = 1  # sacrum including S1
        expert[0:8] = 2  # named "right_hip" but where TotalSegmentator's hip_left is
        expert[22:30] = 3
        affine = np.diag([2.0, 1.0, 1.0, 1.0])
        result = pipeline.validate_against_reference(ts, expert, affine, same_grid=True)
        self.assertEqual(set(result), VALIDATION_KEYS)
        self.assertEqual(result["dice"]["hip_left_vs_expert_left_hip"], 0.0)
        self.assertTrue(result["expert_lr_names_swapped_vs_totalsegmentator"])
        self.assertEqual(result["dice_overlap_matched"]["hip_left"], 1.0)
        self.assertEqual(result["dice_overlap_matched"]["hip_right"], 1.0)
        self.assertEqual(result["dice_overlap_matched"]["sacrum_incl_S1"], 1.0)
        self.assertLess(result["dice_overlap_matched"]["sacrum_ts_sacrum_only"], 1.0)
        self.assertEqual(result["dice_pelvis_union_sacrum_hips"], 1.0)
        self.assertEqual(result["centroid_x_ras_mm"]["ts_hip_left"], result["centroid_x_ras_mm"]["expert_right_hip(2)"])
        self.assertIsNone(result["informational_dice_vertebrae_L5_vs_expert_lumbar_vertebra"])  # both empty


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
        self.assertEqual(plan["command"][-11:], ["--roi_subset", *ROI, "--fast", "--device", "mps"])
        self.assertEqual(plan["meshes"]["sacrum"], ["sacrum", "vertebrae_S1"])
        self.assertEqual(plan["data_file"]["checksum"], f"md5:{hashlib.md5(self.zenodo.blobs[self.zenodo.data_url()]).hexdigest()}")
        self.assertEqual(self.zenodo.calls, [self.zenodo.api_url])
        self.assertEqual(self.ts_calls(), [])
        self.assertFalse(self.work.exists())

    def test_work_dir_inside_the_repository_is_refused(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            code = pipeline.main(["--work-dir", str(pipeline.REPO_ROOT / "public" / "scans"), "--skip-upload"])
        self.assertEqual(code, 2)
        self.assertIn("inside the repository", err.getvalue())

    def test_case_variant_of_the_repository_path_is_refused(self):
        variant = Path(str(pipeline.REPO_ROOT / "public" / "scans").swapcase())
        if not variant.parent.exists():
            self.skipTest("case-sensitive file system: the case variant is a different folder")
        self.assertTrue(pipeline._inside_repo(variant))
        self.assertFalse(pipeline._inside_repo(self.work))
        with contextlib.redirect_stderr(io.StringIO()) as err:
            code = pipeline.main(["--from-processed", str(variant), "--skip-upload"])
        self.assertEqual(code, 2)
        self.assertIn("inside the repository", err.getvalue())

    def test_rerun_with_fewer_cases_publishes_only_this_runs_cases(self):
        code, _, err = self.main("--cases", "2", "--skip-upload")
        self.assertEqual(code, 0, err)
        code, _, err = self.main("--cases", "1", "--skip-upload")
        self.assertEqual(code, 0, err)
        manifest = json.loads((self.work / "processed" / "manifest.json").read_text())
        self.assertEqual([c["case_id"] for c in manifest["cases"]], ["dataset6_CLINIC_0060"])
        self.assertEqual(len(list((self.work / "cases").glob("*.json"))), 2)  # kept on disk, not published

    def test_work_dir_and_from_processed_are_exclusive(self):
        for argv in ([], ["--work-dir", str(self.work), "--from-processed", str(self.tmp)]):
            with contextlib.redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit) as caught:
                pipeline.parse_args(argv)
            self.assertEqual(caught.exception.code, 2)
            self.assertIn("exactly one of --work-dir and --from-processed", err.getvalue())

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

    def bucket(self):
        s3 = boto3.client("s3", region_name="ewr1", endpoint_url=ENDPOINT)
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ewr1"})
        return s3

    def keys(self, s3) -> list[str]:
        return sorted(o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET).get("Contents", []))

    @mock_aws()
    def test_end_to_end_upload_then_rerun(self):
        os.environ.update(S3_ENV)
        os.environ["FAKE_TS_EMPTY"] = "femur_right"
        s3 = self.bucket()
        code, out, err = self.main("--cases", "2", "--fast", "--device", "cpu")
        self.assertEqual(code, 0, err)

        calls = self.ts_calls()
        self.assertEqual(len(calls), 2)
        for call in calls:
            roi = call[call.index("--roi_subset") + 1: call.index("--roi_subset") + 1 + len(ROI)]
            self.assertEqual(roi, ROI)
            self.assertIn("--fast", call)
            self.assertEqual(call[call.index("--device") + 1], "cpu")
            self.assertTrue(call[call.index("--report") + 1].endswith(".report.json"))

        manifest = json.loads(s3.get_object(Bucket=BUCKET, Key="ctpelvic1k/manifest.json")["Body"].read())
        self.assertEqual(set(manifest), MANIFEST_KEYS)
        self.assertEqual(set(manifest["dataset"]), DATASET_KEYS)
        self.assertEqual(set(manifest["segmentation_tool"]), TOOL_KEYS)
        self.assertEqual(manifest["dataset"]["license"], "cc-by-4.0")
        self.assertEqual(manifest["dataset"]["license_url"], "https://creativecommons.org/licenses/by/4.0/")
        self.assertIn("not the dataset's own annotations", manifest["dataset"]["changes"])
        self.assertEqual(set(manifest["dataset"]["source_archives"]), {DATA, MASKS})
        self.assertIn("stopped after the first 2 CT member(s)", manifest["dataset"]["acquisition_note"])
        self.assertIn("ryai.230024", manifest["segmentation_tool"]["citation"])
        self.assertEqual(manifest["segmentation_tool"]["version"], "2.18.0")
        self.assertIn("vtkFlyingEdges3D", manifest["mesh_method"])
        # Archive order, as in rb-data/ctpelvic1k/processed/manifest.json.
        self.assertEqual([c["case_id"] for c in manifest["cases"]], ["dataset6_CLINIC_0060", "dataset6_CLINIC_0007"])

        case = manifest["cases"][0]
        self.assertEqual(set(case), CASE_KEYS)
        self.assertEqual(set(case["source_file"]), SOURCE_FILE_KEYS)
        self.assertEqual(set(case["expert_mask_file"]), EXPERT_FILE_KEYS)
        self.assertEqual(case["expert_mask_file"]["archive_member"], "ipcai2021_dataset6_Anonymized/dataset6_CLINIC_0060_mask_4label.nii.gz")
        self.assertEqual(set(case["segmentation"]), SEGMENTATION_KEYS)
        self.assertEqual(case["segmentation"]["roi_subset"], ROI)
        self.assertEqual((case["segmentation"]["device"], case["segmentation"]["nnunetv2_version"]), ("cpu", "fake"))
        self.assertEqual(set(case["validation"]), VALIDATION_KEYS)
        self.assertTrue(case["validation"]["expert_grid_identical_to_ts_grid"])

        bones = {b["name"]: b for b in case["bones"]}
        self.assertEqual(list(bones), list(pipeline.DEFAULT_BONES))
        self.assertEqual(bones["sacrum"]["source_ts_classes"], ["sacrum", "vertebrae_S1"])
        self.assertEqual(set(bones["sacrum"]), BONE_KEYS | {"mesh_enclosed_volume_ml"})
        self.assertEqual(set(bones["femur_right"]), BONE_KEYS)  # empty: no mesh
        self.assertEqual(bones["femur_right"]["voxels"], 0)

        masks = [f for f in case["files"] if f["kind"] == "mask"]
        meshes = [f for f in case["files"] if f["kind"] == "mesh"]
        self.assertEqual([f["ts_class"] for f in masks], ROI)
        self.assertEqual([f["bone"] for f in meshes], [b for b in pipeline.DEFAULT_BONES if b != "femur_right"])
        for entry in masks:
            self.assertEqual(set(entry), MASK_FILE_KEYS)
        for entry in meshes:
            self.assertEqual(set(entry), MESH_FILE_KEYS)
            self.assertTrue(entry["watertight"] and entry["normals_outward"])
        for entry in case["files"]:
            self.assertEqual(entry["path"].split("/")[0], case["case_id"])
            body = s3.get_object(Bucket=BUCKET, Key=f"ctpelvic1k/{entry['path']}")["Body"].read()
            self.assertEqual(hashlib.sha256(body).hexdigest(), entry["sha256"])
            self.assertEqual(len(body), entry["bytes"])
        self.assertEqual(len(self.keys(s3)), 1 + sum(len(c["files"]) for c in manifest["cases"]))
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
        self.assertLessEqual(second["uploaded"], 1)  # manifest.json, whose time stamp changes
        self.assertEqual(second["uploaded"] + second["skipped"], first["uploaded"])
        self.assertIn("unchanged ctpelvic1k/dataset6_CLINIC_0060/meshes/sacrum.vtp", out)

    def processed(self) -> Path:
        code, _, err = self.main("--cases", "1", "--skip-upload")
        self.assertEqual(code, 0, err)
        return self.work / "processed"

    def publish(self, processed: Path, *extra: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = pipeline.main(["--from-processed", str(processed), *extra])
        return code, out.getvalue(), err.getvalue()

    @mock_aws()
    def test_from_processed_uploads_what_the_manifest_lists_without_zenodo_or_totalsegmentator(self):
        processed = self.processed()
        calls_before, ts_before = list(self.zenodo.calls), len(self.ts_calls())
        os.environ.update(S3_ENV)
        s3 = self.bucket()
        code, out, err = self.publish(processed, "--cors-origin", "http://localhost:3200")
        self.assertEqual(code, 0, err)
        self.assertEqual(self.zenodo.calls, calls_before)
        self.assertEqual(len(self.ts_calls()), ts_before)
        manifest = json.loads((processed / "manifest.json").read_text())
        listed = sorted(["ctpelvic1k/manifest.json"] + [f"ctpelvic1k/{f['path']}" for c in manifest["cases"] for f in c["files"]])
        self.assertEqual(self.keys(s3), listed)
        rules = s3.get_bucket_cors(Bucket=BUCKET)["CORSRules"]
        self.assertEqual(rules[0]["AllowedOrigins"], ["http://localhost:3200"])
        summary = json.loads(out[out.rindex("\n{"):])
        self.assertEqual(summary["upload"]["uploaded"], len(listed))

    @mock_aws()
    def test_from_processed_refuses_a_file_that_differs_from_the_manifest(self):
        processed = self.processed()
        os.environ.update(S3_ENV)
        s3 = self.bucket()
        mesh = processed / "dataset6_CLINIC_0060" / "meshes" / "hip_left.vtp"
        mesh.write_bytes(mesh.read_bytes() + b" ")
        code, _, err = self.publish(processed)
        self.assertEqual(code, 1)
        self.assertIn("dataset6_CLINIC_0060/meshes/hip_left.vtp does not match", err)
        self.assertEqual(self.keys(s3), [])

    def test_from_processed_refuses_unsafe_paths_and_local_paths(self):
        processed = self.processed()
        manifest_path = processed / "manifest.json"
        original = manifest_path.read_text()
        manifest = json.loads(original)
        manifest["cases"][0]["files"][0]["path"] = "../outside.nii.gz"
        manifest_path.write_text(json.dumps(manifest))
        code, _, err = self.publish(processed, "--skip-upload")
        self.assertEqual(code, 1)
        self.assertIn("unsafe path '../outside.nii.gz'", err)

        manifest = json.loads(original)
        manifest["cases"][0]["note"] = str(processed.resolve() / "x")
        manifest_path.write_text(json.dumps(manifest))
        code, _, err = self.publish(processed, "--skip-upload")
        self.assertEqual(code, 2)
        self.assertIn("contains a local path", err)

    def test_from_processed_refuses_a_windows_home_path(self):
        # JSON escapes "\", so the check must look at parsed values, not the text.
        processed = self.processed()
        manifest_path = processed / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["cases"][0]["source_file"]["local_copy"] = "C:\\Users\\Student\\data\\ct.nii.gz"
        manifest_path.write_text(json.dumps(manifest))
        self.assertNotIn("C:\\Users\\Student", manifest_path.read_text())
        with mock.patch.object(pipeline.Path, "home", return_value=Path("C:\\Users\\Student")):
            code, _, err = self.publish(processed, "--skip-upload")
        self.assertEqual(code, 2)
        self.assertIn("contains a local path", err)

    def test_from_processed_needs_the_upload_variables_unless_skipping(self):
        processed = self.processed()
        code, _, err = self.publish(processed)
        self.assertEqual(code, 2)
        self.assertIn("VULTR_S3_ENDPOINT", err)
        code, out, err = self.publish(processed, "--dry-run")
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out[out.index("{"):])["upload"], "skipped (--dry-run)")


if __name__ == "__main__":
    unittest.main()
