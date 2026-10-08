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
    }