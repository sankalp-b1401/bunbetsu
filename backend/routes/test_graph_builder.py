"""Tests for pedestrian graph builder (Phase 2B).

Covers topological connectivity, boundary clipping, grade separation,
duplicate segment handling, degenerate segments, and metric edge lengths.
"""

from __future__ import annotations

import networkx as nx
import pytest
from routes.graph_builder import build_pedestrian_graph


@pytest.fixture
def sample_boundary():
    # Boundary square from [81.860, 25.490] to [81.870, 25.500]
    return {
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


def test_connected_ways_form_graph(sample_boundary):
    # Two ways sharing node 2: way1: 1 -> 2, way2: 2 -> 3
    nodes = {
        1: {"lon": 81.862, "lat": 25.492},
        2: {"lon": 81.864, "lat": 25.494},
        3: {"lon": 81.866, "lat": 25.496},
    }
    ped_ways = [
        {"id": 101, "nodes": [1, 2], "highway": "footway", "layer": 0},
        {"id": 102, "nodes": [2, 3], "highway": "footway", "layer": 0},
    ]

    network = build_pedestrian_graph(sample_boundary, nodes, ped_ways, [])
    G = network.graph

    assert G.number_of_nodes() == 3
    assert G.number_of_edges() == 2
    assert nx.is_connected(G)

    # Shared node 2 has degree 2
    shared_node = "osm_node_2"
    assert G.degree(shared_node) == 2

    # Metric lengths are positive
    for _, _, d in G.edges(data=True):
        assert d["length_m"] > 10.0


def test_grade_separation_no_false_crossing(sample_boundary):
    # Two ways crossing in 2D space without sharing any OSM node:
    # Way 1: (81.862, 25.495) to (81.868, 25.495) [horizontal]
    # Way 2: (81.865, 25.492) to (81.865, 25.498) [vertical]
    # In 2D they intersect at (81.865, 25.495), but they don't share a node (e.g. bridge/overpass).
    nodes = {
        1: {"lon": 81.862, "lat": 25.495},
        2: {"lon": 81.868, "lat": 25.495},
        3: {"lon": 81.865, "lat": 25.492},
        4: {"lon": 81.865, "lat": 25.498},
    }
    ped_ways = [
        {"id": 201, "nodes": [1, 2], "highway": "footway", "layer": 0},
        {"id": 202, "nodes": [3, 4], "highway": "footway", "layer": 1, "bridge": True},
    ]

    network = build_pedestrian_graph(sample_boundary, nodes, ped_ways, [])
    G = network.graph

    # There should be exactly 2 disconnected components: way 1 and way 2
    assert G.number_of_nodes() == 4
    assert G.number_of_edges() == 2
    assert nx.number_connected_components(G) == 2
    assert not nx.has_path(G, "osm_node_1", "osm_node_3")


def test_boundary_clipping(sample_boundary):
    # Boundary is [81.860..81.870, 25.490..25.500]
    # Node 1 is inside (81.865, 25.495)
    # Node 2 is outside (81.875, 25.495)
    # Node 3 is completely outside (81.876, 25.495)
    nodes = {
        1: {"lon": 81.865, "lat": 25.495},
        2: {"lon": 81.875, "lat": 25.495},
        3: {"lon": 81.880, "lat": 25.495},
    }
    ped_ways = [
        {"id": 301, "nodes": [1, 2], "highway": "path"},  # crosses boundary
        {"id": 302, "nodes": [2, 3], "highway": "path"},  # entirely outside
    ]

    network = build_pedestrian_graph(sample_boundary, nodes, ped_ways, [])
    G = network.graph

    # Way 302 should be discarded completely
    # Way 301 should be clipped at the boundary
    assert G.number_of_edges() == 1
    # Node 1 is present, clipped boundary node is present, node 2 and 3 are not in graph
    assert "osm_node_1" in G
    assert "osm_node_2" not in G
    assert "osm_node_3" not in G

    edge_data = list(G.edges(data=True))[0][2]
    # Mapped length should be the clipped portion (~500m instead of ~1000m)
    assert edge_data["length_m"] < 600.0


def test_duplicate_and_degenerate_segments(sample_boundary):
    nodes = {
        1: {"lon": 81.863, "lat": 25.493},
        2: {"lon": 81.865, "lat": 25.495},
        3: {"lon": 81.863, "lat": 25.493},  # Identical coord to 1 (degenerate segment)
    }
    ped_ways = [
        {"id": 401, "nodes": [1, 2], "highway": "footway"},
        {"id": 402, "nodes": [1, 2], "highway": "footway"},  # duplicate segment
        {"id": 403, "nodes": [1, 3], "highway": "footway"},  # zero length
    ]

    network = build_pedestrian_graph(sample_boundary, nodes, ped_ways, [])
    G = network.graph

    # Only 1 unique valid edge
    assert G.number_of_edges() == 1
    assert network.discarded_segments_count >= 1

