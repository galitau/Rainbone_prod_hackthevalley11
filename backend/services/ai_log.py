"""AI audit log in TimescaleDB (Tiger Cloud): the ai_analyses hypertable (migrations/002_ai_analyses.sql).

POST /api/risk-analysis and POST /api/explain call record_answer() once for every answer a model or the
template produced: endpoint, case, provider and model, the fallbacks taken before it, the latency, where its
facts were read from (the grounding store) and the sha256 of the facts and of the text. The text, the
facts, keys and URLs are not stored. An answer risk-analysis kept and serves again is not logged again: it
still carries the id of the row written when it was produced.

The database is DATABASE_URL, as for the simulation history (services.history), and the schema is applied
by the same command, `python -m services.history migrate`, which runs every migration file in order.
record_answer() returns {"id": "<uuid>", "store": "tiger"} once the row is written, and None when
DATABASE_URL is unset or the write fails; a failure is logged with the password masked and never breaks
the answer. GET /api/ai-log reads the latest rows back through fetch_ai_log().
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Callable, Iterable, Literal, Mapping, Optional
from uuid import uuid4

from pydantic import BaseModel

from services import history

log = logging.getLogger("rainbowbone.ai_log")

COLUMNS = ("time", "id", "endpoint", "case_id", "provider", "model", "facts_sha256", "text_sha256", "latency_ms",
           "grounding_store", "fallbacks")
_WRITTEN = COLUMNS[1:]  # time is the database's now()
INSERT_SQL = (f"INSERT INTO ai_analyses ({', '.join(_WRITTEN)}) "
              f"VALUES ({', '.join(f'%({name})s' for name in _WRITTEN)})")
SELECT_SQL = f"SELECT {', '.join(COLUMNS)} FROM ai_analyses ORDER BY time DESC LIMIT %s"

Connect = Callable[[str], Any]


class Logged(BaseModel):
    """The ai_analyses row an answer was logged as."""

    id: str
    store: Literal["tiger"] = "tiger"


class AiLogUnavailable(RuntimeError):
    """The log cannot be read: DATABASE_URL is unset, the database is unreachable, or the table is missing."""


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def database_url(env: Mapping[str, str]) -> Optional[str]:
    return (env.get(history.DATABASE_URL_ENV) or "").strip() or None


def record_answer(env: Mapping[str, str], *, endpoint: str, case_id: Optional[str], provider: str,
                  model: Optional[str], facts_json: str, text: str, latency_ms: float,
                  grounding_store: Optional[str], fallbacks: Iterable[Mapping[str, str]],
                  connect: Optional[Connect] = None) -> Optional[Logged]:
    """Write one ai_analyses row. Never raises: None when DATABASE_URL is unset or the write fails."""
    url = database_url(env)
    if url is None:
        return None
    row_id = uuid4()
    try:
        from psycopg.types.json import Jsonb

        params = {
            "id": row_id,
            "endpoint": endpoint,
            "case_id": case_id,
            "provider": provider,
            "model": model,
            "facts_sha256": sha256_text(facts_json),
            "text_sha256": sha256_text(text),
            "latency_ms": max(0.0, float(latency_ms)),
            "grounding_store": grounding_store,
            "fallbacks": Jsonb([{"provider": f["provider"], "reason": f["reason"]} for f in fallbacks]),
        }
        with (connect or history._connect)(url) as conn:
            conn.execute(INSERT_SQL, params)
    except Exception as exc:  # noqa: BLE001 - a failed log must never fail the answer it describes
        log.warning("AI answer not logged (%s); the answer is unaffected", history._describe(exc, url))
        return None
    return Logged(id=str(row_id))


async def log_answer(env: Mapping[str, str], endpoint: str, case_id: Optional[str], answer: Any, facts_json: str,
                     started: float, grounding: Any) -> Optional[Logged]:
    """record_answer() for a RiskResponse or ExplainResponse, in a worker thread since psycopg blocks.
    `started` is the request's time.perf_counter(); `grounding` a clinical_store.Grounding or None."""
    return await asyncio.to_thread(
        record_answer, env, endpoint=endpoint, case_id=case_id, provider=answer.provider, model=answer.model,
        facts_json=facts_json, text=answer.text, latency_ms=(time.perf_counter() - started) * 1000.0,
        grounding_store=None if grounding is None else grounding.store,
        fallbacks=[f.model_dump() for f in answer.fallbacks])


def fetch_ai_log(env: Mapping[str, str], limit: int, *, connect: Optional[Connect] = None) -> list[dict[str, Any]]:
    """The latest `limit` rows, newest first. Raises AiLogUnavailable with a message fit for the client."""
    url = database_url(env)
    if url is None:
        raise AiLogUnavailable("The AI log is not configured: set DATABASE_URL to a TimescaleDB connection string "
                               "(see backend/README.md).")
    try:
        import psycopg
    except ImportError as exc:
        raise AiLogUnavailable("The AI log needs psycopg. Install backend/requirements.txt.") from exc
    try:
        with (connect or history._connect)(url) as conn:
            rows = conn.execute(SELECT_SQL, (limit,)).fetchall()
    except psycopg.errors.UndefinedTable as exc:
        raise AiLogUnavailable("The AI log table does not exist: run `python -m services.history migrate` "
                               "from backend/.") from exc
    except psycopg.Error as exc:
        log.warning("AI log unavailable (%s)", history._describe(exc, url))
        raise AiLogUnavailable("The AI log database is unavailable.") from exc
    out = []
    for row in rows:
        fallbacks = row.get("fallbacks")
        if isinstance(fallbacks, str):  # jsonb normally arrives parsed; a text cast would not
            fallbacks = json.loads(fallbacks)
        out.append({**{name: row.get(name) for name in COLUMNS}, "fallbacks": fallbacks or []})
    return out
