"""Optional C++ boundary-face extraction; NumPy remains the portable fallback.

Builds repository-owned source once in a background thread at solver import,
never from request data. Set RAINBONE_NATIVE_SURFACE=0 to disable. An absent compiler,
read-only checkout, or failed build leaves the existing NumPy path available.
"""
from __future__ import annotations

import ctypes
import hashlib
import logging
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import threading
import time

import numpy as np

log = logging.getLogger(__name__)
SOURCE = Path(__file__).with_suffix(".cpp")
STANDARDS = ("c++23", "c++20", "c++17")
_cpp_standard = None


def build_native() -> Path | None:
    if os.environ.get("RAINBONE_NATIVE_SURFACE", "1") == "0":
        return None
    try:
        digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()[:16]
        directory = SOURCE.parent / ".native"
        compiler = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")
        deadline = time.monotonic() + 20
        for standard in STANDARDS:
            target = directory / f"surface-{digest}-{standard}-{platform.system()}-{platform.machine()}.so"
            if target.is_file():
                return target
            if compiler is None:
                continue
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            directory.mkdir(exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix="build-", suffix=".so", dir=directory)
            os.close(fd)
            try:
                subprocess.run([compiler, "-O3", f"-std={standard}", "-shared", "-fPIC",
                                str(SOURCE), "-o", temporary], check=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=remaining)
                os.replace(temporary, target)
                return target
            except subprocess.CalledProcessError:
                # Older toolchains can reject a newer language mode. Try the
                # next supported standard before falling back to NumPy.
                continue
            finally:
                Path(temporary).unlink(missing_ok=True)
        return None
    except (OSError, subprocess.SubprocessError):
        log.warning("Native surface build unavailable; using NumPy")
        return None


def _load_kernel():
    global _cpp_standard
    path = build_native()
    if path is None:
        return None
    try:
        library = ctypes.CDLL(str(path))
        library.rb_surface_abi_version.argtypes = []
        library.rb_surface_abi_version.restype = ctypes.c_int
        if library.rb_surface_abi_version() != 1:
            return None
        library.rb_surface_cpp_standard.argtypes = []
        library.rb_surface_cpp_standard.restype = ctypes.c_long
        language_version = library.rb_surface_cpp_standard()
        if language_version < 201703:
            return None
        kernel = library.rb_boundary_faces
        kernel.argtypes = [ctypes.POINTER(ctypes.c_int32), ctypes.c_int64,
                           ctypes.POINTER(ctypes.c_uint64), ctypes.c_int64]
        kernel.restype = ctypes.c_int64
        _cpp_standard = ("c++23" if language_version > 202002 else
                         "c++20" if language_version >= 202002 else "c++17")
        return kernel
    except (OSError, AttributeError):
        log.warning("Native surface library unavailable; using NumPy")
        return None


_kernel = None
_ready = threading.Event()


def _initialize():
    global _kernel
    try:
        _kernel = _load_kernel()
    finally:
        _ready.set()


# Startup and requests never wait for a compiler. Until this finishes, the
# caller uses NumPy; later calls use the cached native library when available.
if os.environ.get("RAINBONE_NATIVE_SURFACE", "1") == "0":
    _ready.set()
else:
    try:
        threading.Thread(target=_initialize, name="rainbone-native-build", daemon=True).start()
    except RuntimeError:
        _ready.set()


def wait_until_ready(timeout: float = 25.0) -> bool:
    """Explicit build/test helper; never called by the API request path."""
    return _ready.wait(timeout)


def available() -> bool:
    return _kernel is not None


def cpp_standard() -> str | None:
    """The language mode reported by the loaded compiler output."""
    return _cpp_standard if available() else None


def boundary_face_indices(tets: np.ndarray) -> np.ndarray | None:
    """Return original flat-face indices in NumPy's canonical order, or fallback.

    The native function only sees bounded contiguous int32 connectivity. Wider
    or other dtypes keep their original NumPy semantics without narrowing.
    """
    if _kernel is None or not isinstance(tets, np.ndarray):
        return None
    if tets.dtype != np.dtype(np.int32) or tets.ndim != 2 or tets.shape[1] != 4:
        return None
    tets = np.ascontiguousarray(tets)
    capacity = len(tets) * 4
    indices = np.empty(capacity, dtype=np.uint64)
    try:
        count = int(_kernel(tets.ctypes.data_as(ctypes.POINTER(ctypes.c_int32)), len(tets),
                            indices.ctypes.data_as(ctypes.POINTER(ctypes.c_uint64)), capacity))
    except (ctypes.ArgumentError, OSError, ValueError, OverflowError):
        return None
    if count < 0 or count > capacity:
        return None
    selected = indices[:count]
    if np.any(selected >= capacity) or np.unique(selected).size != count:
        return None
    return selected.astype(np.int64)


if __name__ == "__main__":
    wait_until_ready()
    print(f"surface extraction: {cpp_standard()}" if available() else "surface extraction: NumPy fallback")
