"""API checks for POST /api/simulate with the real SfePy solve.

Run from backend/: python -m unittest -v
"""
from __future__ import annotations

import gzip
import hashlib
import math
import os
import struct
import sys
import tempfile
import threading
import time
import unittest
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

import nibabel as nib
import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from main import SimulationResponse, app  # noqa: E402
from services import fea_solver  # noqa: E402
from services.fea_solver import (MAX_FE_VOXELS, _load_nifti, analyze_bone_volume,  # noqa: E402
                                 bone_weighted_percentile)

REPO = BACKEND.parent
SAMPLE = REPO / "frontend" / "public" / "sample_bone.nii.gz"
FEMUR_LABELMAP = REPO / "frontend" / "public" / "models" / "hfvalid-femur" / "bone.seg.nrrd"
# sha256 of the sample's float32 voxels in file (Fortran) order. The damaged
# original stored these same bytes from byte 348 of the decompressed file.
SAMPLE_VOXELS_SHA256 = "9c2d7ae8adbdf8c40acede58f47e473492a3845d162e41577ab8080bbbc0e1a5"
TIME_LIMIT_S = 20.0


def nifti_bytes(hu: np.ndarray, spacing_mm=(1.0, 1.0, 1.0), compress: bool = True) -> bytes:
    raw = nib.Nifti1Image(hu.astype(np.int16), np.diag([*spacing_mm, 1.0])).to_bytes()
    return gzip.compress(raw) if compress else raw


def femur_ct_from_labelmap() -> tuple[np.ndarray, tuple[float, float, float]]:
    """A femur-shaped CT: the repo's HFValid labelmap with bone at 700 HU."""
    header, data = FEMUR_LABELMAP.read_bytes().split(b"\n\n", 1)
    fields = dict(line.split(": ", 1) for line in header.decode().splitlines()[1:] if ": " in line)
    assert fields["type"] == "unsigned char" and fields["encoding"] == "gzip", fields
    sizes = tuple(int(value) for value in fields["sizes"].split())
    labels = np.frombuffer(gzip.decompress(data), dtype=np.uint8).reshape(sizes, order="F")
    # Spacing from "space directions: (0.703125,0,0) (0,0.703125,0) (0,0,2)".
    directions = [[float(v) for v in d.strip("()").split(",")] for d in fields["space directions"].split()]
    spacing = tuple(float(np.linalg.norm(d)) for d in directions)
    return np.where(labels > 0, 700, -1000), spacing


class SimulateEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # No history saves from these tests, even with DATABASE_URL in the shell or backend/.env.
        no_history = mock.patch.dict(os.environ, {"DATABASE_URL": ""})
        no_history.start()
        cls.addClassCleanup(no_history.stop)
        # Run from an empty directory to catch solver output files.
        cls.previous_cwd = os.getcwd()
        cls.workdir = tempfile.TemporaryDirectory()
        os.chdir(cls.workdir.name)

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls.previous_cwd)
        cls.workdir.cleanup()

    def post(self, payload: bytes, filename: str = "scan.nii.gz"):
        started = time.perf_counter()
        response = self.client.post("/api/simulate", files={"file": (filename, payload, "application/gzip")})
        return response, time.perf_counter() - started

    def test_sample_voxels_are_unchanged_by_the_header_repair(self):
        image = nib.load(SAMPLE)
        voxels = np.asanyarray(image.dataobj)
        self.assertEqual((voxels.shape, voxels.dtype), ((32, 32, 32), np.float32))
        self.assertEqual(hashlib.sha256(voxels.tobytes(order="F")).hexdigest(), SAMPLE_VOXELS_SHA256)
        np.testing.assert_array_equal(image.header.get_zooms(), (1.0, 1.0, 1.0))

    def test_loader_reads_nifti1_and_nifti2_gzipped_or_plain(self):
        hu = np.arange(4 * 5 * 6, dtype=np.int16).reshape(4, 5, 6)
        affine = np.diag([0.5, 0.75, 2.0, 1.0])
        for image_class in (nib.Nifti1Image, nib.Nifti2Image):
            raw = image_class(hu, affine).to_bytes()
            for payload in (raw, gzip.compress(raw)):
                volume, spacing_mm = _load_nifti(payload)
                np.testing.assert_array_equal(volume, hu)
                np.testing.assert_array_equal(spacing_mm, [0.5, 0.75, 2.0])

    def test_sample_returns_all_fields_with_finite_values(self):
        response, seconds = self.post(SAMPLE.read_bytes(), "sample_bone.nii.gz")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), set(SimulationResponse.model_fields))
        for name in ("max_von_mises_stress_mpa", "average_youngs_modulus_gpa", "bone_volume_cm3",
                     "fracture_risk_index_percent", "load_newtons"):
            self.assertIsInstance(body[name], float, name)
            self.assertTrue(math.isfinite(body[name]), name)
        # The documented sample response (backend/README.md). 3048 voxels of 1 mm3
        # at 750 HU, solved without coarsening; a direct solver may differ in the
        # last bits between machines, so stresses get a 0.01 MPa tolerance.
        self.assertAlmostEqual(body["max_von_mises_stress_mpa"], 17.71, delta=0.011)
        self.assertAlmostEqual(body["average_youngs_modulus_gpa"], 22.79, delta=0.011)
        self.assertEqual(body["bone_volume_cm3"], 3.05)
        self.assertAlmostEqual(body["fracture_risk_index_percent"], 11.81, delta=0.011)
        self.assertEqual(body["load_newtons"], 800)
        self.assertEqual((body["mesh_vertices"], body["mesh_faces"]), (1610, 3216))
        self.assertEqual(body["source_filename"], "sample_bone.nii.gz")
        self.assertLess(seconds, TIME_LIMIT_S)
        self.assertEqual(os.listdir("."), [], "the API must not write SfePy output files")

    def test_sample_solve_balances_the_applied_load(self):
        volume, spacing_mm = _load_nifti(SAMPLE.read_bytes())
        _, details = analyze_bone_volume(volume, spacing_mm)
        # The clamped band must react the full 800 N along +Z.
        np.testing.assert_allclose(details["reaction_newtons"], [0, 0, 800], atol=800 * 1e-6)
        self.assertLess(details["relative_force_balance_error"], 1e-6)
        self.assertLess(details["relative_free_residual"], 1e-6)
        self.assertEqual(details["effective_voxel_mm"], [1.0, 1.0, 1.0])

    def test_invalid_uploads_are_rejected(self):
        response, _ = self.post(b"not a volume", "scan.txt")
        self.assertEqual(response.status_code, 400)
        response, _ = self.post(b"", "scan.nii.gz")
        self.assertEqual(response.status_code, 400)
        response, _ = self.post(gzip.compress(b"not a nifti header"), "scan.nii.gz")
        self.assertEqual(response.status_code, 422)
        response, _ = self.post(b"x" * 400, "scan.nii")
        self.assertEqual(response.status_code, 422)
        response, _ = self.post(nifti_bytes(np.full((8, 8, 8), -1000)), "air.nii.gz")
        self.assertEqual(response.status_code, 422)
        thin = np.full((8, 8, 8), -1000)
        thin[2:6, 2:6, 2:5] = 700
        response, _ = self.post(nifti_bytes(thin), "thin.nii.gz")
        self.assertEqual(response.status_code, 422)
        block = np.full((8, 8, 8), -1000)
        block[2:6, 2:6, 1:7] = 700
        raw = bytearray(nifti_bytes(block, compress=False))
        struct.pack_into("<f", raw, 80, float("nan"))  # pixdim[1]; nibabel keeps NaN
        response, _ = self.post(bytes(raw), "nan-spacing.nii")
        self.assertEqual(response.status_code, 422)
        self.assertIn("voxel size", response.json()["detail"])

    def test_size_limits(self):
        hu = np.full((32, 32, 32), -1000)
        raw = nifti_bytes(hu, compress=False)
        with mock.patch.object(main, "MAX_UPLOAD_BYTES", len(raw) - 1):
            response, _ = self.post(raw, "big.nii")
        self.assertEqual(response.status_code, 413)
        with mock.patch.object(fea_solver, "MAX_RAW_BYTES", len(raw) - 1):
            response, _ = self.post(gzip.compress(raw), "big.nii.gz")
        self.assertEqual(response.status_code, 422)
        self.assertIn("decompressed", response.json()["detail"])
        # A 1.4 KB file whose header declares 1024^3 voxels is refused before any voxel is read.
        header = bytearray(nifti_bytes(np.zeros((2, 2, 2)), compress=False)[:352])
        struct.pack_into("<4h", header, 40, 3, 1024, 1024, 1024)  # dim[0..3]
        response, _ = self.post(gzip.compress(bytes(header) + bytes(1024)), "huge.nii.gz")
        self.assertEqual(response.status_code, 422)
        self.assertIn("1,073,741,824 voxels", response.json()["detail"])
        # A 130 KB gzip that declares one voxel and holds 128 MiB of zeros: only the declared bytes are inflated.
        one_voxel = nifti_bytes(np.zeros((1, 1, 1)), compress=False)
        stream = zlib.compressobj(9, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
        bomb = stream.compress(one_voxel) + b"".join(stream.compress(bytes(2**20)) for _ in range(128)) + stream.flush()
        self.assertLess(len(bomb), 200_000)
        with mock.patch.object(nib.Nifti1Image, "from_bytes", wraps=nib.Nifti1Image.from_bytes) as from_bytes:
            response, _ = self.post(bomb, "bomb.nii.gz")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(from_bytes.call_args.args[0]), len(one_voxel))

    def test_gzip_members_are_read_and_truncated_gzip_is_refused(self):
        hu = np.full((8, 8, 8), -1000)
        hu[2:6, 2:6, 1:7] = 700
        raw = nifti_bytes(hu, compress=False)
        volume, _ = _load_nifti(gzip.compress(raw[:200]) + gzip.compress(raw[200:]))
        np.testing.assert_array_equal(volume, hu)
        response, _ = self.post(gzip.compress(raw)[:-20], "cut.nii.gz")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Unable to read the uploaded NIfTI volume.")

    def test_solves_run_one_at_a_time(self):
        running, peak = [0], [0]
        lock = threading.Lock()

        def slow_solve(payload, filename):
            with lock:
                running[0] += 1
                peak[0] = max(peak[0], running[0])
            time.sleep(0.2)
            with lock:
                running[0] -= 1
            return {"max_von_mises_stress_mpa": 1.0, "average_youngs_modulus_gpa": 20.0, "bone_volume_cm3": 1.0,
                    "fracture_risk_index_percent": 0.67, "load_newtons": 800.0, "mesh_vertices": 8,
                    "mesh_faces": 12, "source_filename": filename}

        with mock.patch.object(main, "simulate_fea", slow_solve), TestClient(app) as client:
            def post():
                return client.post("/api/simulate", files={"file": ("a.nii.gz", b"x", "application/gzip")}).status_code

            with ThreadPoolExecutor(3) as pool:
                codes = list(pool.map(lambda _: post(), range(3)))
        self.assertEqual(codes, [200, 200, 200])
        self.assertEqual(peak[0], 1)

    def test_disconnected_volume_uses_largest_component(self):
        hu = np.full((16, 16, 20), -1000)
        hu[1:5, 1:5, 2:12] = 700  # 160 voxels
        hu[10:12, 10:12, 14:18] = 700  # 16 voxels, not connected
        response, _ = self.post(nifti_bytes(hu, spacing_mm=(2.0, 2.0, 2.5), compress=False), "scan.nii")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        # 160 voxels x 10 mm3; surface of a 4 x 4 x 10 voxel box.
        self.assertEqual(body["bone_volume_cm3"], 1.6)
        self.assertEqual(body["mesh_faces"], 2 * (2 * 4 * 4 + 4 * 4 * 10))
        self.assertEqual(body["mesh_vertices"], 5 * 5 * 11 - 3 * 3 * 9)

    def test_large_volume_is_coarsened_and_answers_in_time(self):
        hu = np.full((44, 44, 44), -1000)
        hu[2:42, 2:42, 2:42] = 700  # 64,000 voxels, above the solver cap
        response, seconds = self.post(nifti_bytes(hu))
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        # Coarsened 2x: a solid 20^3 block of 2 mm voxels keeps the 64 cm3 volume.
        self.assertEqual(body["bone_volume_cm3"], 64.0)
        self.assertEqual(body["mesh_faces"], 6 * 20 * 20 * 2)
        self.assertLess(seconds, TIME_LIMIT_S)

    def test_femur_sized_scan_answers_in_time(self):
        hu, spacing_mm = femur_ct_from_labelmap()
        response, seconds = self.post(nifti_bytes(hu, spacing_mm), "femur.nii.gz")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertLess(seconds, TIME_LIMIT_S)
        _, details = analyze_bone_volume(hu.astype(np.float32), np.asarray(spacing_mm))
        self.assertLessEqual(details["fe_voxels"], MAX_FE_VOXELS)
        self.assertEqual(details["coarsening_factors"], [6, 6, 2])
        np.testing.assert_allclose(details["reaction_newtons"], [0, 0, 800], atol=800 * 1e-6)
        # The response reports the segmented volume, and the coarse mesh carries all of it.
        self.assertEqual(response.json()["bone_volume_cm3"], round(details["thresholded_component_volume_cm3"], 2))
        self.assertAlmostEqual(details["fe_bone_volume_cm3"], details["thresholded_component_volume_cm3"], places=6)

    def test_coarsening_keeps_a_thin_hollow_wall(self):
        # A tube 400 mm long, 13 mm outer radius, 2 mm wall, in 0.703 x 0.703 x 2 mm
        # voxels at 1200 HU: thin cortical bone. A block that is at least half bone
        # broke this wall into pieces and solved 10.68 of its 56.95 cm3.
        spacing_mm = np.array([0.703125, 0.703125, 2.0])
        x = (np.arange(64) - 31.5) * spacing_mm[0]
        radius = np.hypot(*np.meshgrid(x, x, indexing="ij"))
        wall = (radius <= 13) & (radius > 11)
        hu = np.full((64, 64, 200), -1000.0, dtype=np.float32)
        hu[wall, :] = 1200.0
        result, details = analyze_bone_volume(hu, spacing_mm)
        self.assertGreater(details["coarsening_factors"], [1, 1, 1])
        self.assertEqual(result.bone_volume_cm3, round(details["thresholded_component_volume_cm3"], 2))
        self.assertAlmostEqual(details["fe_bone_volume_cm3"], details["thresholded_component_volume_cm3"], places=6)
        np.testing.assert_allclose(details["reaction_newtons"], [0, 0, 800], atol=800 * 1e-6)
        # Away from the ends the wall is in uniform compression at load / wall area.
        nominal_mpa = 800.0 / (wall.sum() * spacing_mm[0] * spacing_mm[1])
        self.assertAlmostEqual(result.max_von_mises_stress_mpa / nominal_mpa, 1.0, delta=0.1)

    def test_bone_weighted_percentile_matches_repeated_values(self):
        rng = np.random.default_rng(3)
        for size in (1, 2, 7, 500):
            values = rng.normal(size=size)
            weights = rng.integers(1, 9, size=size)
            for q in (0.0, 50.0, 99.5, 100.0):
                self.assertAlmostEqual(bone_weighted_percentile(values, weights, q),
                                       float(np.percentile(np.repeat(values, weights), q)), places=12)


if __name__ == "__main__":
    unittest.main()
