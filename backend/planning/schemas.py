"""Pydantic schemas for the Bunbetsu unified planning API.

Defines typed request and response contracts for:
- Waste prediction
- Polygon-constrained bin distribution placement
- Pedestrian route network scoring
- Stage-by-stage diagnostics
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.prediction_api import RangeSchema, WastePredictionResponse
from routes.schemas import (
    RoutePlanResponse,
    RoutingConfigSchema,
    _validate_coordinate_pair,
    validate_geojson_geometry,
)


class LocationPlanRequest(BaseModel):
    """Activity location input with geometry for waste, bin placement, and routing."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., min_length=1, description="Stable unique identifier for the location.")
    name: str = Field(..., min_length=1, description="Location name.")
    area: float = Field(..., gt=0.0, description="Location area in square metres.")
    activities: list[str] = Field(..., min_length=1, description="Activity tags assigned to location.")
    geometry: dict[str, Any] = Field(..., description="GeoJSON Point, Polygon, or MultiPolygon geometry.")
    center: Optional[list[float]] = Field(default=None, description="Optional center [lng, lat].")
    weight: Optional[float] = Field(default=None, ge=0.0, description="Optional attraction weight override.")

    @field_validator("geometry")
    @classmethod
    def validate_geom(cls, v: dict[str, Any]) -> dict[str, Any]:
        return validate_geojson_geometry(v)

    @field_validator("center")
    @classmethod
    def validate_cntr(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        if v is not None:
            _validate_coordinate_pair(v, "center")
            return [float(v[0]), float(v[1])]
        return None


class CampusPlanRequest(BaseModel):
    """Unified campus event planning request."""

    model_config = ConfigDict(extra="ignore")

    fest_name: str = Field(..., min_length=1, description="Event / festival name.")
    total_footfall: int = Field(..., gt=0, description="Expected daily fest footfall.")
    duration_days: int = Field(..., gt=0, description="Duration of the fest in days.")
    campus_state: str = Field(
        ..., min_length=1, description="Campus State or Union Territory for CPCB baseline lookup."
    )
    baseline_rate_kg_per_person_day: Optional[float] = Field(
        default=None, gt=0.0, description="Optional custom baseline rate override in kg/person/day."
    )
    activities: Optional[list[str]] = Field(
        default=None, description="Optional distinct activities list. If omitted, derived from locations."
    )
    campus_boundary: Optional[dict[str, Any]] = Field(
        default=None,
        description="Campus boundary GeoJSON (Polygon or MultiPolygon) for pedestrian routing.",
    )
    locations: list[LocationPlanRequest] = Field(
        ..., min_length=1, description="Map-selected event activity locations."
    )
    routing_config: Optional[RoutingConfigSchema] = Field(
        default=None, description="Optional pedestrian routing configuration."
    )

    @field_validator("campus_boundary")
    @classmethod
    def validate_boundary(cls, v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if v is not None:
            geom = validate_geojson_geometry(v)
            if geom.get("type") not in ("Polygon", "MultiPolygon"):
                raise ValueError(
                    f"Campus boundary must be Polygon or MultiPolygon, received {geom.get('type')!r}."
                )
            return geom
        return None

    @model_validator(mode="after")
    def validate_unique_identities(self) -> CampusPlanRequest:
        # Validate stable IDs uniqueness
        ids = [loc.id for loc in self.locations]
        if len(ids) != len(set(ids)):
            duplicates = [i for i in ids if ids.count(i) > 1]
            raise ValueError(f"Duplicate location IDs detected: {sorted(set(duplicates))}.")

        # Validate location names uniqueness (required by both waste predictor and bin distribution model)
        names = [loc.name.strip() for loc in self.locations]
        if len(names) != len(set(names)):
            dup_names = [n for n in names if names.count(n) > 1]
            raise ValueError(
                f"Duplicate location names detected: {sorted(set(dup_names))}. "
                "Location names must be unique for spatial bin distribution modeling."
            )
        return self


class BinPlacementMarker(BaseModel):
    """Placed bin coordinates sampled around inward-offset exterior boundary."""

    id: str = Field(..., description="Unique bin marker ID, e.g. {location_id}-bin-{bin_index}")
    location_id: str = Field(..., description="Stable location ID corresponding to frontend location")
    location_name: str = Field(..., description="Location name")
    coordinates: list[float] = Field(..., description="[longitude, latitude] in WGS84")
    bin_index: int = Field(..., description="Index of placed bin at location (1-based)")
    bin_scenario: str = Field(default="central", description="Placement scenario (central)")
    boundary_distance_m: Optional[float] = Field(
        default=None, description="Distance from original polygon boundary in metres"
    )


class LocationBinRecommendation(BaseModel):
    """Per-location bin distribution recommendation and coordinates."""

    id: str = Field(..., description="Stable frontend location ID")
    location_name: str = Field(..., description="Location name")
    area: float = Field(..., description="Area in square metres")
    activities: list[str] = Field(default_factory=list, description="Assigned activities")
    capacity_bins: RangeSchema = Field(..., description="Bins required to satisfy daily waste volume")
    spatial_minimum_bins: int = Field(default=0, description="Spatial minimum count override")
    perimeter_spacing_minimum_bins: int = Field(
        default=0, description="Minimum bins to satisfy boundary spacing guideline"
    )
    recommended_bins: RangeSchema = Field(..., description="Final recommended bin count range")
    placement_scenario: str = Field(default="central", description="Scenario used for marker coordinates")
    boundary_spacing_target_m: float = Field(default=30.0, description="Target boundary spacing in metres")
    actual_boundary_spacing_m: float = Field(default=0.0, description="Actual achieved boundary spacing in metres")
    boundary_inset_m: float = Field(default=1.5, description="Boundary inward offset in metres")
    placement_warnings: list[str] = Field(default_factory=list, description="Per-location placement warnings")
    placement_status: Literal["placed", "unsupported_geometry", "failed"] = Field(
        default="placed", description="Placement outcome status for this location"
    )
    bin_placements: list[BinPlacementMarker] = Field(
        default_factory=list, description="Sampled [lng, lat] bin coordinates"
    )


class BinRecommendationResponse(BaseModel):
    """Aggregated output from Bunbetsu bin distribution model."""

    total_bins: int = Field(..., description="Total central recommended bin count across all locations")
    capacity_bins: RangeSchema = Field(..., description="Total capacity-based bin range across all locations")
    recommended_bins: RangeSchema = Field(..., description="Total recommended bin count range across all locations")
    stream_counts: Optional[dict[str, int]] = Field(
        default=None,
        description="Stream-specific counts if modelled; None when spatial model only models total deployment.",
    )
    stream_breakdown_available: bool = Field(
        default=False,
        description="False indicates that the spatial bin model produces total counts, not per-stream counts.",
    )
    locations: list[LocationBinRecommendation] = Field(
        default_factory=list, description="Per-location model results and placement markers"
    )
    bins: list[BinPlacementMarker] = Field(
        default_factory=list, description="All placed bin markers across active locations"
    )
    bin_capacity_litres: float = Field(
        default=100.0, description="Nominal bin volume capacity in litres (model constant: 100 L)"
    )
    usable_fill_fraction: float = Field(
        default=0.80, description="Usable fill fraction before emptying (model constant: 0.80)"
    )
    emptying_cycles_per_day: int = Field(
        default=2, description="Assumed emptying frequency per day (model constant: 2)"
    )
    effective_capacity_litres_per_bin_per_day: float = Field(
        default=160.0, description="Effective daily capacity per bin in litres (model constant: 160 L/day)"
    )
    boundary_spacing_target_m: float = Field(
        default=30.0, description="Configured perimeter spacing guideline in metres"
    )
    boundary_inset_m: float = Field(
        default=1.5, description="Configured inward offset from exterior boundary in metres"
    )
    assumptions: list[str] = Field(default_factory=list, description="Model physical assumptions")
    warnings: list[str] = Field(default_factory=list, description="Aggregated placement warnings")


class StageStatus(BaseModel):
    """Explicit status tracking for each pipeline stage."""

    prediction: Literal["success", "failed"]
    bins: Literal["success", "partial", "failed", "skipped"]
    routes: Literal["success", "failed", "skipped"]


class PlanDiagnostics(BaseModel):
    """Diagnostics, warnings, and errors across all planning pipeline stages."""

    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    stage_status: StageStatus


class CampusPlanResponse(BaseModel):
    """Unified response containing waste predictions, bin recommendations, and route insights."""

    success: bool = Field(
        ...,
        description="True when primary waste prediction and planning completed. Partial stage failures are reported in diagnostics.",
    )
    prediction: Optional[WastePredictionResponse] = Field(
        default=None, description="Frozen waste prediction model output"
    )
    bin_recommendations: Optional[BinRecommendationResponse] = Field(
        default=None, description="Bin distribution model output with [lng, lat] placement coordinates"
    )
    routes: Optional[RoutePlanResponse] = Field(
        default=None, description="Pedestrian routing network and scored corridors, if boundary provided"
    )
    diagnostics: PlanDiagnostics = Field(
        ..., description="Pipeline execution diagnostics, warnings, and per-stage status"
    )

