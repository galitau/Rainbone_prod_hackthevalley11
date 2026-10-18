"""Runtime configuration shared by the explanation chain and the simulation history.

Values come from backend/.env when it exists and python-dotenv is installed, overridden by the
process environment. Values are never logged.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def runtime_env() -> dict[str, str]:
    """backend/.env (when present and python-dotenv is installed), overridden by the process environment."""
    env: dict[str, str] = {}
    try:
        from dotenv import dotenv_values
    except ImportError:
        dotenv_values = None
    if dotenv_values is not None and (BACKEND_DIR / ".env").is_file():
        env.update({k: v for k, v in dotenv_values(BACKEND_DIR / ".env").items() if v is not None})
    env.update(os.environ)
    return env
