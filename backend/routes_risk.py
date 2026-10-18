"""POST /api/risk-analysis: an AI-worded fracture risk analysis of one HFValid femur from its published data."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from services.explain import ChainConfigError
from services.risk import RiskDataUnavailable, RiskRequest, RiskResponse, UnknownCase, analyse
from services.settings import runtime_env

router = APIRouter()


@router.post("/api/risk-analysis", response_model=RiskResponse)
async def risk_analysis(
    request: RiskRequest,
    env: Annotated[dict[str, str], Depends(runtime_env)],
) -> RiskResponse:
    try:
        return await analyse(request, env)
    except UnknownCase as exc:
        raise HTTPException(status_code=404, detail=f"No HFValid subject {request.case_id!r}.") from exc
    except RiskDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ChainConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
