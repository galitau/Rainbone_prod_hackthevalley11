from __future__ import annotations

import time
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from routes_explain import router as explain_router
from routes_history import router as history_router
from services.fea_solver import FEASolverError, simulate_fea
from services.history import save_simulation_run

app = FastAPI(
    title="RainbowBone FEA Engine",
    version="0.1.0",
    description="NIfTI bone segmentation and finite-element biomechanics API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
app.include_router(explain_router)
app.include_router(history_router)


class SimulationResponse(BaseModel):
    max_von_mises_stress_mpa: float = Field(
        description="99.5th percentile of element Von Mises stress in MPa from the SfePy solve."
    )
    average_youngs_modulus_gpa: float = Field(
        description="Volume-weighted mean element Young's modulus in GPa from the HU mapping."
    )
    bone_volume_cm3: float = Field(description="Finite-element mesh volume in cm³.")
    fracture_risk_index_percent: float = Field(
        ge=0,
        le=100,
        description="Illustrative index: stress / assumed 150 MPa strength x 100, clipped to 0-100. "
        "Not a validated fracture risk.",
    )
    load_newtons: float = Field(default=800, description="Applied compressive load.")
    mesh_vertices: int
    mesh_faces: int
    source_filename: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rainbowbone-fea"}


@app.post("/api/simulate", response_model=SimulationResponse)
async def simulate(file: Annotated[UploadFile, File(description="NIfTI .nii or .nii.gz volume")], background_tasks: BackgroundTasks) -> SimulationResponse:
    if not file.filename or not file.filename.lower().endswith((".nii", ".nii.gz")):
        raise HTTPException(status_code=400, detail="Upload a .nii or .nii.gz NIfTI file.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded NIfTI file is empty.")

    started = time.perf_counter()
    try:
        result = await run_in_threadpool(simulate_fea, payload, filename=file.filename)
    except FEASolverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    response = SimulationResponse(**result)
    # Saved after the response is sent; a failed save is logged and never fails the simulation.
    background_tasks.add_task(save_simulation_run, result, solve_ms=(time.perf_counter() - started) * 1000.0)
    return response
