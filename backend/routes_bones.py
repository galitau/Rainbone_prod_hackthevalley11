"""GET /api/bones: the bone manifest in Vultr Object Storage, with short-lived pre-signed URLs.

scripts/vultr_pipeline/pipeline.py uploads the masks, meshes and ctpelvic1k/manifest.json as
private objects. Each manifest file entry has a "path" relative to the manifest; its object key
is ctpelvic1k/<path>. This route reads that manifest and signs a GET URL for every file it lists,
so the browser fetches the files straight from the bucket without seeing any credentials.
"""
from __future__ import annotations

import json
import hashlib
import logging
import os
import re
import threading
import time
from concurrent.futures import Future
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

ENV_VARS = ("VULTR_S3_ENDPOINT", "VULTR_S3_ACCESS_KEY", "VULTR_S3_SECRET_KEY", "VULTR_S3_BUCKET")
BUCKET_PREFIX = "ctpelvic1k/"
MANIFEST_KEY = BUCKET_PREFIX + "manifest.json"
URL_TTL_SECONDS = 15 * 60
# Avoid repeating storage reads and URL signing when a judge revisits the library.
# Updated manifests become visible within this window; signed URLs retain their
# original expiry. The cache is private to this process and never caches errors.
MANIFEST_CACHE_SECONDS = 30
_cache_lock = threading.Lock()
_manifest_cache: Optional[tuple[bytes, float, "BonesResponse"]] = None
_inflight: dict[bytes, Future] = {}
# A manifest "path": relative, "/"-separated, no "." or ".." segments (same rule as pipeline.py).
SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]*(?:/[A-Za-z0-9_][A-Za-z0-9._-]*)*$")
CONTENT_TYPES = {".nii.gz": "application/gzip", ".vtp": "application/xml", ".json": "application/json"}

logger = logging.getLogger(__name__)
router = APIRouter(tags=["bones"])


class BoneFile(BaseModel):
    model_config = ConfigDict(extra="allow")

    kind: str = Field(description="mask, mesh or ct.")
    bone: Optional[str] = Field(default=None, description="Mesh bone, e.g. sacrum (TotalSegmentator sacrum + vertebrae_S1).")
    ts_class: Optional[str] = Field(default=None, description="TotalSegmentator class of a mask, e.g. vertebrae_S1.")
    path: str = Field(description="Path relative to the manifest, e.g. <case>/meshes/sacrum.vtp.")
    key: str = Field(description="Object key: ctpelvic1k/<path>.")
    url: str = Field(description="Pre-signed GET URL, valid for expires_in_seconds.")
    bytes: int
    sha256: str
    content_type: str


class BoneCase(BaseModel):
    model_config = ConfigDict(extra="allow")

    case_id: str
    files: list[BoneFile]


class BonesResponse(BaseModel):
    expires_in_seconds: int
    expires_at: datetime
    manifest_key: str
    generated_utc: Optional[str] = None
    dataset: dict[str, Any] = Field(default_factory=dict)
    segmentation_tool: dict[str, Any] = Field(default_factory=dict)
    mesh_method: Optional[str] = None
    cases: list[BoneCase]


def _content_type(path: str) -> str:
    for suffix, content_type in CONTENT_TYPES.items():
        if path.endswith(suffix):
            return content_type
    return "application/octet-stream"


def _settings() -> dict[str, str]:
    missing = [name for name in ENV_VARS if not os.environ.get(name, "").strip()]
    if missing:
        raise HTTPException(
            status_code=503,
            detail="Bone storage is not configured: set " + ", ".join(missing)
            + " (see scripts/vultr_pipeline/README.md).",
        )
    endpoint = os.environ["VULTR_S3_ENDPOINT"].strip()
    if "://" not in endpoint:
        endpoint = "https://" + endpoint
    return {
        "endpoint": endpoint,
        "access_key": os.environ["VULTR_S3_ACCESS_KEY"].strip(),
        "secret_key": os.environ["VULTR_S3_SECRET_KEY"].strip(),
        "bucket": os.environ["VULTR_S3_BUCKET"].strip(),
    }


def _client(settings: dict[str, str]):
    import boto3
    from botocore.config import Config

    host = urlparse(settings["endpoint"]).hostname or ""
    # Vultr's boto3 guide uses the first label of the hostname (e.g. ewr1) as the region.
    region = host.split(".")[0] if host.endswith(".vultrobjects.com") else "us-east-1"
    return boto3.client(
        "s3",
        endpoint_url=settings["endpoint"],
        region_name=region,
        aws_access_key_id=settings["access_key"],
        aws_secret_access_key=settings["secret_key"],
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
    )


@router.get("/api/bones", response_model=BonesResponse)
def list_bones() -> BonesResponse:
    """Cases and signed URLs; repeated reads share a validated response for 30 seconds."""
    global _manifest_cache
    settings = _settings()
    # Include credentials so rotation cannot return URLs signed by the old key.
    # Only the digest is retained as the cache key; it is never logged.
    key = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).digest()
    # Share an in-flight read, including its failure, with existing waiters. Never
    # hold the lock over storage I/O or make queued callers retry an outage serially.
    with _cache_lock:
        if _manifest_cache is not None:
            cached_key, until, cached = _manifest_cache
            remaining = int((cached.expires_at - datetime.now(timezone.utc)).total_seconds())
            if cached_key == key and time.monotonic() < until and remaining > 0:
                return cached.model_copy(deep=True, update={"expires_in_seconds": remaining})
        # Discard expired/other-configuration data before attempting a fresh read.
        _manifest_cache = None
        pending = _inflight.get(key)
        leader = pending is None
        if leader:
            pending = _inflight[key] = Future()
    if not leader:
        response = pending.result()
        remaining = max(0, int((response.expires_at - datetime.now(timezone.utc)).total_seconds()))
        return response.model_copy(deep=True, update={"expires_in_seconds": remaining})
    try:
        response = _read_bones(settings)
        with _cache_lock:
            _manifest_cache = (key, time.monotonic() + MANIFEST_CACHE_SECONDS, response)
        pending.set_result(response)
        return response.model_copy(deep=True)
    except BaseException as exc:
        pending.set_exception(exc)
        raise
    finally:
        with _cache_lock:
            _inflight.pop(key, None)


def _read_bones(settings: dict[str, str]) -> BonesResponse:
    """Fetch, sign and validate the manifest. Called only on a cache miss."""
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        client = _client(settings)
    except ValueError as exc:  # botocore rejects the endpoint URL; its message is not echoed
        raise HTTPException(status_code=503, detail="VULTR_S3_ENDPOINT is not a valid URL.") from exc
    try:
        body = client.get_object(Bucket=settings["bucket"], Key=MANIFEST_KEY)["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404", "NotFound"):
            raise HTTPException(
                status_code=404,
                detail=f"No {MANIFEST_KEY} in the bucket yet. Run scripts/vultr_pipeline/pipeline.py.",
            ) from exc
        logger.warning("Reading %s failed with error code %s", MANIFEST_KEY, code or "unknown")
        raise HTTPException(status_code=502, detail="Object storage request failed.") from exc
    except BotoCoreError as exc:
        logger.warning("Reading %s failed: %s", MANIFEST_KEY, type(exc).__name__)
        raise HTTPException(status_code=502, detail="Object storage is unreachable.") from exc
    try:
        manifest = json.loads(body)
        raw_cases = manifest["cases"]
        if not isinstance(raw_cases, list) or not all(isinstance(c, dict) for c in raw_cases):
            raise TypeError("cases must be a list of objects")
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"{MANIFEST_KEY} is not a valid bone manifest.") from exc

    cases = []
    for case in raw_cases:
        files = []
        for entry in case.get("files") or []:
            path = entry.get("path") if isinstance(entry, dict) else None
            if not isinstance(path, str) or not SAFE_PATH_RE.match(path):
                continue  # only sign objects under ctpelvic1k/
            key = BUCKET_PREFIX + path
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings["bucket"], "Key": key},
                ExpiresIn=URL_TTL_SECONDS,
            )
            files.append({**entry, "key": key, "content_type": _content_type(path), "url": url})
        cases.append({**case, "files": files})
    try:
        return BonesResponse(
            expires_in_seconds=URL_TTL_SECONDS,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=URL_TTL_SECONDS),
            manifest_key=MANIFEST_KEY,
            generated_utc=manifest.get("generated_utc"),
            dataset=manifest.get("dataset") or {},
            segmentation_tool=manifest.get("segmentation_tool") or {},
            mesh_method=manifest.get("mesh_method"),
            cases=cases,
        )
    except ValidationError as exc:
        # Log where the manifest is wrong, never the values (they include pre-signed URLs).
        where = sorted({".".join(str(part) for part in error["loc"]) for error in exc.errors()})
        logger.warning("%s failed validation at %s", MANIFEST_KEY, ", ".join(where[:10]))
        raise HTTPException(status_code=502, detail=f"{MANIFEST_KEY} is not a valid bone manifest.") from exc
