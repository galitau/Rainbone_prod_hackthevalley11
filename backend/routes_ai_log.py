"""GET /api/ai-log: the latest AI answers logged in the ai_analyses hypertable, without their text."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.ai_log import AiLogUnavailable, fetch_ai_log
from services.explain import Fallback
from services.settings import runtime_env

router = APIRouter(tags=["ai-log"])


class AiAnalysis(BaseModel):
    time: datetime
    id: UUID
    endpoint: str = Field(description="risk-analysis, explain or ask.")
    case_id: Optional[str]
    provider: str = Field(description="gemini, groq or template.")
    model: Optional[str]
    facts_sha256: str = Field(description="sha256 of the facts JSON the answer was checked against.")
    text_sha256: str = Field(description="sha256 of the answer text; the text itself is not stored.")
    latency_ms: Optional[float]
    grounding_store: Optional[str] = Field(description="vultr-object-storage or local-backup; null when the "
                                                       "numbers came in the request.")
    fallbacks: list[Fallback]
    tools_used: list[str] = Field(default_factory=list, description="Allowlisted read-only evidence tool names, without arguments.")


class AiLogResponse(BaseModel):
    rows: list[AiAnalysis] = Field(description="Newest first.")


@router.get("/api/ai-log", response_model=AiLogResponse)
def ai_log(
    limit: Annotated[int, Query(ge=1, le=200, description="Number of rows.")] = 20,
) -> AiLogResponse:
    try:
        return AiLogResponse(rows=fetch_ai_log(runtime_env(), limit))
    except AiLogUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
