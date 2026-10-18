"""POST /api/explain: a plain-language explanation of computed simulation results."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from services.explain import (CaseDataUnavailable, ChainConfigError, ExplainRequest, ExplainResponse, UnknownCase,
                              explain, runtime_env)

router = APIRouter()


@router.post("/api/explain", response_model=ExplainResponse)
async def explain_results(
    request: ExplainRequest,
    env: Annotated[dict[str, str], Depends(runtime_env)],
) -> ExplainResponse:
    try:
        return await explain(request, env)
    except UnknownCase as exc:
        raise HTTPException(status_code=404, detail=f"No femur model for case {request.case_id!r}.") from exc
    except CaseDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ChainConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
