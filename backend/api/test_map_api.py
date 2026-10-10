from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)


def test_campus_not_found():
    with patch("api.map_api.find_campus", new_callable=AsyncMock) as mock_find:
        mock_find.side_effect = ValueError("No OpenStreetMap location found for 'InvalidCollegeXYZ'.")
        response = client.get("/api/map/campus?college=InvalidCollegeXYZ")
        assert response.status_code == 404
        assert "No OpenStreetMap location found" in response.json()["detail"]


def test_campus_upstream_error():
    with patch("api.map_api.find_campus", new_callable=AsyncMock) as mock_find:
        mock_find.side_effect = RuntimeError("Nominatim timeout")
        response = client.get("/api/map/campus?college=MNNIT")
        assert response.status_code == 502
        assert "Unable to retrieve campus data" in response.json()["detail"]


def test_campus_success():
    mock_campus_data = {
        "osm_id": 208352956,
        "osm_type": "way",
        "name": "Motilal Nehru National Institute of Technology",
        "display_name": "Motilal Nehru National Institute of Technology, Prayagraj, India",
        "latitude": 25.4925,
        "longitude": 81.8639,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[81.86, 25.49], [81.87, 25.49], [81.87, 25.50], [81.86, 25.49]]],
        },
        "category": "university",
        "osm_class": "amenity",
        "osm_type_tag": "university",
        "state": "Uttar Pradesh",
        "country": "India",
        "address": {"state": "Uttar Pradesh", "country": "India"},
    }
    with patch("api.map_api.find_campus", new_callable=AsyncMock) as mock_find:
        mock_find.return_value = mock_campus_data
        response = client.get("/api/map/campus?college=MNNIT%20Allahabad")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["campus"]["name"] == "Motilal Nehru National Institute of Technology"
        assert data["campus"]["geometry"]["type"] == "Polygon"
        assert data["campus"]["state"] == "Uttar Pradesh"
        assert data["campus"]["country"] == "India"
        assert data["campus"]["address"] == {"state": "Uttar Pradesh", "country": "India"}


import pytest
from map.campus import find_campus, extract_state_from_address


@pytest.mark.anyio
async def test_find_campus_extracts_structured_state_from_nominatim():
    mock_nominatim_results = [
        {
            "osm_id": 123456,
            "osm_type": "way",
            "name": "Indian Institute of Technology Delhi",
            "display_name": "IIT Delhi, Hauz Khas, New Delhi, Delhi, 110016, India",
            "lat": "28.5450",
            "lon": "77.1926",
            "class": "amenity",
            "type": "university",
            "geojson": {
                "type": "Polygon",
                "coordinates": [[[77.19, 28.54], [77.20, 28.54], [77.20, 28.55], [77.19, 28.54]]],
            },
            "address": {
                "amenity": "IIT Delhi",
                "suburb": "Hauz Khas",
                "city": "New Delhi",
                "state": "Delhi",
                "postcode": "110016",
                "country": "India",
                "country_code": "in",
            },
        }
    ]

    with patch("map.campus.search_place", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = mock_nominatim_results
        result = await find_campus("IIT Delhi")

        assert result["state"] == "Delhi"
        assert result["country"] == "India"
        assert result["address"]["state"] == "Delhi"
        assert result["name"] == "Indian Institute of Technology Delhi"


@pytest.mark.anyio
async def test_find_campus_returns_none_state_when_missing():
    mock_nominatim_results = [
        {
            "osm_id": 999,
            "osm_type": "node",
            "name": "Somewhere Unknown",
            "display_name": "Somewhere Unknown, Campus",
            "lat": "10.0",
            "lon": "20.0",
            "class": "amenity",
            "type": "college",
            "address": {
                "city": "Some City",
                "country": "India",
            },
        }
    ]

    with patch("map.campus.search_place", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = mock_nominatim_results
        result = await find_campus("Somewhere Unknown")

        assert result["state"] is None
        assert result["country"] == "India"


