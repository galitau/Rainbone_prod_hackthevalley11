#!/usr/bin/env python3
"""Upload the research data the AI endpoints read to Vultr Object Storage, under clinical/.

    clinical/hfvalid/hfvalid-risk.json           <- frontend/public/models/hfvalid-risk.json
    clinical/hfvalid/pat001-femur-manifest.json  <- frontend/public/models/hfvalid-femur/manifest.json
    clinical/index.json                          key, sha256, bytes, licence, source and DOI of each file

All of it is de-identified public research data (HFValid, CC BY 4.0), not patient records. The objects
are private (ACL private): backend/services/clinical_store.py reads them with the bucket's keys and checks
each one against clinical/index.json and against the sha256 pinned next to the bundled copy in this
repository (<file>.sha256). A file that does not match its pin is refused here, since the backend would
refuse it too.

The upload is deterministic (the index holds no timestamps) and skips objects whose sha256 metadata
already matches. Every object is then read back and its sha256 checked. --dry-run prints the plan without
contacting the bucket and needs no credentials.

Credentials come only from VULTR_S3_ENDPOINT, VULTR_S3_ACCESS_KEY, VULTR_S3_SECRET_KEY and
VULTR_S3_BUCKET in the environment. Neither they nor the endpoint or the bucket name are printed. Run from
the repository root with the backend's Python environment (this script imports
backend/services/clinical_store.py, which defines the files and the index):

    python scripts/vultr_pipeline/publish_clinical.py --dry-run
    python scripts/vultr_pipeline/publish_clinical.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from services.clinical_store import (CATALOGUE, ENV_VARS, INDEX_KEY, build_index,  # noqa: E402
                                     describe_client_error, make_client, pinned_sha256, s3_settings, sha256_bytes)

CONTENT_TYPE = "application/json"


class PublishError(Exception):
    """A failure main() prints without a traceback (exit code 1)."""


class ConfigError(PublishError):
    """Missing configuration (exit code 2)."""


@dataclass(frozen=True)
class Item:
    key: str
    data: bytes

    @property
    def sha256(self) -> str:
        return sha256_bytes(self.data)


def plan() -> list[Item]:
    """The objects to upload: each catalogue file, checked against its pin, then clinical/index.json."""
    files: dict[str, bytes] = {}
    for name, entry in sorted(CATALOGUE.items()):
        rel = entry.local.relative_to(REPO_ROOT).as_posix()
        try:
            data = entry.local.read_bytes()
            json.loads(data)
        except (OSError, ValueError) as exc:
            raise PublishError(f"{rel} is not readable JSON ({type(exc).__name__})") from None
        try:
            pin = pinned_sha256(entry)
        except (OSError, ValueError) as exc:
            raise PublishError(f"{entry.pin_path.relative_to(REPO_ROOT).as_posix()}: no pinned sha256 "
                               f"({type(exc).__name__})") from None
        if sha256_bytes(data) != pin:
            raise PublishError(f"{rel} does not match the sha256 pinned in {entry.pin_path.name}; update the pin "
                               "deliberately (it is what the backend trusts) before publishing")
        files[name] = data
    items = [Item(CATALOGUE[name].key, data) for name, data in files.items()]
    items.append(Item(INDEX_KEY, build_index(files)))  # last, so it never lists an object that is not there yet
    return items


def upload(client, bucket: str, items: list[Item]) -> list[dict[str, Any]]:
    """Put each item as a private object with its sha256 in metadata, unless it already matches; then read
    every object back and check its sha256."""
    from botocore.exceptions import ClientError

    results = []
    for item in items:
        try:
            head = client.head_object(Bucket=bucket, Key=item.key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
                raise
            head = None
        if head is not None and head.get("Metadata", {}).get("sha256") == item.sha256:
            action = "unchanged"
        else:
            client.put_object(Bucket=bucket, Key=item.key, Body=item.data, ContentType=CONTENT_TYPE, ACL="private",
                              Metadata={"sha256": item.sha256})
            action = "uploaded"
        stored = client.get_object(Bucket=bucket, Key=item.key)["Body"].read()
        if sha256_bytes(stored) != item.sha256:
            raise PublishError(f"{item.key}: the stored object does not match its sha256 after the upload")
        results.append({"key": item.key, "sha256": item.sha256, "bytes": len(item.data), "action": action,
                        "verified": True})
    return results


def publish(env: Mapping[str, str], *, dry_run: bool = False, client=None) -> dict[str, Any]:
    items = plan()
    if dry_run:
        return {"dry_run": True, "private": True,
                "objects": [{"key": i.key, "sha256": i.sha256, "bytes": len(i.data)} for i in items]}
    settings = s3_settings(env)
    if settings is None:
        missing = [name for name in ENV_VARS if not (env.get(name) or "").strip()]
        raise ConfigError("Missing environment variable(s): " + ", ".join(missing)
                          + " (names in scripts/vultr_pipeline/.env.example), or pass --dry-run.")
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        client = client or make_client(settings)
        return {"dry_run": False, "private": True, "objects": upload(client, settings["bucket"], items)}
    except ClientError as exc:
        raise PublishError(f"object storage answered {describe_client_error(exc)}") from None
    except BotoCoreError as exc:
        raise PublishError(f"object storage request failed ({type(exc).__name__})") from None
    except ValueError:  # botocore rejects the endpoint URL; its message is not echoed
        raise ConfigError("VULTR_S3_ENDPOINT is not a valid URL") from None


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="print the objects and their sha256; upload nothing")
    args = parser.parse_args(argv)
    try:
        summary = publish(os.environ, dry_run=args.dry_run)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except PublishError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
