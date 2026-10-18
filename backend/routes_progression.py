from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from services.progression_mesh import cached_progression_vtp
from services.storage import read_lesion_coordinates

router = APIRouter(prefix="/api/progression", tags=["progression"])


class ProgressionCoordinates(BaseModel):
    baseline: list[float]
    followup: list[float]


@router.get("/coordinates", response_model=ProgressionCoordinates)
def progression_coordinates() -> ProgressionCoordinates:
    try:
        return ProgressionCoordinates(**read_lesion_coordinates())
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/frames/{frame_index}.vtp", response_class=Response)
def progression_frame(frame_index: int) -> Response:
    try:
        return Response(
            cached_progression_vtp(frame_index),
            media_type="application/xml",
            headers={"Cache-Control": "public, max-age=86400, immutable"},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.head("/frames/{frame_index}.vtp", response_class=Response)
def progression_frame_head(frame_index: int) -> Response:
    try:
        payload = cached_progression_vtp(frame_index)
        return Response(
            content=b"",
            media_type="application/xml",
            headers={
                "Content-Length": str(len(payload)),
                "Cache-Control": "public, max-age=86400, immutable",
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
