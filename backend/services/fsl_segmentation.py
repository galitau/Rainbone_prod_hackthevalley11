"""Bone segmentation with FSL (FMRIB Software Library), used by services.fea_solver when FSL is installed.

FSL is found from FSLDIR (process environment or backend/.env). The bone mask is made by two FSL
commands, the same two steps as the numpy/scipy path:

    fslmaths ct.nii -thr 150 -bin mask.nii -odt char    # voxels at or above 150 HU
    connectedcomp mask.nii labels.nii 6                  # face-connected components

and the largest component is kept. On a tie, the component that comes first in C order is kept, as
scipy.ndimage.label numbering does. Without FSLDIR, or when a command is missing or fails,
fsl_bone_mask() returns None and the caller segments with numpy/scipy. FSL is not a pip package, runs
on macOS and Linux (Windows only through WSL) and has its own licence for non-commercial use; the API
never requires it.
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import nibabel as nib
import numpy as np

from services.settings import runtime_env

log = logging.getLogger(__name__)

FSL_COMMANDS = ("fslmaths", "connectedcomp")
FSL_TIMEOUT_S = 60
FACE_CONNECTIVITY = 6


def fsl_tools() -> Optional[dict[str, Path]]:
    """The FSL commands under $FSLDIR/bin, or None when FSLDIR is unset or a command is missing."""
    fsldir = runtime_env().get("FSLDIR", "").strip()
    if not fsldir:
        return None
    tools = {name: Path(fsldir).expanduser() / "bin" / name for name in FSL_COMMANDS}
    missing = [name for name, path in tools.items() if not path.is_file()]
    if missing:
        log.warning("FSLDIR is set but %s is missing from $FSLDIR/bin; segmenting bone with numpy/scipy",
                    ", ".join(missing))
        return None
    return tools


def segmentation_tool() -> str:
    """Which tool will make the bone mask, and why, for the startup log."""
    if not runtime_env().get("FSLDIR", "").strip():
        return "numpy/scipy (FSLDIR is not set)"
    tools = fsl_tools()
    if tools is None:
        return "numpy/scipy (fslmaths or connectedcomp is missing from $FSLDIR/bin)"
    return f"FSL ({', '.join(FSL_COMMANDS)} in {tools['fslmaths'].parent})"


def _largest_label(labels: np.ndarray) -> np.ndarray:
    sizes = np.bincount(labels.ravel().astype(np.intp))
    sizes[0] = 0
    if sizes.max() == 0:
        return np.zeros(labels.shape, dtype=bool)
    candidates = np.flatnonzero(sizes == sizes.max())
    flat = labels.ravel()
    first_voxel = [int(np.argmax(flat == label)) for label in candidates] if candidates.size > 1 else [0]
    return labels == candidates[int(np.argmin(first_voxel))]


def fsl_bone_mask(volume: np.ndarray, spacing_mm: np.ndarray, minimum_hu: float) -> Optional[np.ndarray]:
    """Largest face-connected component at or above minimum_hu, segmented by FSL; None without FSL."""
    tools = fsl_tools()
    if tools is None:
        return None
    # The same input as threshold_bone_hu: NaN is air, and +-inf become the largest finite values.
    ct = np.nan_to_num(np.asarray(volume, dtype=np.float32), nan=-1000.0)
    env = {**os.environ, "FSLDIR": str(tools["fslmaths"].parents[1]), "FSLOUTPUTTYPE": "NIFTI"}
    try:
        with tempfile.TemporaryDirectory(prefix="rainbowbone-fsl-") as folder:
            ct_path, mask_path, labels_path = (str(Path(folder) / name) for name in ("ct.nii", "mask.nii", "labels.nii"))
            nib.save(nib.Nifti1Image(ct, np.diag([*np.asarray(spacing_mm, dtype=float), 1.0])), ct_path)
            for command in (
                [str(tools["fslmaths"]), ct_path, "-thr", str(float(minimum_hu)), "-bin", mask_path, "-odt", "char"],
                [str(tools["connectedcomp"]), mask_path, labels_path, str(FACE_CONNECTIVITY)],
            ):
                subprocess.run(command, env=env, check=True, capture_output=True, timeout=FSL_TIMEOUT_S)
            labels = np.asarray(nib.load(labels_path, mmap=False).dataobj)  # read before the folder goes
    except (OSError, ValueError, subprocess.SubprocessError, nib.filebasedimages.ImageFileError) as exc:
        log.warning("FSL bone segmentation failed (%s); segmenting bone with numpy/scipy", type(exc).__name__)
        return None
    if labels.shape != ct.shape:
        log.warning("FSL returned labels of shape %s for a %s volume; segmenting bone with numpy/scipy",
                    labels.shape, ct.shape)
        return None
    return _largest_label(labels)
