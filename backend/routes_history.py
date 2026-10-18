"""GET /api/history: saved /api/simulate results from the simulation_runs hypertable."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.history import HistoryUnavailable, fetch_history

router = APIRouter(tags=["history"])


class StressPoint(BaseModel):
    """One run, in the shape of lib/mock-data.ts mockStressSeries."""

    label: str = Field(description="Run time in UTC.")
    value: float = Field(description="max_von_mises_stress_mpa returned by that run.")


class SimulationRun(BaseModel):
    time: datetime
    run_id: UUID
    source_filename: str
    max_von_mises_stress_mpa: float
    average_youngs_modulus_gpa: float
    bone_volume_cm3: float
    fracture_risk_index_percent: float
    load_newtons: float
    mesh_vertices: int
    mesh_faces: int
    solver: str = Field(description="Function that produced the result.")
    solver_versions: dict[str, Optional[str]] = Field(description="Installed versions of its pipeline packages.")
    solve_ms: Optional[float] = Field(description="Wall time of the solver call in the API process.")


class HourlyStress(BaseModel):
    bucket: datetime = Field(description="Start of the hour (UTC).")
    runs: int
    avg_max_von_mises_stress_mpa: float
    max_max_von_mises_stress_mpa: float


class HistoryResponse(BaseModel):
    series: list[StressPoint] = Field(description="Latest runs, oldest first.")
    runs: list[SimulationRun] = Field(description="The same runs as stored rows, oldest first.")
    hourly: list[HourlyStress] = Field(description="Latest hourly buckets of the continuous aggregate, oldest first.")


@router.get("/api/history", response_model=HistoryResponse)
def history(
    limit: Annotated[int, Query(ge=1, le=500, description="Number of runs and of hourly buckets.")] = 10,
) -> HistoryResponse:
    try:
        return HistoryResponse(**fetch_history(limit))
    except HistoryUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
