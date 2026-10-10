from typing import Any

from .nominatim import search_place


CAMPUS_KEYWORDS = (
    "university",
    "college",
    "institute",
    "campus",
    "school",
)


def score_candidate(result: dict[str, Any]) -> int:
    score = 0

    name = result.get("display_name", "").lower()

    osm_class = result.get("class", "").lower()
    osm_type = result.get("type", "").lower()

    # Prefer explicitly educational results.
    if osm_class in {"amenity", "building", "place"}:
        score += 1

    if osm_type in {
        "university",
        "college",
        "school",
        "campus",
    }:
        score += 5

    # Prefer names suggesting the institution itself.
    for keyword in CAMPUS_KEYWORDS:
        if keyword in name:
            score += 2

    # Prefer results that actually have polygon geometry.
    geometry = result.get("geojson")

    if geometry and geometry.get("type") in {
        "Polygon",
        "MultiPolygon",
    }:
        score += 10

    return score


def extract_state_from_address(address: dict[str, Any]) -> str | None:
    """Extract structured state/UT from Nominatim address object.

    Checks known administrative keys for states/UTs (state, province, region).
    Does not treat a city, county, or district as a state.
    """
    if not isinstance(address, dict):
        return None

    for key in ("state", "province", "region"):
        val = address.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    return None


async def find_campus(query: str) -> dict[str, Any]:
    results = await search_place(query)

    if not results:
        raise ValueError(
            f"No OpenStreetMap location found for '{query}'."
        )

    ranked = sorted(
        results,
        key=score_candidate,
        reverse=True,
    )

    best = ranked[0]

    address = best.get("address") or {}
    state = extract_state_from_address(address)
    country = address.get("country")
    if isinstance(country, str):
        country = country.strip()

    return {
        "osm_id": int(best["osm_id"]),
        "osm_type": best["osm_type"],
        "name": best.get("name") or query,
        "display_name": best["display_name"],
        "latitude": float(best["lat"]),
        "longitude": float(best["lon"]),
        "geometry": best.get("geojson"),
        "category": best.get("type"),
        "osm_class": best.get("class"),
        "osm_type_tag": best.get("type"),
        "state": state,
        "country": country,
        "address": address,
    }