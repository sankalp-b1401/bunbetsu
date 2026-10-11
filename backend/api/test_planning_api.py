"""Integration and contract tests for the unified planning endpoint.

Verifies:
1. Valid request returns prediction, bin model output, and route output.
2. Waste prediction matches the existing prediction endpoint for equivalent inputs.
3. Bin model receives the same FestInput and waste prediction instance.
4. Stable location IDs are preserved in bin placements.
5. Polygon and MultiPolygon locations produce valid serialized coordinates.
6. Point locations are explicitly unsupported for bin placement with clear diagnostics.
7. Duplicate location names produce a clear validation error (HTTP 422).
8. Missing campus boundary produces an appropriate route status without discarding valid bin results.
9. Route service failure preserves successful waste and bin results.
10. Bin model failure does not generate fake counts or coordinates.
11. Malformed request and missing fields return appropriate errors.
12. Response serialization matches the frontend contract.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import pytest

from server import app

client = TestClient(app)

SAMPLE_BOUNDARY = {
    "type": "Polygon",
    "coordinates": [
        [
            [77.200, 28.600],
            [77.220, 28.600],
            [77.220, 28.620],
            [77.200, 28.620],
            [77.200, 28.600],
        ]
    ],
}

SQUARE_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [77.2050, 28.6050],
            [77.2080, 28.6050],
            [77.2080, 28.6080],
            [77.2050, 28.6080],
            [77.2050, 28.6050],
        ]
    ],
}

MULTIPOLYGON_GEOM = {
    "type": "MultiPolygon",
    "coordinates": [
        [
            [
                [77.2100, 28.6100],
                [77.2120, 28.6100],
                [77.2120, 28.6120],
                [77.2100, 28.6120],
                [77.2100, 28.6100],
            ]
        ]
    ],
}

POINT_GEOM = {
    "type": "Point",
    "coordinates": [77.2150, 28.6150],
}

MOCK_OSM_DATA = {
    "elements": [
        {"type": "node", "id": 1, "lon": 77.206, "lat": 28.606},
        {"type": "node", "id": 2, "lon": 77.211, "lat": 28.611},
        {"type": "way", "id": 101, "nodes": [1, 2], "tags": {"highway": "footway"}},
    ]
}


@pytest.fixture
def base_planning_payload():
    return {
        "fest_name": "Antaragni",
        "total_footfall": 5000,
        "duration_days": 3,
        "campus_state": "Delhi",
        "campus_boundary": SAMPLE_BOUNDARY,
        "entry_gate": {
            "id": "entry-gate",
            "name": "Main Entrance Gate",
            "coordinates": [77.202, 28.602],
        },
        "locations": [
            {
                "id": "loc-food-quad",
                "name": "Food Quad",
                "area": 1200.0,
                "activities": ["Food Stalls"],
                "geometry": SQUARE_POLYGON,
            },
            {
                "id": "loc-arena",
                "name": "Concert Arena",
                "area": 2500.0,
                "activities": ["Music Concert"],
                "geometry": MULTIPOLYGON_GEOM,
            },
        ],
    }


def test_1_valid_request_returns_prediction_bins_and_routes(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        assert data["prediction"] is not None
        assert data["bin_recommendations"] is not None
        assert data["routes"] is not None
        assert data["diagnostics"]["stage_status"]["prediction"] == "success"
        assert data["diagnostics"]["stage_status"]["bins"] == "success"
        assert data["diagnostics"]["stage_status"]["routes"] == "success"

        # Check bin recommendations
        bins = data["bin_recommendations"]
        assert bins["total_bins"] > 0
        assert len(bins["bins"]) == bins["total_bins"]
        assert len(bins["locations"]) == 2


def test_2_waste_prediction_matches_standalone_endpoint(base_planning_payload):
    # Call unified endpoint
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        plan_resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert plan_resp.status_code == 200
        plan_data = plan_resp.json()

    # Call existing standalone waste prediction endpoint
    waste_req = {
        "total_footfall": base_planning_payload["total_footfall"],
        "duration_days": base_planning_payload["duration_days"],
        "campus_state": base_planning_payload["campus_state"],
        "locations": [
            {"id": l["id"], "name": l["name"], "area": l["area"], "activities": l["activities"]}
            for l in base_planning_payload["locations"]
        ],
    }
    standalone_resp = client.post("/api/prediction/waste", json=waste_req)
    assert standalone_resp.status_code == 200
    standalone_data = standalone_resp.json()

    # Verify identical values
    assert plan_data["prediction"]["total_waste_kg"] == standalone_data["total_waste_kg"]
    assert plan_data["prediction"]["baseline_rate_kg_per_person_day"] == standalone_data["baseline_rate_kg_per_person_day"]
    assert plan_data["prediction"]["composition_percent"] == standalone_data["composition_percent"]
    assert len(plan_data["prediction"]["location_allocations"]) == len(standalone_data["location_allocations"])
    for plan_loc, std_loc in zip(plan_data["prediction"]["location_allocations"], standalone_data["location_allocations"]):
        assert plan_loc["id"] == std_loc["id"]
        assert plan_loc["location_name"] == std_loc["location_name"]
        assert plan_loc["total_waste_kg"] == std_loc["total_waste_kg"]


def test_3_bin_model_receives_same_waste_prediction(base_planning_payload):
    with patch("planning.planner_service.predict_on_location_bins") as mock_bin_model, \
         patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        # Let mock_bin_model return real result by calling actual function
        from models.bin_distribution_model.bin_distribution_model import predict_on_location_bins as real_bin_predict
        mock_bin_model.side_effect = real_bin_predict

        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        assert mock_bin_model.called

        # Inspect kwargs passed to predict_on_location_bins
        call_kwargs = mock_bin_model.call_args.kwargs
        fest_input_arg = call_kwargs.get("fest_input")
        waste_prediction_arg = call_kwargs.get("waste_prediction")

        assert fest_input_arg is not None
        assert fest_input_arg.total_footfall == 5000
        assert fest_input_arg.duration_days == 3
        assert waste_prediction_arg is not None
        assert len(waste_prediction_arg.location_allocations) == 2


def test_4_stable_location_ids_preserved_in_bins(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        bin_resp = data["bin_recommendations"]
        assert len(bin_resp["locations"]) == 2
        loc_ids = [l["id"] for l in bin_resp["locations"]]
        assert "loc-food-quad" in loc_ids
        assert "loc-arena" in loc_ids

        # Every marker must have a matching location_id
        for marker in bin_resp["bins"]:
            assert marker["location_id"] in ("loc-food-quad", "loc-arena")
            assert marker["id"].startswith(marker["location_id"])


def test_5_polygon_and_multipolygon_produce_valid_wgs84_coordinates(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        for marker in data["bin_recommendations"]["bins"]:
            coords = marker["coordinates"]
            assert len(coords) == 2
            lon, lat = coords[0], coords[1]
            # Must be in Delhi range [longitude, latitude]
            assert 77.0 <= lon <= 78.0
            assert 28.0 <= lat <= 29.0


def test_6_point_locations_explicitly_unsupported_for_placement(base_planning_payload):
    payload = dict(base_planning_payload)
    payload["locations"] = [
        {
            "id": "loc-point",
            "name": "Info Desk",
            "area": 50.0,
            "activities": ["Literary & Fine Arts"],
            "geometry": POINT_GEOM,
        },
        {
            "id": "loc-polygon",
            "name": "Food Quad",
            "area": 1200.0,
            "activities": ["Food Stalls"],
            "geometry": SQUARE_POLYGON,
        },
    ]

    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        bins = data["bin_recommendations"]
        # Point location should have unsupported_geometry status and 0 markers
        point_loc = next(l for l in bins["locations"] if l["id"] == "loc-point")
        assert point_loc["placement_status"] == "unsupported_geometry"
        assert len(point_loc["bin_placements"]) == 0
        assert len(point_loc["placement_warnings"]) > 0

        # Polygon location should have placed status and valid markers
        poly_loc = next(l for l in bins["locations"] if l["id"] == "loc-polygon")
        assert poly_loc["placement_status"] == "placed"
        assert len(poly_loc["bin_placements"]) > 0

        # Diagnostics stage_status should be partial
        assert data["diagnostics"]["stage_status"]["bins"] == "partial"
        assert any("Point" in w for w in data["diagnostics"]["warnings"])


def test_7_duplicate_location_names_produce_clear_validation_error(base_planning_payload):
    payload = dict(base_planning_payload)
    payload["locations"] = [
        {
            "id": "loc-1",
            "name": "Same Name",
            "area": 500.0,
            "activities": ["Food Stalls"],
            "geometry": SQUARE_POLYGON,
        },
        {
            "id": "loc-2",
            "name": "Same Name",
            "area": 800.0,
            "activities": ["Music Concert"],
            "geometry": MULTIPOLYGON_GEOM,
        },
    ]
    resp = client.post("/api/planning/plan", json=payload)
    assert resp.status_code == 422
    detail_str = str(resp.json()["detail"])
    assert "Duplicate location names" in detail_str


def test_8_missing_campus_boundary_skips_routing_without_discarding_bins(base_planning_payload):
    payload = dict(base_planning_payload)
    payload["campus_boundary"] = None

    resp = client.post("/api/planning/plan", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["success"] is True
    assert data["prediction"] is not None
    assert data["bin_recommendations"] is not None
    assert data["bin_recommendations"]["total_bins"] > 0
    assert data["routes"] is None
    assert data["diagnostics"]["stage_status"]["routes"] == "skipped"
    assert any("boundary" in w.lower() for w in data["diagnostics"]["warnings"])


def test_9_route_service_failure_preserves_waste_and_bin_results(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        from routes.osm_client import OverpassTimeoutError
        mock_osm.side_effect = OverpassTimeoutError("Overpass timed out")

        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        assert data["prediction"] is not None
        assert data["bin_recommendations"] is not None
        assert data["bin_recommendations"]["total_bins"] > 0
        assert data["routes"] is None
        assert data["diagnostics"]["stage_status"]["routes"] == "failed"
        assert any("Pedestrian routing unavailable" in w for w in data["diagnostics"]["warnings"])


def test_10_bin_model_failure_does_not_generate_fake_counts_or_markers(base_planning_payload):
    with patch("planning.planner_service.predict_on_location_bins", side_effect=ValueError("Degenerate geometry")), \
         patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA

        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        assert data["prediction"] is not None
        # Bin model failed -> bin_recommendations is None or has 0 markers, no fake markers!
        if data["bin_recommendations"]:
            assert data["bin_recommendations"]["total_bins"] == 0
            assert len(data["bin_recommendations"]["bins"]) == 0
        assert data["diagnostics"]["stage_status"]["bins"] == "failed"


def test_11_malformed_request_returns_appropriate_error():
    # Missing required fields
    resp = client.post("/api/planning/plan", json={})
    assert resp.status_code == 422

    # Negative footfall
    resp = client.post(
        "/api/planning/plan",
        json={
            "fest_name": "Test",
            "total_footfall": -10,
            "duration_days": 1,
            "campus_state": "Delhi",
            "locations": [],
        },
    )
    assert resp.status_code == 422


def test_12_response_serialization_matches_frontend_contract(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        # Check required top-level keys
        assert "success" in data
        assert "prediction" in data
        assert "bin_recommendations" in data
        assert "routes" in data
        assert "diagnostics" in data

        # Check bin recommendation model constants
        bin_meta = data["bin_recommendations"]
        assert bin_meta["bin_capacity_litres"] == 100.0
        assert bin_meta["usable_fill_fraction"] == 0.80
        assert bin_meta["usable_bin_capacity_litres"] == 80.0
        assert bin_meta["boundary_spacing_target_m"] == 25.0
        assert "required_emptying_turns" in bin_meta
        assert bin_meta["stream_breakdown_available"] is True
        assert bin_meta["stream_counts"] is not None
        assert "disposable" in bin_meta["stream_counts"]
        assert "recyclable" in bin_meta["stream_counts"]
        assert bin_meta["total_bins"] == (
            bin_meta["stream_counts"]["disposable"] + bin_meta["stream_counts"]["recyclable"]
        )

        # Check stream-tagged markers
        assert len(bin_meta["bins"]) == bin_meta["total_bins"]
        for marker in bin_meta["bins"]:
            assert marker["bin_type"] in ("Disposable", "Recyclable")

        # Check location-level new fields
        loc0 = bin_meta["locations"][0]
        assert "rectangle_perimeter_m" in loc0
        assert loc0["rectangle_perimeter_m"] > 0
        assert "perimeter_spacing_max_bins" in loc0
        assert "required_emptying_turns" in loc0
        assert "daily_capacity_coverage_litres" in loc0
        assert "capacity_shortfall_litres" in loc0
        assert "disposable" in loc0
        assert "recyclable" in loc0
        assert (
            loc0["disposable"]["physical_bins"] + loc0["recyclable"]["physical_bins"]
            == loc0["recommended_bins"]["central"]
        )

        # Check diagnostics structure
        diag = data["diagnostics"]
        assert "warnings" in diag
        assert "errors" in diag
        assert "stage_status" in diag
        assert set(diag["stage_status"].keys()) == {"prediction", "bins", "routes"}


def test_13_road_bin_recommendations_in_campus_plan_response(base_planning_payload):
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert "road_bin_recommendations" in data
        road_bins = data["road_bin_recommendations"]
        assert road_bins is not None
        assert "total_road_bins" in road_bins
        assert "total_eligible_candidates" in road_bins
        assert "covered_location_ids" in road_bins
        assert "uncovered_location_ids" in road_bins
        assert "location_influence_radii_m" in road_bins
        assert "location_dominant_waste_types" in road_bins
        assert "placements" in road_bins
        assert road_bins["solver_name"] in ("scipy_milp_highs", "greedy_set_cover_heuristic", "no_candidates")

        if road_bins["placements"]:
            p0 = road_bins["placements"][0]
            assert "coordinates" in p0
            coords = p0["coordinates"]
            assert len(coords) == 2
            # WGS84 [longitude, latitude] order
            assert -180 <= coords[0] <= 180
            assert -90 <= coords[1] <= 90
            assert p0["provenance"] == "road_bin_optimizer"
            assert "source_segment_id" in p0
            assert "normalized_popularity_score" in p0
            assert "served_location_ids" in p0
            assert "served_location_distances_m" in p0


def test_14_missing_entry_gate_fails_validation(base_planning_payload):
    payload = dict(base_planning_payload)
    del payload["entry_gate"]
    resp = client.post("/api/planning/plan", json=payload)
    assert resp.status_code == 422
    err_detail = str(resp.json()["detail"])
    assert "entry_gate" in err_detail


def test_15_entry_gate_outside_campus_boundary_fails_validation(base_planning_payload):
    payload = dict(base_planning_payload)
    # Outside SAMPLE_BOUNDARY ([77.200, 28.600] to [77.220, 28.620])
    payload["entry_gate"] = {
        "id": "entry-gate",
        "name": "Outside Gate",
        "coordinates": [77.300, 28.700],
    }
    resp = client.post("/api/planning/plan", json=payload)
    assert resp.status_code == 422
    err_detail = str(resp.json()["detail"])
    assert "inside the campus boundary" in err_detail


def test_16_entry_gate_included_in_routing_but_excluded_from_waste_and_bins(base_planning_payload):
    from routes.route_service import plan_pedestrian_routes
    with patch("routes.route_service.fetch_osm_data_for_boundary", new_callable=AsyncMock) as mock_osm, \
         patch("planning.planner_service.plan_pedestrian_routes", wraps=plan_pedestrian_routes) as mock_routes:
        mock_osm.return_value = MOCK_OSM_DATA
        resp = client.post("/api/planning/plan", json=base_planning_payload)
        assert resp.status_code == 200
        data = resp.json()

        # Check plan_pedestrian_routes was called with entry gate
        assert mock_routes.called
        route_req = mock_routes.call_args[0][0]
        gate_loc = next((l for l in route_req.locations if l.id == "entry-gate"), None)
        assert gate_loc is not None
        assert gate_loc.name == "Main Entrance Gate"
        assert gate_loc.geometry["type"] == "Point"
        assert gate_loc.geometry["coordinates"] == [77.202, 28.602]
        assert gate_loc.weight == 1.0

        # Check waste prediction does NOT include entry gate
        pred_locations = data["prediction"]["location_allocations"]
        assert all(loc["location_name"] != "Main Entrance Gate" for loc in pred_locations)
        assert len(pred_locations) == 2

        # Check on-location bin recommendations do NOT include entry gate
        bin_locations = data["bin_recommendations"]["locations"]
        assert all(loc["id"] != "entry-gate" and loc["location_name"] != "Main Entrance Gate" for loc in bin_locations)
        assert len(bin_locations) == 2

