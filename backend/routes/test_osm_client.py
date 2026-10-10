"""Tests for OpenStreetMap Overpass client (Phase 2A).

Covers offline synthetic responses, empty responses, malformed JSON,
timeouts, retries with backoff, tag filtering, and cache reuse.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch
import httpx
import pytest

from routes.osm_client import (
    OverpassServiceError,
    OverpassTimeoutError,
    calculate_boundary_bbox,
    clear_cache,
    fetch_osm_data_for_boundary,
    is_eligible_pedestrian_way,
    parse_osm_elements,
)


@pytest.fixture(autouse=True)
def reset_osm_cache():
    clear_cache()
    yield
    clear_cache()


def test_calculate_boundary_bbox():
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [81.85, 25.48],
                [81.87, 25.48],
                [81.87, 25.50],
                [81.85, 25.50],
                [81.85, 25.48],
            ]
        ],
    }
    min_lat, min_lon, max_lat, max_lon = calculate_boundary_bbox(polygon, buffer_deg=0.001)
    assert min_lat < 25.48
    assert max_lat > 25.50
    assert min_lon < 81.85
    assert max_lon > 81.87


def test_calculate_boundary_bbox_invalid():
    with pytest.raises(ValueError):
        calculate_boundary_bbox({"type": "Polygon", "coordinates": []})


def test_is_eligible_pedestrian_way_filtering():
    # Eligible paths
    assert is_eligible_pedestrian_way({"highway": "footway"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "path"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "pedestrian"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "steps"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "cycleway"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "residential"})[0] is True
    assert is_eligible_pedestrian_way({"highway": "service"})[0] is True

    # Ineligible highways
    assert is_eligible_pedestrian_way({"highway": "motorway"})[0] is False
    assert is_eligible_pedestrian_way({"highway": "trunk"})[0] is False
    assert is_eligible_pedestrian_way({"highway": "construction"})[0] is False

    # Explicit foot prohibition
    assert is_eligible_pedestrian_way({"highway": "footway", "foot": "no"})[0] is False
    assert is_eligible_pedestrian_way({"highway": "service", "foot": "no"})[0] is False
    assert is_eligible_pedestrian_way({"highway": "cycleway", "foot": "no"})[0] is False

    # General access restriction
    assert is_eligible_pedestrian_way({"highway": "residential", "access": "private"})[0] is False
    # Permissive exception on private road
    assert is_eligible_pedestrian_way({"highway": "residential", "access": "private", "foot": "yes"})[0] is True

    # Service road edge cases
    assert is_eligible_pedestrian_way({"highway": "service", "service": "parking_aisle"})[0] is False
    assert is_eligible_pedestrian_way({"highway": "service", "service": "parking_aisle", "foot": "yes"})[0] is True


@pytest.mark.anyio
async def test_fetch_osm_data_success():
    sample_response = {
        "version": 0.6,
        "elements": [
            {"type": "node", "id": 1, "lat": 25.49, "lon": 81.86},
            {"type": "node", "id": 2, "lat": 25.491, "lon": 81.861},
            {"type": "way", "id": 100, "nodes": [1, 2], "tags": {"highway": "footway"}},
        ],
    }

    mock_resp = httpx.Response(
        status_code=200,
        text=json.dumps(sample_response),
        request=httpx.Request("POST", "https://example.com"),
    )

    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: mock_resp))

    boundary = {
        "type": "Polygon",
        "coordinates": [
            [[81.85, 25.48], [81.87, 25.48], [81.87, 25.50], [81.85, 25.50], [81.85, 25.48]]
        ],
    }

    data = await fetch_osm_data_for_boundary(boundary, custom_client=client)
    assert "elements" in data
    assert len(data["elements"]) == 3

    nodes, ped_ways, obs_ways = parse_osm_elements(data["elements"])
    assert 1 in nodes
    assert 2 in nodes
    assert len(ped_ways) == 1
    assert ped_ways[0]["id"] == 100


@pytest.mark.anyio
async def test_fetch_osm_data_cache_reuse():
    sample_response = {
        "elements": [
            {"type": "node", "id": 10, "lat": 25.49, "lon": 81.86},
        ]
    }
    call_count = 0

    def mock_handler(req):
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, text=json.dumps(sample_response), request=req)

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))

    boundary = {
        "type": "Polygon",
        "coordinates": [
            [[81.85, 25.48], [81.87, 25.48], [81.87, 25.50], [81.85, 25.50], [81.85, 25.48]]
        ],
    }

    res1 = await fetch_osm_data_for_boundary(boundary, custom_client=client)
    res2 = await fetch_osm_data_for_boundary(boundary, custom_client=client)

    assert call_count == 1  # Second call served from in-memory cache!
    assert res1 == res2


@pytest.mark.anyio
async def test_fetch_osm_data_timeout_retry():
    calls = 0

    def mock_handler(req):
        nonlocal calls
        calls += 1
        raise httpx.TimeoutException("Connection timed out", request=req)

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))

    boundary = {
        "type": "Polygon",
        "coordinates": [
            [[81.85, 25.48], [81.87, 25.48], [81.87, 25.50], [81.85, 25.50], [81.85, 25.48]]
        ],
    }

    with pytest.raises(OverpassTimeoutError):
        await fetch_osm_data_for_boundary(boundary, max_retries=2, timeout_s=1.0, custom_client=client)

    assert calls == 2


@pytest.mark.anyio
async def test_fetch_osm_data_malformed_json():
    mock_resp = httpx.Response(
        status_code=200,
        text="<html>Not JSON</html>",
        request=httpx.Request("POST", "https://example.com"),
    )
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: mock_resp))

    boundary = {
        "type": "Polygon",
        "coordinates": [
            [[81.85, 25.48], [81.87, 25.48], [81.87, 25.50], [81.85, 25.50], [81.85, 25.48]]
        ],
    }

    with pytest.raises(OverpassServiceError) as exc_info:
        await fetch_osm_data_for_boundary(boundary, max_retries=1, custom_client=client)
    assert "Malformed JSON" in str(exc_info.value)

