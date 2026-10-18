from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import OrderedDict
from typing import Annotated, Any, Literal
from uuid import uuid4

import anyio
import anyio.to_thread
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from starlette.formparsers import MultiPartException
from routes_bones import router as bones_router

from routes_ai_log import router as ai_log_router
from routes_ask import router as ask_router
from routes_explain import router as explain_router
from routes_history import router as history_router
from routes_progression import router as progression_router
from routes_risk import router as risk_router
from services.fea_solver import MAX_UPLOAD_BYTES, FEASolverError, simulate_fea
from services.fsl_segmentation import segmentation_tool
from services.history import persistence_for_run, prepare_run_persistence, save_simulation_run
from services.settings import runtime_env

# One solve at a time: a full CT can hold several GB while it is segmented.
SOLVE_LIMITER = anyio.CapacityLimiter(1)
# A raw asyncio cancellation can release AnyIO's token while its thread continues.
# The thread-held lock preserves the one-heavy-solve bound until that work ends.
SOLVE_WORKER_LOCK = threading.Lock()

# Two admissions, each held only for the work it bounds:
# * UPLOAD_ADMISSION, a loose cap on bodies being received, taken before FastAPI parses or spools the multipart data and
#   released as soon as the last body chunk arrives. A body that has not finished within UPLOAD_BODY_SECONDS is refused
#   (408), so slow clients cannot hold these slots.
# * SOLVE_ADMISSION, the strict limit: the running solve plus the uploads waiting for SOLVE_LIMITER. Taken only after the
#   kept results miss, released when the solve returns; never held while the response is sent or the history row saved.
#   A kept result (the dashboard's sample on every visit) never needs one, so it is never refused for a busy engine.
MAX_ACTIVE_UPLOADS = 8
UPLOAD_ADMISSION = threading.BoundedSemaphore(MAX_ACTIVE_UPLOADS)
UPLOAD_BODY_SECONDS = 60.0
MAX_ADMITTED_SOLVES = 3
SOLVE_ADMISSION = threading.BoundedSemaphore(MAX_ADMITTED_SOLVES)
UPLOAD_RETRY_SECONDS = 5
BUSY_DETAIL = "The engine is busy with other uploads. Try again shortly."


class UploadAdmissionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path") != "/api/simulate":
            return await self.app(scope, receive, send)
        admission = UPLOAD_ADMISSION
        if not admission.acquire(blocking=False):
            response = JSONResponse({"detail": BUSY_DETAIL}, status_code=429,
                                    headers={"Retry-After": str(UPLOAD_RETRY_SECONDS)})
            return await response(scope, receive, send)
        held = True

        def release() -> None:
            nonlocal held
            if held:
                held = False
                admission.release()

        deadline = anyio.current_time() + UPLOAD_BODY_SECONDS
        timed_out = False

        async def receive_body():
            nonlocal timed_out
            if not held:  # the body is complete; later reads only wait for a disconnect
                return await receive()
            with anyio.move_on_after(max(0.0, deadline - anyio.current_time())):
                message = await receive()
                if message["type"] != "http.request" or not message.get("more_body", False):
                    release()
                return message
            release()
            timed_out = True
            # MultipartParser closes its partially spooled files on MultiPartException.
            # Starlette translates it to 400; send_response preserves our timeout status.
            raise MultiPartException(f"The upload did not finish within {UPLOAD_BODY_SECONDS:g} s.")

        async def send_response(message):
            if timed_out and message["type"] == "http.response.start":
                message = {**message, "status": 408}
            await send(message)

        try:
            await self.app(scope, receive_body, send_response)
        finally:
            release()

# Results of real solves by sha256 of the uploaded bytes. The solve reads only the bytes, so the same file always gives
# the same numbers; posting it again (the dashboard's sample on every visit) answers at once instead of queueing behind
# SOLVE_LIMITER. It is read before the limiter, and again once a request holds it, so identical uploads queued behind a
# solve reuse its result. Only source_filename comes from each request. Failed solves are not kept. A reused result
# saves no history row: simulation history records solves that ran, never a repeat of one.
SIMULATE_CACHE_MAX = 64
# "1" on an answer that is a kept result rather than a solve of this request, else "0". Exposed to the page through CORS
# so the dashboard can say the result was reused instead of showing a near-zero round trip as a live solve.
REUSED_HEADER = "X-Simulate-Reused"
_simulate_results: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_simulate_results_lock = threading.Lock()


def _kept_result(digest: str) -> dict[str, Any] | None:
    with _simulate_results_lock:
        result = _simulate_results.get(digest)
        if result is None:
            return None
        _simulate_results.move_to_end(digest)
        return dict(result)


def _keep_result(digest: str, result: dict[str, Any]) -> None:
    with _simulate_results_lock:
        _simulate_results[digest] = dict(result)
        _simulate_results.move_to_end(digest)
        while len(_simulate_results) > SIMULATE_CACHE_MAX:
            _simulate_results.popitem(last=False)

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
app.add_middleware(UploadAdmissionMiddleware)

app.add_middleware(
    CORSMiddleware,
    **cors_origins(runtime_env()),
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
    expose_headers=[REUSED_HEADER, "Retry-After"],
)
app.include_router(explain_router)
app.include_router(history_router)
app.include_router(progression_router)
app.include_router(risk_router)
app.include_router(ai_log_router)
app.include_router(ask_router)
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
    original_source_filename: str = Field(description="Filename of the execution whose result is returned.")
    run_id: str = Field(description="Stable execution UUID, also used by the Tiger history row.")
    input_sha256: str = Field(pattern=r"^[0-9a-f]{64}$", description="SHA256 of uploaded bytes; unchanged on cache reuse.")
    persistence: Literal["pending", "saved", "unavailable"] = Field(description="Storage acknowledgement for this exact execution.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rainbowbone-fea"}


@app.post("/api/simulate", response_model=SimulationResponse)
async def simulate(file: Annotated[UploadFile, File(description="NIfTI .nii or .nii.gz volume")], background_tasks: BackgroundTasks,
                   response: Response) -> SimulationResponse:
    if not file.filename or not file.filename.lower().endswith((".nii", ".nii.gz")):
        raise HTTPException(status_code=400, detail="Upload a .nii or .nii.gz NIfTI file.")

    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded NIfTI file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Upload a NIfTI file of at most {MAX_UPLOAD_BYTES // 2**20} MiB.")

    filename = file.filename
    digest = await anyio.to_thread.run_sync(lambda: hashlib.sha256(payload).hexdigest())
    result = _kept_result(digest)
    reused = result is not None
    if result is None:
        started = time.perf_counter()

        def solve_unless_kept() -> tuple[dict[str, Any], bool]:
            kept = _kept_result(digest)  # an identical upload may have been solved while this one queued
            if kept is not None:
                return kept, False
            solved_result = {
                **simulate_fea(payload, filename=filename),
                "run_id": str(uuid4()), "input_sha256": digest, "original_source_filename": filename,
                "source_filename": filename,
            }
            prepare_run_persistence(solved_result["run_id"])
            # Publish while still holding the solve slot. A queued identical request
            # must see this result before it can start another execution.
            _keep_result(digest, solved_result)
            return solved_result, True

        admission = SOLVE_ADMISSION
        if not admission.acquire(blocking=False):
            raise HTTPException(status_code=429, detail=BUSY_DETAIL, headers={"Retry-After": str(UPLOAD_RETRY_SECONDS)})
        # A disconnected/cancelled coroutine must not release a running worker's slot.
        # Queued cancellation releases immediately; once started, the worker owns it.
        ownership = threading.Lock()
        worker_started = False
        held = True

        def release_slot():
            nonlocal held
            if held:
                held = False
                admission.release()

        def admitted_solve():
            nonlocal worker_started
            with ownership:
                if not held:
                    raise RuntimeError("Solve cancelled before starting")
                worker_started = True
            try:
                with SOLVE_WORKER_LOCK:
                    return solve_unless_kept()
            finally:
                with ownership:
                    release_slot()

        try:
            result, solved = await anyio.to_thread.run_sync(admitted_solve, limiter=SOLVE_LIMITER)
        except FEASolverError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            with ownership:
                if not worker_started:
                    release_slot()
        reused = not solved
        if solved:
            # Saved after the response is sent; a failed save is logged and never fails the simulation.
            background_tasks.add_task(save_simulation_run, result, solve_ms=(time.perf_counter() - started) * 1000.0)
    response.headers[REUSED_HEADER] = "1" if reused else "0"
    return SimulationResponse(**{**result, "source_filename": filename,
                                 "persistence": persistence_for_run(result["run_id"])})
