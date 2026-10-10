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
    bin_type: str = Field(default="Disposable", description="Stream type: 'Disposable' or 'Recyclable'")
    bin_scenario: str = Field(default="central", description="Placement scenario (central)")
    boundary_distance_m: Optional[float] = Field(
        default=None, description="Distance from original polygon boundary in metres"
    )


class StreamRecommendationSchema(BaseModel):
    """Recommendation metrics and markers for a specific waste stream."""

    capacity_demand_bins: int = Field(..., description="Capacity-only bin demand before perimeter constraint")
    physical_bins: int = Field(..., description="Allocated physical bin count")
    required_turns: int = Field(..., description="Calculated emptying turns per bin per day")
    daily_waste_kg: float = Field(default=0.0, description="Predicted daily waste mass in kg")
    daily_volume_litres: float = Field(default=0.0, description="Predicted daily waste volume in litres")
    available_capacity_litres: float = Field(default=0.0, description="Available daily volume capacity in litres")
    capacity_shortfall_litres: float = Field(default=0.0, description="Uncovered daily volume in litres")
    placements: list[BinPlacementMarker] = Field(
        default_factory=list, description="Stream-specific placed bin markers"
    )


class LocationBinRecommendation(BaseModel):
    """Per-location bin distribution recommendation and coordinates."""

    id: str = Field(..., description="Stable frontend location ID")
    location_name: str = Field(..., description="Location name")
    area: float = Field(..., description="Area in square metres")
    activities: list[str] = Field(default_factory=list, description="Assigned activities")
    capacity_bins: RangeSchema = Field(..., description="Capacity-only bin demand before perimeter constraint")
    spatial_minimum_bins: int = Field(default=0, description="Spatial minimum count override")
    rectangle_perimeter_m: float = Field(default=0.0, description="Approximate best-fit rectangle perimeter in metres")
    perimeter_spacing_max_bins: int = Field(
        default=0, description="Maximum physical bins allowed under 25 m boundary spacing policy"
    )
    perimeter_spacing_minimum_bins: Optional[int] = Field(
        default=None, description="Deprecated alias for perimeter_spacing_max_bins"
    )
    recommended_bins: RangeSchema = Field(..., description="Final physical recommended bin count range")
    required_emptying_turns: RangeSchema = Field(
        default_factory=lambda: RangeSchema(low=1, central=1, high=1),
        description="Calculated emptying turns per bin per day (capacity-equivalent uses)",
    )
    daily_capacity_coverage_litres: float = Field(
        default=0.0, description="Available daily waste volume capacity in litres"
    )
    capacity_shortfall_litres: float = Field(
        default=0.0, description="Remaining uncovered daily waste volume in litres"
    )
    disposable: Optional[StreamRecommendationSchema] = Field(
        default=None, description="Disposable waste stream metrics and markers"
    )
    recyclable: Optional[StreamRecommendationSchema] = Field(
        default=None, description="Recyclable waste stream metrics and markers"
    )
    total_capacity_demand_bins: Optional[int] = Field(
        default=None, description="Total central capacity demand bins across streams"
    )
    total_physical_bins: Optional[int] = Field(
        default=None, description="Total central physical bins across streams"
    )
    placement_scenario: str = Field(default="central", description="Scenario used for marker coordinates")
    boundary_spacing_target_m: float = Field(default=25.0, description="Target boundary spacing in metres")
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

    total_bins: int = Field(..., description="Total central recommended physical bin count across all locations")
    capacity_bins: RangeSchema = Field(..., description="Total capacity-only bin demand range across all locations")
    recommended_bins: RangeSchema = Field(..., description="Total recommended physical bin count range across all locations")
    required_emptying_turns: RangeSchema = Field(
        ..., description="Peak required emptying turns per bin per day across locations"
    )
    stream_counts: Optional[dict[str, int]] = Field(
        default=None,
        description="Stream-specific counts if modelled (e.g. {'disposable': X, 'recyclable': Y})",
    )
    stream_breakdown_available: bool = Field(
        default=True,
        description="True indicates that stream-level breakdown is modelled.",
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
    usable_bin_capacity_litres: float = Field(
        default=80.0, description="Usable volume capacity per bin per turn in litres (model constant: 80 L)"
    )
    emptying_cycles_per_day: Optional[int] = Field(
        default=None, description="Deprecated: Emptying frequency is dynamically calculated per location"
    )
    effective_capacity_litres_per_bin_per_day: Optional[float] = Field(
        default=None, description="Deprecated: Replaced by usable_bin_capacity_litres and dynamic turns"
    )
    boundary_spacing_target_m: float = Field(
        default=25.0, description="Configured perimeter spacing guideline in metres"
    )
    boundary_inset_m: float = Field(
        default=1.5, description="Configured inward offset from exterior boundary in metres"
    )
    assumptions: list[str] = Field(default_factory=list, description="Model physical assumptions")
    warnings: list[str] = Field(default_factory=list, description="Aggregated placement warnings")


class RoadBinPlacementMarker(BaseModel):
    """A selected physical road bin placed along a pedestrian path."""

    id: str = Field(..., description="Stable unique placement ID, e.g. road-bin-1")
    coordinates: list[float] = Field(..., description="[longitude, latitude] in WGS84")
    source_segment_id: str = Field(..., description="Source mapped road-segment ID")
    normalized_popularity_score: float = Field(..., description="Normalized popularity score [0, 1]")
    served_location_ids: list[str] = Field(default_factory=list, description="IDs of served locations")
    served_location_names: list[str] = Field(default_factory=list, description="Names of served locations")
    served_location_distances_m: dict[str, float] = Field(
        default_factory=dict, description="Distance from served location footprint boundary in metres"
    )
    stream_type: str = Field(default="Dual-compartment station", description="Stream or station configuration")
    provenance: str = Field(default="road_bin_optimizer", description="Placement provenance")


class RoadBinRecommendationResponse(BaseModel):
    """Output from influence-based road-bin placement optimizer."""

    total_road_bins: int = Field(..., description="Total selected physical road bins")
    total_eligible_candidates: int = Field(..., description="Total eligible candidate points generated")
    total_locations_requiring_coverage: int = Field(..., description="Total activity locations requiring road coverage")
    covered_location_ids: list[str] = Field(default_factory=list, description="IDs of locations covered")
    uncovered_location_ids: list[str] = Field(default_factory=list, description="IDs of uncovered locations")
    location_influence_radii_m: dict[str, float] = Field(
        default_factory=dict, description="Influence radius assigned per location in metres"
    )
    location_dominant_waste_types: dict[str, str] = Field(
        default_factory=dict, description="Dominant waste type assigned per location"
    )
    candidate_sampling_interval_m: float = Field(default=5.0, description="Sampling interval in metres")
    road_bin_spacing_m: float = Field(default=25.0, description="Minimum spacing policy in metres")
    solver_name: str = Field(..., description="Solver name used")
    optimality_proven: bool = Field(..., description="True if proven mathematically optimal")
    total_popularity_score: float = Field(default=0.0, description="Total popularity score of selected placements")
    placements: list[RoadBinPlacementMarker] = Field(
        default_factory=list, description="Selected road-bin placements"
    )
    warnings: list[str] = Field(default_factory=list, description="Road-bin placement warnings")
    assumptions: list[str] = Field(default_factory=list, description="Model physical assumptions")


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
    road_bin_recommendations: Optional[RoadBinRecommendationResponse] = Field(
        default=None, description="Influence-based road-bin placement model output along pedestrian paths"
    )
    routes: Optional[RoutePlanResponse] = Field(
        default=None, description="Pedestrian routing network and scored corridors, if boundary provided"
    )
    diagnostics: PlanDiagnostics = Field(
        ..., description="Pipeline execution diagnostics, warnings, and per-stage status"
    )

