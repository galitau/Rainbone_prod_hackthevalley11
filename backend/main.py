from __future__ import annotations

import logging
import time
from functools import partial
from typing import Annotated

import anyio
import anyio.to_thread
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from routes_bones import router as bones_router

from routes_explain import router as explain_router
from routes_history import router as history_router
from routes_risk import router as risk_router
from services.fea_solver import MAX_UPLOAD_BYTES, FEASolverError, simulate_fea
from services.fsl_segmentation import segmentation_tool
from services.history import save_simulation_run
from services.settings import runtime_env

# One solve at a time: a full CT can hold several GB while it is segmented.
SOLVE_LIMITER = anyio.CapacityLimiter(1)

# Browser origins allowed to call the API: the local dev server and the production site.
CORS_ORIGINS_ENV = "CORS_ALLOW_ORIGINS"
CORS_ORIGIN_REGEX_ENV = "CORS_ALLOW_ORIGIN_REGEX"
DEFAULT_CORS_ORIGINS = ("http://localhost:3000", "https://rainbone.health", "https://www.rainbone.health")


def cors_origins(env: dict[str, str]) -> dict[str, object]:
    """allow_origins from CORS_ALLOW_ORIGINS (comma list; blank means the defaults) and
    allow_origin_regex from CORS_ALLOW_ORIGIN_REGEX (blank means none)."""
    origins = [o.strip().rstrip("/") for o in env.get(CORS_ORIGINS_ENV, "").split(",") if o.strip()]
    regex = env.get(CORS_ORIGIN_REGEX_ENV, "").strip()
    return {"allow_origins": origins or list(DEFAULT_CORS_ORIGINS), "allow_origin_regex": regex or None}


app = FastAPI(
    title="RainbowBone FEA Engine",
    version="0.1.0",
    description="NIfTI bone segmentation and finite-element biomechanics API.",
)
app.include_router(bones_router)

app.add_middleware(
    CORSMiddleware,
    **cors_origins(runtime_env()),
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
app.include_router(explain_router)
app.include_router(history_router)
app.include_router(risk_router)
# Printed by uvicorn's default logging, so the console says whether FSL makes the bone mask.
logging.getLogger("uvicorn.error").info("Bone segmentation: %s", segmentation_tool())


class SimulationResponse(BaseModel):
    max_von_mises_stress_mpa: float = Field(
        description="99.5th percentile over the bone volume of element Von Mises stress in MPa from the SfePy solve."
    )
    average_youngs_modulus_gpa: float = Field(
        description="Mean Young's modulus of the bone voxels in GPa from the HU mapping."
    )
    bone_volume_cm3: float = Field(description="Segmented bone volume in cm³.")
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

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded NIfTI file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Upload a NIfTI file of at most {MAX_UPLOAD_BYTES // 2**20} MiB.")

    started = time.perf_counter()
    try:
        result = await anyio.to_thread.run_sync(partial(simulate_fea, payload, filename=file.filename),
                                                limiter=SOLVE_LIMITER)
    except FEASolverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    response = SimulationResponse(**result)
    # Saved after the response is sent; a failed save is logged and never fails the simulation.
    background_tasks.add_task(save_simulation_run, result, solve_ms=(time.perf_counter() - started) * 1000.0)
    return response
