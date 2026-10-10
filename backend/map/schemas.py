from typing import Any, Optional

from pydantic import BaseModel


class CampusLocation(BaseModel):
    osm_id: int
    osm_type: str
    name: str
    display_name: str
    latitude: float
    longitude: float

    geometry: Optional[dict[str, Any]] = None

    category: Optional[str] = None
    osm_class: Optional[str] = None
    osm_type_tag: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    address: Optional[dict[str, Any]] = None