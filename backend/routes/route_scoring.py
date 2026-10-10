"""Demand-weighted pedestrian route scoring.

Calculates graph-based shortest paths between activity locations, scores mapped segments
using symmetric activity attraction proxies, normalizes scores deterministically,
and extracts diagnostics and intersection metrics.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional
import networkx as nx

from .schemas import LocationRouteRequest, ScoringDiagnostics

logger = logging.getLogger(__name__)

# Grounded in frontend/src/constants/activities.ts and waste predictor model
ACTIVITY_WEIGHTS: dict[str, float] = {
    "Food Stalls": 5.0,
    "Music Concert": 4.0,
    "Performing Arts": 3.0,
    "Literary & Fine Arts": 2.0,
    "Sports": 1.0,
    "Hackathon": 1.0,
}
DEFAULT_ACTIVITY_WEIGHT = 1.0


def calculate_location_weight(loc: LocationRouteRequest) -> float:
    """Derive non-negative attraction weight for a location from activity tags or explicit override."""
    if loc.weight is not None and loc.weight >= 0:
        return float(loc.weight)

    if not loc.activities:
        return DEFAULT_ACTIVITY_WEIGHT

    total = sum(ACTIVITY_WEIGHTS.get(act, DEFAULT_ACTIVITY_WEIGHT) for act in loc.activities)
    return max(0.1, float(total))


def calculate_pair_contribution(weight_a: float, weight_b: float) -> float:
    """Calculate symmetric pair attraction contribution using geometric mean."""
    return math.sqrt(weight_a * weight_b)


def score_pedestrian_routes(
    graph: nx.Graph,
    locations: list[LocationRouteRequest],
    max_route_pairs: int = 500,
) -> tuple[nx.Graph, ScoringDiagnostics, list[dict[str, Any]]]:
    """Calculate shortest pedestrian routes and assign demand-weighted scores to mapped edges.

    Only graph-based shortest paths are used. Inferred connectors are excluded from mapped popularity scores.
    """
    # Initialize score on all edges in graph
    for _, _, data in graph.edges(data=True):
        data["raw_score"] = 0.0
        data["normalized_score"] = 0.0

    # 1. Calculate and normalize location weights
    raw_weights = {loc.id: calculate_location_weight(loc) for loc in locations}
    max_w = max(raw_weights.values()) if raw_weights else 1.0
    normalized_weights = {loc_id: (w / max_w if max_w > 0 else 1.0) for loc_id, w in raw_weights.items()}

    # 2. Filter locations that exist as connected nodes in graph
    connected_locs: list[LocationRouteRequest] = []
    unmatched_loc_ids: list[str] = []

    for loc in locations:
        node_id = f"activity_{loc.id}"
        if graph.has_node(node_id) and graph.degree(node_id) > 0:
            connected_locs.append(loc)
        else:
            unmatched_loc_ids.append(loc.id)

    # 3. Enumerate all pairs between connected locations
    all_pairs: list[tuple[LocationRouteRequest, LocationRouteRequest]] = []
    n = len(connected_locs)
    for i in range(n):
        for j in range(i + 1, n):
            all_pairs.append((connected_locs[i], connected_locs[j]))

    # Prioritize if pairs exceed threshold
    if len(all_pairs) > max_route_pairs:
        logger.warning(
            "Limiting route pairs from %d to %d to preserve operational bounds",
            len(all_pairs),
            max_route_pairs,
        )
        all_pairs.sort(
            key=lambda p: normalized_weights[p[0].id] * normalized_weights[p[1].id],
            reverse=True,
        )
        evaluated_pairs = all_pairs[:max_route_pairs]
    else:
        evaluated_pairs = all_pairs

    # 4. Compute shortest paths using reusable single-source Dijkstra trees
    # Group pairs by source location
    pairs_by_source: dict[str, list[LocationRouteRequest]] = {}
    for loc_a, loc_b in evaluated_pairs:
        pairs_by_source.setdefault(loc_a.id, []).append(loc_b)

    connected_pairs_count = 0
    unreachable_pairs_count = 0
    evaluated_pairs_count = len(evaluated_pairs)

    # Edge popularity accumulator: (u, v) -> raw_score
    edge_raw_scores: dict[tuple[str, str], float] = {}

    for src_id, target_locs in pairs_by_source.items():
        src_node = f"activity_{src_id}"
        src_w = normalized_weights[src_id]

        try:
            # Reusable Dijkstra shortest path tree from source node
            paths = nx.single_source_dijkstra_path(graph, src_node, weight="length_m")
        except Exception:
            paths = {}

        for tgt_loc in target_locs:
            tgt_node = f"activity_{tgt_loc.id}"
            tgt_w = normalized_weights[tgt_loc.id]

            if tgt_node in paths:
                connected_pairs_count += 1
                pair_contrib = calculate_pair_contribution(src_w, tgt_w)
                path_nodes = paths[tgt_node]

                # Traverse edges on shortest path
                for k in range(len(path_nodes) - 1):
                    u = path_nodes[k]
                    v = path_nodes[k + 1]

                    if graph.has_edge(u, v):
                        edge_data = graph[u][v]
                        # Only score mapped pedestrian paths, not inferred connectors!
                        if edge_data.get("provenance") == "osm_mapped":
                            edge_key = (u, v) if u < v else (v, u)
                            edge_raw_scores[edge_key] = edge_raw_scores.get(edge_key, 0.0) + pair_contrib
            else:
                unreachable_pairs_count += 1

    # 5. Assign raw scores and normalize to [0, 1]
    max_raw = max(edge_raw_scores.values()) if edge_raw_scores else 0.0

    for u, v, data in graph.edges(data=True):
        if data.get("provenance") == "osm_mapped":
            edge_key = (u, v) if u < v else (v, u)
            raw = edge_raw_scores.get(edge_key, 0.0)
            data["raw_score"] = round(raw, 4)
            if max_raw > 0:
                data["normalized_score"] = round(raw / max_raw, 4)
            else:
                data["normalized_score"] = 0.0
        else:
            # Connector edges stay 0.0 score
            data["raw_score"] = 0.0
            data["normalized_score"] = 0.0

    # 6. Extract high-priority intersections (degree >= 3 with route traffic)
    intersections: list[dict[str, Any]] = []
    for node, deg in graph.degree():
        if deg >= 3 and not graph.nodes[node].get("is_activity"):
            incident_score = sum(
                graph[node][neighbor].get("raw_score", 0.0)
                for neighbor in graph.neighbors(node)
            )
            nd = graph.nodes[node]
            if "longitude" in nd and "latitude" in nd:
                intersections.append({
                    "node_id": str(node),
                    "degree": deg,
                    "traffic_score": round(incident_score, 3),
                    "longitude": nd["longitude"],
                    "latitude": nd["latitude"],
                })

    intersections.sort(key=lambda item: item["traffic_score"], reverse=True)

    diagnostics = ScoringDiagnostics(
        total_locations=len(locations),
        connected_locations=len(connected_locs),
        unmatched_locations=unmatched_loc_ids,
        evaluated_pairs=evaluated_pairs_count,
        connected_pairs=connected_pairs_count,
        unreachable_pairs=unreachable_pairs_count,
        max_raw_score=round(max_raw, 4),
    )

    logger.info(
        "Route scoring complete: %d evaluated pairs, %d connected, %d unreachable, max_raw_score=%.3f",
        evaluated_pairs_count,
        connected_pairs_count,
        unreachable_pairs_count,
        max_raw,
    )

    return graph, diagnostics, intersections

