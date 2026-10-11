"""Tests for demand-weighted route scoring (Phase 2D).

Covers shortest-path demand allocation, geometric mean pair contributions,
score normalization [0, 1], disconnected/unmatched handling, all-zero edge cases,
repeatability, and connector score exclusion.
"""

from __future__ import annotations

import math
import networkx as nx
import pytest
from routes.route_scoring import (
    ACTIVITY_WEIGHTS,
    calculate_location_weight,
    calculate_pair_contribution,
    calculate_path_length,
    calculate_path_shares,
    find_bounded_alternative_paths,
    score_pedestrian_routes,
)
from routes.schemas import LocationRouteRequest


@pytest.fixture
def linear_graph_with_activities():
    # Graph: activity_A --(conn1)-- J1 --(edge1: length 50)-- J2 --(edge2: length 50)-- J3 --(conn2)-- activity_B
    #                               |
    #                             (edge3: length 100)
    #                               |
    #                              J4 --(conn3)-- activity_C
    G = nx.Graph()

    # Activity nodes
    G.add_node("activity_A", is_activity=True, longitude=81.86, latitude=25.49)
    G.add_node("activity_B", is_activity=True, longitude=81.87, latitude=25.49)
    G.add_node("activity_C", is_activity=True, longitude=81.865, latitude=25.48)

    # Junction nodes
    G.add_node("J1", is_junction=True, longitude=81.861, latitude=25.49)
    G.add_node("J2", is_junction=True, longitude=81.865, latitude=25.49)
    G.add_node("J3", is_junction=True, longitude=81.869, latitude=25.49)
    G.add_node("J4", is_junction=True, longitude=81.865, latitude=25.485)

    # Connectors (provenance: connector)
    G.add_edge("activity_A", "J1", length_m=5.0, provenance="connector")
    G.add_edge("activity_B", "J3", length_m=5.0, provenance="connector")
    G.add_edge("activity_C", "J4", length_m=5.0, provenance="connector")

    # Mapped paths (provenance: osm_mapped)
    G.add_edge("J1", "J2", length_m=50.0, provenance="osm_mapped")
    G.add_edge("J2", "J3", length_m=50.0, provenance="osm_mapped")
    G.add_edge("J1", "J4", length_m=100.0, provenance="osm_mapped")

    return G


def test_activity_weight_calculation():
    # Food Stalls (5) + Sports (1) = 6
    loc = LocationRouteRequest(
        id="loc1",
        name="Food & Sports",
        activities=["Food Stalls", "Sports"],
        geometry={"type": "Point", "coordinates": [81.86, 25.49]},
    )
    assert calculate_location_weight(loc) == 6.0

    # Custom weight override takes precedence
    loc_override = LocationRouteRequest(
        id="loc2",
        name="Custom Weight",
        activities=["Food Stalls"],
        geometry={"type": "Point", "coordinates": [81.86, 25.49]},
        weight=10.5,
    )
    assert calculate_location_weight(loc_override) == 10.5


def test_geometric_mean_pair_contribution():
    w1 = 1.0
    w2 = 0.25
    expected = math.sqrt(1.0 * 0.25)  # 0.5
    assert math.isclose(calculate_pair_contribution(w1, w2), expected, rel_tol=1e-5)


def test_route_scoring_expected_contributions(linear_graph_with_activities):
    G = linear_graph_with_activities

    # Location A: Food Stalls (weight 5)
    # Location B: Music Concert (weight 4)
    # Location C: Literary & Fine Arts (weight 2)
    locations = [
        LocationRouteRequest(
            id="A",
            name="A",
            activities=["Food Stalls"],
            geometry={"type": "Point", "coordinates": [81.86, 25.49]},
        ),
        LocationRouteRequest(
            id="B",
            name="B",
            activities=["Music Concert"],
            geometry={"type": "Point", "coordinates": [81.87, 25.49]},
        ),
        LocationRouteRequest(
            id="C",
            name="C",
            activities=["Literary & Fine Arts"],
            geometry={"type": "Point", "coordinates": [81.865, 25.48]},
        ),
    ]

    G_scored, diag, intersections = score_pedestrian_routes(G, locations)

    assert diag.evaluated_pairs == 3
    assert diag.connected_pairs == 3
    assert diag.unreachable_pairs == 0

    # Check connector edges: raw_score and normalized_score MUST be 0.0
    assert G["activity_A"]["J1"]["raw_score"] == 0.0
    assert G["activity_B"]["J3"]["raw_score"] == 0.0
    assert G["activity_C"]["J4"]["raw_score"] == 0.0

    # Between A and B: path traverses J1-J2 and J2-J3
    # Between A and C: path traverses J1-J4
    # Between B and C: shortest path from B (J3) to C (J4) traverses J3-J2-J1-J4
    # Therefore, edge J1-J2 is traversed by A-B and B-C!
    # Edge J2-J3 is traversed by A-B and B-C!
    # Edge J1-J4 is traversed by A-C and B-C!
    assert G["J1"]["J2"]["raw_score"] > 0.0
    assert G["J2"]["J3"]["raw_score"] > 0.0
    assert G["J1"]["J4"]["raw_score"] > 0.0

    # Normalization: highest scoring edge has normalized_score == 1.0
    max_norm = max(d["normalized_score"] for _, _, d in G.edges(data=True))
    assert math.isclose(max_norm, 1.0, rel_tol=1e-3)


def test_repeatability_for_identical_inputs(linear_graph_with_activities):
    G1 = linear_graph_with_activities
    G2 = G1.copy()

    locations = [
        LocationRouteRequest(
            id="A",
            name="A",
            activities=["Food Stalls"],
            geometry={"type": "Point", "coordinates": [81.86, 25.49]},
        ),
        LocationRouteRequest(
            id="B",
            name="B",
            activities=["Music Concert"],
            geometry={"type": "Point", "coordinates": [81.87, 25.49]},
        ),
    ]

    G1_scored, diag1, _ = score_pedestrian_routes(G1, locations)
    G2_scored, diag2, _ = score_pedestrian_routes(G2, locations)

    assert diag1.max_raw_score == diag2.max_raw_score
    for u, v in G1.edges():
        assert G1[u][v]["raw_score"] == G2[u][v]["raw_score"]
        assert G1[u][v]["normalized_score"] == G2[u][v]["normalized_score"]


def test_all_zero_score_case():
    # Only 1 location: no pairs to evaluate -> all scores 0.0
    G = nx.Graph()
    G.add_node("activity_X", is_activity=True, longitude=81.86, latitude=25.49)
    G.add_node("J1", is_junction=True, longitude=81.86, latitude=25.49)
    G.add_node("J2", is_junction=True, longitude=81.861, latitude=25.49)
    G.add_edge("activity_X", "J1", length_m=5.0, provenance="connector")
    G.add_edge("J1", "J2", length_m=50.0, provenance="osm_mapped")

    loc = LocationRouteRequest(
        id="X",
        name="Only One",
        activities=["Food Stalls"],
        geometry={"type": "Point", "coordinates": [81.86, 25.49]},
    )

    G_scored, diag, _ = score_pedestrian_routes(G, [loc])

    assert diag.evaluated_pairs == 0
    assert diag.max_raw_score == 0.0
    assert G["J1"]["J2"]["raw_score"] == 0.0
    assert G["J1"]["J2"]["normalized_score"] == 0.0


def test_disconnected_locations_diagnostics():
    # Two disconnected components
    G = nx.Graph()
    G.add_node("activity_1", is_activity=True, longitude=81.86, latitude=25.49)
    G.add_node("J1", is_junction=True, longitude=81.86, latitude=25.49)
    G.add_edge("activity_1", "J1", length_m=5.0, provenance="connector")

    G.add_node("activity_2", is_activity=True, longitude=81.87, latitude=25.49)
    G.add_node("J2", is_junction=True, longitude=81.87, latitude=25.49)
    G.add_edge("activity_2", "J2", length_m=5.0, provenance="connector")

    locs = [
        LocationRouteRequest(id="1", name="Loc 1", activities=["Sports"], geometry={"type": "Point", "coordinates": [81.86, 25.49]}),
        LocationRouteRequest(id="2", name="Loc 2", activities=["Sports"], geometry={"type": "Point", "coordinates": [81.87, 25.49]}),
    ]

    G_scored, diag, _ = score_pedestrian_routes(G, locs)

    assert diag.evaluated_pairs == 1
    assert diag.connected_pairs == 0
    assert diag.unreachable_pairs == 1
    assert diag.max_raw_score == 0.0


@pytest.fixture
def multi_path_graph():
    """Graph with 4 alternative routes between J1 and J4:

    Path 1: J1-J2-J4: length = 50 + 50 = 100m (L0 shortest)
    Path 2: J1-J3-J4: length = 55 + 50 = 105m (Delta = 5m, within 10m tolerance)
    Path 3: J1-J5-J4: length = 60 + 50 = 110m (Delta = 10m, exactly at 10m cutoff)
    Path 4: J1-J6-J4: length = 70 + 50 = 120m (Delta = 20m, beyond 10m cutoff)
    """
    G = nx.Graph()
    G.add_node("activity_A", is_activity=True, longitude=81.86, latitude=25.49)
    G.add_node("activity_B", is_activity=True, longitude=81.87, latitude=25.49)

    for j in ["J1", "J2", "J3", "J4", "J5", "J6"]:
        G.add_node(j, is_junction=True, longitude=81.865, latitude=25.49)

    # Inferred connectors
    G.add_edge("activity_A", "J1", length_m=5.0, provenance="connector")
    G.add_edge("activity_B", "J4", length_m=5.0, provenance="connector")

    # Mapped edges
    # Path 1: 100m
    G.add_edge("J1", "J2", length_m=50.0, provenance="osm_mapped")
    G.add_edge("J2", "J4", length_m=50.0, provenance="osm_mapped")

    # Path 2: 105m
    G.add_edge("J1", "J3", length_m=55.0, provenance="osm_mapped")
    G.add_edge("J3", "J4", length_m=50.0, provenance="osm_mapped")

    # Path 3: 110m
    G.add_edge("J1", "J5", length_m=60.0, provenance="osm_mapped")
    G.add_edge("J5", "J4", length_m=50.0, provenance="osm_mapped")

    # Path 4: 120m
    G.add_edge("J1", "J6", length_m=70.0, provenance="osm_mapped")
    G.add_edge("J6", "J4", length_m=50.0, provenance="osm_mapped")

    return G


def test_path_eligibility_and_cutoffs(multi_path_graph):
    G = multi_path_graph
    # With tolerance 10m:
    # L0 = 100m (conn + 100m + conn)
    # Cutoff = L0 + 10m.
    # Eligible paths should be 100m, 105m, 110m (3 paths). 120m must be excluded.
    paths, lengths, reached_limit = find_bounded_alternative_paths(
        G, "activity_A", "activity_B", tolerance_m=10.0, max_paths=20
    )

    assert len(paths) == 3
    assert not reached_limit

    # Shortest path is always first
    assert paths[0] == ["activity_A", "J1", "J2", "J4", "activity_B"]
    l0 = lengths[0]

    # Path exactly at cutoff (110m) is included
    assert any(math.isclose(l, l0 + 10.0, abs_tol=1e-5) for l in lengths)

    # Path beyond cutoff (120m) is excluded
    assert not any(math.isclose(l, l0 + 20.0, abs_tol=1e-5) for l in lengths)

    # With tolerance 0m: only shortest path is included
    paths_0, lengths_0, _ = find_bounded_alternative_paths(
        G, "activity_A", "activity_B", tolerance_m=0.0, max_paths=20
    )
    assert len(paths_0) == 1
    assert paths_0[0] == paths[0]


def test_path_correctness_and_limits(multi_path_graph):
    G = multi_path_graph
    edges_before = set(G.edges())
    node_count_before = len(G.nodes())

    # Test max_paths limit: request only max 2 paths when 3 are within tolerance
    paths, lengths, reached_limit = find_bounded_alternative_paths(
        G, "activity_A", "activity_B", tolerance_m=10.0, max_paths=2
    )

    assert len(paths) == 2
    assert reached_limit is True  # Because 3rd path (110m) existed within cutoff!

    # Verify loopless paths and no duplicates
    for p in paths:
        assert len(p) == len(set(p)), "Path must be loopless"
    assert len(paths) == len(set(tuple(p) for p in paths)), "Duplicate paths must not occur"

    # Verify graph was not mutated
    assert set(G.edges()) == edges_before
    assert len(G.nodes()) == node_count_before


def test_equal_length_alternatives_handling():
    # Graph with 2 symmetrical paths of equal length
    G = nx.Graph()
    G.add_node("A")
    G.add_node("B")
    G.add_node("P1")
    G.add_node("P2")
    G.add_edge("A", "P1", length_m=50.0, provenance="osm_mapped")
    G.add_edge("P1", "B", length_m=50.0, provenance="osm_mapped")
    G.add_edge("A", "P2", length_m=50.0, provenance="osm_mapped")
    G.add_edge("P2", "B", length_m=50.0, provenance="osm_mapped")

    paths, lengths, _ = find_bounded_alternative_paths(G, "A", "B", tolerance_m=10.0, max_paths=10)
    assert len(paths) == 2
    assert math.isclose(lengths[0], lengths[1], abs_tol=1e-5)

    shares = calculate_path_shares(lengths, tolerance_m=10.0)
    assert len(shares) == 2
    assert math.isclose(shares[0], 0.5, rel_tol=1e-5)
    assert math.isclose(shares[1], 0.5, rel_tol=1e-5)
    assert math.isclose(sum(shares), 1.0, rel_tol=1e-5)


def test_contribution_allocation_and_conservation(multi_path_graph):
    G = multi_path_graph

    loc_a = LocationRouteRequest(
        id="A",
        name="Location A",
        activities=["Food Stalls"],  # weight 5
        geometry={"type": "Point", "coordinates": [81.86, 25.49]},
    )
    loc_b = LocationRouteRequest(
        id="B",
        name="Location B",
        activities=["Music Concert"],  # weight 4
        geometry={"type": "Point", "coordinates": [81.87, 25.49]},
    )

    # 1. Evaluate with tolerance 10m (3 eligible paths)
    G_scored, diag, _ = score_pedestrian_routes(
        G,
        [loc_a, loc_b],
        alternative_path_tolerance_m=10.0,
        max_paths_per_pair=20,
    )

    assert diag.connected_pairs == 1
    assert diag.pairs_with_multiple_paths == 1
    assert diag.total_paths_evaluated == 3
    assert diag.pairs_reaching_path_limit == 0

    # Connector edges MUST be 0
    assert G["activity_A"]["J1"]["raw_score"] == 0.0
    assert G["activity_B"]["J4"]["raw_score"] == 0.0

    # Expected pair contribution C_AB:
    # normalized weights: max is loc_a (5), so w_A = 1.0, w_B = 4/5 = 0.8
    # C_AB = sqrt(1.0 * 0.8) = sqrt(0.8) ~ 0.894427
    expected_c_ab = calculate_pair_contribution(1.0, 4.0 / 5.0)

    # Each branch (J2, J3, J5) carries one path's share
    # Total sum of raw scores across the 3 independent branch paths must equal expected_c_ab
    score_p1 = G["J1"]["J2"]["raw_score"]
    score_p2 = G["J1"]["J3"]["raw_score"]
    score_p3 = G["J1"]["J5"]["raw_score"]
    score_p4 = G["J1"]["J6"]["raw_score"]  # Path 4 was beyond cutoff

    assert score_p4 == 0.0, "Path beyond cutoff must receive 0 demand"

    # Longer path receives strictly less demand:
    # Path 1 (100m) > Path 2 (105m) > Path 3 (110m)
    assert score_p1 > score_p2 > score_p3 > 0.0

    # Strict demand conservation: sum of shares equals total pair contribution
    total_branch_demand = score_p1 + score_p2 + score_p3
    assert math.isclose(total_branch_demand, expected_c_ab, abs_tol=1e-3)

    # Segment normalization remains in [0, 1]
    max_norm = max(d["normalized_score"] for _, _, d in G.edges(data=True))
    assert math.isclose(max_norm, 1.0, rel_tol=1e-3)


def test_tolerance_zero_matches_shortest_path_regression(multi_path_graph):
    G = multi_path_graph

    loc_a = LocationRouteRequest(
        id="A",
        name="Location A",
        activities=["Food Stalls"],
        geometry={"type": "Point", "coordinates": [81.86, 25.49]},
    )
    loc_b = LocationRouteRequest(
        id="B",
        name="Location B",
        activities=["Music Concert"],
        geometry={"type": "Point", "coordinates": [81.87, 25.49]},
    )

    # With tolerance 0.0: only shortest path (J1-J2-J4) receives demand
    G_scored, diag, _ = score_pedestrian_routes(
        G,
        [loc_a, loc_b],
        alternative_path_tolerance_m=0.0,
    )

    assert diag.connected_pairs == 1
    assert diag.pairs_with_multiple_paths == 0
    assert diag.total_paths_evaluated == 1

    expected_c_ab = calculate_pair_contribution(1.0, 4.0 / 5.0)

    # 100% of demand on shortest path
    assert math.isclose(G["J1"]["J2"]["raw_score"], expected_c_ab, abs_tol=1e-3)
    assert math.isclose(G["J2"]["J4"]["raw_score"], expected_c_ab, abs_tol=1e-3)

    # Alternative paths receive 0
    assert G["J1"]["J3"]["raw_score"] == 0.0
    assert G["J1"]["J5"]["raw_score"] == 0.0
    assert G["J1"]["J6"]["raw_score"] == 0.0


