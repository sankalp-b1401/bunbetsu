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
    }
    with patch("api.map_api.find_campus", new_callable=AsyncMock) as mock_find:
        mock_find.return_value = mock_campus_data
        response = client.get("/api/map/campus?college=MNNIT%20Allahabad")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["campus"]["name"] == "Motilal Nehru National Institute of Technology"
        assert data["campus"]["geometry"]["type"] == "Polygon"

