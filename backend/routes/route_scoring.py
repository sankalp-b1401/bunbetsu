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


def calculate_path_length(graph: nx.Graph, path: list[str]) -> float:
    """Calculate the total metric length of a node sequence in the graph."""
    length = 0.0
    for idx in range(len(path) - 1):
        u, v = path[idx], path[idx + 1]
        if graph.has_edge(u, v):
            length += float(graph[u][v].get("length_m", 0.0))
    return length


def find_bounded_alternative_paths(
    graph: nx.Graph,
    source: str,
    target: str,
    tolerance_m: float = 10.0,
    max_paths: int = 20,
) -> tuple[list[list[str]], list[float], bool]:
    """Discover loopless paths between source and target satisfying length <= L0 + tolerance_m.

    Returns:
        (paths, lengths, reached_limit): Discovered paths, their lengths, and whether
        additional eligible paths existed beyond max_paths.
    """
    if source == target:
        return ([[source]], [0.0], False)

    if not (graph.has_node(source) and graph.has_node(target) and nx.has_path(graph, source, target)):
        return ([], [], False)

    # Fast path for single shortest path (zero tolerance or max_paths == 1)
    if tolerance_m <= 0.0 or max_paths <= 1:
        try:
            sp = nx.shortest_path(graph, source, target, weight="length_m")
            l0 = calculate_path_length(graph, sp)
            return ([sp], [l0], False)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return ([], [], False)

    paths: list[list[str]] = []
    lengths: list[float] = []
    reached_limit = False

    try:
        generator = nx.shortest_simple_paths(graph, source, target, weight="length_m")
        shortest_path = next(generator)
        l0 = calculate_path_length(graph, shortest_path)
        paths.append(shortest_path)
        lengths.append(l0)
        cutoff = l0 + float(tolerance_m)

        for path in generator:
            plen = calculate_path_length(graph, path)
            if plen > cutoff + 1e-9:
                break
            paths.append(path)
            lengths.append(plen)
            if len(paths) >= max_paths:
                # Check if there was at least one more path within cutoff
                try:
                    next_path = next(generator)
                    next_len = calculate_path_length(graph, next_path)
                    if next_len <= cutoff + 1e-9:
                        reached_limit = True
                except (StopIteration, nx.NetworkXNoPath):
                    pass
                break
    except (StopIteration, nx.NetworkXNoPath, nx.NodeNotFound):
        pass

    return (paths, lengths, reached_limit)


def calculate_path_shares(
    lengths: list[float],
    tolerance_m: float = 10.0,
    decay_lambda_m: Optional[float] = None,
) -> list[float]:
    """Calculate normalized shares p_k for paths using exponential distance decay.

    p_k = exp(-Delta_k / lambda) / sum_j exp(-Delta_j / lambda)
    where Delta_k = L_k - L_0 >= 0, and sum_k p_k == 1.0.
    """
    if not lengths:
        return []
    if len(lengths) == 1 or tolerance_m <= 0.0:
        return [1.0]

    if decay_lambda_m is not None and decay_lambda_m > 0:
        eff_lambda = float(decay_lambda_m)
    elif tolerance_m > 0:
        eff_lambda = float(tolerance_m) / 2.0
    else:
        eff_lambda = 1.0

    l0 = lengths[0]
    preferences = [math.exp(-max(0.0, l - l0) / eff_lambda) for l in lengths]
    total_pref = sum(preferences)

    if total_pref <= 0.0 or not math.isfinite(total_pref):
        return [1.0 / len(lengths)] * len(lengths)

    return [p / total_pref for p in preferences]


def score_pedestrian_routes(
    graph: nx.Graph,
    locations: list[LocationRouteRequest],
    max_route_pairs: int = 500,
    alternative_path_tolerance_m: float = 500.0,
    max_paths_per_pair: int = 20,
    alternative_path_decay_lambda_m: Optional[float] = None,
) -> tuple[nx.Graph, ScoringDiagnostics, list[dict[str, Any]]]:
    """Calculate alternative pedestrian routes and assign demand-weighted scores to mapped edges.

    Discovers bounded loopless paths within alternative_path_tolerance_m of the shortest path,
    applies exponential distance decay preference weighting, and strictly conserves pair demand.
    Inferred connectors are excluded from mapped popularity scores.
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

    # 4. Compute alternative paths and allocate demand
    connected_pairs_count = 0
    unreachable_pairs_count = 0
    evaluated_pairs_count = len(evaluated_pairs)
    pairs_with_path_search = 0
    total_paths_evaluated = 0
    pairs_with_multiple_paths = 0
    pairs_reaching_path_limit = 0

    # Edge popularity accumulator: (u, v) -> raw_score (undirected edge key)
    edge_raw_scores: dict[tuple[str, str], float] = {}

    for loc_a, loc_b in evaluated_pairs:
        src_node = f"activity_{loc_a.id}"
        tgt_node = f"activity_{loc_b.id}"
        src_w = normalized_weights[loc_a.id]
        tgt_w = normalized_weights[loc_b.id]

        if not (graph.has_node(src_node) and graph.has_node(tgt_node) and nx.has_path(graph, src_node, tgt_node)):
            unreachable_pairs_count += 1
            continue

        paths, lengths, reached_limit = find_bounded_alternative_paths(
            graph=graph,
            source=src_node,
            target=tgt_node,
            tolerance_m=alternative_path_tolerance_m,
            max_paths=max_paths_per_pair,
        )

        if not paths:
            unreachable_pairs_count += 1
            continue

        connected_pairs_count += 1
        pairs_with_path_search += 1
        total_paths_evaluated += len(paths)
        if len(paths) > 1:
            pairs_with_multiple_paths += 1
        if reached_limit:
            pairs_reaching_path_limit += 1

        shares = calculate_path_shares(
            lengths=lengths,
            tolerance_m=alternative_path_tolerance_m,
            decay_lambda_m=alternative_path_decay_lambda_m,
        )
        pair_contrib = calculate_pair_contribution(src_w, tgt_w)

        # Distribute pair contribution across alternative paths
        for path, share in zip(paths, shares):
            path_contrib = pair_contrib * share
            for k in range(len(path) - 1):
                u = path[k]
                v = path[k + 1]
                if graph.has_edge(u, v):
                    edge_data = graph[u][v]
                    # Only score mapped pedestrian paths, not inferred connectors!
                    if edge_data.get("provenance") == "osm_mapped":
                        edge_key = (u, v) if u < v else (v, u)
                        edge_raw_scores[edge_key] = edge_raw_scores.get(edge_key, 0.0) + path_contrib

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

    eff_lambda = (
        float(alternative_path_decay_lambda_m)
        if (alternative_path_decay_lambda_m is not None and alternative_path_decay_lambda_m > 0)
        else (round(alternative_path_tolerance_m / 2.0, 4) if alternative_path_tolerance_m > 0 else 1.0)
    )

    diagnostics = ScoringDiagnostics(
        total_locations=len(locations),
        connected_locations=len(connected_locs),
        unmatched_locations=unmatched_loc_ids,
        evaluated_pairs=evaluated_pairs_count,
        connected_pairs=connected_pairs_count,
        unreachable_pairs=unreachable_pairs_count,
        max_raw_score=round(max_raw, 4),
        pairs_with_path_search=pairs_with_path_search,
        total_paths_evaluated=total_paths_evaluated,
        pairs_with_multiple_paths=pairs_with_multiple_paths,
        pairs_reaching_path_limit=pairs_reaching_path_limit,
        alternative_path_tolerance_m=round(alternative_path_tolerance_m, 2),
        max_paths_per_pair=max_paths_per_pair,
        alternative_path_decay_lambda_m=round(eff_lambda, 4),
    )

    logger.info(
        "Route scoring complete: %d evaluated pairs, %d connected, %d unreachable, "
        "%d total paths, %d multi-path pairs, max_raw_score=%.3f",
        evaluated_pairs_count,
        connected_pairs_count,
        unreachable_pairs_count,
        total_paths_evaluated,
        pairs_with_multiple_paths,
        max_raw,
    )

    return graph, diagnostics, intersections


