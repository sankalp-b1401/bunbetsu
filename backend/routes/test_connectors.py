"""Tests for activity connectors and edge splitting (Phase 2C).

Covers Point and Polygon location snapping, edge splitting in topological order,
shared snap points, threshold rejection, obstacle crossings, and provenance isolation.
"""

from __future__ import annotations

import networkx as nx
import pytest
from routes.connectors import connect_activity_locations
from routes.graph_builder import build_pedestrian_graph
from routes.schemas import LocationRouteRequest


@pytest.fixture
def sample_network():
    # Boundary square
    boundary = {
        "type": "Polygon",
        "coordinates": [
            [
                [81.860, 25.490],
                [81.870, 25.490],
                [81.870, 25.500],
                [81.860, 25.500],
                [81.860, 25.490],
            ]
        ],
    }
    # Single horizontal pedestrian way along latitude 25.495 from 81.862 to 81.868 (~600m)
    nodes = {
        1: {"lon": 81.862, "lat": 25.495},
        2: {"lon": 81.868, "lat": 25.495},
    }
    ped_ways = [
        {"id": 501, "nodes": [1, 2], "highway": "footway"},
    ]
    # One obstacle building between 81.864 and 81.865 south of path
    obstacle_nodes = {
        10: {"lon": 81.8640, "lat": 25.4940},
        11: {"lon": 81.8650, "lat": 25.4940},
        12: {"lon": 81.8650, "lat": 25.4945},
        13: {"lon": 81.8640, "lat": 25.4945},
        14: {"lon": 81.8640, "lat": 25.4940},
    }
    nodes.update(obstacle_nodes)
    obs_ways = [
        {"id": 901, "nodes": [10, 11, 12, 13, 14], "type": "building"},
    ]

    return build_pedestrian_graph(boundary, nodes, ped_ways, obs_ways)


def test_point_location_snapping(sample_network):
    # Location 1: Point at 81.864, 25.4952 (close to path at 25.495, ~22m away)
    loc1 = LocationRouteRequest(
        id="loc-stage",
        name="Main Stage",
        activities=["Music Concert"],
        geometry={"type": "Point", "coordinates": [81.864, 25.4952]},
    )

    G, connectors, statuses = connect_activity_locations(sample_network, [loc1], max_snap_distance_m=50.0)

    assert len(connectors) == 1
    conn = connectors[0]
    assert conn.location_id == "loc-stage"
    assert conn.status == "connected"
    assert 10.0 < conn.snap_distance_m < 35.0

    # Activity node exists in graph
    assert G.has_node("activity_loc-stage")
    assert G.nodes["activity_loc-stage"]["is_activity"] is True

    # Connector edge exists in graph and has provenance 'connector'
    assert G.has_edge("activity_loc-stage", conn.junction_node_id)
    edge_data = G["activity_loc-stage"][conn.junction_node_id]
    assert edge_data["provenance"] == "connector"


def test_polygon_location_snapping(sample_network):
    # Location 2: Polygon north of the path
    loc_poly = LocationRouteRequest(
        id="loc-food",
        name="Food Court",
        activities=["Food Stalls"],
        geometry={
            "type": "Polygon",
            "coordinates": [
                [
                    [81.863, 25.4952],
                    [81.865, 25.4952],
                    [81.865, 25.4960],
                    [81.863, 25.4960],
                    [81.863, 25.4952],
                ]
            ],
        },
    )

    G, connectors, statuses = connect_activity_locations(sample_network, [loc_poly], max_snap_distance_m=50.0)
    assert len(connectors) == 1
    assert statuses[0].status == "connected"
    # Snapped to boundary of polygon closest to path, not blind centroid!
    assert connectors[0].snap_distance_m < 30.0


def test_multiple_snaps_split_same_edge_in_order(sample_network):
    # Two locations along the path at lon 81.863 and 81.866
    loc_a = LocationRouteRequest(
        id="loc-a",
        name="Location A",
        activities=["Sports"],
        geometry={"type": "Point", "coordinates": [81.863, 25.4951]},
    )
    loc_b = LocationRouteRequest(
        id="loc-b",
        name="Location B",
        activities=["Hackathon"],
        geometry={"type": "Point", "coordinates": [81.866, 25.4951]},
    )

    G, connectors, statuses = connect_activity_locations(sample_network, [loc_a, loc_b], max_snap_distance_m=50.0)

    assert len(connectors) == 2
    assert all(s.status == "connected" for s in statuses)

    # The original single edge was split into 3 segments:
    # osm_node_1 -> junction_A -> junction_B -> osm_node_2
    mapped_edges = [
        (u, v, d) for u, v, d in G.edges(data=True) if d.get("provenance") == "osm_mapped"
    ]
    assert len(mapped_edges) == 3

    # Shortest path between activity A and activity B exists through junctions
    path = nx.shortest_path(G, "activity_loc-a", "activity_loc-b", weight="length_m")
    assert path[0] == "activity_loc-a"
    assert path[-1] == "activity_loc-b"


def test_shared_snap_point_reuse_junction(sample_network):
    # Two locations at nearly identical longitude snapping to the same point on path
    loc1 = LocationRouteRequest(
        id="loc-1",
        name="Stall 1",
        activities=["Food Stalls"],
        geometry={"type": "Point", "coordinates": [81.864, 25.4951]},
    )
    loc2 = LocationRouteRequest(
        id="loc-2",
        name="Stall 2",
        activities=["Food Stalls"],
        geometry={"type": "Point", "coordinates": [81.864, 25.49515]},
    )

    G, connectors, statuses = connect_activity_locations(sample_network, [loc1, loc2], max_snap_distance_m=50.0)

    assert len(connectors) == 2
    # Both connectors connect to the SAME junction node!
    assert connectors[0].junction_node_id == connectors[1].junction_node_id


def test_excessive_distance_unmatched(sample_network):
    # Location 500m away from the path
    loc_far = LocationRouteRequest(
        id="loc-far",
        name="Far Location",
        activities=["Sports"],
        geometry={"type": "Point", "coordinates": [81.864, 25.491]},
    )

    G, connectors, statuses = connect_activity_locations(sample_network, [loc_far], max_snap_distance_m=50.0)

    assert len(connectors) == 0
    assert len(statuses) == 1
    assert statuses[0].status == "unmatched"
    assert "exceeds threshold" in statuses[0].reason


def test_building_crossing_flagged(sample_network):
    # Obstacle building is between lat 25.4940 and 25.4945 at lon 81.8645.
    # Path is at lat 25.4950.
    # Location placed south of building at lat 25.4938.
    # Connector to path must cross the building!
    loc_blocked = LocationRouteRequest(
        id="loc-blocked",
        name="Blocked Location",
        activities=["Hackathon"],
        geometry={"type": "Point", "coordinates": [81.8645, 25.4938]},
    )

    G, connectors, statuses = connect_activity_locations(
        sample_network,
        [loc_blocked],
        max_snap_distance_m=150.0,
        check_barriers=True,
    )

    assert len(connectors) == 1
    assert connectors[0].status == "flagged"
    assert "crosses building" in connectors[0].reason

