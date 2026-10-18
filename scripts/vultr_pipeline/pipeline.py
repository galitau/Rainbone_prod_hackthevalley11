#!/usr/bin/env python3
"""CTPelvic1K pelvic CT -> TotalSegmentator bone masks and meshes -> Vultr Object Storage.

1. Resolve file URLs, sizes and checksums from the Zenodo API (record 4588403 by default).
2. Stream the CT tarball and extract only the first N `.nii.gz` cases. The small
   reference-mask tarball is downloaded whole and its MD5 is checked.
3. Run the TotalSegmentator CLI on each case with --roi_subset.
4. Write processed/: every TotalSegmentator mask, one watertight surface mesh (VTK XML
   PolyData, .vtp) per bone, Dice against the CTPelvic1K reference masks, and manifest.json.
5. Upload processed/ under ctpelvic1k/ as private objects with boto3. Objects whose sha256 is
   unchanged are skipped. --from-processed uploads an existing processed/ folder instead.

Credentials come only from the VULTR_S3_* environment variables. See README.md.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import nibabel as nib
import numpy as np
import vtk
from nibabel.processing import resample_from_to
from scipy import ndimage
from vtk.util import numpy_support

REPO_ROOT = Path(__file__).resolve().parents[2]
ZENODO_API = "https://zenodo.org/api/records/{record}"
DEFAULT_RECORD = "4588403"
DEFAULT_DATA_FILE = "CTPelvic1K_dataset6_data.tar.gz"
DEFAULT_MASK_FILE = "CTPelvic1K_dataset6_Anonymized_mask.tar.gz"
# Mesh bone -> the TotalSegmentator 2.18.0 classes (task "total", `TotalSegmentator --list-classes`)
# whose union it is. TotalSegmentator labels S1 apart from "sacrum", so the anatomical sacrum is
# their union: against the CTPelvic1K sacrum label, Dice was 0.81-0.83 for "sacrum" alone and
# 0.91-0.94 for the union on dataset 6 cases 0012, 0023 and 0060.
MESH_BONES = {
    "sacrum": ("sacrum", "vertebrae_S1"),
    "hip_left": ("hip_left",),
    "hip_right": ("hip_right",),
    "femur_left": ("femur_left",),
    "femur_right": ("femur_right",),
    "vertebrae_L5": ("vertebrae_L5",),
}
DEFAULT_BONES = tuple(MESH_BONES)
# Triangle budget per mesh before decimation; a bone not listed gets DEFAULT_TRIANGLE_BUDGET.
TRIANGLE_BUDGET = {"sacrum": 30000, "hip_left": 40000, "hip_right": 40000,
                   "femur_left": 30000, "femur_right": 30000, "vertebrae_L5": 20000}
DEFAULT_TRIANGLE_BUDGET = 30000
DEVICE_RE = re.compile(r"^(gpu|cpu|mps|gpu:\d+)$")  # what TotalSegmentator's -d/--device accepts
BONE_RE = re.compile(r"^[A-Za-z0-9_]+$")  # class names become file names and object keys
# manifest.json "path" values: relative, "/"-separated, no "." or ".." segments, no hidden files.
SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]*(?:/[A-Za-z0-9_][A-Za-z0-9._-]*)*$")
# backend/routes_bones.py reads <BUCKET_PREFIX>/manifest.json; object key = <BUCKET_PREFIX>/<path>.
BUCKET_PREFIX = "ctpelvic1k"
ENV_VARS = ("VULTR_S3_ENDPOINT", "VULTR_S3_ACCESS_KEY", "VULTR_S3_SECRET_KEY", "VULTR_S3_BUCKET")
USER_AGENT = "RainbowBone-vultr-pipeline/1.0"
CHUNK = 1 << 20
CONTENT_TYPES = {".nii.gz": "application/gzip", ".vtp": "application/xml", ".json": "application/json"}
# "<case>_data.nii.gz" and "<case>_mask_4label.nii.gz" share one case id.
CASE_RE = re.compile(r"^(?P<case>[A-Za-z0-9][A-Za-z0-9._-]*?)(?:_data|_mask(?:_[A-Za-z0-9]+)?)?\.nii\.gz$")

MASK_FORMAT = "nifti-gz uint8 binary, same grid as source CT (TotalSegmentator output, unmodified)"
MESH_FORMAT = "VTK XML PolyData, binary zlib, float32 points, RAS world mm"
CT_FORMAT = "nifti-gz CT volume, unmodified member of the source archive"
MESH_METHOD = (
    "vtkFlyingEdges3D at 0.5 on the binary mask (1-voxel zero padding, closed surface), transformed by the "
    "NIfTI affine to RAS world mm, vtkWindowedSincPolyDataFilter (20 iterations, passband 0.05), "
    "vtkQuadricDecimation to a per-bone triangle budget (vtkDecimatePro with PreserveTopology, or a larger "
    "budget, when needed to stay watertight), point normals. VTK "
)

CTPELVIC1K_REPOSITORY = "https://github.com/MIRACLE-Center/CTPelvic1K (formerly ICT-MIRACLE-lab/CTPelvic1K)"
CTPELVIC1K_PREPRINT = (
    "Pengbo Liu, Hu Han, Yuanqi Du, Heqin Zhu, Yinhao Li, Feng Gu, Honghu Xiao, Jun Li, Chunpeng Zhao, "
    "Li Xiao, Xinbao Wu, S. Kevin Zhou. Deep Learning to Segment Pelvic Bones: Large-scale CT Datasets and "
    "Baseline Models. arXiv:2012.08721 (2020)."
)
# CTPelvic1K reference-mask labels, from MIRACLE-Center/CTPelvic1K
# nnunet/dataset_conversion/JstPelvisSegmentation_5label.py (json_dict['labels']).
EXPERT_LABELS = {1: "sacrum", 2: "right_hip", 3: "left_hip", 4: "lumbar_vertebra"}
EXPERT_LABEL_SOURCE = "nnunet/dataset_conversion/JstPelvisSegmentation_5label.py (json_dict['labels'])"
DATASET_DESCRIPTION = (
    "Pelvic CT with expert pelvic-bone segmentation (sacrum, left/right hip, lumbar vertebra)."
)
DATASET_NAMES = {"CTPelvic1K_dataset6_data.tar.gz": "CTPelvic1K (sub-dataset 6, CLINIC)"}
DATASET_NOTES = {
    "CTPelvic1K_dataset6_data.tar.gz": (
        " Sub-dataset 6 (CLINIC) is preoperative pelvic-fracture CT without metal artifacts per the dataset README."
    ),
}
# Zenodo licence id -> licence text URL (CC BY 4.0 section 3(a)(1)(C) asks for a URI or hyperlink to it).
LICENSE_URLS = {"cc-by-4.0": "https://creativecommons.org/licenses/by/4.0/"}
# CC BY 4.0 section 3(a)(1)(B): say what was changed.
DERIVED_DATA_NOTE = (
    "The masks and meshes are derived from the CTPelvic1K CT volumes by automatic segmentation "
    "(TotalSegmentator) and surface meshing; they are not the dataset's own annotations and were not "
    "reviewed by a clinician. CT volumes, when included, are unmodified members of the source archive."
)
# TotalSegmentator attribution, from its README (github.com/wasserth/TotalSegmentator).
TOTALSEGMENTATOR = {
    "name": "TotalSegmentator",
    "license": "Apache-2.0 (code and the 'total' task; no licence key required for 'total')",
    "citation": (
        "Wasserthal, J., Breit, H.-C., Meyer, M.T., Pradella, M., Hinck, D., Sauter, A.W., Heye, T., Boll, D., "
        "Cyriac, J., Yang, S., Bach, M., Segeroth, M., 2023. TotalSegmentator: Robust Segmentation of 104 "
        "Anatomic Structures in CT Images. Radiology: Artificial Intelligence. https://doi.org/10.1148/ryai.230024"
    ),
    "also_cite": (
        "Isensee, F., Jaeger, P. F., Kohl, S. A., Petersen, J., & Maier-Hein, K. H. (2021). nnU-Net: a "
        "self-configuring method for deep learning-based biomedical image segmentation. Nature Methods, 18(2), 203-211."
    ),
    "repository": "https://github.com/wasserth/TotalSegmentator",
    "disclaimer": "TotalSegmentator is not a medical device and is not intended for clinical usage (per its README).",
}
# Dice pairs: TotalSegmentator class -> CTPelvic1K label of the same name, and the swapped pairs.
DICE_PAIRS = (("sacrum", 1), ("hip_left", 3), ("hip_right", 2))
DICE_CROSS = (("hip_left", 2), ("hip_right", 3))


class PipelineError(Exception):
    """A failure the user can act on; main() prints it without a traceback."""


class ConfigError(PipelineError):
    """Missing or invalid configuration (exit code 2)."""


class ChecksumError(PipelineError):
    """A download did not match the size or checksum published by Zenodo."""


@dataclass(frozen=True)
class RemoteFile:
    key: str
    url: str
    size: int
    checksum: str  # "md5:<hex>", as Zenodo publishes it

    @property
    def md5(self) -> str:
        algorithm, _, value = self.checksum.partition(":")
        if algorithm != "md5" or not value:
            raise PipelineError(f"Unsupported checksum for {self.key}: {self.checksum!r}")
        return value.lower()

    def describe(self) -> dict[str, Any]:
        return {"key": self.key, "url": self.url, "bytes": self.size, "checksum": self.checksum}


@dataclass(frozen=True)
class UploadItem:
    path: Path
    key: str
    sha256: str
    content_type: str


def log(message: str) -> None:
    print(message, flush=True)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def http_open(url: str, timeout: float = 60.0):
    return urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=timeout)


def content_type_for(name: str) -> str:
    for suffix, content_type in CONTENT_TYPES.items():
        if name.endswith(suffix):
            return content_type
    return "application/octet-stream"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def md5_file(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def case_id_for(member_name: str) -> str | None:
    match = CASE_RE.match(PurePosixPath(member_name).name)
    return match.group("case") if match else None


def check_gzip(path: Path) -> None:
    """Read a .gz file to the end so its CRC-32 and length trailer are checked."""
    try:
        with gzip.open(path, "rb") as handle:
            while handle.read(CHUNK):
                pass
    except (OSError, EOFError) as exc:
        raise ChecksumError(f"{path.name} is not a valid gzip file: {exc}") from exc


# --------------------------------------------------------------------------- Zenodo


def resolve_record(record_id: str, names: Iterable[str]) -> tuple[dict[str, Any], dict[str, RemoteFile]]:
    """Return the record's attribution and the named files with their URL, size and checksum."""
    url = ZENODO_API.format(record=record_id)
    try:
        with http_open(url) as response:
            record = json.load(response)
    except (OSError, ValueError) as exc:
        raise PipelineError(f"Could not read the Zenodo record {url}: {exc}") from exc
    available = {
        entry["key"]: RemoteFile(entry["key"], entry["links"]["self"], int(entry["size"]), entry["checksum"])
        for entry in record.get("files", [])
    }
    wanted = [name for name in names if name]
    missing = [name for name in wanted if name not in available]
    if missing:
        raise PipelineError(
            f"Zenodo record {record_id} has no file named {', '.join(missing)}. "
            f"Available: {', '.join(sorted(available))}"
        )
    metadata = record.get("metadata", {})
    references = metadata.get("references") or []
    attribution = {
        "title": metadata.get("title"),
        "zenodo_record": (record.get("links") or {}).get("self_html")
        or f"https://zenodo.org/records/{record.get('id', record_id)}",
        "doi": record.get("doi"),
        "license": (metadata.get("license") or {}).get("id"),
        "creators": [creator.get("name") for creator in metadata.get("creators", [])],
        "citation": references[0] if references else None,
    }
    return attribution, {name: available[name] for name in wanted}


class _CountingReader:
    """Wraps an HTTP response: hashes and counts every byte that tarfile pulls through it."""

    def __init__(self, raw) -> None:
        self._raw = raw
        self.md5 = hashlib.md5(usedforsecurity=False)
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        data = self._raw.read(size)
        self.md5.update(data)
        self.bytes_read += len(data)
        return data

    def drain(self) -> None:
        while self.read(CHUNK):
            pass


def _verify_whole(remote: RemoteFile, bytes_read: int, md5_hex: str) -> None:
    if bytes_read != remote.size:
        raise ChecksumError(f"{remote.key}: read {bytes_read} bytes, Zenodo lists {remote.size}.")
    if md5_hex != remote.md5:
        raise ChecksumError(f"{remote.key}: md5 {md5_hex} does not match Zenodo's {remote.md5}.")


def stream_extract_cases(remote: RemoteFile, dest: Path, limit: int, verify_archive: bool = False) -> dict[str, Any]:
    """Stream a .tar.gz over HTTP and write only its first `limit` .nii.gz cases to `dest`.

    Reading stops after the last wanted case, so the archive MD5 can only be checked when the
    whole archive is read: with verify_archive=True, or when it holds fewer than `limit` cases.
    Each extracted file's own gzip CRC is always checked.
    """
    if limit < 1:
        raise ConfigError("--cases must be at least 1.")
    dest.mkdir(parents=True, exist_ok=True)
    cases: list[dict[str, Any]] = []
    started = time.perf_counter()
    try:
        with http_open(remote.url) as response:
            reader = _CountingReader(response)
            reached_end = True
            with tarfile.open(fileobj=reader, mode="r|gz") as archive:
                for member in archive:
                    case_id = case_id_for(member.name)
                    if not member.isfile() or case_id is None:
                        continue
                    member_started = time.perf_counter()
                    target = dest / PurePosixPath(member.name).name
                    part = target.with_name(target.name + ".part")
                    digest = hashlib.sha256()
                    written = 0
                    source = archive.extractfile(member)
                    with part.open("wb") as out:
                        while chunk := source.read(CHUNK):
                            out.write(chunk)
                            digest.update(chunk)
                            written += len(chunk)
                    try:
                        if written != member.size:
                            raise ChecksumError(f"{member.name}: wrote {written} of {member.size} bytes.")
                        check_gzip(part)
                    except ChecksumError:
                        part.unlink(missing_ok=True)
                        raise
                    part.replace(target)
                    cases.append(
                        {
                            "case_id": case_id,
                            "member": member.name,
                            "file": target.name,
                            "bytes": written,
                            "sha256": digest.hexdigest(),
                            "extract_seconds": round(time.perf_counter() - member_started, 3),
                        }
                    )
                    log(f"  extracted {target.name} ({written:,} bytes)")
                    if len(cases) >= limit:
                        reached_end = False
                        break
            verified = False
            if verify_archive or reached_end:
                reader.drain()
                try:
                    _verify_whole(remote, reader.bytes_read, reader.md5.hexdigest())
                except ChecksumError:
                    for case in cases:
                        (dest / case["file"]).unlink(missing_ok=True)
                    raise
                verified = True
            bytes_read = reader.bytes_read
    except (tarfile.TarError, OSError, EOFError, http.client.HTTPException) as exc:
        raise PipelineError(f"Could not stream {remote.key}: {exc}") from exc
    return {
        "source": remote.describe(),
        "archive_md5_verified": verified,
        "archive_bytes_read": bytes_read,
        "seconds": round(time.perf_counter() - started, 3),
        "cases": cases,
    }


def extract_cases(remote: RemoteFile, raw_dir: Path, limit: int, verify_archive: bool) -> dict[str, Any]:
    """Reuse earlier extractions recorded in index.json when they cover `limit` cases.

    "streamed_cases" is how many scans were read from the archive in all, which can be more
    than the `limit` returned in "cases".
    """
    index_path = raw_dir / "index.json"
    if index_path.is_file():
        index = json.loads(index_path.read_text())
        same_source = index.get("source", {}).get("checksum") == remote.checksum
        enough = len(index.get("cases", [])) >= limit
        verified_ok = index.get("archive_md5_verified") or not verify_archive
        if same_source and enough and verified_ok:
            cases = index["cases"][:limit]
            if all((raw_dir / c["file"]).is_file() and (raw_dir / c["file"]).stat().st_size == c["bytes"] for c in cases):
                log(f"Reusing {len(cases)} extracted case(s) from {index_path}")
                return {**index, "cases": cases, "streamed_cases": len(index["cases"]), "reused": True}
    log(f"Streaming {remote.key} ({remote.size:,} bytes) for the first {limit} case(s)...")
    index = stream_extract_cases(remote, raw_dir, limit, verify_archive)
    index_path.write_text(json.dumps(index, indent=2))
    return {**index, "streamed_cases": len(index["cases"]), "reused": False}


def download_verified(remote: RemoteFile, dest_dir: Path) -> Path:
    """Download a whole file (for the small mask tarballs) and check size and MD5."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / remote.key
    if target.is_file() and target.stat().st_size == remote.size and md5_file(target) == remote.md5:
        log(f"Reusing verified {target.name}")
        return target
    part = target.with_name(target.name + ".part")
    digest = hashlib.md5(usedforsecurity=False)
    size = 0
    log(f"Downloading {remote.key} ({remote.size:,} bytes)...")
    try:
        with http_open(remote.url) as response, part.open("wb") as out:
            while chunk := response.read(CHUNK):
                out.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        _verify_whole(remote, size, digest.hexdigest())
    except ChecksumError:
        part.unlink(missing_ok=True)
        raise
    except (OSError, http.client.HTTPException) as exc:
        part.unlink(missing_ok=True)
        raise PipelineError(f"Could not download {remote.key}: {exc}") from exc
    part.replace(target)
    return target


def extract_reference_masks(archive_path: Path, case_ids: set[str], dest: Path) -> dict[str, tuple[Path, str]]:
    """Copy the dataset's own annotation for each wanted case out of a local mask tarball.

    Returns case id -> (extracted file, archive member name).
    """
    dest.mkdir(parents=True, exist_ok=True)
    found: dict[str, tuple[Path, str]] = {}
    with tarfile.open(archive_path, mode="r:gz") as archive:
        for member in archive:
            case_id = case_id_for(member.name)
            if not member.isfile() or case_id not in case_ids or case_id in found:
                continue
            target = dest / PurePosixPath(member.name).name
            with archive.extractfile(member) as source, target.open("wb") as out:
                shutil.copyfileobj(source, out, CHUNK)
            found[case_id] = (target, member.name)
    return found


# --------------------------------------------------------------------------- TotalSegmentator


def roi_classes(bones: Iterable[str]) -> list[str]:
    """TotalSegmentator classes needed for these mesh bones, in order, without repeats."""
    return list(dict.fromkeys(cls for bone in bones for cls in MESH_BONES.get(bone, (bone,))))


def find_totalsegmentator(explicit: str | None = None) -> str | None:
    return explicit if explicit else shutil.which("TotalSegmentator")


def totalsegmentator_version(executable: str) -> str:
    try:
        result = subprocess.run([executable, "--version"], capture_output=True, text=True)
    except OSError as exc:
        raise ConfigError(f"Cannot run TotalSegmentator at {executable}: {exc}") from exc
    return (result.stdout or result.stderr).strip() or "unknown"


def totalsegmentator_command(
    executable: str, ct: str, out: str, report: str, classes: list[str], fast: bool, device: str | None
) -> list[str]:
    command = [executable, "-i", ct, "-o", out, "--report", report, "--roi_subset", *classes]
    if fast:
        command.append("--fast")
    if device:
        command += ["--device", device]
    return command


def segment_case(
    executable: str, version: str, ct_path: Path, out_dir: Path, classes: list[str], fast: bool, device: str | None
) -> dict[str, Any]:
    """Run TotalSegmentator unless this folder already holds masks made with the same settings.

    Returns the case's "segmentation" record; versions and runtime come from TotalSegmentator's
    own --report JSON.
    """
    settings = {"roi_subset": classes, "fast": fast, "totalsegmentator_version": version}
    state_path = out_dir / "segmentation.json"
    if state_path.is_file():
        previous = json.loads(state_path.read_text())
        reusable = previous.get("settings") == settings and "record" in previous
        if reusable and all((out_dir / f"{c}.nii.gz").is_file() for c in classes):
            log(f"  reusing TotalSegmentator masks in {out_dir}")
            return previous["record"]
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir.with_name(out_dir.name + ".report.json")
    report_path.unlink(missing_ok=True)
    command = totalsegmentator_command(executable, str(ct_path), str(out_dir), str(report_path), classes, fast, device)
    log("  " + " ".join(command))
    started = time.perf_counter()
    result = subprocess.run(command)
    wall = round(time.perf_counter() - started, 2)
    if result.returncode != 0:
        raise PipelineError(f"TotalSegmentator exited with code {result.returncode} on {ct_path.name}.")
    missing = [c for c in classes if not (out_dir / f"{c}.nii.gz").is_file()]
    if missing:
        raise PipelineError(f"TotalSegmentator wrote no mask for {', '.join(missing)} ({ct_path.name}).")
    report = json.loads(report_path.read_text()) if report_path.is_file() else {}
    used_device = report.get("device", device)
    record = {
        "tool": "TotalSegmentator",
        "version": report.get("totalsegmentator_version", version),
        "nnunetv2_version": report.get("nnunetv2_version"),
        "torch_version": report.get("torch_version"),
        "task": report.get("task", "total"),
        "roi_subset": classes,
        "fast": fast,
        "device": used_device,
        "wall_s": wall,
        "tool_reported_runtime_s": report.get("runtime_seconds"),
        "attempts": [{"device": used_device, "returncode": result.returncode, "wall_s": wall, "ok": True}],
        "cpu_benchmark_same_settings": None,
        "first_run_wall_s_incl_weight_download": None,
        "first_run_note": None,
    }
    state_path.write_text(json.dumps({"settings": settings, "record": record}, indent=2))
    return record


# --------------------------------------------------------------------------- validation


def dice(a: np.ndarray, b: np.ndarray) -> float | None:
    total = int(a.sum()) + int(b.sum())
    return None if total == 0 else round(2.0 * int(np.logical_and(a, b).sum()) / total, 4)


def validate_against_reference(ts: dict[str, np.ndarray], expert: np.ndarray, affine: np.ndarray, same_grid: bool) -> dict[str, Any]:
    """Voxelwise Dice of TotalSegmentator masks against the CTPelvic1K reference labels.

    CTPelvic1K's left/right hip names are the reverse of TotalSegmentator's on the dataset 6 cases
    checked so far, so the hips are also scored against the opposite label ("lr_cross_check_dice")
    and "dice_overlap_matched" keeps whichever pairing overlaps.
    """

    def union(*names: str) -> np.ndarray | None:
        return np.logical_or.reduce([ts[n] for n in names]) if all(n in ts for n in names) else None

    def score(mask: np.ndarray | None, labels) -> float | None:
        return None if mask is None else dice(mask, np.isin(expert, labels))

    def centroid_x(mask: np.ndarray | None) -> float | None:
        if mask is None or not mask.any():
            return None
        ijk = np.argwhere(mask).mean(axis=0)
        return round(float((affine @ np.r_[ijk, 1.0])[0]), 1)

    pairs = {f"{b}_vs_expert_{EXPERT_LABELS[label]}": score(ts.get(b), label) for b, label in DICE_PAIRS}
    pairs["sacrum_plus_vertebrae_S1_vs_expert_sacrum"] = score(union("sacrum", "vertebrae_S1"), 1)
    cross = {f"{b}_vs_expert_{EXPERT_LABELS[label]}": score(ts.get(b), label) for b, label in DICE_CROSS}
    swapped = (cross["hip_left_vs_expert_right_hip"] or 0) > (pairs["hip_left_vs_expert_left_hip"] or 0) and (
        cross["hip_right_vs_expert_left_hip"] or 0
    ) > (pairs["hip_right_vs_expert_right_hip"] or 0)
    return {
        "metric": "Dice (2|A∩B|/(|A|+|B|)), voxelwise on the source CT grid",
        "expert_grid_identical_to_ts_grid": bool(same_grid),
        "dice": pairs,
        "dice_pelvis_union_sacrum_hips": score(union("sacrum", "vertebrae_S1", "hip_left", "hip_right"), [1, 2, 3]),
        "lr_cross_check_dice": cross,
        "expert_lr_names_swapped_vs_totalsegmentator": bool(swapped),
        "dice_overlap_matched": {
            "sacrum_ts_sacrum_only": pairs["sacrum_vs_expert_sacrum"],
            "sacrum_incl_S1": pairs["sacrum_plus_vertebrae_S1_vs_expert_sacrum"],
            "hip_left": cross["hip_left_vs_expert_right_hip"] if swapped else pairs["hip_left_vs_expert_left_hip"],
            "hip_right": cross["hip_right_vs_expert_left_hip"] if swapped else pairs["hip_right_vs_expert_right_hip"],
        },
        "centroid_x_ras_mm": {
            "ts_hip_left": centroid_x(ts.get("hip_left")),
            "ts_hip_right": centroid_x(ts.get("hip_right")),
            "expert_left_hip(3)": centroid_x(expert == 3),
            "expert_right_hip(2)": centroid_x(expert == 2),
        },
        "not_compared": (
            "femurs are not labelled in CTPelvic1K; CTPelvic1K label 4 is 'lumbar_vertebra' (lumbar spine in the "
            "field of view, not L5 alone), so the L5 Dice below is informational only"
        ),
        "informational_dice_vertebrae_L5_vs_expert_lumbar_vertebra": score(ts.get("vertebrae_L5"), 4),
    }


# --------------------------------------------------------------------------- meshes


def mesh_from_mask(mask: np.ndarray, affine: np.ndarray, target_tris: int) -> tuple[Any, dict[str, Any]]:
    """Watertight, outward-facing surface of a binary mask in NIfTI world coordinates (RAS+, mm).

    Raises PipelineError when no decimation in the budget ladder gives a watertight, outward mesh.
    """
    padded = np.pad(mask.astype(np.uint8), 1)
    image = vtk.vtkImageData()
    image.SetDimensions(*padded.shape)
    image.SetOrigin(-1.0, -1.0, -1.0)  # the padding, in voxel index space
    image.SetSpacing(1.0, 1.0, 1.0)
    scalars = numpy_support.numpy_to_vtk(padded.ravel(order="F"), deep=True, array_type=vtk.VTK_UNSIGNED_CHAR)
    image.GetPointData().SetScalars(scalars)

    surface = vtk.vtkFlyingEdges3D()
    surface.SetInputData(image)
    surface.SetValue(0, 0.5)
    surface.ComputeNormalsOff()
    surface.ComputeGradientsOff()
    surface.ComputeScalarsOff()
    surface.Update()
    raw_tris = surface.GetOutput().GetNumberOfCells()

    matrix = vtk.vtkMatrix4x4()
    for r in range(4):
        for c in range(4):
            matrix.SetElement(r, c, float(affine[r, c]))
    transform = vtk.vtkTransform()
    transform.SetMatrix(matrix)
    to_world = vtk.vtkTransformPolyDataFilter()
    to_world.SetInputConnection(surface.GetOutputPort())
    to_world.SetTransform(transform)
    to_world.SetOutputPointsPrecision(vtk.vtkAlgorithm.SINGLE_PRECISION)
    last = to_world
    if np.linalg.det(affine[:3, :3]) < 0:  # a mirroring affine turns the triangles inside out
        reverse = vtk.vtkReverseSense()
        reverse.SetInputConnection(to_world.GetOutputPort())
        reverse.ReverseCellsOn()
        last = reverse

    smooth = vtk.vtkWindowedSincPolyDataFilter()
    smooth.SetInputConnection(last.GetOutputPort())
    smooth.SetNumberOfIterations(20)
    smooth.SetPassBand(0.05)
    smooth.BoundarySmoothingOff()
    smooth.FeatureEdgeSmoothingOff()
    smooth.NonManifoldSmoothingOn()
    smooth.NormalizeCoordinatesOn()
    smooth.Update()
    smoothed_tris = smooth.GetOutput().GetNumberOfCells()

    def finish(source) -> Any:
        clean = vtk.vtkCleanPolyData()
        clean.SetInputConnection(source.GetOutputPort())
        clean.SetOutputPointsPrecision(vtk.vtkAlgorithm.SINGLE_PRECISION)
        normals = vtk.vtkPolyDataNormals()
        normals.SetInputConnection(clean.GetOutputPort())
        normals.ConsistencyOn()
        normals.SplittingOff()
        normals.ComputePointNormalsOn()
        normals.ComputeCellNormalsOff()
        normals.SetOutputPointsPrecision(vtk.vtkAlgorithm.SINGLE_PRECISION)
        normals.Update()
        return normals.GetOutput()

    def topology(poly) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, (boundary, nonmanifold) in (("boundary_edges", (1, 0)), ("nonmanifold_edges", (0, 1))):
            edges = vtk.vtkFeatureEdges()
            edges.SetInputData(poly)
            edges.SetBoundaryEdges(boundary)
            edges.SetNonManifoldEdges(nonmanifold)
            edges.FeatureEdgesOff()
            edges.ManifoldEdgesOff()
            edges.Update()
            out[key] = edges.GetOutput().GetNumberOfCells()
        mass = vtk.vtkMassProperties()
        mass.SetInputData(poly)
        mass.Update()
        vx, vy, vz = mass.GetVolumeX(), mass.GetVolumeY(), mass.GetVolumeZ()
        out["watertight"] = (
            out["boundary_edges"] == 0
            and out["nonmanifold_edges"] == 0
            and max(vx, vy, vz) - min(vx, vy, vz) <= 0.01 * abs(mass.GetVolume())
        )
        out["area"], out["volume"] = mass.GetSurfaceArea(), mass.GetVolume()
        return out

    if smoothed_tris <= target_tris:
        method, budget, poly = "none", smoothed_tris, finish(smooth)
        topo = topology(poly)
    else:
        # Budget ladder: keep the first watertight result (quadric preferred, then topology-
        # preserving DecimatePro, then a larger triangle budget).
        for budget in (target_tris, int(target_tris * 1.5), target_tris * 2, target_tris * 3):
            if budget >= smoothed_tris:
                method, budget, poly = "none", smoothed_tris, finish(smooth)
                topo = topology(poly)
                break
            for method in ("vtkQuadricDecimation", "vtkDecimatePro(PreserveTopology)"):
                if method == "vtkQuadricDecimation":
                    decimate = vtk.vtkQuadricDecimation()
                    decimate.VolumePreservationOn()
                else:
                    decimate = vtk.vtkDecimatePro()
                    decimate.PreserveTopologyOn()
                    decimate.SplittingOff()
                    decimate.BoundaryVertexDeletionOff()
                decimate.SetInputConnection(smooth.GetOutputPort())
                decimate.SetTargetReduction(1.0 - budget / smoothed_tris)
                decimate.Update()
                poly = finish(decimate)
                topo = topology(poly)
                if topo["watertight"]:
                    break
            if topo["watertight"]:
                break
    # Outward orientation: positive signed volume (divergence theorem).
    points = numpy_support.vtk_to_numpy(poly.GetPoints().GetData()).astype(np.float64)
    triangles = numpy_support.vtk_to_numpy(poly.GetPolys().GetConnectivityArray()).reshape(-1, 3)
    a, b, c = points[triangles[:, 0]], points[triangles[:, 1]], points[triangles[:, 2]]
    topo["outward"] = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0) > 0
    if not topo["watertight"] or not topo["outward"]:
        raise PipelineError(
            f"Mesh check failed (watertight={topo['watertight']}, outward={topo['outward']}, "
            f"boundary_edges={topo['boundary_edges']}, nonmanifold_edges={topo['nonmanifold_edges']})."
        )
    return poly, {
        "points": poly.GetNumberOfPoints(),
        "triangles": poly.GetNumberOfPolys(),
        "triangles_before_decimation": smoothed_tris,
        "marching_cubes_triangles": raw_tris,
        "decimation": method,
        "triangle_budget": budget,
        "normals_outward": bool(topo["outward"]),
        "watertight": topo["watertight"],
        "boundary_edges": topo["boundary_edges"],
        "nonmanifold_edges": topo["nonmanifold_edges"],
        "bounds_ras_mm": [round(v, 2) for v in poly.GetBounds()],
        "surface_area_mm2": round(topo["area"], 1),
        "enclosed_volume_ml": round(topo["volume"] / 1000.0, 2),
    }


def write_vtp(poly, path: Path) -> None:
    """VTK XML PolyData, binary with zlib compression, as vtk.js vtkXMLPolyDataReader reads it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = vtk.vtkXMLPolyDataWriter()
    writer.SetFileName(str(path))
    writer.SetInputData(poly)
    writer.SetDataModeToBinary()
    writer.SetCompressorTypeToZLib()
    writer.SetHeaderTypeToUInt32()
    if writer.Write() != 1:
        raise PipelineError(f"Could not write {path.name}.")


# --------------------------------------------------------------------------- outputs


def _file_entry(processed_dir: Path, rel: str, kind: str, label: dict[str, Any], fmt: str, **extra: Any) -> dict[str, Any]:
    path = processed_dir / rel
    return {"path": rel, "kind": kind, **label, "format": fmt, "bytes": path.stat().st_size,
            "sha256": sha256_file(path), **extra}


def build_case(
    case: dict[str, Any],
    ct_path: Path,
    segmentation: dict[str, Any],
    seg_dir: Path,
    processed_dir: Path,
    bones: list[str],
    reference: tuple[Path, str] | None,
    include_ct: bool,
    data_remote: RemoteFile,
    mask_remote: RemoteFile | None,
) -> dict[str, Any]:
    """Copy masks into processed/<case>/, mesh each bone, score against the reference, describe the case."""
    case_id = case["case_id"]
    classes = roi_classes(bones)
    grid = nib.load(str(seg_dir / f"{classes[0]}.nii.gz"))
    affine = grid.affine
    voxel_ml = float(np.prod(grid.header.get_zooms()[:3])) / 1000.0
    ts = {c: np.asanyarray(nib.load(str(seg_dir / f"{c}.nii.gz")).dataobj) > 0 for c in classes}

    files: list[dict[str, Any]] = []
    for cls in classes:
        rel = f"{case_id}/masks/{cls}.nii.gz"
        (processed_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(seg_dir / f"{cls}.nii.gz", processed_dir / rel)
        files.append(_file_entry(processed_dir, rel, "mask", {"ts_class": cls}, MASK_FORMAT))

    bone_records: list[dict[str, Any]] = []
    for bone in bones:
        sources = list(MESH_BONES.get(bone, (bone,)))
        mask = np.logical_or.reduce([ts[s] for s in sources])
        voxels = int(mask.sum())
        z_slices = np.where(mask.any(axis=(0, 1)))[0]
        record: dict[str, Any] = {
            "name": bone,
            "source_ts_classes": sources,
            "voxels": voxels,
            "volume_ml": round(voxels * voxel_ml, 2),
            "connected_components": int(ndimage.label(mask)[1]) if voxels else 0,
            "touches_scan_z_limit": bool(voxels and (z_slices[0] == 0 or z_slices[-1] == mask.shape[2] - 1)),
        }
        if voxels:
            poly, info = mesh_from_mask(mask, affine, TRIANGLE_BUDGET.get(bone, DEFAULT_TRIANGLE_BUDGET))
            rel = f"{case_id}/meshes/{bone}.vtp"
            write_vtp(poly, processed_dir / rel)
            files.append(_file_entry(processed_dir, rel, "mesh", {"bone": bone}, MESH_FORMAT, **info))
            record["mesh_enclosed_volume_ml"] = info["enclosed_volume_ml"]
        bone_records.append(record)

    expert_file = validation = None
    if reference is not None:
        ref_path, ref_member = reference
        ref_image = nib.load(str(ref_path))
        same_grid = ref_image.shape[:3] == grid.shape[:3] and np.allclose(ref_image.affine, affine, atol=1e-3)
        if not same_grid:
            ref_image = resample_from_to(ref_image, grid, order=0)
        expert = np.asarray(ref_image.dataobj).astype(np.int16)
        expert_file = {
            "archive": mask_remote.key if mask_remote else None,
            "archive_member": ref_member,
            "bytes": ref_path.stat().st_size,
            "sha256": sha256_file(ref_path),
            "volume_ml": {name: round(int((expert == label).sum()) * voxel_ml, 2) for label, name in EXPERT_LABELS.items()},
        }
        validation = validate_against_reference(ts, expert, affine, same_grid)

    if include_ct:
        rel = f"{case_id}/ct/{ct_path.name}"
        (processed_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ct_path, processed_dir / rel)
        files.append(_file_entry(processed_dir, rel, "ct", {}, CT_FORMAT))

    ct_image = nib.load(str(ct_path))
    return {
        "case_id": case_id,
        "source_file": {
            "archive": data_remote.key,
            "archive_member": case["member"],
            "bytes": case["bytes"],
            "sha256": case["sha256"],
            "shape_ijk": [int(n) for n in ct_image.shape[:3]],
            "spacing_mm": [round(float(z), 6) for z in ct_image.header.get_zooms()[:3]],
            "orientation": "".join(nib.aff2axcodes(ct_image.affine)),
        },
        "expert_mask_file": expert_file,
        "bones": bone_records,
        "files": files,
        "segmentation": segmentation,
        "validation": validation,
    }


def dataset_record(
    attribution: dict[str, Any], data_remote: RemoteFile, mask_remote: RemoteFile | None, extraction: dict[str, Any]
) -> dict[str, Any]:
    if extraction["archive_md5_verified"]:
        data_note = "The data archive was read in full and md5-verified against the Zenodo API."
    else:
        data_note = (
            f"The {data_remote.size / 1e9:.2f} GB data archive was streamed and stopped after the first "
            f"{extraction['streamed_cases']} CT member(s), so its archive checksum cannot be verified; each "
            "extracted member passed its gzip CRC check."
        )
    mask_note = "Mask archive downloaded in full and md5-verified against the Zenodo API. " if mask_remote else ""
    title = attribution.get("title") or "Zenodo record"
    return {
        "name": DATASET_NAMES.get(data_remote.key, f"{title} ({data_remote.key})"),
        "zenodo_record": attribution["zenodo_record"],
        "doi": attribution["doi"],
        "license": attribution["license"],
        "license_url": LICENSE_URLS.get(attribution["license"] or ""),
        "changes": DERIVED_DATA_NOTE,
        "creators": attribution["creators"],
        "citation": attribution["citation"],
        "citation_preprint": CTPELVIC1K_PREPRINT,
        "repository": CTPELVIC1K_REPOSITORY,
        "expert_label_map": {str(k): v for k, v in EXPERT_LABELS.items()} if mask_remote else None,
        "expert_label_map_source": EXPERT_LABEL_SOURCE if mask_remote else None,
        "description": DATASET_DESCRIPTION + DATASET_NOTES.get(data_remote.key, ""),
        "source_archives": {
            remote.key: {"bytes": remote.size, "checksum": remote.checksum, "url": remote.url}
            for remote in (data_remote, mask_remote)
            if remote is not None
        },
        "acquisition_note": mask_note + data_note,
    }


def write_manifest(work_dir: Path, dataset: dict[str, Any], ts_version: str, cases: list[dict[str, Any]]) -> Path:
    """Write processed/manifest.json with this run's case records only.

    Records left in work_dir/cases by earlier runs (other --cases or --bones) are not published.
    """
    tool = {"name": TOTALSEGMENTATOR["name"], "version": ts_version,
            **{k: v for k, v in TOTALSEGMENTATOR.items() if k != "name"}}
    manifest = {
        "generated_utc": utc_now(),
        "dataset": dataset,
        "segmentation_tool": tool,
        "mesh_method": MESH_METHOD + vtk.vtkVersion.GetVTKVersion(),
        "cases": cases,
    }
    path = work_dir / "processed" / "manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2))
    return path


def _comparable(path: str) -> str:
    # normcase lowercases on Windows; "/" vs "\" is unified so either spelling of a path matches.
    return os.path.normcase(path).replace("\\", "/")


def _holds_local_path(value: Any, local_dirs: Iterable[Path]) -> bool:
    """True if any key or string value in the parsed manifest contains one of these directories.

    Checked on parsed values, not the JSON text: JSON escapes "\\", so a Windows path never appears
    literally in the text.
    """
    needles = {_comparable(str(d)).rstrip("/") for d in local_dirs if d.parent != d}  # never a bare root

    def walk(node: Any) -> bool:
        if isinstance(node, str):
            text = _comparable(node)
            return any(n in text for n in needles)
        if isinstance(node, dict):
            return any(walk(k) or walk(v) for k, v in node.items())
        if isinstance(node, list):
            return any(walk(v) for v in node)
        return False

    return walk(value)


def load_processed(processed_dir: Path) -> tuple[dict[str, Any], list[UploadItem]]:
    """Check a processed/ folder against its manifest.json and list what to upload.

    Every file the manifest lists must exist with the listed bytes and sha256 under a safe
    relative path; the manifest itself goes last, so it never points at a missing object.
    """
    manifest_path = processed_dir / "manifest.json"
    if not manifest_path.is_file():
        raise ConfigError(f"{manifest_path} does not exist.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        cases = manifest["cases"]
        if not isinstance(cases, list) or not all(isinstance(c, dict) for c in cases):
            raise TypeError("cases must be a list of objects")
    except (ValueError, KeyError, TypeError) as exc:
        raise ConfigError(f"{manifest_path} is not a bone manifest: {exc}") from exc
    if _holds_local_path(manifest, [processed_dir.resolve(), processed_dir.absolute(), Path.home()]):
        raise ConfigError("manifest.json contains a local path. It is served to browsers; remove local paths first.")
    items: list[UploadItem] = []
    problems: list[str] = []
    for case in cases:
        for entry in case.get("files") or []:
            rel = entry.get("path") if isinstance(entry, dict) else None
            if not isinstance(rel, str) or not SAFE_PATH_RE.match(rel):
                problems.append(f"unsafe path {rel!r}")
                continue
            path = processed_dir / rel
            if not path.is_file():
                problems.append(f"{rel} is missing")
                continue
            digest = sha256_file(path)
            if path.stat().st_size != entry.get("bytes") or digest != entry.get("sha256"):
                problems.append(f"{rel} does not match its bytes/sha256 in manifest.json")
                continue
            items.append(UploadItem(path, f"{BUCKET_PREFIX}/{rel}", digest, content_type_for(rel)))
    if problems:
        more = f" (and {len(problems) - 5} more)" if len(problems) > 5 else ""
        raise ChecksumError(f"{processed_dir} does not match its manifest.json: " + "; ".join(problems[:5]) + more)
    items.append(UploadItem(manifest_path, f"{BUCKET_PREFIX}/manifest.json", sha256_file(manifest_path), "application/json"))
    return manifest, items


# --------------------------------------------------------------------------- object storage


def s3_settings_from_env(env: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ if env is None else env
    missing = [name for name in ENV_VARS if not env.get(name, "").strip()]
    if missing:
        raise ConfigError(
            "Missing environment variable(s): " + ", ".join(missing) + ". Set them as described in "
            "scripts/vultr_pipeline/README.md (names in scripts/vultr_pipeline/.env.example), or pass --skip-upload."
        )
    endpoint = env["VULTR_S3_ENDPOINT"].strip()
    if "://" not in endpoint:
        endpoint = "https://" + endpoint
    return {
        "endpoint": endpoint,
        "access_key": env["VULTR_S3_ACCESS_KEY"].strip(),
        "secret_key": env["VULTR_S3_SECRET_KEY"].strip(),
        "bucket": env["VULTR_S3_BUCKET"].strip(),
    }


def region_for(endpoint: str) -> str:
    """Vultr's boto3 guide uses the first label of the hostname (e.g. ewr1) as the region."""
    host = urlparse(endpoint).hostname or ""
    return host.split(".")[0] if host.endswith(".vultrobjects.com") else "us-east-1"


def make_s3_client(settings: dict[str, str]):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings["endpoint"],
        region_name=region_for(settings["endpoint"]),
        aws_access_key_id=settings["access_key"],
        aws_secret_access_key=settings["secret_key"],
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )


def upload_items(client, bucket: str, items: list[UploadItem]) -> dict[str, int]:
    """Upload private objects with their sha256 in metadata; skip objects that already match."""
    from botocore.exceptions import ClientError

    counts = {"uploaded": 0, "skipped": 0, "bytes_uploaded": 0}
    for item in items:
        try:
            head = client.head_object(Bucket=bucket, Key=item.key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
                raise
            head = None
        if head is not None and head.get("Metadata", {}).get("sha256") == item.sha256:
            counts["skipped"] += 1
            log(f"  unchanged {item.key}")
            continue
        client.upload_file(
            str(item.path),
            bucket,
            item.key,
            ExtraArgs={"ContentType": item.content_type, "ACL": "private", "Metadata": {"sha256": item.sha256}},
        )
        counts["uploaded"] += 1
        counts["bytes_uploaded"] += item.path.stat().st_size
        log(f"  uploaded {item.key} ({item.path.stat().st_size:,} bytes)")
    return counts


def apply_cors(client, bucket: str, origins: list[str]) -> None:
    """Let browsers on these origins GET the pre-signed URLs. Replaces the bucket's CORS rules."""
    client.put_bucket_cors(
        Bucket=bucket,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedOrigins": origins,
                    "AllowedMethods": ["GET", "HEAD"],
                    "ExposeHeaders": ["ETag", "Content-Length"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )


def publish(items: list[UploadItem], settings: dict[str, str], cors_origins: list[str]) -> dict[str, int]:
    from botocore.exceptions import BotoCoreError, ClientError

    client = make_s3_client(settings)
    try:
        if cors_origins:
            apply_cors(client, settings["bucket"], cors_origins)
            log(f"CORS: GET allowed from {', '.join(cors_origins)}")
        log(f"Uploading {len(items)} object(s) to bucket {settings['bucket']}...")
        return upload_items(client, settings["bucket"], items)
    except (BotoCoreError, ClientError) as exc:  # botocore messages carry no secret key
        raise PipelineError(f"Object storage request failed: {exc}") from exc


# --------------------------------------------------------------------------- CLI


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download CTPelvic1K CT cases, segment bones with TotalSegmentator, upload masks and meshes to Vultr Object Storage.",
    )
    parser.add_argument("--work-dir", type=Path,
                        help="Folder for downloads, scans, masks and meshes. Must be outside the repository.")
    parser.add_argument("--from-processed", type=Path, metavar="DIR",
                        help="Skip download and segmentation: check DIR/manifest.json and the files it lists, "
                             "then upload them (instead of --work-dir).")
    parser.add_argument("--record", default=DEFAULT_RECORD, help=f"Zenodo record id (default {DEFAULT_RECORD}).")
    parser.add_argument("--data-file", default=DEFAULT_DATA_FILE, help=f"CT tarball in the record (default {DEFAULT_DATA_FILE}).")
    parser.add_argument("--mask-file", default=DEFAULT_MASK_FILE,
                        help=f"Reference-mask tarball in the record (default {DEFAULT_MASK_FILE}); '' to skip.")
    parser.add_argument("--cases", type=int, default=1, help="Number of CT cases to extract and process (default 1).")
    parser.add_argument("--bones", nargs="+", default=list(DEFAULT_BONES),
                        help="Bones to mesh (default: %(default)s). sacrum is TotalSegmentator's sacrum plus "
                             "vertebrae_S1; any other TotalSegmentator class name is meshed on its own.")
    parser.add_argument("--device", help="Passed to TotalSegmentator --device: gpu, cpu, mps or gpu:N.")
    parser.add_argument("--fast", action="store_true", help="Pass --fast to TotalSegmentator (3 mm model).")
    parser.add_argument("--verify-archive", action="store_true",
                        help="Read the whole CT tarball to check its MD5 (downloads all of it).")
    parser.add_argument("--include-ct", action="store_true", help="Also upload each source CT volume.")
    parser.add_argument("--cors-origin", action="append", default=[], metavar="ORIGIN",
                        help="Set the bucket's CORS rules to allow GET from this origin (repeatable).")
    parser.add_argument("--totalseg-bin", help="Path to the TotalSegmentator executable (default: found on PATH).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the plan; no downloads, segmentation or uploads.")
    parser.add_argument("--skip-upload", action="store_true", help="Do everything except the upload.")
    args = parser.parse_args(argv)
    if bool(args.work_dir) == bool(args.from_processed):
        parser.error("give exactly one of --work-dir and --from-processed")
    if args.cases < 1:
        parser.error("--cases must be at least 1")
    if args.device and not DEVICE_RE.match(args.device):
        parser.error("--device must be gpu, cpu, mps or gpu:N")
    bad = [bone for bone in args.bones if not BONE_RE.match(bone)]
    if bad:
        parser.error(f"--bones takes TotalSegmentator class names such as sacrum, not {', '.join(bad)}")
    return args


def _inside_repo(path: Path) -> bool:
    """True if path is the repository or under it, compared by file identity.

    A string comparison misses case variants of the same folder on case-insensitive file
    systems (macOS, Windows), so every existing ancestor is compared with os.path.samefile.
    """
    resolved = path.expanduser().resolve()
    for candidate in (resolved, *resolved.parents):
        try:
            if os.path.samefile(candidate, REPO_ROOT):
                return True
        except OSError:  # this ancestor does not exist yet
            continue
    return False


def run_from_processed(args: argparse.Namespace, upload: bool) -> dict[str, Any]:
    processed_dir: Path = args.from_processed.expanduser()
    if _inside_repo(processed_dir):
        raise ConfigError(f"--from-processed {processed_dir} is inside the repository; keep scans and masks outside it.")
    settings = s3_settings_from_env() if upload else None
    manifest, items = load_processed(processed_dir)
    summary: dict[str, Any] = {
        "manifest": str(processed_dir / "manifest.json"),
        "cases": [case.get("case_id") for case in manifest["cases"]],
        "files_in_manifest": len(items) - 1,
        "bytes": sum(item.path.stat().st_size for item in items),
        "bucket_prefix": f"{BUCKET_PREFIX}/",
    }
    summary["upload"] = publish(items, settings, args.cors_origin) if upload else (
        "skipped (--dry-run)" if args.dry_run else "skipped (--skip-upload)"
    )
    log(json.dumps(summary, indent=2))
    return summary


def run(args: argparse.Namespace) -> dict[str, Any]:
    upload = not (args.skip_upload or args.dry_run)
    if args.from_processed:
        return run_from_processed(args, upload)
    work_dir: Path = args.work_dir.expanduser()
    if _inside_repo(work_dir):
        raise ConfigError(f"--work-dir {work_dir} is inside the repository; keep scans and masks outside it.")
    settings = s3_settings_from_env() if upload else None  # fail before any download
    classes = roi_classes(args.bones)

    attribution, remote = resolve_record(args.record, [args.data_file, args.mask_file])
    data_remote = remote[args.data_file]
    mask_remote = remote.get(args.mask_file) if args.mask_file else None
    executable = find_totalsegmentator(args.totalseg_bin)

    if args.dry_run:
        plan = {
            "dry_run": True,
            "dataset": attribution,
            "data_file": data_remote.describe(),
            "mask_file": mask_remote.describe() if mask_remote else None,
            "cases": args.cases,
            "totalsegmentator": executable or "not found on PATH",
            "command": totalsegmentator_command(
                "TotalSegmentator", "<ct.nii.gz>", "<output_dir>", "<report.json>", classes, args.fast, args.device
            ),
            "meshes": {bone: list(MESH_BONES.get(bone, (bone,))) for bone in args.bones},
            "bucket_prefix": f"{BUCKET_PREFIX}/",
            "upload_env_vars_set": {name: bool(os.environ.get(name)) for name in ENV_VARS},
        }
        log(json.dumps(plan, indent=2))
        return plan

    if not executable:
        raise ConfigError("TotalSegmentator was not found on PATH. Install it (see README.md) or pass --totalseg-bin.")
    version = totalsegmentator_version(executable)
    log(f"TotalSegmentator {version}")

    extraction = extract_cases(data_remote, work_dir / "raw" / "ct", args.cases, args.verify_archive)
    references: dict[str, tuple[Path, str]] = {}
    if mask_remote is not None:
        mask_archive = download_verified(mask_remote, work_dir / "downloads")
        references = extract_reference_masks(
            mask_archive, {c["case_id"] for c in extraction["cases"]}, work_dir / "raw" / "reference"
        )

    processed_dir = work_dir / "processed"
    (work_dir / "cases").mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for case in extraction["cases"]:
        case_id = case["case_id"]
        log(f"Case {case_id}")
        ct_path = work_dir / "raw" / "ct" / case["file"]
        seg_dir = work_dir / "segment" / case_id
        segmentation = segment_case(executable, version, ct_path, seg_dir, classes, args.fast, args.device)
        record = build_case(
            case, ct_path, segmentation, seg_dir, processed_dir, args.bones,
            references.get(case_id), args.include_ct, data_remote, mask_remote,
        )
        (work_dir / "cases" / f"{case_id}.json").write_text(json.dumps(record, indent=2))
        records.append(record)
    dataset = dataset_record(attribution, data_remote, mask_remote, extraction)
    write_manifest(work_dir, dataset, version, records)
    manifest, items = load_processed(processed_dir)
    summary: dict[str, Any] = {
        "manifest": str(processed_dir / "manifest.json"),
        "cases": [c["case_id"] for c in manifest["cases"]],
        "files_in_manifest": len(items) - 1,
        "archive_md5_verified": extraction["archive_md5_verified"],
    }
    summary["upload"] = publish(items, settings, args.cors_origin) if upload else "skipped (--skip-upload)"
    log(json.dumps(summary, indent=2))
    return summary


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        run(args)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except PipelineError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
