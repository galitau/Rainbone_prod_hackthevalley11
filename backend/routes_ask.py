"""POST /api/ask: process-local, bounded Q&A about server-owned evidence."""
from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict, deque
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from services import ask, clinical_store, explain, risk
from services.settings import runtime_env

router = APIRouter()
RATE_LIMIT = 8
RATE_WINDOW_S = 60
MAX_CLIENTS = 1024
MAX_ACTIVE = 4
_clients: OrderedDict[str, deque] = OrderedDict()
_lock = threading.Lock()
_active = 0


def admit(client: str) -> None:
    """Limit the transport peer, never an arbitrary caller-supplied forwarded header."""
    now = time.monotonic()
    with _lock:
        hits = _clients.setdefault(client, deque())
        _clients.move_to_end(client)
        while hits and hits[0] <= now - RATE_WINDOW_S:
            hits.popleft()
        if len(hits) >= RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many questions. Please try again shortly.",
                                headers={"Retry-After": str(max(1, math.ceil(hits[0] + RATE_WINDOW_S - now)))})
        hits.append(now)
        while len(_clients) > MAX_CLIENTS:
            _clients.popitem(last=False)


@router.post("/api/ask", response_model=ask.AskResponse)
async def ask_rainbone(request: ask.AskRequest, http_request: Request,
                       env: Annotated[dict[str, str], Depends(runtime_env)]) -> ask.AskResponse:
    global _active
    admit(http_request.client.host if http_request.client else "unknown")
    with _lock:
        if _active >= MAX_ACTIVE:
            raise HTTPException(status_code=429, detail="Rainbone is answering other questions. Please retry shortly.",
                                headers={"Retry-After": "2"})
        _active += 1
    try:
        return await ask.ask(request, env)
    except ask.AskBusy as exc:
        raise HTTPException(status_code=429, detail="Rainbone is answering other questions. Please retry shortly.",
                            headers={"Retry-After": "2"}) from exc
    except (clinical_store.ClinicalDataUnavailable, explain.CaseDataUnavailable, risk.RiskDataUnavailable) as exc:
        raise HTTPException(status_code=503, detail="Verified Rainbone evidence is currently unavailable.") from exc
    except explain.ChainConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        with _lock:
            _active -= 1
