"""Bone segmentation with FSL: the fallback without FSL, and agreement with numpy/scipy when FSL is installed.

The agreement tests run only when FSLDIR (process environment or backend/.env) points at an FSL install
with fslmaths and connectedcomp; otherwise they are skipped with the reason.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from services import fea_solver, fsl_segmentation  # noqa: E402
from services.fea_solver import largest_component, segment_bone, threshold_bone_hu  # noqa: E402
from tests.test_simulate import SAMPLE, femur_ct_from_labelmap  # noqa: E402

ONE_MM = np.ones(3)


def numpy_mask(volume: np.ndarray) -> np.ndarray:
    return largest_component(threshold_bone_hu(volume))


def edge_case_volume() -> np.ndarray:
    """Threshold edges, non-finite values, diagonal-only contact and a tie between two largest components."""
    hu = np.full((12, 10, 9), -1000.0, dtype=np.float32)
    hu[0, 0, 0], hu[0, 0, 1], hu[0, 0, 2] = 150.0, 149.99, np.nan
    hu[1, 1, 1], hu[1, 1, 2] = np.inf, -np.inf
    hu[3:5, 3:5, 3:5] = 700.0          # 8 voxels
    hu[5, 5, 5] = 700.0                # touches the cube only at a corner
    hu[8:10, 6:8, 0:2] = 400.0         # another 8 voxels: a tie for the largest
    return hu


class WithoutFslTests(unittest.TestCase):
    def test_without_fsldir_numpy_segments_and_nothing_runs(self):
        hu = edge_case_volume()
        with mock.patch.object(fsl_segmentation, "runtime_env", return_value={}), \
                mock.patch.object(subprocess, "run", side_effect=AssertionError("FSL must not run")):
            mask, method = segment_bone(hu, ONE_MM)
        self.assertEqual(method, "numpy")
        np.testing.assert_array_equal(mask, numpy_mask(hu))

    def test_fsldir_without_commands_falls_back_with_a_warning(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.object(fsl_segmentation, "runtime_env", return_value={"FSLDIR": folder}), \
                    self.assertLogs(fsl_segmentation.log, "WARNING") as logs:
                _, method = segment_bone(edge_case_volume(), ONE_MM)
        self.assertEqual(method, "numpy")
        self.assertIn("fslmaths, connectedcomp", logs.output[0])

    def test_failing_fsl_command_falls_back_with_a_warning(self):
        tools = {name: Path("/fsl/bin") / name for name in fsl_segmentation.FSL_COMMANDS}
        failure = subprocess.CalledProcessError(1, "fslmaths")
        with mock.patch.object(fsl_segmentation, "fsl_tools", return_value=tools), \
                mock.patch.object(subprocess, "run", side_effect=failure), \
                self.assertLogs(fsl_segmentation.log, "WARNING"):
            mask, method = segment_bone(edge_case_volume(), ONE_MM)
        self.assertEqual(method, "numpy")
        np.testing.assert_array_equal(mask, numpy_mask(edge_case_volume()))


@unittest.skipUnless(fsl_segmentation.fsl_tools(), "FSL not found: set FSLDIR to an install with fslmaths and "
                                                   "connectedcomp to run these")
class FslAgreementTests(unittest.TestCase):
    def assert_same_mask(self, hu: np.ndarray, spacing_mm=ONE_MM):
        mask, method = segment_bone(hu, np.asarray(spacing_mm, dtype=float))
        self.assertEqual(method, "fsl")
        np.testing.assert_array_equal(mask, numpy_mask(hu))
        return mask

    def test_edge_cases_match_numpy(self):
        for order in ("C", "F"):
            with self.subTest(order=order):
                mask = self.assert_same_mask(np.asarray(edge_case_volume(), order=order))
                self.assertEqual(int(mask.sum()), 8)

    def test_femur_shaped_volume_matches_numpy(self):
        hu, spacing_mm = femur_ct_from_labelmap()
        self.assert_same_mask(hu.astype(np.float32), spacing_mm)

    def test_simulate_response_is_the_same_with_or_without_fsl(self):
        client = TestClient(app)
        files = {"file": (SAMPLE.name, SAMPLE.read_bytes(), "application/gzip")}
        with mock.patch.dict(os.environ, {"DATABASE_URL": ""}):
            with self.assertLogs(fea_solver.logger, "INFO") as with_fsl_logs:
                with_fsl = client.post("/api/simulate", files=files)
            with mock.patch.object(fsl_segmentation, "runtime_env", return_value={}):
                without_fsl = client.post("/api/simulate", files=files)
        self.assertEqual(with_fsl.status_code, 200, with_fsl.text)
        self.assertEqual(with_fsl.json(), without_fsl.json())
        self.assertIn("'segmentation': 'fsl'", with_fsl_logs.output[-1])


if __name__ == "__main__":
    unittest.main()
