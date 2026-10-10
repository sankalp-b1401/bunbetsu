"""FastAPI Routes API for Bunbetsu Pedestrian Network Routing.

Exposes POST /api/routes/plan.
Constructs a connected pedestrian graph, snaps activity locations, and scores routes.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from routes.route_service import plan_pedestrian_routes
from routes.schemas import RoutePlanRequest, RoutePlanResponse

router = APIRouter(
    prefix="/api/routes",
    tags=["routes"],
)


@router.post(
    "/plan",
    response_model=RoutePlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Plan and score pedestrian routes across campus event locations",
)
async def plan_routes_endpoint(request: RoutePlanRequest) -> RoutePlanResponse:
    """Plan pedestrian routes, snap activity locations, and calculate demand scores."""
    return await plan_pedestrian_routes(request)

