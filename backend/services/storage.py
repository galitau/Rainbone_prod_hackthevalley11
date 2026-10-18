from __future__ import annotations

import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from services.settings import runtime_env


def _env(env: dict[str, str], *names: str) -> str:
    for name in names:
        if env.get(name):
            return env[name]
    return ""


def _settings() -> tuple[str, str]:
    env = runtime_env()
    bucket_path = _env(env, "VULTR_BUCKET_PATH", "bucket_path") or "rainbowbone-bones/therapy"
    bucket_path = bucket_path.strip("/")
    bucket, _, prefix = bucket_path.partition("/")
    if not bucket or not prefix:
        raise RuntimeError("VULTR_BUCKET_PATH must contain a bucket and prefix.")
    return bucket, prefix


def _client():
    env = runtime_env()
    endpoint = _env(env, "VULTR_ENDPOINT_URL", "endpoint_url", "ENDPOINT_URL")
    if not endpoint:
        raise RuntimeError("VULTR_ENDPOINT_URL is not configured.")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=_env(env, "AWS_ACCESS_KEY_ID", "aws_access_key_id"),
        aws_secret_access_key=_env(env, "AWS_SECRET_ACCESS_KEY", "aws_secret_access_key"),
        region_name=_env(env, "AWS_DEFAULT_REGION", "aws_default_region") or "us-east-1",
    )


def read_object_bytes(filename: str) -> bytes:
    bucket, prefix = _settings()
    try:
        response = _client().get_object(Bucket=bucket, Key=f"{prefix}/{filename}")
        return response["Body"].read()
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Could not read progression object {filename}.") from exc


def write_object_bytes(filename: str, payload: bytes, content_type: str = "application/octet-stream") -> None:
    bucket, prefix = _settings()
    try:
        _client().put_object(
            Bucket=bucket,
            Key=f"{prefix}/{filename}",
            Body=payload,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Could not upload progression object {filename}.") from exc

def read_json_object(filename: str) -> dict[str, Any]:
    try:
        payload = json.loads(read_object_bytes(filename))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Progression object {filename} is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"Progression object {filename} must contain a JSON object.")
    return payload


def read_lesion_coordinates() -> dict[str, list[float]]:
    coordinates: dict[str, list[float]] = {}
    for label, filename in (("baseline", "006f52e910_BL_00.json"), ("followup", "006f52e910_FU_00.json")):
        payload = read_json_object(filename)
        try:
            point = payload["points"][0]["point"]
            values = [float(value) for value in point]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise RuntimeError(f"Progression object {filename} has no valid points[0].point coordinates.") from exc
        if len(values) != 3 or not all(map(lambda value: value == value and abs(value) != float("inf"), values)):
            raise RuntimeError(f"Progression object {filename} must contain three finite coordinates.")
        coordinates[label] = values
    return coordinates
