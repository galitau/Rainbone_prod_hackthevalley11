from __future__ import annotations

from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from routes_bones import router as bones_router

from services.fea_solver import FEASolverError, simulate_fea

app = FastAPI(
    title="RainbowBone FEA Engine",
    version="0.1.0",
    description="NIfTI bone segmentation and finite-element biomechanics API.",
)
app.include_router(bones_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class SimulationResponse(BaseModel):
    max_von_mises_stress_mpa: float = Field(description="Maximum Von Mises stress in MPa.")
    average_youngs_modulus_gpa: float = Field(description="Mean apparent Young's modulus in GPa.")
    bone_volume_cm3: float = Field(description="Segmented bone volume in cm³.")
    fracture_risk_index_percent: float = Field(
        ge=0,
        le=100,
        description="Estimated fracture risk index from 0 to 100 percent.",
    )
    load_newtons: float = Field(default=800, description="Applied compressive load.")
    mesh_vertices: int
    mesh_faces: int
    source_filename: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rainbowbone-fea"}


@app.post("/api/simulate", response_model=SimulationResponse)
async def simulate(file: Annotated[UploadFile, File(description="NIfTI .nii or .nii.gz volume")]) -> SimulationResponse:
    if not file.filename or not file.filename.lower().endswith((".nii", ".nii.gz")):
        raise HTTPException(status_code=400, detail="Upload a .nii or .nii.gz NIfTI file.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded NIfTI file is empty.")

    try:
        result = simulate_fea(payload, filename=file.filename)
    except FEASolverError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SimulationResponse(**result)
