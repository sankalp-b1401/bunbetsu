from fastapi.testclient import TestClient
import pytest
from server import app

client = TestClient(app)


def test_prediction_valid():
    payload = {
        "total_footfall": 10000,
        "duration_days": 3,
        "campus_state": "Uttar Pradesh",
        "activities": ["Food Stalls", "Music Concert", "Sports"],
        "locations": [
            {
                "id": "loc-001",
                "name": "Food Court",
                "area": 2500,
                "activities": ["Food Stalls"],
            },
            {
                "id": "loc-002",
                "name": "Main Stage",
                "area": 1800,
                "activities": ["Music Concert"],
            },
            {
                "id": "loc-003",
                "name": "Sports Ground",
                "area": 5000,
                "activities": ["Sports"],
            },
        ],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Resolved rate and metadata check
    assert data["campus_state"] == "Uttar Pradesh"
    assert data["baseline_rate_kg_per_person_day"] == pytest.approx(0.06266)
    assert data["baseline_source_year"] == "2020-21"
    assert data["baseline_is_national_fallback"] is False
    assert "CPCB statewise rate" in data["baseline_rate_source"]

    # Ranges check
    assert "low" in data["total_waste_kg"]
    assert "central" in data["total_waste_kg"]
    assert "high" in data["total_waste_kg"]
    assert data["total_waste_kg"]["low"] <= data["total_waste_kg"]["central"] <= data["total_waste_kg"]["high"]

    # Location allocations ID preservation
    loc_allocs = data["location_allocations"]
    assert len(loc_allocs) == 3
    assert loc_allocs[0]["id"] == "loc-001"
    assert loc_allocs[1]["id"] == "loc-002"
    assert loc_allocs[2]["id"] == "loc-003"

    # Heatmap data present
    assert data["heatmap_data"] is not None
    assert "Food Court" in data["heatmap_data"]["total_waste_kg"]


def test_prediction_rejects_client_baseline_rate():
    # Extra field forbidden by schema
    payload = {
        "total_footfall": 10000,
        "duration_days": 3,
        "campus_state": "Uttar Pradesh",
        "baseline_rate_kg_per_person_day": 0.45,
        "locations": [
            {
                "id": "loc-001",
                "name": "Food Court",
                "area": 2500,
                "activities": ["Food Stalls"],
            }
        ],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422


def test_prediction_national_fallback_for_ladakh_and_unknown():
    # Ladakh: dictionary entry is None -> fallback
    payload_ladakh = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "Ladakh",
        "locations": [
            {
                "id": "loc-001",
                "name": "Stage",
                "area": 1000,
                "activities": ["Sports"],
            }
        ],
    }
    resp = client.post("/api/prediction/waste", json=payload_ladakh)
    assert resp.status_code == 200
    data = resp.json()
    assert data["campus_state"] == "Ladakh"
    assert data["baseline_rate_kg_per_person_day"] == pytest.approx(0.11907)
    assert data["baseline_is_national_fallback"] is True
    assert data["baseline_source_year"] == "2020-21"

    # Unknown state -> fallback
    payload_unknown = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "NonexistentStateXYZ",
        "locations": [
            {
                "id": "loc-001",
                "name": "Stage",
                "area": 1000,
                "activities": ["Sports"],
            }
        ],
    }
    resp_unk = client.post("/api/prediction/waste", json=payload_unknown)
    assert resp_unk.status_code == 200
    data_unk = resp_unk.json()
    assert data_unk["baseline_rate_kg_per_person_day"] == pytest.approx(0.11907)
    assert data_unk["baseline_is_national_fallback"] is True


def test_prediction_empty_state_rejected():
    payload = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "",
        "locations": [
            {
                "id": "loc-001",
                "name": "Stage",
                "area": 1000,
                "activities": ["Sports"],
            }
        ],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422


def test_prediction_invalid_activity():
    payload = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "Uttar Pradesh",
        "locations": [
            {
                "id": "loc-001",
                "name": "Stage",
                "area": 1000,
                "activities": ["UnknownActivity"],
            }
        ],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422


def test_prediction_zero_area():
    payload = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "Uttar Pradesh",
        "locations": [
            {
                "id": "loc-001",
                "name": "Stage",
                "area": 0,
                "activities": ["Sports"],
            }
        ],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422


def test_prediction_empty_locations():
    payload = {
        "total_footfall": 5000,
        "duration_days": 2,
        "campus_state": "Uttar Pradesh",
        "locations": [],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422

