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
import time
import unittest
from pathlib import Path
from unittest import mock

import nibabel as nib
import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from main import SimulationResponse, app  # noqa: E402
from services.fea_solver import MAX_FE_VOXELS, _load_nifti, analyze_bone_volume  # noqa: E402

REPO = BACKEND.parent
SAMPLE = REPO / "public" / "sample_bone.nii.gz"
FEMUR_LABELMAP = REPO / "public" / "models" / "hfvalid-femur" / "bone.seg.nrrd"
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
        self.assertGreater(body["max_von_mises_stress_mpa"], 0)
        self.assertTrue(10 <= body["average_youngs_modulus_gpa"] <= 25)
        # 3048 voxels of 1 mm3 at 750 HU, solved without coarsening.
        self.assertEqual(body["bone_volume_cm3"], 3.05)
        self.assertTrue(0 <= body["fracture_risk_index_percent"] <= 100)
        self.assertEqual(body["load_newtons"], 800)
        self.assertGreater(body["mesh_vertices"], 0)
        self.assertGreater(body["mesh_faces"], 0)
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
        np.testing.assert_allclose(details["reaction_newtons"], [0, 0, 800], atol=800 * 1e-6)
        # Coarsening keeps the meshed volume within 2% of the segmented volume.
        self.assertAlmostEqual(response.json()["bone_volume_cm3"] / details["thresholded_component_volume_cm3"],
                               1.0, delta=0.02)


if __name__ == "__main__":
    unittest.main()
