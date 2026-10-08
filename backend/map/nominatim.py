from typing import Any

import httpx


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

USER_AGENT = "Bunbetsu/0.1"


async def search_place(
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": limit,
        "addressdetails": 1,
        "polygon_geojson": 1,
    }

    headers = {
        "User-Agent": USER_AGENT,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            NOMINATIM_URL,
            params=params,
            headers=headers,
        )

        response.raise_for_status()

        return response.json()