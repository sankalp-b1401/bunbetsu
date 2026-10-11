"""Routing orchestration service for Bunbetsu.

Coordinates OSM acquisition, topological graph construction, location snapping,
shortest-path scoring, and GeoJSON response serialization.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
import networkx as nx
from fastapi import HTTPException, status

from .connectors import connect_activity_locations
from .graph_builder import build_pedestrian_graph
from .osm_client import (
    OverpassServiceError,
    OverpassTimeoutError,
    fetch_osm_data_for_boundary,
    parse_osm_elements,
)
from .route_scoring import score_pedestrian_routes
from .schemas import (
    GraphDiagnostics,
    LocationConnectivityStatus,
    RoutePlanRequest,
    RoutePlanResponse,
    RoutingConfigSchema,
)

logger = logging.getLogger(__name__)

SCORING_METHOD_METADATA = {
    "version": "Phase 2 Routes Pipeline v2.0 (Alternative Pedestrian Paths)",
    "description": "Bounded multi-path pedestrian demand allocation on OSM graph with exponential distance decay.",
    "cost_metric": "Geodesic length in metres",
    "pair_scoring_function": (
        "Geometric mean of normalized endpoint activity attraction weights "
        "distributed across bounded alternative paths with exponential distance decay"
    ),
    "score_interpretation": (
        "Modelled relative route importance index in range [0, 1]. "
        "This indicates relative pedestrian corridor demand under event layout assumptions and alternative path discovery, "
        "not measured empirical footfall counts or sensor measurements."
    ),
}


async def plan_pedestrian_routes(
    request: RoutePlanRequest,
    custom_osm_elements: Optional[list[dict[str, Any]]] = None,
) -> RoutePlanResponse:
    """Execute the end-to-end pedestrian routing and scoring pipeline."""
    config = request.config or RoutingConfigSchema()
    warnings: list[str] = []

    # 1. Fetch OSM pedestrian network and obstacle data
    raw_elements: list[dict[str, Any]]
    if custom_osm_elements is not None:
        raw_elements = custom_osm_elements
    else:
        try:
            osm_data = await fetch_osm_data_for_boundary(
                boundary_geojson=request.boundary,
                timeout_s=config.overpass_timeout_s,
            )
            raw_elements = osm_data.get("elements", [])
        except OverpassTimeoutError as exc:
            logger.error("Overpass timeout: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"OpenStreetMap Overpass API timed out: {exc}",
            )
        except OverpassServiceError as exc:
            logger.error("Overpass service failure: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenStreetMap data acquisition failed: {exc}",
            )
        except Exception as exc:
            logger.error("Unexpected error contacting Overpass: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to retrieve OpenStreetMap pedestrian network: {exc}",
            )

    # 2. Parse OSM elements
    nodes_dict, ped_ways, obs_ways = parse_osm_elements(raw_elements)

    if not ped_ways:
        warnings.append(
            "No eligible pedestrian ways were found within the campus boundary in OpenStreetMap."
        )

    # 3. Build pedestrian graph clipped to campus boundary
    try:
        network = build_pedestrian_graph(
            boundary_geojson=request.boundary,
            nodes_dict=nodes_dict,
            pedestrian_ways=ped_ways,
            obstacle_ways=obs_ways,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Error building pedestrian graph: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error constructing pedestrian graph: {exc}",
        )

    # 4. Connect activity locations to pedestrian graph
    G_connected, connector_objs, connectivity_statuses = connect_activity_locations(
        network=network,
        locations=request.locations,
        max_snap_distance_m=config.max_snap_distance_m,
        check_barriers=config.check_barriers,
    )

    unmatched_statuses = [s for s in connectivity_statuses if s.status == "unmatched"]
    if unmatched_statuses:
        warnings.append(
            f"{len(unmatched_statuses)} of {len(request.locations)} locations could not be connected "
            f"to the pedestrian network within {config.max_snap_distance_m:.1f}m."
        )

    flagged_statuses = [s for s in connectivity_statuses if s.status == "flagged"]
    if flagged_statuses:
        warnings.append(
            f"{len(flagged_statuses)} location connector(s) cross known building/barrier geometries."
        )

    # 5. Score pedestrian routes with bounded alternative paths
    G_scored, scoring_diag, intersections_list = score_pedestrian_routes(
        graph=G_connected,
        locations=request.locations,
        max_route_pairs=config.max_route_pairs,
        alternative_path_tolerance_m=config.alternative_path_tolerance_m,
        max_paths_per_pair=config.max_paths_per_pair,
        alternative_path_decay_lambda_m=config.alternative_path_decay_lambda_m,
    )

    if scoring_diag.unreachable_pairs > 0:
        warnings.append(
            f"{scoring_diag.unreachable_pairs} location pair(s) are in disconnected graph components."
        )
    if scoring_diag.connected_pairs == 0 and scoring_diag.evaluated_pairs > 0:
        warnings.append(
            "No location pairs could be connected along mapped pedestrian paths."
        )
    if scoring_diag.pairs_reaching_path_limit > 0:
        warnings.append(
            f"{scoring_diag.pairs_reaching_path_limit} location pair(s) reached the maximum path limit ({config.max_paths_per_pair})."
        )

    # 6. Serialize mapped paths GeoJSON FeatureCollection
    path_features: list[dict[str, Any]] = []
    for u, v, data in G_scored.edges(data=True):
        if data.get("provenance") != "osm_mapped":
            continue

        geom_wgs84 = data.get("geometry_wgs84")
        if not geom_wgs84 or len(geom_wgs84) < 2:
            continue

        raw_score = float(data.get("raw_score", 0.0))
        norm_score = float(data.get("normalized_score", 0.0))
        length_m = float(data.get("length_m", 0.0))
        edge_id = str(data.get("id", f"{u}_{v}"))

        path_features.append({
            "type": "Feature",
            "id": edge_id,
            "geometry": {
                "type": "LineString",
                "coordinates": geom_wgs84,
            },
            "properties": {
                "id": edge_id,
                "osm_way_id": data.get("osm_way_id"),
                "highway": data.get("highway", "path"),
                "length_m": round(length_m, 2),
                "raw_score": round(raw_score, 4),
                "normalized_score": round(norm_score, 4),
                "u": u,
                "v": v,
                "layer": data.get("layer", 0),
                "bridge": data.get("bridge", False),
                "tunnel": data.get("tunnel", False),
                "provenance": "osm_mapped",
            },
        })

    paths_geojson = {
        "type": "FeatureCollection",
        "features": path_features,
    }

    # 7. Serialize connectors GeoJSON FeatureCollection
    connector_features: list[dict[str, Any]] = []
    for conn in connector_objs:
        connector_features.append({
            "type": "Feature",
            "id": f"connector_{conn.location_id}",
            "geometry": {
                "type": "LineString",
                "coordinates": conn.connector_line_wgs84,
            },
            "properties": {
                "id": f"connector_{conn.location_id}",
                "location_id": conn.location_id,
                "location_name": conn.location_name,
                "snap_distance_m": round(conn.snap_distance_m, 2),
                "connector_length_m": round(float(conn.connector_line_m.length), 2),
                "status": conn.status,
                "provenance": "connector",
                "reason": conn.reason,
            },
        })

    connectors_geojson = {
        "type": "FeatureCollection",
        "features": connector_features,
    }

    # 8. Serialize optional intersection priorities GeoJSON FeatureCollection
    intersection_features: list[dict[str, Any]] = []
    for inter in intersections_list[:50]:  # Top 50 key junctions
        intersection_features.append({
            "type": "Feature",
            "id": f"intersection_{inter['node_id']}",
            "geometry": {
                "type": "Point",
                "coordinates": [inter["longitude"], inter["latitude"]],
            },
            "properties": {
                "node_id": inter["node_id"],
                "degree": inter["degree"],
                "traffic_score": inter["traffic_score"],
            },
        })

    intersections_geojson = {
        "type": "FeatureCollection",
        "features": intersection_features,
    }

    graph_diag = GraphDiagnostics(
        nodes_count=network.node_count,
        edges_count=network.edge_count,
        total_length_m=round(network.total_length_m, 2),
        components_count=network.components_count,
        discarded_ways_count=network.discarded_segments_count,
    )

    return RoutePlanResponse(
        success=True,
        boundary_geojson=request.boundary,
        paths_geojson=paths_geojson,
        connectors_geojson=connectors_geojson,
        intersections_geojson=intersections_geojson,
        location_connectivity=connectivity_statuses,
        diagnostics={
            "graph": graph_diag.model_dump(),
            "scoring": scoring_diag.model_dump(),
        },
        metadata=SCORING_METHOD_METADATA,
        warnings=warnings,
    )

