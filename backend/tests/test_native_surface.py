"""Compare the compiled boundary extractor with an independent NumPy oracle."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import numpy as np


DIRECTORY = Path(__file__).resolve().parents[2] / "scripts" / "bone_fea"


def load_file(name, filename):
    spec = importlib.util.spec_from_file_location(name, DIRECTORY / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def reference(tets):
    faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
    _, first, multiplicity = np.unique(
        np.sort(faces, axis=1), axis=0, return_index=True, return_counts=True,
    )
    selected = first[multiplicity == 1]
    return selected, faces[selected], selected // 4


class NativeSurfaceParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        required = os.environ.get("RAINBONE_REQUIRE_NATIVE_SURFACE") == "1"
        cls.native = load_file("_tested_native_surface", "native_surface.py")
        # Tests may wait for the bounded startup build; the API path never does.
        cls.native.wait_until_ready(timeout=25)
        if not cls.native.available():
            if required:
                raise AssertionError("Explicit native verification requested but native extraction is unavailable")
            raise unittest.SkipTest("Optional native extractor unavailable after bounded warm-up; fallback tests still run")
        with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "0"}):
            cls.solve = load_file("_tested_surface_solve", "solve.py")
        cls.solve._native_surface = cls.native

    def test_compiled_library_reports_its_actual_supported_standard(self):
        self.assertIn(self.native.cpp_standard(), {"c++23", "c++20", "c++17"})

    def assert_native_matches(self, tets):
        expected, faces, owners = reference(tets)
        actual = self.native.boundary_face_indices(tets)
        self.assertIsNotNone(actual, "Native path must execute for supported int32 input")
        self.assertEqual(actual.dtype, np.dtype(np.int64))
        np.testing.assert_array_equal(actual, expected)
        all_faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
        np.testing.assert_array_equal(all_faces[actual], faces)
        np.testing.assert_array_equal(actual // 4, owners)
        return faces, owners

    def test_regular_voxel_mesh_and_reordered_tetrahedra(self):
        points, tets = self.solve.tetrahedralize(np.ones((3, 2, 4), dtype=bool), np.eye(4))
        for candidate in (tets, tets[::-1].copy(), tets[:, [2, 0, 3, 1]].copy()):
            with self.subTest(first=candidate[0].tolist()):
                faces, owners = self.assert_native_matches(candidate)
                actual_faces, actual_owners = self.solve.surface_faces(points, candidate)
                np.testing.assert_array_equal(actual_faces, faces)
                np.testing.assert_array_equal(actual_owners, owners)
                self.assertEqual(self.solve._surface_faces(points, candidate)[2], "cpp")

    def test_duplicate_multiplicity_two_and_three_excludes_shared_faces(self):
        tet = np.array([[0, 1, 2, 3]], dtype=np.int32)
        separate = np.array([[4, 5, 6, 7]], dtype=np.int32)
        for copies in (2, 3):
            candidate = np.concatenate([np.repeat(tet, copies, axis=0), separate])
            faces, owners = self.assert_native_matches(candidate)
            self.assertEqual(len(faces), 4)
            np.testing.assert_array_equal(owners, np.full(4, copies))

    def test_empty_input_is_a_valid_native_empty_result(self):
        faces, owners = self.assert_native_matches(np.empty((0, 4), dtype=np.int32))
        self.assertEqual(faces.shape, (0, 3))
        self.assertEqual(owners.shape, (0,))

    def test_committed_hfvalid_connectivity_has_byte_exact_faces_and_owners(self):
        import meshio

        filename = Path(__file__).resolve().parents[2] / "frontend/public/models/hfvalid-femur/bone-fea.vtu"
        mesh = meshio.read(filename)
        original = mesh.cells_dict["tetra"]
        self.assertEqual(len(original), 60819)
        self.assertGreaterEqual(int(original.min()), 0)
        self.assertLessEqual(int(original.max()), np.iinfo(np.int32).max)
        tets = original.astype(np.int32)
        np.testing.assert_array_equal(tets.astype(original.dtype), original)
        expected_faces, expected_owners = self.assert_native_matches(tets)
        faces, owners, backend = self.solve._surface_faces(mesh.points, tets)
        self.assertEqual(backend, "cpp")
        self.assertEqual(faces.dtype, expected_faces.dtype)
        self.assertEqual(owners.dtype, expected_owners.dtype)
        self.assertEqual(faces.tobytes(), expected_faces.tobytes())
        self.assertEqual(owners.tobytes(), expected_owners.tobytes())


class NativeSurfaceFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # These tests never need a compiler, an existing binary, or a successful
        # background warm-up. Import with native loading explicitly disabled.
        with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "0"}):
            cls.native = load_file("_fallback_native_surface", "native_surface.py")
            cls.solve = load_file("_fallback_surface_solve", "solve.py")

    def test_unsupported_dtype_shape_and_large_indices_return_none(self):
        unsupported = (
            np.array([[0, 1, 2, 3]], dtype=np.int64),
            np.array([[0, 1, 2, 2**40]], dtype=np.int64),
            np.ones((2, 3), dtype=np.int32),
            np.array([0, 1, 2, 3], dtype=np.int32),
            np.array([[0, 1, 2, 3]], dtype=np.float64),
        )
        for tets in unsupported:
            with self.subTest(shape=tets.shape, dtype=tets.dtype), mock.patch.object(self.native, "_kernel") as kernel:
                self.assertIsNone(self.native.boundary_face_indices(tets))
                kernel.assert_not_called()

    def test_explicit_disable_does_not_offer_native_extraction(self):
        with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "0"}):
            disabled = load_file("_tested_native_surface_disabled", "native_surface.py")
            self.assertFalse(disabled.available())
            self.assertIsNone(disabled.boundary_face_indices(np.array([[0, 1, 2, 3]], dtype=np.int32)))

    def assert_solver_fallback(self, tets):
        _, expected_faces, expected_owners = reference(tets)
        with mock.patch.object(self.solve, "_native_surface", self.native):
            faces, owners, backend = self.solve._surface_faces(None, tets)
        np.testing.assert_array_equal(faces, expected_faces)
        np.testing.assert_array_equal(owners, expected_owners)
        self.assertEqual(backend, "numpy")

    def test_forced_unavailable_and_int64_keep_original_numpy_result(self):
        tets = np.array([[0, 1, 2, 3], [1, 2, 3, 4]], dtype=np.int32)
        with mock.patch.object(self.native, "_kernel", None):
            self.assertFalse(self.native.available())
            self.assertIsNone(self.native.boundary_face_indices(tets))
            self.assert_solver_fallback(tets)
        for candidate in (tets.astype(np.int64), tets.astype(np.int64) + 2**40):
            self.assert_solver_fallback(candidate)

    def test_bad_native_returns_are_rejected_before_indexing_and_use_numpy(self):
        tets = np.array([[0, 1, 2, 3], [1, 2, 3, 4]], dtype=np.int32)

        def out_of_range(_tets, _count, output, capacity):
            output[0] = capacity
            return 1

        def duplicate_indices(_tets, _count, output, _capacity):
            output[0] = output[1] = 0
            return 2

        def negative_index(_tets, _count, output, _capacity):
            output[0] = -1  # ctypes uint64 wraps this; wrapper must still reject it.
            return 1

        for callback in (lambda *_: -1, lambda *_: 4 * len(tets) + 1,
                         out_of_range, negative_index, duplicate_indices):
            with self.subTest(callback=callback), mock.patch.object(self.native, "_kernel", callback):
                self.assertIsNone(self.native.boundary_face_indices(tets))
                self.assert_solver_fallback(tets)

    def test_missing_compiler_falls_back_without_running_build(self):
        run = mock.Mock()
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "native_surface.cpp"
            source.write_text("// isolated no-compiler fixture\n")
            with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
                 mock.patch.object(self.native, "SOURCE", source), \
                 mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: None)), \
                 mock.patch.object(self.native, "subprocess", self.fake_subprocess(run)):
                kernel = self.native._load_kernel()
        self.assertIsNone(kernel)
        run.assert_not_called()
        with mock.patch.object(self.native, "_kernel", kernel):
            self.assert_solver_fallback(np.array([[0, 1, 2, 3]], dtype=np.int32))

    @staticmethod
    def fake_subprocess(run):
        # Replace only this disabled wrapper's module binding, never globals
        # another solver's background compiler may currently be using.
        return SimpleNamespace(run=run, PIPE=subprocess.PIPE, SubprocessError=subprocess.SubprocessError,
                               CalledProcessError=subprocess.CalledProcessError,
                               TimeoutExpired=subprocess.TimeoutExpired)

    def test_compiler_failure_and_timeout_preserve_numpy_fallback(self):
        for failure in (subprocess.CalledProcessError(1, "c++"), subprocess.TimeoutExpired("c++", 20)):
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as temporary:
                source = Path(temporary) / "native_surface.cpp"
                source.write_text("// isolated build-failure fixture\n")
                run = mock.Mock(side_effect=failure)
                with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
                     mock.patch.object(self.native, "SOURCE", source), \
                     mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: "fake-c++")), \
                     mock.patch.object(self.native, "subprocess", self.fake_subprocess(run)):
                    kernel = self.native._load_kernel()
                self.assertIsNone(kernel)
                self.assertEqual(run.call_count, 1 if isinstance(failure, subprocess.TimeoutExpired) else 3)
                for call in run.call_args_list:
                    self.assertGreater(call.kwargs["timeout"], 0)
                    self.assertLessEqual(call.kwargs["timeout"], 20)
                self.assertEqual(list((source.parent / ".native").iterdir()), [])
                with mock.patch.object(self.native, "_kernel", kernel):
                    self.assert_solver_fallback(np.array([[0, 1, 2, 3]], dtype=np.int32))

    def test_cpp23_success_stops_and_compile_rejections_try_cpp20_then_cpp17(self):
        preferred = ["c++23", "c++20", "c++17"]
        for accepted in preferred:
            with self.subTest(accepted=accepted), tempfile.TemporaryDirectory() as temporary:
                source = Path(temporary) / "native_surface.cpp"
                source.write_text("// isolated standards fixture\n")
                attempted = []

                def compile_fixture(command, **kwargs):
                    standard = next(arg.split("=", 1)[1] for arg in command if arg.startswith("-std="))
                    attempted.append(standard)
                    if standard != accepted:
                        raise subprocess.CalledProcessError(1, command)
                    Path(command[command.index("-o") + 1]).write_bytes(standard.encode())
                    return subprocess.CompletedProcess(command, 0)

                with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
                     mock.patch.object(self.native, "SOURCE", source), \
                     mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: "fake-c++")), \
                     mock.patch.object(self.native, "subprocess", self.fake_subprocess(mock.Mock(side_effect=compile_fixture))):
                    result = self.native.build_native()
                self.assertIsNotNone(result)
                self.assertEqual(result.read_bytes(), accepted.encode())
                self.assertEqual(attempted, preferred[:preferred.index(accepted) + 1])
                self.assertEqual(list(result.parent.iterdir()), [result], "failed temporary builds are removed")

    def test_cached_standard_priority_uses_cpp23_without_a_compiler(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "native_surface.cpp"
            source.write_text("// isolated cache priority fixture\n")
            paths = []
            with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
                 mock.patch.object(self.native, "SOURCE", source), \
                 mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: "fake-c++")):
                # Build lower-standard fixtures first so all three cache files
                # coexist, then prove newest-standard cache preference.
                for accepted in ("c++17", "c++20", "c++23"):
                    def compile_fixture(command, **kwargs):
                        standard = next(arg.split("=", 1)[1] for arg in command if arg.startswith("-std="))
                        if standard != accepted:
                            raise subprocess.CalledProcessError(1, command)
                        Path(command[command.index("-o") + 1]).write_bytes(standard.encode())
                        return subprocess.CompletedProcess(command, 0)
                    with mock.patch.object(self.native, "subprocess", self.fake_subprocess(mock.Mock(side_effect=compile_fixture))):
                        paths.append(self.native.build_native())
                run = mock.Mock(side_effect=AssertionError("cached library must not compile"))
                with mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: None)), \
                     mock.patch.object(self.native, "subprocess", self.fake_subprocess(run)):
                    result = self.native.build_native()
                    self.assertEqual(result, paths[-1])
                    self.assertEqual(result.read_bytes(), b"c++23")
                    # Only isolated temporary fixtures are removed, never the
                    # repository's real compiled artifacts.
                    paths[-1].unlink()
                    self.assertEqual(self.native.build_native(), paths[1])
                    paths[1].unlink()
                    self.assertEqual(self.native.build_native(), paths[0])
            self.assertEqual(len(set(paths)), 3, "each standard gets a distinct cache entry")
            run.assert_not_called()

    def test_compile_attempts_share_one_twenty_second_budget(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "native_surface.cpp"
            source.write_text("// isolated total-budget fixture\n")
            run = mock.Mock(side_effect=subprocess.CalledProcessError(1, "fake-c++"))
            clock = mock.Mock(side_effect=[100.0, 101.0, 110.0, 121.0])
            with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
                 mock.patch.object(self.native, "SOURCE", source), \
                 mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: "fake-c++")), \
                 mock.patch.object(self.native, "time", SimpleNamespace(monotonic=clock)), \
                 mock.patch.object(self.native, "subprocess", self.fake_subprocess(run)):
                self.assertIsNone(self.native.build_native())
            self.assertEqual([call.kwargs["timeout"] for call in run.call_args_list], [19.0, 10.0])
            self.assertEqual(run.call_count, 2, "expired total budget prevents the third attempt")

    def test_read_only_build_directory_preserves_numpy_fallback(self):
        source = mock.MagicMock()
        source.read_bytes.return_value = b"// isolated read-only fixture"
        directory = source.parent.__truediv__.return_value
        directory.__truediv__.return_value.is_file.return_value = False
        directory.mkdir.side_effect = PermissionError("read-only checkout")
        run = mock.Mock()
        with mock.patch.dict(os.environ, {"RAINBONE_NATIVE_SURFACE": "1"}), \
             mock.patch.object(self.native, "SOURCE", source), \
             mock.patch.object(self.native, "shutil", SimpleNamespace(which=lambda _: "fake-c++")), \
             mock.patch.object(self.native, "subprocess", self.fake_subprocess(run)):
            kernel = self.native._load_kernel()
        self.assertIsNone(kernel)
        run.assert_not_called()
        with mock.patch.object(self.native, "_kernel", kernel):
            self.assert_solver_fallback(np.array([[0, 1, 2, 3]], dtype=np.int32))

    def test_library_load_error_preserves_numpy_fallback(self):
        with mock.patch.object(self.native, "build_native", return_value=Path("/unused/library.so")), \
             mock.patch.object(self.native, "ctypes", SimpleNamespace(CDLL=mock.Mock(side_effect=OSError("cannot load binary")))):
            kernel = self.native._load_kernel()
        self.assertIsNone(kernel)
        with mock.patch.object(self.native, "_kernel", kernel):
            self.assert_solver_fallback(np.array([[0, 1, 2, 3]], dtype=np.int32))

    def test_missing_optional_helper_keeps_original_numpy_faces(self):
        tets = np.array([[0, 1, 2, 3], [1, 2, 3, 4]], dtype=np.int32)
        _, expected_faces, expected_owners = reference(tets)
        with mock.patch.object(self.solve, "_native_surface", None):
            faces, owners, backend = self.solve._surface_faces(None, tets)
        np.testing.assert_array_equal(faces, expected_faces)
        np.testing.assert_array_equal(owners, expected_owners)
        self.assertEqual(backend, "numpy")

