"""Simulation history in TimescaleDB (Tiger Data).

Every new successful solver execution is saved as one row of the ``simulation_runs`` hypertable
(``migrations/001_simulation_runs.sql``); ``GET /api/history`` reads it back. Cache hits reuse its UUID and add no row.

Configuration is one variable, ``DATABASE_URL``: a PostgreSQL connection string for a database with
TimescaleDB, read from the process environment or backend/.env (process environment wins). Without it nothing is saved and history is reported as unavailable; the
simulation itself never depends on the database. The schema is applied only by an explicit command,
run from ``backend/``::

    python -m services.history migrate

psycopg is imported inside the functions that use it, so the API still starts (and simulates) in an
environment where it is not installed.
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from functools import lru_cache
from importlib import metadata
from pathlib import Path
from typing import Any, Callable, Literal, Mapping, Optional
from uuid import uuid4
from urllib.parse import quote

from services.settings import runtime_env

log = logging.getLogger("rainbowbone.history")

DATABASE_URL_ENV = "DATABASE_URL"
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
CONNECT_TIMEOUT_SECONDS = 5
MIGRATION_LOCK_ID = 0x5242_4831  # arbitrary constant; serialises concurrent `migrate` runs
Persistence = Literal["pending", "saved", "unavailable"]
_save_states: "OrderedDict[str, Persistence]" = OrderedDict()
_save_states_lock = threading.Lock()
SAVE_STATE_MAX = 256


def _set_save_state(run_id: str, state: Persistence) -> Persistence:
    with _save_states_lock:
        _save_states[str(run_id)] = state
        _save_states.move_to_end(str(run_id))
        while len(_save_states) > SAVE_STATE_MAX:
            _save_states.popitem(last=False)
    return state


def prepare_run_persistence(run_id: str) -> Persistence:
    return _set_save_state(run_id, "pending" if database_url() else "unavailable")


def persistence_for_run(run_id: str) -> Persistence:
    with _save_states_lock:
        return _save_states.get(str(run_id), "unavailable")

# The function whose output is stored, and the installed packages its pipeline imports.
SOLVER = "services.fea_solver.simulate_fea"
SOLVER_PACKAGES = ("nibabel", "numpy", "scipy", "sfepy")

# SimulationResponse fields, in table column order.
RESULT_COLUMNS = (
    "source_filename",
    "max_von_mises_stress_mpa",
    "average_youngs_modulus_gpa",
    "bone_volume_cm3",
    "fracture_risk_index_percent",
    "load_newtons",
    "mesh_vertices",
    "mesh_faces",
)
RUN_COLUMNS = ("time", "run_id", *RESULT_COLUMNS, "solver", "solver_versions", "solve_ms")

INSERT_SQL = (
    f"INSERT INTO simulation_runs (run_id, {', '.join(RESULT_COLUMNS)}, solver, solver_versions, solve_ms) "
    f"VALUES (%(run_id)s, {', '.join(f'%({name})s' for name in RESULT_COLUMNS)}, "
    "%(solver)s, %(solver_versions)s, %(solve_ms)s)"
)
RUNS_SQL = f"SELECT {', '.join(RUN_COLUMNS)} FROM simulation_runs ORDER BY time DESC LIMIT %s"
FILTERED_RUNS_SQL = (
    f"SELECT {', '.join(RUN_COLUMNS)} FROM simulation_runs "
    "WHERE source_filename = %s ORDER BY time DESC LIMIT %s"
)
RUN_ID_SQL = f"SELECT {', '.join(RUN_COLUMNS)} FROM simulation_runs WHERE run_id = %s ORDER BY time DESC LIMIT 1"
HOURLY_SQL = (
    "SELECT bucket, runs, avg_max_von_mises_stress_mpa, max_max_von_mises_stress_mpa "
    "FROM simulation_runs_hourly ORDER BY bucket DESC LIMIT %s"
)

Connect = Callable[[str], Any]


class HistoryUnavailable(RuntimeError):
    """History cannot be served: DATABASE_URL is unset, the database is unreachable, or the schema is missing."""


def database_url() -> Optional[str]:
    url = runtime_env().get(DATABASE_URL_ENV, "").strip()
    return url or None


def _connect(url: str):
    import psycopg
    from psycopg.rows import dict_row

    return psycopg.connect(url, connect_timeout=CONNECT_TIMEOUT_SECONDS, row_factory=dict_row,
                          options="-c statement_timeout=3000 -c lock_timeout=1000")


@lru_cache(maxsize=1)
def solver_versions() -> dict[str, Optional[str]]:
    """Installed versions of the packages the simulation pipeline imports (None when not installed)."""
    versions: dict[str, Optional[str]] = {}
    for name in SOLVER_PACKAGES:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def insert_run(conn, result: Mapping[str, Any], solve_ms: Optional[float] = None) -> None:
    """Insert one simulation result. The caller owns the connection and its transaction."""
    from psycopg.types.json import Jsonb

    params = {name: result[name] for name in RESULT_COLUMNS}
    # Which tool made the bone mask ("fsl" or "numpy"), as simulate_fea reports it.
    versions = {**solver_versions(), "segmentation": result.get("segmentation")}
    if result.get("input_sha256"):
        versions["input_sha256"] = result["input_sha256"]
    params.update(run_id=result.get("run_id") or str(uuid4()), solver=SOLVER,
                  solver_versions=Jsonb(versions), solve_ms=solve_ms)
    conn.execute(INSERT_SQL, params)


def save_simulation_run(
    result: Mapping[str, Any],
    solve_ms: Optional[float] = None,
    *,
    connect: Optional[Connect] = None,
) -> bool:
    """Persist one /api/simulate result. Never raises.

    Returns False without connecting when DATABASE_URL is unset, and False after logging a warning when
    the save fails for any reason; a failed save must not fail the simulation that produced it.
    """
    url = database_url()
    if url is None:
        if result.get("run_id"):
            _set_save_state(str(result["run_id"]), "unavailable")
        return False
    try:
        with (connect or _connect)(url) as conn:
            insert_run(conn, result, solve_ms)
    except Exception as exc:  # noqa: BLE001 - any failure here is logged and ignored by design
        if result.get("run_id"):
            _set_save_state(str(result["run_id"]), "unavailable")
        log.warning("simulation history not saved (%s); the simulation result is unaffected",
                    _describe(exc, url))
        return False
    if result.get("run_id"):
        _set_save_state(str(result["run_id"]), "saved")
    return True


def _describe(exc: BaseException, url: str) -> str:
    """Exception type and first message line, with the connection password masked.

    The password is masked where it stands as its own token (":<password>@", "password=<password>",
    or a quoted word), not inside other words, so a short password does not garble the message.
    When the connection string cannot be parsed the message is dropped, since it may quote the string.
    """
    lines = str(exc).strip().splitlines()
    text = lines[0] if lines else ""
    try:
        from psycopg.conninfo import conninfo_to_dict

        password = conninfo_to_dict(url).get("password")
    except Exception:  # noqa: BLE001 - psycopg missing or an unparseable connection string
        return type(exc).__name__
    if password:
        for secret in {str(password), quote(str(password), safe="")}:
            text = re.sub(rf"(?<![A-Za-z0-9]){re.escape(secret)}(?![A-Za-z0-9])", "***", text)
    return f"{type(exc).__name__}: {text}" if text else type(exc).__name__


def series_label(time: datetime) -> str:
    """Chart label for one run, in UTC, e.g. 'Oct 18 02:05:13 UTC'."""
    return time.astimezone(timezone.utc).strftime("%b %d %H:%M:%S UTC")


def query_history(conn, limit: int, source_filename: Optional[str] = None, run_id: Optional[str] = None) -> dict[str, Any]:
    """The latest `limit` runs and hourly buckets, each oldest first."""
    # Filter before limiting so other inputs cannot crowd this input out of history.
    sql, params = ((RUNS_SQL, (limit,)) if source_filename is None else
                   (FILTERED_RUNS_SQL, (source_filename, limit)))
    if run_id is not None:
        sql, params = RUN_ID_SQL, (str(run_id),)
    runs = list(reversed(conn.execute(sql, params).fetchall()))
    # Legacy rows have no content hash; leave that absence explicit. No schema
    # migration is needed: new runs keep the hash in the existing metadata JSONB.
    runs = [{**run, "input_sha256": run.get("solver_versions", {}).get("input_sha256")} for run in runs]
    hourly = list(reversed(conn.execute(HOURLY_SQL, (limit,)).fetchall()))
    series = [{"label": series_label(run["time"]), "value": run["max_von_mises_stress_mpa"]} for run in runs]
    result = {"series": series, "runs": runs, "hourly": hourly}
    if run_id is not None:
        result["persistence"] = "saved" if runs else persistence_for_run(run_id)
        # An earlier successful save is not evidence that a row still exists.
        if not runs and result["persistence"] == "saved":
            result["persistence"] = "unavailable"
    return result


def fetch_history(limit: int, source_filename: Optional[str] = None, *, run_id: Optional[str] = None,
                  connect: Optional[Connect] = None) -> dict[str, Any]:
    """Read history for GET /api/history. Raises HistoryUnavailable with a message fit for the client."""
    url = database_url()
    if url is None:
        raise HistoryUnavailable(
            "Simulation history is not configured: set DATABASE_URL to a TimescaleDB connection string "
            "(see backend/README.md)."
        )
    try:
        import psycopg
    except ImportError as exc:
        raise HistoryUnavailable(
            "Simulation history needs psycopg. Install backend/requirements.txt."
        ) from exc
    try:
        with (connect or _connect)(url) as conn:
            return query_history(conn, limit, source_filename, run_id)
    except psycopg.errors.UndefinedTable as exc:
        raise HistoryUnavailable(
            "Simulation history tables do not exist: run `python -m services.history migrate` from backend/."
        ) from exc
    except psycopg.Error as exc:
        log.warning("simulation history unavailable (%s)", _describe(exc, url))
        raise HistoryUnavailable("Simulation history database is unavailable.") from exc


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    return sorted(path for path in directory.glob("*.sql") if path.is_file())


def apply_migrations(url: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Run every migration file in name order, each in its own transaction. Files must be idempotent."""
    import psycopg

    applied: list[str] = []
    with psycopg.connect(url, autocommit=True, connect_timeout=CONNECT_TIMEOUT_SECONDS) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
        try:
            for path in migration_files(directory):
                with conn.transaction():
                    conn.execute(path.read_text(encoding="utf-8"))
                applied.append(path.name)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))
    return applied


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m services.history",
        description="Simulation history schema. Reads the database from DATABASE_URL.",
    )
    parser.add_argument("command", choices=["migrate"], help="apply backend/migrations/*.sql")
    parser.parse_args(argv)
    url = database_url()
    if url is None:
        print(f"{DATABASE_URL_ENV} is not set", file=sys.stderr)
        return 2
    for name in apply_migrations(url):
        print(f"applied {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
