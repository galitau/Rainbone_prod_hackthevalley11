"""POST /api/explain: a plain-language explanation of computed simulation results."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from services.explain import ChainConfigError, ExplainRequest, ExplainResponse, explain, runtime_env

router = APIRouter()


@router.post("/api/explain", response_model=ExplainResponse)
async def explain_results(
    request: ExplainRequest,
    env: Annotated[dict[str, str], Depends(runtime_env)],
) -> ExplainResponse:
    try:
        return await explain(request, env)
    except ChainConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
