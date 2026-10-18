"""The research data the AI endpoints word, read from Vultr Object Storage with a bundled backup copy.

POST /api/risk-analysis reads the HFValid table and POST /api/explain (with a case_id) reads the femur
model's manifest through get_clinical_json(). Both files are de-identified public research data
(HFValid, CC BY 4.0), not patient records. scripts/vultr_pipeline/publish_clinical.py uploads them as
private objects under clinical/ in the VULTR_S3_BUCKET bucket, with clinical/index.json listing each
file's key, sha256, size, licence and source.

get_clinical_json(name) returns (data, grounding):

1. it reads clinical/index.json and the entry for `name`;
2. the entry's sha256 must equal the sha256 pinned in this repository next to the bundled copy
   (`<file>.sha256`), so a changed or tampered bucket cannot change the facts silently;
3. the object's bytes must hash to that sha256 and parse as JSON.

Then grounding is {"store": "vultr-object-storage", "key", "sha256", "verified": true}. Any failure
(VULTR_S3_* not set, boto3 missing, network, 403/404, a hash or size mismatch, bad JSON) falls back to
the bundled copy with {"store": "local-backup", "reason", "key", "sha256", "verified"}, where verified
says whether the bundled copy matches its pin. A bundled copy that is missing or not JSON raises
ClinicalDataUnavailable.

Answers are kept in memory: a bucket read for CACHE_TTL_S, a fallback for FALLBACK_TTL_S, so an outage
costs one request its timeout rather than every request. The cache is keyed by file and bucket, and
only names in CATALOGUE are accepted, so it stays bounded.

Settings come from runtime_env() (process environment over backend/.env). Credentials, the endpoint,
the bucket name and signed URLs are never logged or returned: a reason names an error code only.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Optional
from urllib.parse import urlparse

from pydantic import BaseModel

from services.settings import runtime_env

log = logging.getLogger("rainbowbone.clinical")

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO_ROOT / "frontend" / "public" / "models"
ENV_VARS = ("VULTR_S3_ENDPOINT", "VULTR_S3_ACCESS_KEY", "VULTR_S3_SECRET_KEY", "VULTR_S3_BUCKET")
PREFIX = "clinical/"
INDEX_KEY = PREFIX + "index.json"
CACHE_TTL_S = 600.0
FALLBACK_TTL_S = 60.0
MAX_OBJECT_BYTES = 4 << 20  # the files are tens of kB; a bigger object is not one of them
# A slow or unreachable bucket must not hold up an answer for long: the bundled copy is a fallback away.
CONNECT_TIMEOUT_S = 3
READ_TIMEOUT_S = 5

LICENCE = "CC BY 4.0"
DATA_NOTE = "de-identified public research data, not patient records"
SOURCE = {
    "citation": "Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025). HFValid collection. "
                "University of Bologna.",
    "doi": "10.6092/unibo/amsacta/8431",
    "url": "https://amsacta.unibo.it/id/eprint/8431/",
}


@dataclass(frozen=True)
class ClinicalFile:
    name: str
    key: str
    local: Path  # the bundled copy; its pin is local.with_name(local.name + ".sha256")
    description: str

    @property
    def pin_path(self) -> Path:
        return self.local.with_name(self.local.name + ".sha256")


CATALOGUE: dict[str, ClinicalFile] = {
    f.name: f for f in (
        ClinicalFile(
            "hfvalid-risk", PREFIX + "hfvalid/hfvalid-risk.json", MODELS_DIR / "hfvalid-risk.json",
            "Age, ARF0, MSF and recorded hip-fracture follow-up of each HFValid subject, from the dataset's "
            "published metadata (scripts/bone_fea/build_risk_table.py), with sideways-fall forces from "
            "van den Kroonenberg et al. 1995. Read by POST /api/risk-analysis."),
        ClinicalFile(
            "pat001-femur-manifest", PREFIX + "hfvalid/pat001-femur-manifest.json",
            MODELS_DIR / "hfvalid-femur" / "manifest.json",
            "Manifest of our finite-element model of HFValid subject Pat001's femur (scripts/bone_fea): source "
            "files and their sha256, mesh, load and solved numbers. Read by POST /api/explain with case_id Pat001."),
    )
}


class ClinicalDataUnavailable(RuntimeError):
    """Neither the bucket nor the bundled copy gave usable data."""


class Grounding(BaseModel):
    """Where the facts of an AI answer were read from."""

    store: Literal["vultr-object-storage", "local-backup"]
    key: str
    sha256: str
    verified: bool
    reason: Optional[str] = None


class _Fallback(Exception):
    """The bucket read failed; the message is the reason shown with the bundled copy."""


# ----------------------------------------------------------------------------- pins and index
def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pinned_sha256(entry: ClinicalFile) -> str:
    """The sha256 in `<file>.sha256` (sha256sum format: '<hex>  <name>')."""
    text = entry.pin_path.read_text(encoding="utf-8").split()
    if not text or len(text[0]) != 64 or any(c not in "0123456789abcdef" for c in text[0]):
        raise ValueError(f"{entry.pin_path.name} holds no sha256")
    return text[0]


def index_entry(entry: ClinicalFile, data: bytes) -> dict[str, Any]:
    return {
        "key": entry.key,
        "sha256": sha256_bytes(data),
        "bytes": len(data),
        "content_type": "application/json",
        "licence": LICENCE,
        "source": dict(SOURCE),
        "data": DATA_NOTE,
        "description": entry.description,
    }


def build_index(files: Mapping[str, bytes]) -> bytes:
    """clinical/index.json for these files (name -> bytes). Deterministic: no timestamps, sorted keys."""
    index = {
        "description": "Research data the RainbowBone AI endpoints read: " + DATA_NOTE + ".",
        "data": DATA_NOTE,
        "licence": LICENCE,
        "source": dict(SOURCE),
        "files": {name: index_entry(CATALOGUE[name], data) for name, data in sorted(files.items())},
    }
    return (json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


# ----------------------------------------------------------------------------- bucket
def s3_settings(env: Mapping[str, str]) -> Optional[dict[str, str]]:
    """The four VULTR_S3_* values, or None when any is unset."""
    values = {name: (env.get(name) or "").strip() for name in ENV_VARS}
    if not all(values.values()):
        return None
    endpoint = values["VULTR_S3_ENDPOINT"]
    return {
        "endpoint": endpoint if "://" in endpoint else "https://" + endpoint,
        "access_key": values["VULTR_S3_ACCESS_KEY"],
        "secret_key": values["VULTR_S3_SECRET_KEY"],
        "bucket": values["VULTR_S3_BUCKET"],
    }


def make_client(settings: Mapping[str, str]):
    """A boto3 S3 client for Vultr, as backend/routes_bones.py builds it, with short timeouts. Each client gets its
    own session: the two AI routes may build one at the same time in worker threads, and boto3's default session
    is not safe to share for that."""
    import boto3.session
    from botocore.config import Config

    host = urlparse(settings["endpoint"]).hostname or ""
    # Vultr's boto3 guide uses the first label of the hostname (e.g. ewr1) as the region.
    region = host.split(".")[0] if host.endswith(".vultrobjects.com") else "us-east-1"
    return boto3.session.Session().client(
        "s3",
        endpoint_url=settings["endpoint"],
        region_name=region,
        aws_access_key_id=settings["access_key"],
        aws_secret_access_key=settings["secret_key"],
        config=Config(signature_version="s3v4", connect_timeout=CONNECT_TIMEOUT_S, read_timeout=READ_TIMEOUT_S,
                      retries={"max_attempts": 2, "mode": "standard"}),
    )


def describe_client_error(exc) -> str:
    """'403 AccessDenied' from a botocore ClientError: the HTTP status and error code, never its message, which
    can name the bucket."""
    status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    code = exc.response.get("Error", {}).get("Code")
    return " ".join(str(part) for part in dict.fromkeys(str(p) for p in (status, code) if p)) or "an error"


def _get(client, bucket: str, key: str) -> bytes:
    """The object's bytes. Raises _Fallback naming only the error code."""
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        body = client.get_object(Bucket=bucket, Key=key)["Body"]
        data = body.read(MAX_OBJECT_BYTES + 1)
    except ClientError as exc:
        raise _Fallback(f"object storage answered {describe_client_error(exc)} for {key}") from None
    except BotoCoreError as exc:  # connection, timeout, endpoint: the type is enough
        raise _Fallback(f"object storage unreachable ({type(exc).__name__})") from None
    if len(data) > MAX_OBJECT_BYTES:
        raise _Fallback(f"{key} is larger than {MAX_OBJECT_BYTES:,} bytes")
    return data


def _read_bucket(entry: ClinicalFile, pin: str, env: Mapping[str, str], client=None) -> tuple[Any, Grounding]:
    settings = s3_settings(env)
    if settings is None:
        raise _Fallback("object storage not configured (VULTR_S3_* not set)")
    if client is None:
        try:
            client = make_client(settings)
        except ImportError:
            raise _Fallback("boto3 is not installed") from None
        except ValueError:  # botocore rejects the endpoint URL; its message is not echoed
            raise _Fallback("VULTR_S3_ENDPOINT is not a valid URL") from None
    try:
        listed = json.loads(_get(client, settings["bucket"], INDEX_KEY))["files"][entry.name]
        listed_sha, listed_bytes = str(listed["sha256"]), int(listed["bytes"])
        if listed["key"] != entry.key:
            raise _Fallback(f"{INDEX_KEY} lists {entry.name} under another key")
    except (ValueError, KeyError, TypeError):
        raise _Fallback(f"{INDEX_KEY} has no usable entry for {entry.name}") from None
    if listed_sha != pin:
        raise _Fallback(f"{INDEX_KEY} sha256 for {entry.key} is not the one pinned in the repository")
    data = _get(client, settings["bucket"], entry.key)
    if len(data) != listed_bytes or sha256_bytes(data) != pin:
        raise _Fallback(f"{entry.key} does not match its pinned sha256")
    try:
        parsed = json.loads(data)
    except ValueError:
        raise _Fallback(f"{entry.key} is not valid JSON") from None
    return parsed, Grounding(store="vultr-object-storage", key=entry.key, sha256=pin, verified=True)


def _read_local(entry: ClinicalFile, pin: Optional[str], reason: str) -> tuple[Any, Grounding]:
    try:
        data = entry.local.read_bytes()
        parsed = json.loads(data)
    except (OSError, ValueError) as exc:
        raise ClinicalDataUnavailable(f"{entry.name}: bundled copy unreadable ({type(exc).__name__})") from None
    digest = sha256_bytes(data)
    if digest != pin:
        log.warning("clinical: bundled %s does not match its pin", entry.name)
    return parsed, Grounding(store="local-backup", key=entry.key, sha256=digest, verified=digest == pin,
                             reason=reason)


# ----------------------------------------------------------------------------- cache and entry point
_cache: dict[tuple[str, Optional[str], Optional[str]], tuple[float, Any, Grounding]] = {}
_cache_lock = threading.Lock()


def _now() -> float:
    return time.monotonic()


def reset_cache() -> None:
    with _cache_lock:
        _cache.clear()


def get_clinical_json(name: str, env: Optional[Mapping[str, str]] = None, *, client=None) -> tuple[Any, Grounding]:
    """The parsed JSON of catalogue file `name` and where it came from. Never raises for a bucket problem;
    raises KeyError for an unknown name and ClinicalDataUnavailable when the bundled copy is unusable too.

    The data is shared between callers through the cache: treat it as read-only."""
    entry = CATALOGUE[name]
    e = runtime_env() if env is None else env
    settings = s3_settings(e)
    cache_key = (name, settings and settings["endpoint"], settings and settings["bucket"])
    with _cache_lock:
        kept = _cache.get(cache_key)
    if kept is not None and _now() < kept[0]:
        return kept[1], kept[2]
    try:
        pin: Optional[str] = pinned_sha256(entry)
    except (OSError, ValueError):
        pin = None
    try:
        if pin is None:
            raise _Fallback(f"no sha256 pinned for {entry.key}")
        data, grounding = _read_bucket(entry, pin, e, client)
        ttl = CACHE_TTL_S
    except Exception as exc:  # noqa: BLE001 - whatever the bucket does, the bundled copy answers
        reason = str(exc) if isinstance(exc, _Fallback) else f"object storage read failed ({type(exc).__name__})"
        log.warning("clinical: %s read from the bundled copy: %s", name, reason)
        data, grounding = _read_local(entry, pin, reason)
        ttl = FALLBACK_TTL_S
    with _cache_lock:
        _cache[cache_key] = (_now() + ttl, data, grounding)
    return data, grounding
