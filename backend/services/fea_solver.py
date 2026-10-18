from __future__ import annotations

import importlib.util
import logging
import math
import struct
import time
import zlib
from pathlib import Path
from typing import Any

import nibabel as nib
import numpy as np
import scipy.ndimage as ndi
from pydantic import BaseModel, Field
from sfepy.base.base import output as sfepy_output

from services.fsl_segmentation import fsl_bone_mask


def _load_bone_fea_solver():
    # scripts/ is not a package; load solve.py by path so the API and the
    # static femur model run the same SfePy solver.
    path = Path(__file__).resolve().parents[2] / "scripts" / "bone_fea" / "solve.py"
    spec = importlib.util.spec_from_file_location("rainbowbone_bone_fea_solve", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bone_fea = _load_bone_fea_solver()
# SfePy prints about 30 progress lines per solve; the API logs its own summary.
sfepy_output.set_output(quiet=True)
logger = logging.getLogger(__name__)

# Upload limits. A 512 x 512 x 512 volume is a large CT; crop larger scans to the bone first.
MAX_UPLOAD_BYTES = 512 * 2**20
MAX_RAW_BYTES = 1024 * 2**20
MAX_VOXELS = 512**3

LOAD_NEWTONS = 800.0
POISSON_RATIO = 0.3
ASSUMED_STRENGTH_MPA = 150.0
STRESS_PERCENTILE = 99.5
# Coarsen the segmented bone above this many voxels so a request stays well
# under 20 s; the README lists the timings this value was chosen from.
MAX_FE_VOXELS = 8000
# Clamp and load bands: the two outermost node layers at each end along Z.
BAND_VOXELS = 1.5


class FEASolverError(ValueError):
    """Raised when an input volume cannot be processed by the FEA pipeline."""


class FEAResult(BaseModel):
    max_von_mises_stress_mpa: float
    average_youngs_modulus_gpa: float
    bone_volume_cm3: float
    fracture_risk_index_percent: float = Field(ge=0, le=100)
    load_newtons: float = 800
    mesh_vertices: int
    mesh_faces: int
    source_filename: str


def _gunzip_prefix(payload: bytes, size: int) -> bytes:
    """The first `size` decompressed bytes of a gzip file (members in order), or fewer if it is shorter."""
    parts: list[bytes] = []
    try:
        while payload and size > 0:
            stream = zlib.decompressobj(16 + zlib.MAX_WBITS)
            part = stream.decompress(payload, size)
            parts.append(part)
            size -= len(part)
            if not stream.eof:  # `size` reached, or the file is cut short
                break
            payload = stream.unused_data
    except zlib.error as exc:
        raise FEASolverError("Unable to read the uploaded NIfTI volume.") from exc
    return b"".join(parts)


def _load_nifti(payload: bytes) -> tuple[np.ndarray, np.ndarray]:
    # nibabel 5 cannot nib.load() a BytesIO; parse the (decompressed) bytes.
    # The header is read first, and only the bytes it declares are decompressed,
    # so a small gzip file cannot make the server allocate a large buffer.
    gzipped = payload[:2] == b"\x1f\x8b"
    head = _gunzip_prefix(payload, 540) if gzipped else payload[:540]
    try:
        nifti2 = head[:4] in (struct.pack("<i", 540), struct.pack(">i", 540))
        header_class = nib.Nifti2Header if nifti2 else nib.Nifti1Header
        header = header_class(head[:header_class.template_dtype.itemsize], check=False)
        voxels = math.prod(int(size) for size in header.get_data_shape())
        # A single-file NIfTI keeps its voxels after the header and the 4-byte extension flag.
        offset = max(int(header.get_data_offset()), header_class.template_dtype.itemsize + 4)
        size = offset + voxels * header.get_data_dtype().itemsize
    except Exception as exc:
        raise FEASolverError("Unable to read the uploaded NIfTI volume.") from exc
    if voxels > MAX_VOXELS:
        raise FEASolverError(f"The NIfTI volume has {voxels:,} voxels; the limit is {MAX_VOXELS:,} (512 x 512 x 512).")
    if size > MAX_RAW_BYTES:
        raise FEASolverError(f"The NIfTI file declares {size:,} bytes; the limit is "
                             f"{MAX_RAW_BYTES // 2**20:,} MiB decompressed.")
    raw = _gunzip_prefix(payload, size) if gzipped else payload[:size]
    try:
        image = (nib.Nifti2Image if nifti2 else nib.Nifti1Image).from_bytes(raw)
        volume = np.asarray(image.get_fdata(dtype=np.float32))
        spacing_mm = np.asarray(image.header.get_zooms()[:3], dtype=float)
    except Exception as exc:
        raise FEASolverError("Unable to read the uploaded NIfTI volume.") from exc

    if volume.ndim != 3 or not np.isfinite(volume).any():
        raise FEASolverError("NIfTI input must contain a finite 3D scalar volume.")
    if spacing_mm.shape != (3,) or not np.all(np.isfinite(spacing_mm) & (spacing_mm > 0)):
        raise FEASolverError("NIfTI input must declare a positive voxel size.")
    return volume, spacing_mm


def threshold_bone_hu(volume: np.ndarray, minimum_hu: float = 150.0) -> np.ndarray:
    """Segment mineralised tissue from CT Hounsfield Units."""
    return np.nan_to_num(volume, nan=-1000.0) >= minimum_hu


def hu_to_apparent_density_and_modulus(
    hu: np.ndarray,
    bone_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Map CT attenuation to density and cancellous-bone modulus.

    Density is a calibrated apparent density estimate in g/cm³. The modulus
    mapping is deliberately bounded to the requested 10–25 GPa range.
    """
    density = np.clip((hu + 1000.0) / 2000.0, 0.0, 1.2)
    normalized_density = np.clip((density - 0.15) / 0.85, 0.0, 1.0)
    modulus_gpa = 10.0 + 15.0 * normalized_density
    return density[bone_mask], modulus_gpa[bone_mask]


def segment_bone(volume: np.ndarray, spacing_mm: np.ndarray) -> tuple[np.ndarray, str]:
    """Largest face-connected component at or above 150 HU: with FSL when installed, else numpy/scipy."""
    mask = fsl_bone_mask(volume, spacing_mm, minimum_hu=150.0)
    if mask is not None:
        return mask, "fsl"
    return largest_component(threshold_bone_hu(volume)), "numpy"


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Keep the largest face-connected component of a binary mask."""
    labels, count = ndi.label(mask)
    if count == 0:
        return np.zeros(mask.shape, dtype=bool)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == sizes.argmax()


def coarsen_bone(
    mask: np.ndarray,
    modulus_gpa: np.ndarray,
    factors: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Merge blocks of factors[0] x factors[1] x factors[2] voxels.

    A block is in the mesh when it holds any bone voxel, so a thin wall stays
    connected: blocks of face-connected voxels are face-connected. Returns the
    block mask, the mean modulus of each block's bone voxels and each block's
    bone voxel count.
    """
    fx, fy, fz = (int(f) for f in factors)
    padding = [(0, -size % f) for size, f in zip(mask.shape, (fx, fy, fz))]
    shape = [(size + pad) // f for size, (_, pad), f in zip(mask.shape, padding, (fx, fy, fz))]

    def block_sum(values: np.ndarray) -> np.ndarray:
        padded = np.pad(values, padding)
        return padded.reshape(shape[0], fx, shape[1], fy, shape[2], fz).sum(axis=(1, 3, 5), dtype=np.float64)

    bone_count = block_sum(mask.astype(np.uint8)).astype(np.int64)
    modulus_sum = block_sum(np.where(mask, modulus_gpa, np.float32(0.0)))
    coarse_modulus = np.divide(modulus_sum, bone_count, out=np.zeros(shape), where=bone_count > 0)
    return bone_count > 0, coarse_modulus, bone_count


def _fe_grid(
    bone: np.ndarray,
    modulus_gpa: np.ndarray,
    spacing_mm: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return the FE voxel mask, its moduli, its bone voxel counts and the per-axis coarsening factors.

    Above MAX_FE_VOXELS, voxels are merged into blocks that are as close to
    cubic as the scan spacing allows, growing the block edge until the mesh
    fits under the cap.
    """
    factors = np.ones(3, dtype=int)
    count = int(bone.sum())
    if count <= MAX_FE_VOXELS:
        return bone, modulus_gpa, bone.astype(np.int64), factors
    edge_mm = float((count * np.prod(spacing_mm) / MAX_FE_VOXELS) ** (1.0 / 3.0))
    while True:
        factors = np.maximum(1, np.rint(edge_mm / spacing_mm)).astype(int)
        mask, mask_modulus, bone_count = coarsen_bone(bone, modulus_gpa, factors)
        if int(mask.sum()) <= MAX_FE_VOXELS:
            return mask, mask_modulus, bone_count, factors
        edge_mm *= 1.1


def bone_weighted_percentile(values: np.ndarray, bone_voxels: np.ndarray, q: float) -> float:
    """np.percentile(np.repeat(values, bone_voxels), q), without building the repeated array."""
    order = np.argsort(values, kind="stable")
    ends = np.cumsum(bone_voxels[order])  # copies of the i-th smallest value fill [ends[i-1], ends[i])
    last = int(ends[-1]) - 1
    position = q / 100.0 * last
    below = int(np.floor(position))
    low, high = values[order][np.searchsorted(ends, [below, min(below + 1, last)], side="right")]
    return float(low + (position - below) * (high - low))


def analyze_bone_volume(
    volume: np.ndarray,
    spacing_mm: np.ndarray,
    filename: str = "mock-bone.nii",
) -> tuple[FEAResult, dict[str, Any]]:
    """Segment, mesh and solve one CT volume; return API fields and solver details."""
    started = time.perf_counter()
    bone, segmentation = segment_bone(volume, spacing_mm)
    if int(bone.sum()) < 8:
        raise FEASolverError("The NIfTI volume does not contain enough bone voxels to mesh.")
    # Work on the bounding box of the bone so large scans stay cheap.
    box = ndi.find_objects(bone.astype(np.uint8))[0]
    bone = bone[box]
    modulus_gpa = np.zeros(bone.shape, dtype=np.float32)
    modulus_gpa[bone] = hu_to_apparent_density_and_modulus(volume[box], bone)[1]
    bone_volume_cm3 = float(bone.sum() * np.prod(spacing_mm) / 1000.0)

    mask, mask_modulus, bone_count, factors = _fe_grid(bone, modulus_gpa, spacing_mm)
    voxel_mm = np.asarray(spacing_mm, dtype=float) * factors
    layers = np.flatnonzero(mask.any(axis=(0, 1)))
    if int(mask.sum()) < 8 or layers.size == 0 or layers[-1] - layers[0] + 1 < 4:
        raise FEASolverError(
            "The meshed bone needs at least 8 voxels spanning at least 4 voxels along Z "
            "to place separate support and load bands."
        )

    try:
        points, tets = bone_fea.tetrahedralize(mask, np.diag([*voxel_mm, 1.0]))
        voxel_index = tuple(np.rint(points[tets].mean(axis=1) / voxel_mm).astype(int).T)
        # A block that is only part bone gets its bone's modulus times its bone
        # fraction, so the mesh keeps the stiffness of the bone it holds.
        element_bone_voxels = bone_count[voxel_index]
        element_fraction = element_bone_voxels / float(np.prod(factors))
        element_modulus_mpa = 1000.0 * mask_modulus[voxel_index] * element_fraction
        band_mm = BAND_VOXELS * voxel_mm[2]
        solved = bone_fea.solve_elasticity(
            points,
            tets,
            load_newtons=LOAD_NEWTONS,
            poisson_ratio=POISSON_RATIO,
            support_depth_mm=band_mm,
            load_depth_mm=band_mm,
            element_youngs_modulus_mpa=element_modulus_mpa,
            save_results=False,
        )
    except (ValueError, RuntimeError) as exc:
        raise FEASolverError(f"Finite-element solve failed: {exc}") from exc

    metrics = solved["metrics"]
    # Stress in the bone itself: a block that is part bone carries its load in
    # that part, so its stress is divided by its bone fraction (1 without
    # coarsening). A percentile over the bone volume, not the single-element
    # peak, so a few corner elements of the voxel mesh do not set the value.
    von_mises = solved["von_mises"] / element_fraction
    max_stress = bone_weighted_percentile(von_mises, element_bone_voxels, STRESS_PERCENTILE)
    fracture_risk = float(np.clip((max_stress / ASSUMED_STRENGTH_MPA) * 100.0, 0.0, 100.0))
    surface = solved["faces"]
    result = FEAResult(
        max_von_mises_stress_mpa=round(max_stress, 2),
        average_youngs_modulus_gpa=round(float(modulus_gpa[bone].mean(dtype=np.float64)), 2),
        bone_volume_cm3=round(bone_volume_cm3, 2),
        fracture_risk_index_percent=round(fracture_risk, 2),
        load_newtons=LOAD_NEWTONS,
        mesh_vertices=int(np.unique(surface).size),
        mesh_faces=len(surface),
        source_filename=filename,
    )
    details = {
        "input_shape": [int(v) for v in volume.shape],
        "input_spacing_mm": [float(v) for v in spacing_mm],
        "segmentation": segmentation,
        "surface_extraction_backend": metrics["surface_extraction_backend"],
        "coarsening_factors": [int(v) for v in factors],
        "effective_voxel_mm": [float(v) for v in voxel_mm],
        "thresholded_component_voxels": int(bone.sum()),
        "thresholded_component_volume_cm3": bone_volume_cm3,
        "fe_voxels": int(mask.sum()),
        "fe_mesh_volume_cm3": metrics["volume_cm3"],
        # Block volume times bone fraction, summed: the bone volume the mesh carries.
        "fe_bone_volume_cm3": float(element_fraction.sum() * np.prod(voxel_mm) / 6.0 / 1000.0),
        "band_mm": float(band_mm),
        "max_element_von_mises_mpa": float(von_mises.max()),
        "seconds": time.perf_counter() - started,
        **{key: metrics[key] for key in (
            "nodes", "elements", "loaded_area_mm2", "max_displacement_mm",
            "min_youngs_modulus_mpa", "max_youngs_modulus_mpa", "reaction_newtons",
            "relative_free_residual", "relative_force_balance_error",
        )},
    }
    logger.info("FE solve for %s: %s", filename, details)
    logging.getLogger("uvicorn.error").info(
        "FEA surface extraction: %s; elements=%d", metrics["surface_extraction_backend"], len(tets)
    )
    return result, details


def simulate_fea(payload: bytes, filename: str = "mock-bone.nii") -> dict[str, Any]:
    """Segment the CT volume and run a linear-elastic SfePy solve under 800 N.

    Returns the API fields plus `segmentation` ("fsl" or "numpy"), which the
    simulation history stores and the API response leaves out.
    """
    volume, spacing_mm = _load_nifti(payload)
    result, details = analyze_bone_volume(volume, spacing_mm, filename)
    return {**result.model_dump(), "segmentation": details["segmentation"]}
