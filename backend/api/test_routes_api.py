"""Integration tests for FastAPI Routes API (Phase 2E).

Covers POST /api/routes/plan endpoint validation, successful GeoJSON responses,
duplicate ID rejection, invalid geometries, empty networks, and upstream failures.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import pytest

from routes.osm_client import OverpassServiceError, OverpassTimeoutError, clear_cache
from server import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_cache():
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
def valid_plan_payload():
    return {
        "boundary": {
            "type": "Polygon",
            "coordinates": [
                [
                    [81.859, 25.490],
                    [81.868, 25.490],
                    [81.868, 25.498],
                    [81.859, 25.498],
                    [81.859, 25.490],
                ]
            ],
        },
        "locations": [
            {
                "id": "loc-stage",
                "name": "Main Stage",
                "activities": ["Music Concert"],
                "geometry": {"type": "Point", "coordinates": [81.862, 25.4941]},
            },
            {
                "id": "loc-food",
                "name": "Food Quad",
                "activities": ["Food Stalls"],
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [81.865, 25.4942],
                            [81.867, 25.4942],
                            [81.867, 25.4955],
                            [81.865, 25.4955],
                            [81.865, 25.4942],
                        ]
                    ],
                },
            },
        ],
        "config": {
            "max_snap_distance_m": 60.0,
        },
    }


def test_routes_api_success_with_mocked_osm(valid_plan_payload):
    # Mock OSM data with a connected footway between stage and food quad
    mock_osm_data = {
        "elements": [
            {"type": "node", "id": 1, "lon": 81.861, "lat": 25.4940},
            {"type": "node", "id": 2, "lon": 81.863, "lat": 25.4940},
            {"type": "node", "id": 3, "lon": 81.866, "lat": 25.4940},
            {"type": "way", "id": 1001, "nodes": [1, 2, 3], "tags": {"highway": "footway"}},
        ]
    }

    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_osm_data

        resp = client.post("/api/routes/plan", json=valid_plan_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        assert "paths_geojson" in data
        assert "connectors_geojson" in data
        assert data["paths_geojson"]["type"] == "FeatureCollection"
        assert data["connectors_geojson"]["type"] == "FeatureCollection"
        assert len(data["connectors_geojson"]["features"]) == 2

        # Check diagnostics
        assert data["diagnostics"]["scoring"]["connected_pairs"] == 1
        assert len(data["location_connectivity"]) == 2


def test_routes_api_invalid_geometry_422(valid_plan_payload):
    # Unclosed polygon ring
    payload = dict(valid_plan_payload)
    payload["boundary"] = {
        "type": "Polygon",
        "coordinates": [
            [[81.859, 25.490], [81.868, 25.490], [81.868, 25.498]]  # Not closed, < 4 coords
        ],
    }
    resp = client.post("/api/routes/plan", json=payload)
    assert resp.status_code == 422


def test_routes_api_duplicate_location_ids_422(valid_plan_payload):
    payload = dict(valid_plan_payload)
    payload["locations"] = [
        {
            "id": "loc-duplicate",
            "name": "Location 1",
            "activities": ["Sports"],
            "geometry": {"type": "Point", "coordinates": [81.862, 25.494]},
        },
        {
            "id": "loc-duplicate",  # Same ID
            "name": "Location 2",
            "activities": ["Hackathon"],
            "geometry": {"type": "Point", "coordinates": [81.863, 25.494]},
        },
    ]
    resp = client.post("/api/routes/plan", json=payload)
    assert resp.status_code == 422
    assert "Duplicate location IDs" in resp.text


def test_routes_api_empty_network_handled_gracefully(valid_plan_payload):
    # Overpass returns 0 pedestrian ways
    mock_osm_data = {"elements": []}

    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_osm_data

        resp = client.post("/api/routes/plan", json=valid_plan_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["paths_geojson"]["features"]) == 0
        assert any("No eligible pedestrian ways" in w for w in data["warnings"])


def test_routes_api_upstream_overpass_timeout_504(valid_plan_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.side_effect = OverpassTimeoutError("Overpass timed out")

        resp = client.post("/api/routes/plan", json=valid_plan_payload)
        assert resp.status_code == 504
        assert "timed out" in resp.json()["detail"].lower()


def test_routes_api_upstream_overpass_service_error_502(valid_plan_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.side_effect = OverpassServiceError("Overpass 503 Service Unavailable")

        resp = client.post("/api/routes/plan", json=valid_plan_payload)
        assert resp.status_code == 502
        assert "OpenStreetMap data acquisition failed" in resp.json()["detail"]

