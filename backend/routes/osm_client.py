"""OpenStreetMap Overpass API client for pedestrian network acquisition.

Retrieves eligible pedestrian ways and obstacle geometries (buildings/barriers)
within a campus bounding box, with robust caching, bounded retry, and conservative
pedestrian access tag filtering.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)

DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "Bunbetsu/0.2 (PedestrianRouting; info@bunbetsu.local)"

# Cache storage: key -> (timestamp, data)
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 3600.0  # 1 hour default TTL


class OverpassError(Exception):
    """Base exception for Overpass API failures."""
    pass


class OverpassTimeoutError(OverpassError):
    """Raised when an Overpass request times out."""
    pass


class OverpassServiceError(OverpassError):
    """Raised when Overpass returns an HTTP or server-level error."""
    pass


def clear_cache() -> None:
    """Clear in-memory Overpass cache (useful in tests)."""
    _CACHE.clear()


def get_overpass_endpoint() -> str:
    """Retrieve configured Overpass API endpoint."""
    return os.environ.get("OVERPASS_API_URL", DEFAULT_OVERPASS_URL).strip()


def calculate_boundary_bbox(boundary_geojson: dict[str, Any], buffer_deg: float = 0.0008) -> tuple[float, float, float, float]:
    """Calculate (min_lat, min_lon, max_lat, max_lon) from a GeoJSON Polygon or MultiPolygon with buffer.

    Buffer ensures paths crossing the campus boundary or entrance vertices right at the perimeter
    are captured. 0.0008 deg is approximately 80-90m.
    """
    coords = boundary_geojson.get("coordinates")
    if not coords:
        raise ValueError("Boundary geometry is missing coordinates.")

    all_lons: list[float] = []
    all_lats: list[float] = []

    def _collect(pt: Any) -> None:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2 and isinstance(pt[0], (int, float)) and isinstance(pt[1], (int, float)):
            all_lons.append(float(pt[0]))
            all_lats.append(float(pt[1]))
        elif isinstance(pt, list):
            for sub in pt:
                _collect(sub)

    _collect(coords)
    if not all_lons or not all_lats:
        raise ValueError("Could not extract any coordinates from boundary geometry.")

    min_lon = max(-180.0, min(all_lons) - buffer_deg)
    max_lon = min(180.0, max(all_lons) + buffer_deg)
    min_lat = max(-90.0, min(all_lats) - buffer_deg)
    max_lat = min(90.0, max(all_lats) + buffer_deg)

    return (min_lat, min_lon, max_lat, max_lon)


def is_eligible_pedestrian_way(tags: dict[str, str]) -> tuple[bool, Optional[str]]:
    """Conservative filter for walkable pedestrian paths.

    Returns (is_eligible, reason_if_excluded).
    Respects: highway, foot, access, service, bridge, tunnel, layer.
    """
    if not tags:
        return False, "missing tags"

    highway = tags.get("highway", "").lower()
    if not highway:
        return False, "no highway tag"

    # Strictly excluded highway categories
    disallowed_highways = {
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
        "construction",
        "proposed",
        "raceway",
        "escape",
        "abandoned",
        "busway",
    }
    if highway in disallowed_highways:
        return False, f"motor-only/disallowed highway class ({highway})"

    # Explicit pedestrian exclusions
    foot = tags.get("foot", "").lower()
    if foot in {"no", "private", "use_sidepath"}:
        return False, f"explicitly non-walkable (foot={foot})"

    # General access restrictions
    access = tags.get("access", "").lower()
    if access in {"no", "private"} and foot not in {"yes", "designated", "permissive"}:
        return False, f"restricted access without pedestrian exception (access={access})"

    # Conservative service road handling
    if highway == "service":
        service = tags.get("service", "").lower()
        if service in {"driveway", "parking_aisle", "drive-through", "bus"} and foot not in {"yes", "designated"}:
            return False, f"restricted service road type ({service})"
        if access in {"private", "no"}:
            return False, "private service road"

    # Explicit pedestrian paths
    pedestrian_highways = {
        "footway",
        "path",
        "pedestrian",
        "steps",
        "living_street",
        "corridor",
        "crossing",
        "sidewalk",
    }
    if highway in pedestrian_highways:
        return True, None

    # Cycleways: eligible unless foot is explicitly forbidden
    if highway == "cycleway":
        return True, None

    # Campus/urban roads where walking is standard unless forbidden
    walkable_roads = {
        "residential",
        "unclassified",
        "tertiary",
        "tertiary_link",
        "secondary",
        "secondary_link",
        "service",
        "track",
        "pedestrian_area",
    }
    if highway in walkable_roads:
        return True, None

    # Any other highway with explicit pedestrian allowance
    if foot in {"yes", "designated", "permissive"}:
        return True, None

    return False, f"unsupported or non-pedestrian highway tag ({highway})"


def build_overpass_query(bbox: tuple[float, float, float, float], timeout_s: int = 25) -> str:
    """Construct an Overpass QL query bounded to the campus area."""
    min_lat, min_lon, max_lat, max_lon = bbox
    # Query ways tagged highway, building, or barrier and all referenced nodes
    return f"""[out:json][timeout:{timeout_s}];
(
  way["highway"]({min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f});
  way["building"]({min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f});
  way["barrier"]({min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f});
);
(._;>;);
out body;
"""


def _generate_cache_key(bbox: tuple[float, float, float, float], endpoint: str) -> str:
    key_str = f"{endpoint}:{bbox[0]:.6f}:{bbox[1]:.6f}:{bbox[2]:.6f}:{bbox[3]:.6f}"
    return hashlib.sha256(key_str.encode("utf-8")).hexdigest()


async def fetch_osm_data_for_boundary(
    boundary_geojson: dict[str, Any],
    timeout_s: float = 25.0,
    max_retries: int = 3,
    custom_client: Optional[httpx.AsyncClient] = None,
) -> dict[str, Any]:
    """Fetch raw OSM elements for campus boundary using bounded retry and caching.

    Returns the parsed Overpass JSON response containing 'elements'.
    """
    bbox = calculate_boundary_bbox(boundary_geojson)
    endpoint = get_overpass_endpoint()
    cache_key = _generate_cache_key(bbox, endpoint)

    # Check cache
    now = time.time()
    if cache_key in _CACHE:
        cached_time, cached_data = _CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            logger.info("Using cached Overpass data for bbox %s", bbox)
            return cached_data

    query = build_overpass_query(bbox, timeout_s=int(timeout_s))
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    last_error: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        try:
            client = custom_client or httpx.AsyncClient(timeout=timeout_s + 5.0)
            try:
                response = await client.post(
                    endpoint,
                    data={"data": query},
                    headers=headers,
                )
            finally:
                if custom_client is None:
                    await client.aclose()

            if response.status_code == 429:
                # Rate limited
                wait_time = 1.0 * (2 ** (attempt - 1))
                logger.warning("Overpass rate limited (429), attempt %d/%d. Waiting %.1fs", attempt, max_retries, wait_time)
                if attempt == max_retries:
                    raise OverpassServiceError("OpenStreetMap Overpass API rate limit reached (HTTP 429). Please try again shortly.")
                time.sleep(wait_time)
                continue

            if response.status_code in (502, 503, 504):
                wait_time = 0.8 * (2 ** (attempt - 1))
                logger.warning("Overpass server error (%d), attempt %d/%d. Waiting %.1fs", response.status_code, attempt, max_retries, wait_time)
                if attempt == max_retries:
                    raise OverpassServiceError(f"OpenStreetMap Overpass API returned HTTP {response.status_code}.")
                time.sleep(wait_time)
                continue

            response.raise_for_status()

            try:
                data = response.json()
            except Exception as exc:
                raise OverpassServiceError(f"Malformed JSON response from Overpass: {exc}") from exc

            if not isinstance(data, dict) or "elements" not in data:
                raise OverpassServiceError("Invalid Overpass response format: missing 'elements'.")

            # Store in cache
            _CACHE[cache_key] = (now, data)
            return data

        except httpx.TimeoutException as exc:
            last_error = exc
            wait_time = 0.5 * (2 ** (attempt - 1))
            logger.warning("Overpass request timed out, attempt %d/%d", attempt, max_retries)
            if attempt == max_retries:
                raise OverpassTimeoutError(f"OpenStreetMap Overpass API timed out after {timeout_s}s.") from exc
            time.sleep(wait_time)

        except (httpx.HTTPError, httpx.RequestError) as exc:
            last_error = exc
            if attempt == max_retries:
                raise OverpassServiceError(f"Network error communicating with Overpass: {exc}") from exc
            time.sleep(0.5)

    raise OverpassServiceError(f"Failed to fetch OSM data from Overpass after {max_retries} attempts: {last_error}")


def parse_osm_elements(elements: list[dict[str, Any]]) -> tuple[dict[int, dict[str, float]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Parse raw Overpass elements into nodes, eligible pedestrian ways, and obstacle ways (buildings/barriers).

    Returns:
        nodes: dict[node_id, {"lat": float, "lon": float}]
        pedestrian_ways: list of dicts with way attributes, nodes list, tags
        obstacle_ways: list of dicts with obstacle ways (building/barrier)
    """
    nodes: dict[int, dict[str, float]] = {}
    ways: list[dict[str, Any]] = []

    for el in elements:
        el_type = el.get("type")
        if el_type == "node":
            nid = el.get("id")
            lat = el.get("lat")
            lon = el.get("lon")
            if nid is not None and lat is not None and lon is not None:
                nodes[int(nid)] = {"lat": float(lat), "lon": float(lon)}
        elif el_type == "way":
            ways.append(el)

    pedestrian_ways: list[dict[str, Any]] = []
    obstacle_ways: list[dict[str, Any]] = []

    for way in ways:
        tags = way.get("tags") or {}
        way_nodes = [int(n) for n in way.get("nodes", [])]
        if len(way_nodes) < 2:
            continue

        # Check obstacles: building or barrier
        if "building" in tags or "barrier" in tags:
            obstacle_ways.append({
                "id": int(way.get("id", 0)),
                "nodes": way_nodes,
                "tags": tags,
                "type": "building" if "building" in tags else "barrier",
            })

        # Check pedestrian eligibility
        is_ped, _ = is_eligible_pedestrian_way(tags)
        if is_ped:
            pedestrian_ways.append({
                "id": int(way.get("id", 0)),
                "nodes": way_nodes,
                "tags": tags,
                "highway": tags.get("highway", "path"),
                "layer": int(tags.get("layer", "0")) if tags.get("layer", "").lstrip("-").isdigit() else 0,
                "bridge": tags.get("bridge") in ("yes", "true", "1"),
                "tunnel": tags.get("tunnel") in ("yes", "true", "1"),
            })

    return nodes, pedestrian_ways, obstacle_ways

