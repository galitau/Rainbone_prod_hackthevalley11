from __future__ import annotations

import struct
import zlib
from functools import lru_cache

import nibabel as nib
import numpy as np
from skimage.measure import marching_cubes

from services.storage import read_lesion_coordinates, read_object_bytes

MAX_NIFTI_BYTES = 512 * 2**20
MAX_SURFACE_DIMENSION = 192


def _decompress(payload: bytes) -> bytes:
    if payload[:2] != b"\x1f\x8b":
        return payload
    try:
        return zlib.decompress(payload, 16 + zlib.MAX_WBITS)
    except zlib.error as exc:
        raise RuntimeError("The compressed NIfTI object could not be decompressed.") from exc


def _read_volume(filename: str) -> tuple[np.ndarray, np.ndarray]:
    raw = _decompress(read_object_bytes(filename))
    if len(raw) > MAX_NIFTI_BYTES:
        raise RuntimeError("The NIfTI volume is too large to convert to a surface.")
    try:
        image = nib.Nifti1Image.from_bytes(raw) if struct.unpack("<I", raw[:4])[0] != 540 else nib.Nifti2Image.from_bytes(raw)
        volume = np.asarray(image.get_fdata(dtype=np.float32))
        spacing = np.asarray(image.header.get_zooms()[:3], dtype=float)
    except (ValueError, TypeError, IndexError) as exc:
        raise RuntimeError("The Vultr object is not a readable NIfTI volume.") from exc
    if volume.ndim != 3 or not np.all(np.isfinite(spacing)) or np.any(spacing <= 0):
        raise RuntimeError("The NIfTI object must contain a finite 3D volume.")
    return volume, spacing


@lru_cache(maxsize=2)
def _surface(filename: str) -> tuple[np.ndarray, np.ndarray]:
    volume, spacing = _read_volume(filename)
    stride = max(1, int(np.ceil(max(volume.shape) / MAX_SURFACE_DIMENSION)))
    if stride > 1:
        volume = volume[::stride, ::stride, ::stride]
    mask = volume > 0 if "_mask_" in filename else volume >= 150.0
    if not np.any(mask):
        raise RuntimeError(f"No bone voxels were found in {filename}.")
    try:
        # The annotation JSON uses voxel coordinates. Keep the generated mesh
        # in that same coordinate system rather than applying the NIfTI affine.
        vertices, faces, _, _ = marching_cubes(
            mask.astype(np.float32),
            level=0.5,
            spacing=(float(stride), float(stride), float(stride)),
        )
    except (RuntimeError, ValueError) as exc:
        raise RuntimeError(f"Could not create a surface from {filename}.") from exc
    return vertices, faces.astype(np.int32)


def _xml(vertices: np.ndarray, faces: np.ndarray) -> bytes:
    points = " ".join(f"{value:.5g}" for value in vertices.astype(np.float32).ravel())
    connectivity = " ".join(str(int(value)) for value in faces.ravel())
    offsets = " ".join(str((index + 1) * 3) for index in range(len(faces)))
    return f"""<?xml version="1.0"?>
<VTKFile type="PolyData" version="0.1" byte_order="LittleEndian">
<PolyData><Piece NumberOfPoints="{len(vertices)}" NumberOfVerts="0" NumberOfLines="0" NumberOfStrips="0" NumberOfPolys="{len(faces)}">
<Points><DataArray type="Float32" NumberOfComponents="3" format="ascii">{points}</DataArray></Points>
<Polys><DataArray type="Int32" Name="connectivity" format="ascii">{connectivity}</DataArray>
<DataArray type="Int32" Name="offsets" format="ascii">{offsets}</DataArray></Polys>
</Piece></PolyData></VTKFile>""".encode()


@lru_cache(maxsize=8)
def _cached_vultr_progression_vtp(frame_index: int) -> bytes:
    return read_object_bytes(f"progression/frame-{frame_index:02d}.vtp")


@lru_cache(maxsize=8)
def progression_vtp(frame_index: int) -> bytes:
    if not 0 <= frame_index <= 7:
        raise RuntimeError("Progression frame must be between 0 and 7.")
    baseline, baseline_faces = _surface("006f52e910_BL_img_BL_img_00.nii.gz")
    if frame_index == 7:
        vertices, faces = _surface("006f52e910_FU_img_FU_img_00.nii.gz")
    else:
        # The scans do not have identical marching-cubes topology. Translate
        # the stable baseline surface through the registered lesion displacement
        # for intermediate frames, then use the real follow-up surface at frame 7.
        followup, _ = _surface("006f52e910_FU_img_FU_img_00.nii.gz")
        progress = frame_index / 7
        coordinates = read_lesion_coordinates()
        baseline_point = coordinates["baseline"]
        followup_point = coordinates["followup"]
        displacement = np.asarray(followup_point) - np.asarray(baseline_point)
        if len(followup) == len(baseline):
            vertices, faces = baseline + (followup - baseline) * progress, baseline_faces
        else:
            vertices, faces = baseline + displacement * progress, baseline_faces
    return _xml(vertices, faces)


def cached_progression_vtp(frame_index: int) -> bytes:
    if not 0 <= frame_index <= 7:
        raise RuntimeError("Progression frame must be between 0 and 7.")
    try:
        return _cached_vultr_progression_vtp(frame_index)
    except RuntimeError:
        return progression_vtp(frame_index)
