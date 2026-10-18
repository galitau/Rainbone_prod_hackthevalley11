from __future__ import annotations

import gzip
import importlib.util
import logging
import struct
import time
from pathlib import Path
from typing import Any

import nibabel as nib
import numpy as np
import scipy.ndimage as ndi
from pydantic import BaseModel, Field

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
logger = logging.getLogger(__name__)

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


def _load_nifti(payload: bytes) -> tuple[np.ndarray, np.ndarray]:
    # nibabel 5 cannot nib.load() a BytesIO; parse the (decompressed) bytes.
    try:
        raw = gzip.decompress(payload) if payload[:2] == b"\x1f\x8b" else payload
        nifti2 = raw[:4] in (struct.pack("<i", 540), struct.pack(">i", 540))
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
) -> tuple[np.ndarray, np.ndarray]:
    """Merge blocks of factors[0] x factors[1] x factors[2] voxels.

    A block is bone when at least half of its voxels are bone. Its modulus is
    the mean modulus of those bone voxels.
    """
    fx, fy, fz = (int(f) for f in factors)
    padding = [(0, -size % f) for size, f in zip(mask.shape, (fx, fy, fz))]
    shape = [(size + pad) // f for size, (_, pad), f in zip(mask.shape, padding, (fx, fy, fz))]

    def block_sum(values: np.ndarray) -> np.ndarray:
        padded = np.pad(values, padding)
        return padded.reshape(shape[0], fx, shape[1], fy, shape[2], fz).sum(axis=(1, 3, 5))

    bone_count = block_sum(mask.astype(np.float64))
    modulus_sum = block_sum(np.where(mask, modulus_gpa, 0.0))
    coarse_modulus = np.divide(modulus_sum, bone_count, out=np.zeros(shape), where=bone_count > 0)
    return bone_count >= 0.5 * fx * fy * fz, coarse_modulus


def _fe_grid(
    bone: np.ndarray,
    modulus_gpa: np.ndarray,
    spacing_mm: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return the FE voxel mask, its moduli and the per-axis coarsening factors.

    Above MAX_FE_VOXELS, voxels are merged into blocks that are as close to
    cubic as the scan spacing allows, growing the block edge until the
    largest remaining component fits under the cap.
    """
    factors = np.ones(3, dtype=int)
    count = int(bone.sum())
    if count <= MAX_FE_VOXELS:
        return bone, modulus_gpa, factors
    edge_mm = float((count * np.prod(spacing_mm) / MAX_FE_VOXELS) ** (1.0 / 3.0))
    while True:
        factors = np.maximum(1, np.rint(edge_mm / spacing_mm)).astype(int)
        mask, mask_modulus = coarsen_bone(bone, modulus_gpa, factors)
        mask = largest_component(mask)
        if int(mask.sum()) <= MAX_FE_VOXELS:
            return mask, mask_modulus, factors
        edge_mm *= 1.1


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
    modulus_gpa = np.zeros(bone.shape)
    modulus_gpa[bone] = hu_to_apparent_density_and_modulus(volume[box], bone)[1]

    mask, mask_modulus, factors = _fe_grid(bone, modulus_gpa, spacing_mm)
    voxel_mm = np.asarray(spacing_mm, dtype=float) * factors
    layers = np.flatnonzero(mask.any(axis=(0, 1)))
    if int(mask.sum()) < 8 or layers.size == 0 or layers[-1] - layers[0] + 1 < 4:
        raise FEASolverError(
            "The meshed bone needs at least 8 voxels spanning at least 4 voxels along Z "
            "to place separate support and load bands."
        )

    try:
        points, tets = bone_fea.tetrahedralize(mask, np.diag([*voxel_mm, 1.0]))
        voxel_index = np.rint(points[tets].mean(axis=1) / voxel_mm).astype(int)
        element_modulus_mpa = 1000.0 * mask_modulus[tuple(voxel_index.T)]
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
    von_mises = solved["von_mises"]
    # A percentile, not the single-element peak, so a few corner elements of
    # the voxel mesh do not set the value. All tetrahedra have equal volume
    # (six per voxel), so the unweighted percentile is also volume-weighted.
    max_stress = float(np.percentile(von_mises, STRESS_PERCENTILE))
    fracture_risk = float(np.clip((max_stress / ASSUMED_STRENGTH_MPA) * 100.0, 0.0, 100.0))
    surface = solved["faces"]
    result = FEAResult(
        max_von_mises_stress_mpa=round(max_stress, 2),
        average_youngs_modulus_gpa=round(metrics["youngs_modulus_mpa"] / 1000.0, 2),
        bone_volume_cm3=round(metrics["volume_cm3"], 2),
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
        "coarsening_factors": [int(v) for v in factors],
        "effective_voxel_mm": [float(v) for v in voxel_mm],
        "thresholded_component_voxels": int(bone.sum()),
        "thresholded_component_volume_cm3": float(bone.sum() * np.prod(spacing_mm) / 1000.0),
        "fe_voxels": int(mask.sum()),
        "band_mm": float(band_mm),
        "max_element_von_mises_mpa": float(von_mises.max()),
        "seconds": time.perf_counter() - started,
        **{key: metrics[key] for key in (
            "nodes", "elements", "loaded_area_mm2", "volume_cm3", "max_displacement_mm",
            "min_youngs_modulus_mpa", "max_youngs_modulus_mpa", "reaction_newtons",
            "relative_free_residual", "relative_force_balance_error",
        )},
    }
    logger.info("FE solve for %s: %s", filename, details)
    return result, details


def simulate_fea(payload: bytes, filename: str = "mock-bone.nii") -> dict[str, Any]:
    """Segment the CT volume and run a linear-elastic SfePy solve under 800 N."""
    volume, spacing_mm = _load_nifti(payload)
    result, _ = analyze_bone_volume(volume, spacing_mm, filename)
    return result.model_dump()
