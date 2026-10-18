#!/usr/bin/env python3
"""CTPelvic1K pelvic CT -> TotalSegmentator bone masks and meshes -> Vultr Object Storage.

1. Resolve file URLs, sizes and checksums from the Zenodo API (record 4588403 by default).
2. Stream the CT tarball and extract only the first N `.nii.gz` cases. The small
   reference-mask tarball is downloaded whole and its MD5 is checked.
3. Run the TotalSegmentator CLI on each case with --roi_subset.
4. Write one mask and one surface mesh (VTK XML PolyData, .vtp) per bone, and manifest.json.
5. Upload them as private objects with boto3. Objects whose sha256 is unchanged are skipped.

Credentials come only from the VULTR_S3_* environment variables. See README.md.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import http.client
import json
import os
import re
import shutil
import struct
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
from nibabel.affines import apply_affine
from skimage.measure import marching_cubes

REPO_ROOT = Path(__file__).resolve().parents[2]
ZENODO_API = "https://zenodo.org/api/records/{record}"
DEFAULT_RECORD = "4588403"
DEFAULT_DATA_FILE = "CTPelvic1K_dataset6_data.tar.gz"
DEFAULT_MASK_FILE = "CTPelvic1K_dataset6_Anonymized_mask.tar.gz"
# TotalSegmentator 2.18.0 class names (task "total"), from totalsegmentator/map_to_binary.py.
DEFAULT_BONES = ("sacrum", "hip_left", "hip_right", "femur_left", "femur_right")
DEVICE_RE = re.compile(r"^(gpu|cpu|mps|gpu:\d+)$")  # what TotalSegmentator's -d/--device accepts
BONE_RE = re.compile(r"^[A-Za-z0-9_]+$")  # class names become file names and object keys
# backend/routes_bones.py reads <BUCKET_PREFIX>/manifest.json.
BUCKET_PREFIX = "ctpelvic1k"
MANIFEST_SCHEMA = "rainbowbone.bones/v1"
ENV_VARS = ("VULTR_S3_ENDPOINT", "VULTR_S3_ACCESS_KEY", "VULTR_S3_SECRET_KEY", "VULTR_S3_BUCKET")
USER_AGENT = "RainbowBone-vultr-pipeline/1.0"
CHUNK = 1 << 20
CONTENT_TYPES = {".nii.gz": "application/gzip", ".vtp": "application/xml", ".json": "application/json"}
# "<case>_data.nii.gz" and "<case>_mask_4label.nii.gz" share one case id.
CASE_RE = re.compile(r"^(?P<case>[A-Za-z0-9][A-Za-z0-9._-]*?)(?:_data|_mask(?:_[A-Za-z0-9]+)?)?\.nii\.gz$")

CTPELVIC1K_REPOSITORY = "https://github.com/MIRACLE-Center/CTPelvic1K"
TOTALSEGMENTATOR = {
    "name": "TotalSegmentator",
    "repository": "https://github.com/wasserth/TotalSegmentator",
    "licence": "Apache-2.0 (code and the weights of the default 'total' task)",
    "citation": (
        "Wasserthal, J., Breit, H.-C., Meyer, M.T., Pradella, M., Hinck, D., Sauter, A.W., Heye, T., "
        "Boll, D., Cyriac, J., Yang, S., Bach, M., Segeroth, M., 2023. TotalSegmentator: Robust "
        "Segmentation of 104 Anatomic Structures in CT Images. Radiology: Artificial Intelligence. "
        "https://doi.org/10.1148/ryai.230024"
    ),
    "also_cite": "nnU-Net, https://github.com/MIC-DKFZ/nnUNet",
}


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
    doi = record.get("doi")
    attribution = {
        "title": metadata.get("title"),
        "zenodo_record": str(record.get("id", record_id)),
        "doi": doi,
        "doi_url": f"https://doi.org/{doi}" if doi else None,
        "licence": (metadata.get("license") or {}).get("id"),
        "creators": [creator.get("name") for creator in metadata.get("creators", [])],
        "references": metadata.get("references", []),
        "repository": CTPELVIC1K_REPOSITORY,
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
    """Reuse earlier extractions recorded in index.json when they cover `limit` cases."""
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
                return {**index, "cases": cases, "reused": True}
    log(f"Streaming {remote.key} ({remote.size:,} bytes) for the first {limit} case(s)...")
    index = stream_extract_cases(remote, raw_dir, limit, verify_archive)
    index_path.write_text(json.dumps(index, indent=2))
    return {**index, "reused": False}


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


def extract_reference_masks(archive_path: Path, case_ids: set[str], dest: Path) -> dict[str, Path]:
    """Copy the dataset's own annotation for each wanted case out of a local mask tarball."""
    dest.mkdir(parents=True, exist_ok=True)
    found: dict[str, Path] = {}
    with tarfile.open(archive_path, mode="r:gz") as archive:
        for member in archive:
            case_id = case_id_for(member.name)
            if not member.isfile() or case_id not in case_ids or case_id in found:
                continue
            target = dest / PurePosixPath(member.name).name
            with archive.extractfile(member) as source, target.open("wb") as out:
                shutil.copyfileobj(source, out, CHUNK)
            found[case_id] = target
    return found


# --------------------------------------------------------------------------- TotalSegmentator


def find_totalsegmentator(explicit: str | None = None) -> str | None:
    return explicit if explicit else shutil.which("TotalSegmentator")


def totalsegmentator_version(executable: str) -> str:
    try:
        result = subprocess.run([executable, "--version"], capture_output=True, text=True)
    except OSError as exc:
        raise ConfigError(f"Cannot run TotalSegmentator at {executable}: {exc}") from exc
    return (result.stdout or result.stderr).strip() or "unknown"


def totalsegmentator_command(executable: str, ct: str, out: str, bones: list[str], fast: bool, device: str | None) -> list[str]:
    command = [executable, "-i", ct, "-o", out, "--roi_subset", *bones]
    if fast:
        command.append("--fast")
    if device:
        command += ["--device", device]
    return command


def segment_case(executable: str, version: str, ct_path: Path, out_dir: Path, bones: list[str], fast: bool, device: str | None) -> dict[str, Any]:
    """Run TotalSegmentator unless this folder already holds masks made with the same settings."""
    settings = {"roi_subset": bones, "fast": fast, "totalsegmentator_version": version}
    record_path = out_dir / "segmentation.json"
    if record_path.is_file():
        previous = json.loads(record_path.read_text())
        if previous.get("settings") == settings and all((out_dir / f"{bone}.nii.gz").is_file() for bone in bones):
            log(f"  reusing TotalSegmentator masks in {out_dir}")
            return {**previous, "reused": True}
    out_dir.mkdir(parents=True, exist_ok=True)
    command = totalsegmentator_command(executable, str(ct_path), str(out_dir), bones, fast, device)
    log("  " + " ".join(command))
    started = time.perf_counter()
    result = subprocess.run(command)
    seconds = round(time.perf_counter() - started, 3)
    if result.returncode != 0:
        raise PipelineError(f"TotalSegmentator exited with code {result.returncode} on {ct_path.name}.")
    missing = [bone for bone in bones if not (out_dir / f"{bone}.nii.gz").is_file()]
    if missing:
        raise PipelineError(f"TotalSegmentator wrote no mask for {', '.join(missing)} ({ct_path.name}).")
    # Placeholders instead of local paths: the manifest is served to browsers.
    public_command = totalsegmentator_command("TotalSegmentator", "<ct.nii.gz>", "<output_dir>", bones, fast, device)
    record = {"settings": settings, "device": device, "command": public_command, "seconds": seconds}
    record_path.write_text(json.dumps(record, indent=2))
    return {**record, "reused": False}


# --------------------------------------------------------------------------- meshes


def mask_to_mesh(mask_path: Path, step_size: int = 2) -> dict[str, Any]:
    """Marching-cubes surface of a binary mask, in NIfTI world coordinates (RAS+, mm)."""
    image = nib.load(str(mask_path))
    mask = np.asanyarray(image.dataobj) > 0
    voxels = int(mask.sum())
    zooms = [float(z) for z in image.header.get_zooms()[:3]]
    result: dict[str, Any] = {"voxels": voxels, "volume_ml": round(voxels * float(np.prod(zooms)) / 1000.0, 3)}
    if voxels == 0:
        return result
    indices = np.argwhere(mask)
    low, high = indices.min(axis=0), indices.max(axis=0) + 1
    # One empty voxel of padding closes surfaces that touch the edge of the scan.
    crop = np.pad(mask[low[0]:high[0], low[1]:high[1], low[2]:high[2]], 1).astype(np.uint8)
    for step in dict.fromkeys((step_size, 1)):  # a coarse step can miss a very small bone
        try:
            verts, faces, _normals, _values = marching_cubes(crop, level=0.5, step_size=step, allow_degenerate=False)
        except (ValueError, RuntimeError):
            continue
        if len(faces):
            break
    else:
        return result
    verts = apply_affine(image.affine, verts + (low - 1))
    if signed_volume(verts, faces) < 0:
        faces = faces[:, ::-1]  # outward-facing triangles, also after a mirroring affine
    result.update(
        verts=verts.astype(np.float32),
        faces=faces.astype(np.int32),
        normals=vertex_normals(verts, faces).astype(np.float32),
        step_size=step,
    )
    return result


def signed_volume(verts: np.ndarray, faces: np.ndarray) -> float:
    """Divergence-theorem volume: positive when triangles wind counter-clockwise seen from outside."""
    a, b, c = (verts[faces[:, i]] for i in range(3))
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def vertex_normals(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    face_normals = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
    normals = np.zeros_like(verts, dtype=np.float64)
    for i in range(3):
        np.add.at(normals, faces[:, i], face_normals)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.where(lengths == 0, 1.0, lengths)


def _vtk_binary(array: np.ndarray) -> str:
    """VTK XML inline binary: base64 of a little-endian UInt32 byte count followed by the data."""
    raw = np.ascontiguousarray(array, dtype=array.dtype.newbyteorder("<")).tobytes()
    return base64.b64encode(struct.pack("<I", len(raw)) + raw).decode("ascii")


def write_vtp(path: Path, verts: np.ndarray, faces: np.ndarray, normals: np.ndarray) -> None:
    """Write a triangle surface as VTK XML PolyData, readable by vtk.js vtkXMLPolyDataReader."""
    offsets = np.arange(3, 3 * len(faces) + 1, 3, dtype=np.int32)
    xml = (
        '<?xml version="1.0"?>\n'
        '<VTKFile type="PolyData" version="1.0" byte_order="LittleEndian" header_type="UInt32">\n'
        "  <PolyData>\n"
        f'    <Piece NumberOfPoints="{len(verts)}" NumberOfVerts="0" NumberOfLines="0" '
        f'NumberOfStrips="0" NumberOfPolys="{len(faces)}">\n'
        '      <PointData Normals="Normals">\n'
        '        <DataArray type="Float32" Name="Normals" NumberOfComponents="3" format="binary">'
        f"{_vtk_binary(normals.astype(np.float32))}</DataArray>\n"
        "      </PointData>\n"
        "      <Points>\n"
        '        <DataArray type="Float32" Name="Points" NumberOfComponents="3" format="binary">'
        f"{_vtk_binary(verts.astype(np.float32))}</DataArray>\n"
        "      </Points>\n"
        "      <Polys>\n"
        '        <DataArray type="Int32" Name="connectivity" format="binary">'
        f"{_vtk_binary(faces.astype(np.int32).ravel())}</DataArray>\n"
        '        <DataArray type="Int32" Name="offsets" format="binary">'
        f"{_vtk_binary(offsets)}</DataArray>\n"
        "      </Polys>\n"
        "    </Piece>\n"
        "  </PolyData>\n"
        "</VTKFile>\n"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(xml, encoding="ascii")


# --------------------------------------------------------------------------- outputs


def _file_entry(bucket_dir: Path, key: str, **extra: Any) -> dict[str, Any]:
    path = bucket_dir / key
    return {
        "key": key,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "content_type": content_type_for(key),
        **extra,
    }


def build_case(
    case: dict[str, Any],
    ct_path: Path,
    segmentation: dict[str, Any],
    seg_dir: Path,
    bucket_dir: Path,
    bones: list[str],
    mesh_step: int,
    reference: Path | None,
    include_ct: bool,
    source: dict[str, Any],
) -> dict[str, Any]:
    """Copy masks into the bucket mirror, mesh them, and describe the case for the manifest."""
    case_id = case["case_id"]
    prefix = f"{BUCKET_PREFIX}/{case_id}"
    files: list[dict[str, Any]] = []
    empty: list[str] = []
    mesh_started = time.perf_counter()
    for bone in bones:
        mask_key = f"{prefix}/masks/{bone}.nii.gz"
        mesh = mask_to_mesh(seg_dir / f"{bone}.nii.gz", mesh_step)
        if mesh["voxels"] == 0:
            empty.append(bone)
            continue
        (bucket_dir / mask_key).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(seg_dir / f"{bone}.nii.gz", bucket_dir / mask_key)
        files.append(_file_entry(bucket_dir, mask_key, kind="mask", bone=bone, voxels=mesh["voxels"], volume_ml=mesh["volume_ml"]))
        mesh_key = f"{prefix}/meshes/{bone}.vtp"
        write_vtp(bucket_dir / mesh_key, mesh["verts"], mesh["faces"], mesh["normals"])
        files.append(
            _file_entry(
                bucket_dir, mesh_key, kind="mesh", bone=bone,
                points=int(len(mesh["verts"])), triangles=int(len(mesh["faces"])), marching_cubes_step=mesh["step_size"],
            )
        )
    mesh_seconds = round(time.perf_counter() - mesh_started, 3)
    if reference is not None:
        ref_key = f"{prefix}/reference/{reference.name}"
        (bucket_dir / ref_key).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(reference, bucket_dir / ref_key)
        files.append(_file_entry(bucket_dir, ref_key, kind="reference_mask", bone=None, origin="CTPelvic1K annotation"))
    ct_image = nib.load(str(ct_path))
    ct_info = {
        "file": ct_path.name,
        "archive_member": case["member"],
        "bytes": case["bytes"],
        "sha256": case["sha256"],
        "shape": [int(n) for n in ct_image.shape[:3]],
        "spacing_mm": [round(float(z), 4) for z in ct_image.header.get_zooms()[:3]],
        "uploaded": include_ct,
    }
    if include_ct:
        ct_key = f"{prefix}/ct/{ct_path.name}"
        (bucket_dir / ct_key).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ct_path, bucket_dir / ct_key)
        files.append(_file_entry(bucket_dir, ct_key, kind="ct", bone=None))
    return {
        "case_id": case_id,
        "source": source,
        "ct": ct_info,
        "segmentation": {k: segmentation[k] for k in ("settings", "device", "command", "seconds") if k in segmentation},
        "timings_seconds": {
            "extract": case.get("extract_seconds"),
            "totalsegmentator": segmentation.get("seconds"),
            "meshes": mesh_seconds,
        },
        "bones_without_voxels": empty,
        "files": files,
    }


def write_manifest(work_dir: Path, dataset: dict[str, Any], mesh_step: int) -> Path:
    """Merge every case record in work_dir/cases into the bucket-mirror manifest."""
    cases = [json.loads(p.read_text()) for p in sorted((work_dir / "cases").glob("*.json"))]
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "generated_at": utc_now(),
        "dataset": dataset,
        "segmentation_tool": TOTALSEGMENTATOR,
        "mesh": {
            "format": "VTK XML PolyData (.vtp), triangles with point normals",
            "method": "skimage.measure.marching_cubes at level 0.5 on the binary mask",
            "requested_step_size": mesh_step,
            "coordinates": "NIfTI world coordinates of the CT (RAS+, millimetres)",
        },
        "notice": "Research data. Automatic segmentation, not reviewed by a clinician. Not for clinical use.",
        "cases": cases,
    }
    path = work_dir / "bucket" / BUCKET_PREFIX / "manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2))
    return path


def upload_plan(work_dir: Path, manifest_path: Path) -> list[UploadItem]:
    """Every file the manifest lists, then the manifest itself (last, so it never points at a missing object)."""
    bucket_dir = work_dir / "bucket"
    manifest = json.loads(manifest_path.read_text())
    items = [
        UploadItem(bucket_dir / entry["key"], entry["key"], entry["sha256"], entry["content_type"])
        for case in manifest["cases"]
        for entry in case["files"]
    ]
    manifest_key = manifest_path.relative_to(bucket_dir).as_posix()
    items.append(UploadItem(manifest_path, manifest_key, sha256_file(manifest_path), "application/json"))
    return items


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


# --------------------------------------------------------------------------- CLI


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download CTPelvic1K CT cases, segment bones with TotalSegmentator, upload masks and meshes to Vultr Object Storage.",
    )
    parser.add_argument("--work-dir", type=Path, required=True,
                        help="Folder for downloads, scans, masks and meshes. Must be outside the repository.")
    parser.add_argument("--record", default=DEFAULT_RECORD, help=f"Zenodo record id (default {DEFAULT_RECORD}).")
    parser.add_argument("--data-file", default=DEFAULT_DATA_FILE, help=f"CT tarball in the record (default {DEFAULT_DATA_FILE}).")
    parser.add_argument("--mask-file", default=DEFAULT_MASK_FILE,
                        help=f"Reference-mask tarball in the record (default {DEFAULT_MASK_FILE}); '' to skip.")
    parser.add_argument("--cases", type=int, default=1, help="Number of CT cases to extract and process (default 1).")
    parser.add_argument("--bones", nargs="+", default=list(DEFAULT_BONES),
                        help="TotalSegmentator class names for --roi_subset (default: %(default)s).")
    parser.add_argument("--device", help="Passed to TotalSegmentator --device: gpu, cpu, mps or gpu:N.")
    parser.add_argument("--fast", action="store_true", help="Pass --fast to TotalSegmentator (3 mm model).")
    parser.add_argument("--mesh-step", type=int, default=2, help="Marching-cubes step size in voxels (default 2).")
    parser.add_argument("--verify-archive", action="store_true",
                        help="Read the whole CT tarball to check its MD5 (downloads all of it).")
    parser.add_argument("--include-ct", action="store_true", help="Also upload each source CT volume.")
    parser.add_argument("--cors-origin", action="append", default=[], metavar="ORIGIN",
                        help="Set the bucket's CORS rules to allow GET from this origin (repeatable).")
    parser.add_argument("--totalseg-bin", help="Path to the TotalSegmentator executable (default: found on PATH).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve the files and print the plan; no downloads, segmentation or uploads.")
    parser.add_argument("--skip-upload", action="store_true", help="Do everything except the upload.")
    args = parser.parse_args(argv)
    if args.cases < 1:
        parser.error("--cases must be at least 1")
    if args.mesh_step < 1:
        parser.error("--mesh-step must be at least 1")
    if args.device and not DEVICE_RE.match(args.device):
        parser.error("--device must be gpu, cpu, mps or gpu:N")
    bad = [bone for bone in args.bones if not BONE_RE.match(bone)]
    if bad:
        parser.error(f"--bones takes TotalSegmentator class names such as sacrum, not {', '.join(bad)}")
    return args


def _inside_repo(path: Path) -> bool:
    try:
        path.resolve().relative_to(REPO_ROOT)
        return True
    except ValueError:
        return False


def run(args: argparse.Namespace) -> dict[str, Any]:
    work_dir: Path = args.work_dir.expanduser()
    if _inside_repo(work_dir):
        raise ConfigError(f"--work-dir {work_dir} is inside the repository; keep scans and masks outside it.")
    upload = not (args.skip_upload or args.dry_run)
    settings = s3_settings_from_env() if upload else None  # fail before any download

    dataset, remote = resolve_record(args.record, [args.data_file, args.mask_file])
    data_remote = remote[args.data_file]
    mask_remote = remote.get(args.mask_file) if args.mask_file else None
    executable = find_totalsegmentator(args.totalseg_bin)

    if args.dry_run:
        plan = {
            "dry_run": True,
            "dataset": dataset,
            "data_file": data_remote.describe(),
            "mask_file": mask_remote.describe() if mask_remote else None,
            "cases": args.cases,
            "totalsegmentator": executable or "not found on PATH",
            "command": totalsegmentator_command("TotalSegmentator", "<ct.nii.gz>", "<output_dir>", args.bones, args.fast, args.device),
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
    references: dict[str, Path] = {}
    if mask_remote is not None:
        mask_archive = download_verified(mask_remote, work_dir / "downloads")
        references = extract_reference_masks(
            mask_archive, {c["case_id"] for c in extraction["cases"]}, work_dir / "raw" / "reference"
        )

    source = {
        "zenodo_record": dataset["zenodo_record"],
        "file": data_remote.describe(),
        "archive_md5_verified": extraction["archive_md5_verified"],
        "reference_file": mask_remote.describe() if mask_remote else None,
    }
    (work_dir / "cases").mkdir(parents=True, exist_ok=True)
    for case in extraction["cases"]:
        case_id = case["case_id"]
        log(f"Case {case_id}")
        ct_path = work_dir / "raw" / "ct" / case["file"]
        seg_dir = work_dir / "segment" / case_id
        segmentation = segment_case(executable, version, ct_path, seg_dir, args.bones, args.fast, args.device)
        record = build_case(
            case, ct_path, segmentation, seg_dir, work_dir / "bucket", args.bones, args.mesh_step,
            references.get(case_id), args.include_ct, source,
        )
        (work_dir / "cases" / f"{case_id}.json").write_text(json.dumps(record, indent=2))
    manifest_path = write_manifest(work_dir, dataset, args.mesh_step)
    items = upload_plan(work_dir, manifest_path)
    summary: dict[str, Any] = {
        "manifest": str(manifest_path),
        "cases": [c["case_id"] for c in extraction["cases"]],
        "files_in_manifest": len(items),
        "archive_md5_verified": extraction["archive_md5_verified"],
    }
    if upload:
        from botocore.exceptions import BotoCoreError, ClientError

        client = make_s3_client(settings)
        try:
            if args.cors_origin:
                apply_cors(client, settings["bucket"], args.cors_origin)
                log(f"CORS: GET allowed from {', '.join(args.cors_origin)}")
            log(f"Uploading {len(items)} object(s) to bucket {settings['bucket']}...")
            summary["upload"] = upload_items(client, settings["bucket"], items)
        except (BotoCoreError, ClientError) as exc:  # botocore messages carry no secret key
            raise PipelineError(f"Object storage request failed: {exc}") from exc
    else:
        summary["upload"] = "skipped (--skip-upload)"
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
