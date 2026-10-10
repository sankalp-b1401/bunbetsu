"""Bunbetsu Planning Orchestration Service.

Integrates:
1. Frozen mathematical waste prediction model (waste_predictor_model.py)
2. Spatial polygon-constrained bin distribution model (bin_distribution_model.py)
3. Deterministic pedestrian routing and demand scoring (route_service.py)

Executes internal Python functions directly without looping back through HTTP.
Preserves stable IDs and handles partial stage failures gracefully.
"""

from __future__ import annotations

import dataclasses
import logging
from typing import Any, Sequence
from fastapi import HTTPException, status

from api.prediction_api import (
    RangeSchema,
    serialize_range,
    serialize_waste_prediction_response,
)
from models.bin_distribution_model.bin_distribution_model import (
    BIN_CAPACITY_LITRES,
    DEFAULT_BOUNDARY_INSET_M,
    DEFAULT_BOUNDARY_SPACING_M,
    USABLE_BIN_CAPACITY_LITRES,
    USABLE_FILL_FRACTION,
    OnLocationBinPrediction,
    RoadBinPrediction,
    predict_on_location_bins,
    predict_road_bins,
)
from models.waste_predictor_model.waste_predictor_model import (
    ACTIVITIES,
    FestInput,
    LocationInput,
    WastePrediction,
    predict as predict_waste,
)
from routes.route_service import plan_pedestrian_routes
from routes.schemas import LocationRouteRequest, RoutePlanRequest, RoutePlanResponse

from .schemas import (
    BinPlacementMarker,
    BinRecommendationResponse,
    CampusPlanRequest,
    CampusPlanResponse,
    LocationBinRecommendation,
    PlanDiagnostics,
    RoadBinPlacementMarker,
    RoadBinRecommendationResponse,
    StageStatus,
    StreamRecommendationSchema,
)

logger = logging.getLogger(__name__)


async def execute_campus_plan(request: CampusPlanRequest) -> CampusPlanResponse:
    """Execute the unified end-to-end event planning pipeline."""
    warnings: list[str] = []
    errors: list[str] = []

    # -------------------------------------------------------------------------
    # 1. Validation & Input Preparation
    # -------------------------------------------------------------------------
    # Validate activity names against frozen CPCB activity registry
    for loc in request.locations:
        for act in loc.activities:
            if act not in ACTIVITIES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Unknown activity {act!r} for location {loc.name!r}. Allowed: {sorted(ACTIVITIES)}",
                )

    if request.activities:
        unknown_requested = set(request.activities) - set(ACTIVITIES)
        if unknown_requested:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown activities in request: {sorted(unknown_requested)}",
            )
        event_activities = tuple(dict.fromkeys(request.activities))
    else:
        # Derive distinct activities in stable order
        event_activities = tuple(
            dict.fromkeys(act for loc in request.locations for act in loc.activities)
        )

    if not event_activities:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one activity is required across all locations.",
        )

    model_locations: list[LocationInput] = []
    for loc in request.locations:
        try:
            m_loc = LocationInput(
                name=loc.name.strip(),
                activities=tuple(loc.activities),
                area=float(loc.area),
            )
            m_loc.validate()
            model_locations.append(m_loc)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            )

    # -------------------------------------------------------------------------
    # 2. Stage 1: Waste Prediction Model
    # -------------------------------------------------------------------------
    try:
        fest_input = FestInput(
            total_footfall=request.total_footfall,
            duration_days=request.duration_days,
            activities=event_activities,
            campus_state=request.campus_state.strip(),
            locations=tuple(model_locations),
        )
        prediction: WastePrediction = predict_waste(fest_input)
        serialized_prediction = serialize_waste_prediction_response(
            prediction, request.locations
        )
        prediction_status: StageStatus["prediction"] = "success"
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Internal error executing waste prediction model: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error executing waste prediction model: {exc}",
        )

    # -------------------------------------------------------------------------
    # 3. Stage 2: Spatial Bin Distribution Model
    # -------------------------------------------------------------------------
    location_by_name = {loc.name.strip(): loc for loc in request.locations}
    location_by_id = {loc.id: loc for loc in request.locations}

    polygon_locations = [
        loc for loc in request.locations if loc.geometry.get("type") in ("Polygon", "MultiPolygon")
    ]
    unsupported_locations = [
        loc for loc in request.locations if loc.geometry.get("type") not in ("Polygon", "MultiPolygon")
    ]

    location_recommendations: list[LocationBinRecommendation] = []
    all_placed_markers: list[BinPlacementMarker] = []
    bin_assumptions: list[str] = []
    bin_model_failed = False

    # A. Process unsupported locations explicitly (e.g. Point geometries)
    for un_loc in unsupported_locations:
        g_type = un_loc.geometry.get("type", "Unknown")
        warn_msg = (
            f"Location {un_loc.name!r} has {g_type} geometry. Perimeter-sampled bin placement "
            "requires a Polygon or MultiPolygon with measurable boundary."
        )
        warnings.append(warn_msg)
        location_recommendations.append(
            LocationBinRecommendation(
                id=un_loc.id,
                location_name=un_loc.name,
                area=un_loc.area,
                activities=list(un_loc.activities),
                capacity_bins=RangeSchema(low=0, central=0, high=0),
                spatial_minimum_bins=0,
                rectangle_perimeter_m=0.0,
                perimeter_spacing_max_bins=0,
                perimeter_spacing_minimum_bins=0,
                recommended_bins=RangeSchema(low=0, central=0, high=0),
                required_emptying_turns=RangeSchema(low=0, central=0, high=0),
                daily_capacity_coverage_litres=0.0,
                capacity_shortfall_litres=0.0,
                disposable=StreamRecommendationSchema(
                    capacity_demand_bins=0,
                    physical_bins=0,
                    required_turns=0,
                    daily_waste_kg=0.0,
                    daily_volume_litres=0.0,
                    available_capacity_litres=0.0,
                    capacity_shortfall_litres=0.0,
                    placements=[],
                ),
                recyclable=StreamRecommendationSchema(
                    capacity_demand_bins=0,
                    physical_bins=0,
                    required_turns=0,
                    daily_waste_kg=0.0,
                    daily_volume_litres=0.0,
                    available_capacity_litres=0.0,
                    capacity_shortfall_litres=0.0,
                    placements=[],
                ),
                total_capacity_demand_bins=0,
                total_physical_bins=0,
                placement_scenario="central",
                boundary_spacing_target_m=DEFAULT_BOUNDARY_SPACING_M,
                actual_boundary_spacing_m=0.0,
                boundary_inset_m=DEFAULT_BOUNDARY_INSET_M,
                placement_warnings=[warn_msg],
                placement_status="unsupported_geometry",
                bin_placements=[],
            )
        )

    # B. Process valid Polygon and MultiPolygon locations using predict_on_location_bins
    if polygon_locations:
        poly_geometries = {loc.name.strip(): loc.geometry for loc in polygon_locations}
        poly_names = set(poly_geometries.keys())
        poly_allocations = tuple(
            a for a in prediction.location_allocations if a.location_name in poly_names
        )

        subset_waste_prediction = dataclasses.replace(
            prediction, location_allocations=poly_allocations
        )

        bin_prediction_result: OnLocationBinPrediction | None = None
        try:
            # First attempt batch prediction on all valid polygon locations
            bin_prediction_result = predict_on_location_bins(
                fest_input=fest_input,
                waste_prediction=subset_waste_prediction,
                location_geometries=poly_geometries,
            )
            bin_assumptions = list(bin_prediction_result.assumptions)
        except Exception as batch_exc:
            logger.warning(
                "Batch bin prediction failed (%s); falling back to per-location placement.",
                batch_exc,
            )
            # If batch fails (e.g. one polygon is degenerate or too narrow), process location-by-location
            single_results = []
            for poly_loc in polygon_locations:
                single_alloc = tuple(
                    a for a in prediction.location_allocations if a.location_name == poly_loc.name.strip()
                )
                if not single_alloc:
                    continue
                single_pred = dataclasses.replace(prediction, location_allocations=single_alloc)
                try:
                    res = predict_on_location_bins(
                        fest_input=fest_input,
                        waste_prediction=single_pred,
                        location_geometries={poly_loc.name.strip(): poly_loc.geometry},
                    )
                    single_results.extend(res.locations)
                    if not bin_assumptions:
                        bin_assumptions = list(res.assumptions)
                except Exception as loc_exc:
                    loc_warn = f"Bin placement failed for location {poly_loc.name!r}: {loc_exc}"
                    warnings.append(loc_warn)
                    location_recommendations.append(
                        LocationBinRecommendation(
                            id=poly_loc.id,
                            location_name=poly_loc.name,
                            area=poly_loc.area,
                            activities=list(poly_loc.activities),
                            capacity_bins=RangeSchema(low=0, central=0, high=0),
                            spatial_minimum_bins=0,
                            rectangle_perimeter_m=0.0,
                            perimeter_spacing_max_bins=0,
                            perimeter_spacing_minimum_bins=0,
                            recommended_bins=RangeSchema(low=0, central=0, high=0),
                            required_emptying_turns=RangeSchema(low=0, central=0, high=0),
                            daily_capacity_coverage_litres=0.0,
                            capacity_shortfall_litres=0.0,
                            disposable=StreamRecommendationSchema(
                                capacity_demand_bins=0,
                                physical_bins=0,
                                required_turns=0,
                                daily_waste_kg=0.0,
                                daily_volume_litres=0.0,
                                available_capacity_litres=0.0,
                                capacity_shortfall_litres=0.0,
                                placements=[],
                            ),
                            recyclable=StreamRecommendationSchema(
                                capacity_demand_bins=0,
                                physical_bins=0,
                                required_turns=0,
                                daily_waste_kg=0.0,
                                daily_volume_litres=0.0,
                                available_capacity_litres=0.0,
                                capacity_shortfall_litres=0.0,
                                placements=[],
                            ),
                            total_capacity_demand_bins=0,
                            total_physical_bins=0,
                            placement_scenario="central",
                            boundary_spacing_target_m=DEFAULT_BOUNDARY_SPACING_M,
                            actual_boundary_spacing_m=0.0,
                            boundary_inset_m=DEFAULT_BOUNDARY_INSET_M,
                            placement_warnings=[loc_warn],
                            placement_status="failed",
                            bin_placements=[],
                        )
                    )

            if single_results:
                bin_prediction_result = OnLocationBinPrediction(
                    locations=tuple(single_results),
                    bin_capacity_litres=BIN_CAPACITY_LITRES,
                    usable_fill_fraction=USABLE_FILL_FRACTION,
                    usable_bin_capacity_litres=USABLE_BIN_CAPACITY_LITRES,
                    density_kg_per_m3={},
                    boundary_spacing_target_m=DEFAULT_BOUNDARY_SPACING_M,
                    boundary_inset_m=DEFAULT_BOUNDARY_INSET_M,
                    assumptions=tuple(bin_assumptions),
                )
            else:
                bin_model_failed = True
                errors.append(f"Bin distribution model failed for all polygon locations: {batch_exc}")

        if bin_prediction_result:
            for loc_result in bin_prediction_result.locations:
                req_loc = location_by_name.get(loc_result.location_name)
                stable_loc_id = req_loc.id if req_loc else loc_result.location_name

                loc_markers: list[BinPlacementMarker] = []
                for p in loc_result.bin_placements:
                    marker = BinPlacementMarker(
                        id=f"{stable_loc_id}-bin-{p.bin_index}",
                        location_id=stable_loc_id,
                        location_name=loc_result.location_name,
                        coordinates=[p.longitude, p.latitude],
                        bin_index=p.bin_index,
                        bin_type=p.bin_type,
                        bin_scenario=loc_result.placement_scenario,
                        boundary_distance_m=p.boundary_distance_m,
                    )
                    loc_markers.append(marker)
                    all_placed_markers.append(marker)

                # Diagnostic check for marker count vs recommended central count
                loc_warnings = list(loc_result.placement_warnings)
                if len(loc_markers) != loc_result.recommended_bins.central:
                    discrepancy_msg = (
                        f"Location {loc_result.location_name!r}: Generated {len(loc_markers)} marker(s) "
                        f"for central recommended count of {loc_result.recommended_bins.central}."
                    )
                    loc_warnings.append(discrepancy_msg)
                    warnings.append(discrepancy_msg)

                disp_markers = [m for m in loc_markers if m.bin_type == "Disposable"]
                rec_markers = [m for m in loc_markers if m.bin_type == "Recyclable"]

                disposable_schema = StreamRecommendationSchema(
                    capacity_demand_bins=loc_result.disposable_capacity_bins.central,
                    physical_bins=loc_result.disposable_physical_bins.central,
                    required_turns=loc_result.disposable_required_turns.central,
                    daily_waste_kg=loc_result.disposable_waste_kg_per_day_central,
                    daily_volume_litres=loc_result.disposable_volume_litres_per_day_central,
                    available_capacity_litres=loc_result.disposable_capacity_coverage_litres,
                    capacity_shortfall_litres=loc_result.disposable_capacity_shortfall_litres,
                    placements=disp_markers,
                )
                recyclable_schema = StreamRecommendationSchema(
                    capacity_demand_bins=loc_result.recyclable_capacity_bins.central,
                    physical_bins=loc_result.recyclable_physical_bins.central,
                    required_turns=loc_result.recyclable_required_turns.central,
                    daily_waste_kg=loc_result.recyclable_waste_kg_per_day_central,
                    daily_volume_litres=loc_result.recyclable_volume_litres_per_day_central,
                    available_capacity_litres=loc_result.recyclable_capacity_coverage_litres,
                    capacity_shortfall_litres=loc_result.recyclable_capacity_shortfall_litres,
                    placements=rec_markers,
                )

                location_recommendations.append(
                    LocationBinRecommendation(
                        id=stable_loc_id,
                        location_name=loc_result.location_name,
                        area=loc_result.area,
                        activities=list(loc_result.activities),
                        capacity_bins=RangeSchema(
                            low=loc_result.capacity_bins.low,
                            central=loc_result.capacity_bins.central,
                            high=loc_result.capacity_bins.high,
                        ),
                        spatial_minimum_bins=loc_result.spatial_minimum_bins,
                        rectangle_perimeter_m=loc_result.rectangle_perimeter_m,
                        perimeter_spacing_max_bins=loc_result.perimeter_spacing_max_bins,
                        perimeter_spacing_minimum_bins=loc_result.perimeter_spacing_max_bins,
                        recommended_bins=RangeSchema(
                            low=loc_result.recommended_bins.low,
                            central=loc_result.recommended_bins.central,
                            high=loc_result.recommended_bins.high,
                        ),
                        required_emptying_turns=RangeSchema(
                            low=loc_result.required_emptying_turns.low,
                            central=loc_result.required_emptying_turns.central,
                            high=loc_result.required_emptying_turns.high,
                        ),
                        daily_capacity_coverage_litres=loc_result.daily_capacity_coverage_litres,
                        capacity_shortfall_litres=loc_result.capacity_shortfall_litres,
                        disposable=disposable_schema,
                        recyclable=recyclable_schema,
                        total_capacity_demand_bins=loc_result.capacity_bins.central,
                        total_physical_bins=loc_result.recommended_bins.central,
                        placement_scenario=loc_result.placement_scenario,
                        boundary_spacing_target_m=loc_result.boundary_spacing_target_m,
                        actual_boundary_spacing_m=loc_result.actual_boundary_spacing_m,
                        boundary_inset_m=loc_result.boundary_inset_m,
                        placement_warnings=loc_warnings,
                        placement_status="placed",
                        bin_placements=loc_markers,
                    )
                )

    # C. Assemble BinRecommendationResponse
    total_central_bins = sum(rec.recommended_bins.central for rec in location_recommendations)
    total_capacity_low = sum(rec.capacity_bins.low for rec in location_recommendations)
    total_capacity_central = sum(rec.capacity_bins.central for rec in location_recommendations)
    total_capacity_high = sum(rec.capacity_bins.high for rec in location_recommendations)

    total_rec_low = sum(rec.recommended_bins.low for rec in location_recommendations)
    total_rec_central = sum(rec.recommended_bins.central for rec in location_recommendations)
    total_rec_high = sum(rec.recommended_bins.high for rec in location_recommendations)

    peak_turns_low = max((rec.required_emptying_turns.low for rec in location_recommendations), default=0)
    peak_turns_central = max((rec.required_emptying_turns.central for rec in location_recommendations), default=0)
    peak_turns_high = max((rec.required_emptying_turns.high for rec in location_recommendations), default=0)

    total_disp_bins = sum(
        rec.disposable.physical_bins if rec.disposable else 0
        for rec in location_recommendations
    )
    total_rec_bins = sum(
        rec.recyclable.physical_bins if rec.recyclable else 0
        for rec in location_recommendations
    )

    placed_locations = [r for r in location_recommendations if r.placement_status == "placed"]
    if bin_model_failed or (not placed_locations and unsupported_locations):
        bins_status = "failed" if not placed_locations else "partial"
    elif len(placed_locations) == len(request.locations):
        bins_status = "success"
    elif placed_locations:
        bins_status = "partial"
    else:
        bins_status = "failed"

    bin_recommendations_response: Optional[BinRecommendationResponse] = None
    if not bin_model_failed:
        bin_recommendations_response = BinRecommendationResponse(
            total_bins=total_central_bins,
            capacity_bins=RangeSchema(
                low=float(total_capacity_low),
                central=float(total_capacity_central),
                high=float(total_capacity_high),
            ),
            recommended_bins=RangeSchema(
                low=float(total_rec_low),
                central=float(total_rec_central),
                high=float(total_rec_high),
            ),
            required_emptying_turns=RangeSchema(
                low=float(peak_turns_low),
                central=float(peak_turns_central),
                high=float(peak_turns_high),
            ),
            stream_counts={
                "disposable": total_disp_bins,
                "recyclable": total_rec_bins,
                "general": total_disp_bins,
                "food": 0,
            },
            stream_breakdown_available=True,
            locations=location_recommendations,
            bins=all_placed_markers,
            bin_capacity_litres=BIN_CAPACITY_LITRES,
            usable_fill_fraction=USABLE_FILL_FRACTION,
            usable_bin_capacity_litres=USABLE_BIN_CAPACITY_LITRES,
            boundary_spacing_target_m=DEFAULT_BOUNDARY_SPACING_M,
            boundary_inset_m=DEFAULT_BOUNDARY_INSET_M,
            assumptions=bin_assumptions,
            warnings=warnings,
        )

    # -------------------------------------------------------------------------
    # 4. Stage 3: Pedestrian Route Planning
    # -------------------------------------------------------------------------
    route_response: Optional[RoutePlanResponse] = None
    if request.campus_boundary:
        b_type = request.campus_boundary.get("type")
        if b_type in ("Polygon", "MultiPolygon"):
            route_locations = [
                LocationRouteRequest(
                    id=loc.id,
                    name=loc.name,
                    activities=loc.activities,
                    geometry=loc.geometry,
                    center=loc.center,
                    weight=loc.weight,
                )
                for loc in request.locations
            ]
            route_plan_req = RoutePlanRequest(
                boundary=request.campus_boundary,
                locations=route_locations,
                config=request.routing_config,
            )
            try:
                route_response = await plan_pedestrian_routes(route_plan_req)
                routes_status: StageStatus["routes"] = "success"
                if route_response.warnings:
                    warnings.extend(route_response.warnings)
            except HTTPException as exc:
                routes_status = "failed"
                route_warn = f"Pedestrian routing unavailable: {exc.detail}"
                logger.warning(route_warn)
                warnings.append(route_warn)
            except Exception as exc:
                routes_status = "failed"
                route_warn = f"Pedestrian routing error: {exc}"
                logger.warning(route_warn, exc_info=True)
                warnings.append(route_warn)
        else:
            routes_status = "skipped"
            skip_warn = f"Campus boundary must be Polygon or MultiPolygon, received {b_type!r}; route planning skipped."
            warnings.append(skip_warn)
    else:
        routes_status = "skipped"
        warnings.append("Campus boundary GeoJSON not provided; pedestrian route planning skipped.")

    # -------------------------------------------------------------------------
    # 5. Stage 4: Influence-Based Road-Bin Placement Model
    # -------------------------------------------------------------------------
    road_bin_response: Optional[RoadBinRecommendationResponse] = None
    road_bins_status: Literal["success", "partial", "failed", "skipped"] = "skipped"

    if route_response is not None and route_response.paths_geojson:
        try:
            poly_geoms_by_id = {
                loc.id: loc.geometry
                for loc in request.locations
                if loc.geometry.get("type") in ("Polygon", "MultiPolygon")
            }
            loc_compositions = {}
            for loc in request.locations:
                alloc = next(
                    (a for a in prediction.location_allocations if a.location_name == loc.name.strip()),
                    None,
                )
                if alloc is not None:
                    loc_compositions[loc.id] = alloc.composition_kg

            loc_names_by_id = {loc.id: loc.name for loc in request.locations}

            if poly_geoms_by_id:
                road_bin_result: RoadBinPrediction = predict_road_bins(
                    location_geometries=poly_geoms_by_id,
                    waste_compositions=loc_compositions,
                    paths_geojson=route_response.paths_geojson,
                    campus_boundary=request.campus_boundary,
                    location_names=loc_names_by_id,
                )

                road_markers = [
                    RoadBinPlacementMarker(
                        id=p.placement_id,
                        coordinates=[p.longitude, p.latitude],
                        source_segment_id=p.source_segment_id,
                        normalized_popularity_score=p.normalized_popularity_score,
                        served_location_ids=list(p.served_location_ids),
                        served_location_names=list(p.served_location_names),
                        served_location_distances_m=p.served_location_distances_m,
                        stream_type=p.stream_type,
                        provenance=p.provenance,
                    )
                    for p in road_bin_result.placements
                ]

                road_bin_response = RoadBinRecommendationResponse(
                    total_road_bins=road_bin_result.total_physical_bins,
                    total_eligible_candidates=road_bin_result.total_eligible_candidates,
                    total_locations_requiring_coverage=road_bin_result.total_locations_requiring_coverage,
                    covered_location_ids=list(road_bin_result.covered_location_ids),
                    uncovered_location_ids=list(road_bin_result.uncovered_location_ids),
                    location_influence_radii_m=road_bin_result.location_influence_radii_m,
                    location_dominant_waste_types=road_bin_result.location_dominant_waste_types,
                    candidate_sampling_interval_m=road_bin_result.candidate_sampling_interval_m,
                    road_bin_spacing_m=road_bin_result.road_bin_spacing_m,
                    solver_name=road_bin_result.solver_name,
                    optimality_proven=road_bin_result.optimality_proven,
                    total_popularity_score=road_bin_result.total_popularity_score,
                    placements=road_markers,
                    warnings=list(road_bin_result.warnings),
                    assumptions=list(road_bin_result.assumptions),
                )

                if road_bin_result.warnings:
                    warnings.extend(road_bin_result.warnings)

                if len(road_bin_result.covered_location_ids) == len(poly_geoms_by_id):
                    road_bins_status = "success"
                elif road_bin_result.covered_location_ids:
                    road_bins_status = "partial"
                else:
                    road_bins_status = "failed"
            else:
                road_bins_status = "skipped"
                warnings.append("No Polygon/MultiPolygon locations provided; road-bin placement skipped.")
        except Exception as rb_exc:
            logger.warning("Road-bin placement model encountered an error: %s", rb_exc, exc_info=True)
            road_bins_status = "failed"
            warnings.append(f"Road-bin placement model error: {rb_exc}")
    else:
        road_bins_status = "skipped"

    # -------------------------------------------------------------------------
    # 6. Aggregate Response
    # -------------------------------------------------------------------------
    diagnostics = PlanDiagnostics(
        warnings=warnings,
        errors=errors,
        stage_status=StageStatus(
            prediction=prediction_status,
            bins=bins_status,
            routes=routes_status,
        ),
    )

    return CampusPlanResponse(
        success=True,
        prediction=serialized_prediction,
        bin_recommendations=bin_recommendations_response,
        road_bin_recommendations=road_bin_response,
        routes=route_response,
        diagnostics=diagnostics,
    )

