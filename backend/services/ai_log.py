"""AI audit log in TimescaleDB (Tiger Cloud): the ai_analyses hypertable (migrations/002_ai_analyses.sql).

POST /api/risk-analysis, POST /api/explain and POST /api/ask call record_answer() once for every answer a model or the
template produced: endpoint, case, provider and model, the fallbacks taken before it, the latency, where its
facts were read from (the grounding store) and the sha256 of the facts and of the text. The text, the
facts, keys and URLs are not stored. An answer risk-analysis kept and serves again is not logged again: it
still carries the id of the row written when it was produced.

The database is DATABASE_URL, as for the simulation history (services.history), and the schema is applied
by the same command, `python -m services.history migrate`, which runs every migration file in order.
record_answer() returns {"id": "<uuid>", "store": "tiger"} once the row is written, and None when
DATABASE_URL is unset or the write fails; a failure is logged with the password masked and never breaks
the answer. GET /api/ai-log reads the latest rows back through fetch_ai_log().

The answer waits for its row, so the write is bounded: a LOG_CONNECT_TIMEOUT_S connection, a statement
timeout, and at most LOG_WAIT_S in all. After a failure or a timeout the log is skipped for SKIP_AFTER_FAILURE_S,
so a slow or unreachable database costs one answer that wait rather than every answer. An answer whose row
was not written is kept for at most MISSED_LOG_TTL_S (kept_for()), so a later one is logged once Tiger is back.
A fallback's reason is stored without the rejected fragment the checker quotes ("rejected: blocked wording").
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import threading
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
TOOL_NAMES = frozenset({"get_patient_facts", "compare_with_cohort", "get_fea_result", "get_page_guide", "get_dataset_info"})
INSERT_TOOLS_SQL = (f"INSERT INTO ai_analyses ({', '.join(_WRITTEN)}, tools_used) "
                    f"VALUES ({', '.join(f'%({name})s' for name in _WRITTEN)}, %(tools_used)s)")
# Missing JSON object keys yield null, so reads also work before migration 003 is applied.
SELECT_SQL = (f"SELECT {', '.join(COLUMNS)}, "
              "COALESCE(to_jsonb(ai_analyses)->'tools_used', '[]'::jsonb) AS tools_used "
              "FROM ai_analyses ORDER BY time DESC LIMIT %s")

Connect = Callable[[str], Any]

LOG_CONNECT_TIMEOUT_S = 2  # libpq's minimum
LOG_STATEMENT_TIMEOUT_MS = 1500
LOG_WAIT_S = 2.5
SKIP_AFTER_FAILURE_S = 60.0
MISSED_LOG_TTL_S = 60.0
# SET LOCAL lasts for this transaction only, which a transaction-mode connection pooler also accepts.
SET_TIMEOUT_SQL = f"SET LOCAL statement_timeout = {LOG_STATEMENT_TIMEOUT_MS}"
# check() reasons quote what they rejected ("rejected: blocked wording: 'will'"); the log keeps the category only.
_REJECT_DETAIL = re.compile(r"(rejected: [^:]+): .*", re.S)

_skip_until = 0.0
_skip_lock = threading.Lock()


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


def stored_reason(reason: str) -> str:
    """A fallback's reason without the text fragment a checker rejection quotes."""
    return _REJECT_DETAIL.sub(r"\1", reason)


def _connect(url: str):
    import psycopg

    return psycopg.connect(url, connect_timeout=LOG_CONNECT_TIMEOUT_S)


def _skipping() -> bool:
    with _skip_lock:
        return time.monotonic() < _skip_until


def _skip_for_a_while() -> None:
    global _skip_until
    with _skip_lock:
        _skip_until = time.monotonic() + SKIP_AFTER_FAILURE_S


def reset_skip() -> None:
    """Try the database again at once (tests)."""
    global _skip_until
    with _skip_lock:
        _skip_until = 0.0


def kept_for(ttl_s: float, logged: Optional["Logged"], env: Mapping[str, str]) -> float:
    """How long to keep an answer: at most MISSED_LOG_TTL_S when DATABASE_URL is set but its row was not written."""
    return ttl_s if logged is not None or database_url(env) is None else min(ttl_s, MISSED_LOG_TTL_S)


def record_answer(env: Mapping[str, str], *, endpoint: str, case_id: Optional[str], provider: str,
                  model: Optional[str], facts_json: str, text: str, latency_ms: float,
                  grounding_store: Optional[str], fallbacks: Iterable[Mapping[str, str]],
                  connect: Optional[Connect] = None, tools_used: Iterable[str] = ()) -> Optional[Logged]:
    """Write one ai_analyses row. Never raises: None when DATABASE_URL is unset, the write fails, or a write
    failed less than SKIP_AFTER_FAILURE_S ago."""
    url = database_url(env)
    if url is None or _skipping():
        return None
    raw_names = list(tools_used)
    if len(raw_names) > 4 or any(not isinstance(name, str) or name not in TOOL_NAMES for name in raw_names):
        log.warning("AI answer not logged (invalid tool metadata)")
        return None
    names = list(dict.fromkeys(raw_names))
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
            "fallbacks": Jsonb([{"provider": f["provider"], "reason": stored_reason(f["reason"])}
                                for f in fallbacks]),
        }
        if names:
            params["tools_used"] = Jsonb(names)
        with (connect or _connect)(url) as conn:
            conn.execute(SET_TIMEOUT_SQL)
            conn.execute(INSERT_TOOLS_SQL if names else INSERT_SQL, params)
    except Exception as exc:  # noqa: BLE001 - a failed log must never fail the answer it describes
        _skip_for_a_while()
        log.warning("AI answer not logged (%s); the answer is unaffected, the log is skipped for %.0f s",
                    history._describe(exc, url), SKIP_AFTER_FAILURE_S)
        return None
    return Logged(id=str(row_id))


async def log_answer(env: Mapping[str, str], endpoint: str, case_id: Optional[str], answer: Any, facts_json: str,
                     started: float, grounding: Any, *, tools_used: Iterable[str] = ()) -> Optional[Logged]:
    """record_answer() for a RiskResponse or ExplainResponse, in a worker thread since psycopg blocks, waiting at
    most LOG_WAIT_S. `started` is the request's time.perf_counter(); `grounding` a clinical_store.Grounding or None."""
    write = asyncio.to_thread(
        record_answer, env, endpoint=endpoint, case_id=case_id, provider=answer.provider, model=answer.model,
        facts_json=facts_json, text=answer.text, latency_ms=(time.perf_counter() - started) * 1000.0,
        grounding_store=None if grounding is None else grounding.store,
        fallbacks=[f.model_dump() for f in answer.fallbacks], tools_used=tools_used)
    try:
        return await asyncio.wait_for(write, timeout=LOG_WAIT_S)
    except asyncio.TimeoutError:
        _skip_for_a_while()
        log.warning("AI answer not logged (no reply in %.1f s); the answer is unaffected, the log is skipped for "
                    "%.0f s", LOG_WAIT_S, SKIP_AFTER_FAILURE_S)
        return None


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
        names = row.get("tools_used") or []
        if isinstance(names, str):
            names = json.loads(names)
        names = [name for name in names if isinstance(name, str) and name in TOOL_NAMES][:4] if isinstance(names, list) else []
        out.append({**{name: row.get(name) for name in COLUMNS}, "fallbacks": fallbacks or [], "tools_used": names})
    return out
