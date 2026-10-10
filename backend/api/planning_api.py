"""FastAPI Planning API for Bunbetsu Unified Planning Pipeline.

Exposes POST /api/planning/plan.
Coordinates waste prediction, bin distribution model, and pedestrian routing
in a single unified backend operation.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from planning.planner_service import execute_campus_plan
from planning.schemas import CampusPlanRequest, CampusPlanResponse

router = APIRouter(
    prefix="/api/planning",
    tags=["planning"],
)


@router.post(
    "/plan",
    response_model=CampusPlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute unified campus event planning pipeline",
)
async def plan_campus_event(request: CampusPlanRequest) -> CampusPlanResponse:
    """Execute waste prediction, spatial bin distribution, and pedestrian routing."""
    return await execute_campus_plan(request)

