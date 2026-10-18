"""Benchmark optional native surface extraction against the original NumPy algorithm.

Default: bundled HFValid femur. Optional positional paths accept other tetrahedral VTU meshes.
Reports stage latency only, including Python wrapper validation; does not run or time the FE solve.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import statistics
import time

import meshio
import numpy as np

from solve import surface_faces, _native_surface


def numpy_surface_faces(points, tets):
    """Unchanged surface_faces algorithm from Rainbone commit 1dcdbf2."""
    faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
    _, first, counts = np.unique(np.sort(faces, axis=1), axis=0, return_index=True, return_counts=True)
    selected = first[counts == 1]
    return faces[selected], selected // 4


def median_ms(callback, repeats):
    for _ in range(2):
        callback()
    elapsed = []
    for _ in range(repeats):
        start = time.perf_counter()
        callback()
        elapsed.append((time.perf_counter() - start) * 1000)
    return statistics.median(elapsed)


def benchmark(path, repeats):
    mesh = meshio.read(path)
    if not mesh.cells or any(cell.type != "tetra" for cell in mesh.cells):
        raise ValueError(f"{path.name}: requires tetrahedral cells only")
    raw = np.concatenate([cell.data for cell in mesh.cells])
    if (raw.size == 0 or raw.dtype.kind not in "iu" or int(raw.min()) < 0
            or int(raw.max()) >= len(mesh.points) or int(raw.max()) > np.iinfo(np.int32).max):
        raise ValueError(f"{path.name}: invalid or unsupported connectivity")
    # This explicit, verified cast matches production tetrahedralize output without narrowing values.
    tets = np.ascontiguousarray(raw, dtype=np.int32)
    np.testing.assert_array_equal(raw, tets)
    selected = _native_surface.boundary_face_indices(tets)
    if selected is None:
        raise RuntimeError("Native kernel unavailable for input; refusing to benchmark NumPy against itself")
    expected = numpy_surface_faces(mesh.points, tets)
    actual = surface_faces(mesh.points, tets)
    np.testing.assert_array_equal(actual[0], expected[0])
    np.testing.assert_array_equal(actual[1], expected[1])
    python_ms = median_ms(lambda: numpy_surface_faces(mesh.points, tets), repeats)
    native_ms = median_ms(lambda: surface_faces(mesh.points, tets), repeats)
    return {"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "points": len(mesh.points), "tetrahedra": len(tets), "boundary_faces": len(actual[0]),
            "exact_face_owner_parity": True, "exact_int32_cast": True,
            "python_median_ms": round(python_ms, 3), "native_wrapper_median_ms": round(native_ms, 3),
            "surface_stage_speedup": round(python_ms / native_ms, 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="Tetrahedral VTU files; default bundled HFValid femur")
    parser.add_argument("--repeats", type=int, default=7)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    if not _native_surface.wait_until_ready(timeout=25) or not _native_surface.available():
        parser.error("Native kernel unavailable; install a supported C++ compiler and retry")
    paths = args.paths or [Path(__file__).resolve().parents[2] / "frontend/public/models/hfvalid-femur/bone-fea.vtu"]
    print(json.dumps({"scope": "surface extraction only; includes wrapper validation; not end-to-end solve latency",
                      "warmups": 2, "repeats": args.repeats,
                      "cases": [benchmark(path, args.repeats) for path in paths]}, indent=2))


if __name__ == "__main__":
    main()
