"""Runtime configuration shared by the explanation chain and the simulation history.

Values come from the repository-root .env and backend/.env when they exist and python-dotenv is
installed, overridden by the process environment. Values are never logged.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def runtime_env() -> dict[str, str]:
    """Load root and backend env files, with backend and process values taking precedence."""
    env: dict[str, str] = {}
    try:
        from dotenv import dotenv_values
    except ImportError:
        dotenv_values = None
    if dotenv_values is not None:
        # The frontend convention is a root .env; backend/.env remains a supported override.
        for env_file in (BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"):
            if env_file.is_file():
                env.update({k: v for k, v in dotenv_values(env_file).items() if v is not None})
    env.update(os.environ)
    return env
