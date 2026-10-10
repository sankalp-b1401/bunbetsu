"""FastAPI Prediction Route for Bunbetsu Waste Prediction Model.

Exposes POST /api/prediction/waste.
Executes the frozen mathematical model (waste_predictor_model.py) without alteration.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from models.waste_predictor_model.waste_predictor_model import (
    ACTIVITIES,
    FestInput,
    LocationInput,
    Range,
    WastePrediction,
    predict,
)


router = APIRouter(
    prefix="/api/prediction",
    tags=["prediction"],
)


class RangeSchema(BaseModel):
    low: float
    central: float
    high: float


class LocationPredictionRequest(BaseModel):
    id: str = Field(..., description="Stable frontend identifier for map matching")
    name: str = Field(..., min_length=1, description="Location name")
    area: float = Field(..., gt=0, description="Location area in square metres")
    activities: list[str] = Field(..., min_length=1, description="Activity tags assigned to location")


class WastePredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_footfall: int = Field(..., gt=0, description="Expected daily fest footfall")
    duration_days: int = Field(..., gt=0, description="Duration of the fest in days")
    campus_state: str = Field(
        ..., min_length=1, description="Campus State or Union Territory for CPCB baseline lookup"
    )
    activities: Optional[list[str]] = Field(
        None, description="Optional distinct activities list. If omitted, derived from locations."
    )
    locations: list[LocationPredictionRequest] = Field(
        ..., min_length=1, description="Map-selected event locations"
    )


class ActivityAllocationResponse(BaseModel):
    activity: str
    normalized_weight: float
    intensity: RangeSchema
    relative_intensity: RangeSchema
    internal_waste_range_kg: RangeSchema


class LocationWasteAllocationResponse(BaseModel):
    id: str
    location_id: str
    location_name: str
    area: float
    activities: list[str]
    normalized_share: float
    total_waste_kg: RangeSchema
    composition_kg: dict[str, RangeSchema]
    recyclable_kg: RangeSchema
    disposable_kg: RangeSchema


class HeatmapDataResponse(BaseModel):
    total_waste_kg: dict[str, RangeSchema]
    category_waste_kg: dict[str, dict[str, RangeSchema]]
    recyclable_kg: dict[str, RangeSchema]
    disposable_kg: dict[str, RangeSchema]


class WastePredictionResponse(BaseModel):
    success: bool = True
    campus_state: str
    baseline_rate_kg_per_person_day: float
    baseline_source_year: str
    baseline_rate_source: str
    baseline_is_national_fallback: bool
    total_waste_kg: RangeSchema
    composition_kg: dict[str, RangeSchema]
    composition_percent: dict[str, float]
    recyclable_kg: RangeSchema
    disposable_kg: RangeSchema
    activity_allocations: list[ActivityAllocationResponse]
    location_allocations: list[LocationWasteAllocationResponse]
    heatmap_data: Optional[HeatmapDataResponse] = None
    assumptions: list[str]


def serialize_range(r: Range) -> RangeSchema:
    return RangeSchema(low=r.low, central=r.central, high=r.high)


def serialize_waste_prediction_response(
    prediction: WastePrediction, request_locations: Any
) -> WastePredictionResponse:
    """Serialize a frozen WastePrediction domain object into WastePredictionResponse."""
    serialized_activity_allocations = [
        ActivityAllocationResponse(
            activity=a.activity,
            normalized_weight=a.normalized_weight,
            intensity=serialize_range(a.intensity),
            relative_intensity=serialize_range(a.relative_intensity),
            internal_waste_range_kg=serialize_range(a.internal_waste_range_kg),
        )
        for a in prediction.activity_allocations
    ]

    serialized_location_allocations = [
        LocationWasteAllocationResponse(
            id=req_loc.id,
            location_id=req_loc.id,
            location_name=alloc.location_name,
            area=alloc.area,
            activities=list(alloc.activities),
            normalized_share=alloc.normalized_share,
            total_waste_kg=serialize_range(alloc.total_waste_kg),
            composition_kg={
                cat: serialize_range(r) for cat, r in alloc.composition_kg.items()
            },
            recyclable_kg=serialize_range(alloc.recyclable_kg),
            disposable_kg=serialize_range(alloc.disposable_kg),
        )
        for req_loc, alloc in zip(request_locations, prediction.location_allocations)
    ]

    serialized_heatmap = None
    if prediction.heatmap_data:
        serialized_heatmap = HeatmapDataResponse(
            total_waste_kg={
                k: serialize_range(v)
                for k, v in prediction.heatmap_data.total_waste_kg.items()
            },
            category_waste_kg={
                cat: {
                    loc_name: serialize_range(v)
                    for loc_name, v in loc_dict.items()
                }
                for cat, loc_dict in prediction.heatmap_data.category_waste_kg.items()
            },
            recyclable_kg={
                k: serialize_range(v)
                for k, v in prediction.heatmap_data.recyclable_kg.items()
            },
            disposable_kg={
                k: serialize_range(v)
                for k, v in prediction.heatmap_data.disposable_kg.items()
            },
        )

    return WastePredictionResponse(
        success=True,
        campus_state=prediction.campus_state,
        baseline_rate_kg_per_person_day=prediction.baseline_rate_kg_per_person_day,
        baseline_source_year=prediction.baseline_source_year,
        baseline_rate_source=prediction.baseline_rate_source,
        baseline_is_national_fallback=prediction.baseline_is_national_fallback,
        total_waste_kg=serialize_range(prediction.total_waste_kg),
        composition_kg={
            cat: serialize_range(r) for cat, r in prediction.composition_kg.items()
        },
        composition_percent=dict(prediction.composition_percent),
        recyclable_kg=serialize_range(prediction.recyclable_kg),
        disposable_kg=serialize_range(prediction.disposable_kg),
        activity_allocations=serialized_activity_allocations,
        location_allocations=serialized_location_allocations,
        heatmap_data=serialized_heatmap,
        assumptions=list(prediction.assumptions),
    )


@router.post(
    "/waste",
    response_model=WastePredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate waste prediction for campus event",
)
async def predict_waste(request: WastePredictionRequest) -> WastePredictionResponse:
    # 1. Derive or validate distinct activities
    location_activities_set: set[str] = set()
    for loc in request.locations:
        for act in loc.activities:
            location_activities_set.add(act)

    if request.activities:
        req_act_set = set(request.activities)
        unknown_requested = req_act_set - set(ACTIVITIES)
        if unknown_requested:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown activities in request: {sorted(unknown_requested)}",
            )
        # Use user-supplied activities if provided and valid, otherwise derive
        event_activities = tuple(dict.fromkeys(request.activities))
    else:
        # Derive distinct activity names in stable order
        event_activities = tuple(dict.fromkeys(act for loc in request.locations for act in loc.activities))

    if not event_activities:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one activity is required across all locations.",
        )

    # 2. Convert locations to frozen model LocationInput dataclasses
    model_locations: list[LocationInput] = []
    for loc in request.locations:
        try:
            model_loc = LocationInput(
                name=loc.name,
                activities=tuple(loc.activities),
                area=float(loc.area),
            )
            model_loc.validate()
            model_locations.append(model_loc)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            )

    # 3. Construct FestInput and execute frozen prediction model
    try:
        fest_input = FestInput(
            total_footfall=request.total_footfall,
            duration_days=request.duration_days,
            activities=event_activities,
            campus_state=request.campus_state,
            locations=tuple(model_locations),
        )
        prediction: WastePrediction = predict(fest_input)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error executing waste model: {exc}",
        )

    return serialize_waste_prediction_response(prediction, request.locations)
