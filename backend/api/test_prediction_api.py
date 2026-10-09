from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_prediction_valid():
    payload = {
        "total_footfall": 10000,
        "duration_days": 3,
        "baseline_rate_kg_per_person_day": 0.45,
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


def test_prediction_invalid_activity():
    payload = {
        "total_footfall": 5000,
        "duration_days": 2,
        "baseline_rate_kg_per_person_day": 0.45,
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
        "baseline_rate_kg_per_person_day": 0.45,
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
        "baseline_rate_kg_per_person_day": 0.45,
        "locations": [],
    }
    response = client.post("/api/prediction/waste", json=payload)
    assert response.status_code == 422

