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

