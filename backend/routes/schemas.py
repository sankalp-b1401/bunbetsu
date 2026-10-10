"""Pydantic schemas for the Bunbetsu pedestrian routing subsystem.

Validates GeoJSON geometries, activity locations, routing parameters,
and standardizes API response schemas.
"""

from __future__ import annotations

import math
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


def _validate_coordinate_pair(coord: Any, name: str = "coordinate") -> tuple[float, float]:
    """Validate a [longitude, latitude] coordinate pair."""
    if not isinstance(coord, (list, tuple)) or len(coord) < 2:
        raise ValueError(f"{name} must be a [longitude, latitude] sequence of at least 2 numbers.")
    lon, lat = coord[0], coord[1]
    if not (isinstance(lon, (int, float)) and isinstance(lat, (int, float))):
        raise ValueError(f"{name} values must be numeric.")
    if not (math.isfinite(lon) and math.isfinite(lat)):
        raise ValueError(f"{name} values must be finite numbers.")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Longitude {lon} out of range [-180, 180].")
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Latitude {lat} out of range [-90, 90].")
    return float(lon), float(lat)


def validate_geojson_geometry(geom: Any) -> dict[str, Any]:
    """Validate GeoJSON geometry structure and coordinate values."""
    if not isinstance(geom, dict):
        raise ValueError("Geometry must be a dictionary.")
    gtype = geom.get("type")
    if gtype not in ("Point", "Polygon", "MultiPolygon", "LineString"):
        raise ValueError(f"Unsupported geometry type: {gtype!r}. Supported: Point, Polygon, MultiPolygon, LineString.")
    coords = geom.get("coordinates")
    if coords is None:
        raise ValueError("Geometry missing 'coordinates' field.")

    if gtype == "Point":
        _validate_coordinate_pair(coords, "Point coordinate")
    elif gtype == "LineString":
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError("LineString coordinates must contain at least 2 coordinate pairs.")
        for pt in coords:
            _validate_coordinate_pair(pt, "LineString vertex")
    elif gtype == "Polygon":
        if not isinstance(coords, list) or len(coords) == 0:
            raise ValueError("Polygon must contain at least an exterior ring.")
        for ring in coords:
            if not isinstance(ring, list) or len(ring) < 4:
                raise ValueError("Polygon ring must have at least 4 coordinates (closed ring).")
            for pt in ring:
                _validate_coordinate_pair(pt, "Polygon vertex")
            # Verify ring is closed (first == last within small epsilon)
            first, last = ring[0], ring[-1]
            if abs(first[0] - last[0]) > 1e-6 or abs(first[1] - last[1]) > 1e-6:
                raise ValueError("Polygon linear ring must be closed (first coordinate equals last coordinate).")
    elif gtype == "MultiPolygon":
        if not isinstance(coords, list) or len(coords) == 0:
            raise ValueError("MultiPolygon must contain at least one polygon.")
        for poly in coords:
            if not isinstance(poly, list) or len(poly) == 0:
                raise ValueError("MultiPolygon polygon must contain at least one ring.")
            for ring in poly:
                if not isinstance(ring, list) or len(ring) < 4:
                    raise ValueError("MultiPolygon ring must have at least 4 coordinates.")
                for pt in ring:
                    _validate_coordinate_pair(pt, "MultiPolygon vertex")
                first, last = ring[0], ring[-1]
                if abs(first[0] - last[0]) > 1e-6 or abs(first[1] - last[1]) > 1e-6:
                    raise ValueError("MultiPolygon linear ring must be closed.")
    return geom


class RoutingConfigSchema(BaseModel):
    max_snap_distance_m: float = Field(
        default=50.0,
        gt=0.0,
        le=500.0,
        description="Maximum snapping distance from an activity location to the pedestrian graph in metres.",
    )
    overpass_timeout_s: float = Field(
        default=25.0,
        gt=1.0,
        le=120.0,
        description="Timeout for Overpass API requests in seconds.",
    )
    max_route_pairs: int = Field(
        default=500,
        gt=0,
        le=5000,
        description="Maximum evaluated activity location pairs to prevent unbounded computation.",
    )
    check_barriers: bool = Field(
        default=True,
        description="Whether candidate connectors crossing known building/barrier geometries are flagged.",
    )


class LocationRouteRequest(BaseModel):
    id: str = Field(..., min_length=1, description="Stable unique identifier for the location.")
    name: str = Field(..., min_length=1, description="Human-readable name of the location.")
    activities: list[str] = Field(default_factory=list, description="Activity tags assigned to location.")
    geometry: dict[str, Any] = Field(..., description="GeoJSON Point, Polygon, or MultiPolygon geometry.")
    center: Optional[list[float]] = Field(default=None, description="Optional center [lng, lat].")
    weight: Optional[float] = Field(default=None, ge=0.0, description="Optional attraction weight override.")

    @field_validator("geometry")
    @classmethod
    def validate_geometry(cls, v: dict[str, Any]) -> dict[str, Any]:
        return validate_geojson_geometry(v)

    @field_validator("center")
    @classmethod
    def validate_center(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        if v is not None:
            _validate_coordinate_pair(v, "center")
            return [float(v[0]), float(v[1])]
        return None


class RoutePlanRequest(BaseModel):
    boundary: dict[str, Any] = Field(
        ...,
        description="Campus boundary GeoJSON (Polygon or MultiPolygon).",
    )
    locations: list[LocationRouteRequest] = Field(
        ...,
        min_length=1,
        description="Active activity locations to connect and route between.",
    )
    config: Optional[RoutingConfigSchema] = Field(
        default=None,
        description="Optional routing configuration thresholds.",
    )

    @field_validator("boundary")
    @classmethod
    def validate_boundary(cls, v: dict[str, Any]) -> dict[str, Any]:
        geom = validate_geojson_geometry(v)
        if geom.get("type") not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"Campus boundary must be Polygon or MultiPolygon, received {geom.get('type')!r}.")
        return geom

    @model_validator(mode="after")
    def validate_unique_location_ids(self) -> RoutePlanRequest:
        ids = [loc.id for loc in self.locations]
        if len(ids) != len(set(ids)):
            duplicates = [i for i in ids if ids.count(i) > 1]
            raise ValueError(f"Duplicate location IDs detected: {sorted(set(duplicates))}.")
        return self


class PathSegmentProperties(BaseModel):
    id: str
    osm_way_id: Optional[int] = None
    highway: str
    length_m: float
    raw_score: float
    normalized_score: float
    u: str
    v: str
    provenance: Literal["osm_mapped"] = "osm_mapped"
    accessibility: Optional[dict[str, Any]] = None


class ConnectorProperties(BaseModel):
    id: str
    location_id: str
    location_name: str
    snap_distance_m: float
    connector_length_m: float
    status: Literal["connected", "unmatched", "flagged"]
    provenance: Literal["connector"] = "connector"
    reason: Optional[str] = None


class IntersectionProperties(BaseModel):
    node_id: str
    degree: int
    traffic_score: float


class LocationConnectivityStatus(BaseModel):
    location_id: str
    location_name: str
    status: Literal["connected", "unmatched", "flagged"]
    snap_distance_m: Optional[float] = None
    snap_point: Optional[list[float]] = None
    reason: Optional[str] = None


class GraphDiagnostics(BaseModel):
    nodes_count: int
    edges_count: int
    total_length_m: float
    components_count: int
    discarded_ways_count: int


class ScoringDiagnostics(BaseModel):
    total_locations: int
    connected_locations: int
    unmatched_locations: list[str]
    evaluated_pairs: int
    connected_pairs: int
    unreachable_pairs: int
    max_raw_score: float


class RoutePlanResponse(BaseModel):
    success: bool = True
    boundary_geojson: dict[str, Any]
    paths_geojson: dict[str, Any]
    connectors_geojson: dict[str, Any]
    intersections_geojson: Optional[dict[str, Any]] = None
    location_connectivity: list[LocationConnectivityStatus]
    diagnostics: dict[str, Any]
    metadata: dict[str, Any]
    warnings: list[str]

