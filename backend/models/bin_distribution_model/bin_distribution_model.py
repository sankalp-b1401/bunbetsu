"""Bunbetsu on-location bin prediction and polygon-constrained placement.

The existing waste predictor remains unchanged. This module:
1. converts predicted category mass to estimated litres,
2. estimates average daily bin capacity requirements,
3. enforces a configurable perimeter spacing guideline, and
4. returns bin coordinates sampled on an inward-offset version of each
   location polygon's exterior boundary.

Input geometry is GeoJSON in WGS84 [longitude, latitude] order, matching
MapLibre and the frontend CampusLocation.geometry shape.

Spacing note:
A 30 m interval is an initial planning guideline for active public spaces,
not a universal statutory standard. Local event conditions and accessibility
must be reviewed before deployment.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Mapping

from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import transform

from models.waste_predictor_model.waste_predictor_model import (
    FestInput,
    LocationWasteAllocation,
    WastePrediction,
    predict as predict_waste,
)

BIN_CAPACITY_LITRES = 100.0
USABLE_FILL_FRACTION = 0.80
EMPTYING_CYCLES_PER_DAY = 2
EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY = (
    BIN_CAPACITY_LITRES * USABLE_FILL_FRACTION * EMPTYING_CYCLES_PER_DAY
)

WASTE_DENSITY_KG_PER_M3: dict[str, float] = {
    "Food": 290.0,
    "Plastic": 62.5,
    "Paper": 88.0,
    "Glass": 197.5,
    # Explicit provisional proxy; "Others" is not a standardized material mix.
    "Others": 240.0,
}

# Initial planning defaults; override for the venue/event if needed.
DEFAULT_BOUNDARY_SPACING_M = 30.0
DEFAULT_BOUNDARY_INSET_M = 1.5
DEFAULT_CLOSE_SPACING_WARNING_M = 3.0


@dataclass(frozen=True)
class BinCountRange:
    low: int
    central: int
    high: int

    def __post_init__(self) -> None:
        if not (0 <= self.low <= self.central <= self.high):
            raise ValueError("Bin counts must satisfy 0 <= low <= central <= high.")


@dataclass(frozen=True)
class BinPlacement:
    """One placed bin; coordinates are [longitude, latitude] in WGS84."""

    bin_index: int
    longitude: float
    latitude: float
    boundary_distance_m: float

    @property
    def coordinates(self) -> tuple[float, float]:
        return (self.longitude, self.latitude)


@dataclass(frozen=True)
class LocationBinPrediction:
    location_name: str
    area: float
    activities: tuple[str, ...]
    waste_kg_per_day_low: float
    waste_kg_per_day_central: float
    waste_kg_per_day_high: float
    volume_litres_per_day_low: float
    volume_litres_per_day_central: float
    volume_litres_per_day_high: float
    capacity_bins: BinCountRange
    spatial_minimum_bins: int
    perimeter_spacing_minimum_bins: int
    recommended_bins: BinCountRange
    bin_placements: tuple[BinPlacement, ...]
    placement_scenario: str
    boundary_spacing_target_m: float
    actual_boundary_spacing_m: float
    boundary_inset_m: float
    placement_warnings: tuple[str, ...]


@dataclass(frozen=True)
class OnLocationBinPrediction:
    locations: tuple[LocationBinPrediction, ...]
    bin_capacity_litres: float
    usable_fill_fraction: float
    emptying_cycles_per_day: int
    effective_capacity_litres_per_bin_per_day: float
    density_kg_per_m3: dict[str, float]
    boundary_spacing_target_m: float
    boundary_inset_m: float
    assumptions: tuple[str, ...]


def _validate_density_map(densities: Mapping[str, float]) -> None:
    required = {"Food", "Plastic", "Paper", "Glass", "Others"}
    missing = required - set(densities)
    if missing:
        raise ValueError(f"Missing waste density values for categories: {sorted(missing)}")
    invalid = {
        category: density
        for category, density in densities.items()
        if not isinstance(density, (int, float))
        or not math.isfinite(float(density))
        or float(density) <= 0
    }
    if invalid:
        raise ValueError(f"Waste densities must be finite positive kg/m^3 values: {invalid}")


def volume_litres_from_mass_kg(
    composition_mass_kg: Mapping[str, float],
    density_kg_per_m3: Mapping[str, float] = WASTE_DENSITY_KG_PER_M3,
) -> float:
    """Convert category masses to estimated bulk volume in litres."""
    _validate_density_map(density_kg_per_m3)
    unknown = set(composition_mass_kg) - set(density_kg_per_m3)
    if unknown:
        raise ValueError(f"No density configured for waste categories: {sorted(unknown)}")

    total_litres = 0.0
    for category, mass_kg in composition_mass_kg.items():
        if not isinstance(mass_kg, (int, float)) or not math.isfinite(float(mass_kg)):
            raise ValueError(f"Mass for {category!r} must be finite.")
        if mass_kg < 0:
            raise ValueError(f"Mass for {category!r} cannot be negative.")
        total_litres += float(mass_kg) / (float(density_kg_per_m3[category]) / 1000.0)
    return total_litres


def bins_for_daily_volume(
    volume_litres_per_day: float,
    effective_capacity_litres_per_bin_per_day: float = EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY,
) -> int:
    """Return the minimum integer bin count for an estimated daily volume."""
    if not math.isfinite(float(volume_litres_per_day)) or volume_litres_per_day < 0:
        raise ValueError("Daily volume must be finite and non-negative.")
    if (
        not math.isfinite(float(effective_capacity_litres_per_bin_per_day))
        or effective_capacity_litres_per_bin_per_day <= 0
    ):
        raise ValueError("Effective bin capacity must be finite and positive.")
    return 0 if volume_litres_per_day == 0 else math.ceil(
        volume_litres_per_day / effective_capacity_litres_per_bin_per_day
    )


def _to_shape(geometry: Mapping[str, Any], location_name: str) -> Polygon | MultiPolygon:
    if not isinstance(geometry, Mapping):
        raise ValueError(f"Missing GeoJSON geometry for location {location_name!r}.")
    try:
        geom = shape(geometry)
    except Exception as exc:
        raise ValueError(f"Invalid GeoJSON geometry for {location_name!r}: {exc}") from exc
    if not isinstance(geom, (Polygon, MultiPolygon)):
        raise ValueError(
            f"Location {location_name!r} must have Polygon or MultiPolygon geometry; "
            f"received {geom.geom_type}."
        )
    if geom.is_empty or not geom.is_valid or geom.area <= 0:
        raise ValueError(
            f"Location {location_name!r} has an empty, invalid, or zero-area polygon. "
            "Repair the polygon before predicting bin locations."
        )
    return geom


def _local_transformers(geom: Polygon | MultiPolygon) -> tuple[Transformer, Transformer]:
    """Create a local azimuthal-equidistant metre projection for this polygon."""
    centroid = geom.centroid
    local_crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={centroid.y} +lon_0={centroid.x} "
        "+datum=WGS84 +units=m +no_defs"
    )
    forward = Transformer.from_crs(CRS.from_epsg(4326), local_crs, always_xy=True)
    inverse = Transformer.from_crs(local_crs, CRS.from_epsg(4326), always_xy=True)
    return forward, inverse


def _exterior_lines(geom: Polygon | MultiPolygon) -> list[LineString]:
    polygons = [geom] if isinstance(geom, Polygon) else list(geom.geoms)
    return [poly.exterior for poly in polygons if poly.exterior.length > 0]


def _inset_exterior_lines(
    polygon_m: Polygon | MultiPolygon,
    requested_inset_m: float,
) -> tuple[list[LineString], float]:
    """Find an inward-buffered exterior ring; reduce inset for small polygons."""
    minx, miny, maxx, maxy = polygon_m.bounds
    scale = max(0.0, min(maxx - minx, maxy - miny))
    initial = min(requested_inset_m, max(scale * 0.20, 0.01))
    candidates = [initial, initial * 0.5, initial * 0.25, initial * 0.1, 0.01]
    seen: set[float] = set()
    for inset in candidates:
        inset = max(0.005, inset)
        if inset in seen:
            continue
        seen.add(inset)
        inner = polygon_m.buffer(-inset)
        if inner.is_empty:
            continue
        lines = _exterior_lines(inner)
        if lines and sum(line.length for line in lines) > 0:
            return lines, inset
    raise ValueError(
        "The location polygon is too narrow/small to generate an inward boundary. "
        "Redraw the polygon or reduce the boundary inset."
    )


def _sample_boundary(
    lines: list[LineString],
    count: int,
    inverse: Transformer,
    original_polygon_m: Polygon | MultiPolygon,
    original_polygon_wgs84: Polygon | MultiPolygon,
    forward_transform: Transformer,
    requested_inset_m: float,
) -> tuple[tuple[BinPlacement, ...], float, float]:
    """Sample evenly around inward-offset exterior rings and return WGS84 points."""
    if count <= 0:
        return (), 0.0, requested_inset_m

    lengths = [float(line.length) for line in lines]
    total_length = sum(lengths)
    if total_length <= 0:
        raise ValueError("Could not measure a usable inward boundary for bin placement.")

    # Allocate samples proportional to each disconnected polygon's perimeter.
    raw = [count * length / total_length for length in lengths]
    allocation = [int(math.floor(value)) for value in raw]
    # If there are fewer bins than polygon components, prioritize longest components.
    if count >= len(lines):
        for idx in range(len(lines)):
            if allocation[idx] == 0:
                allocation[idx] = 1
    while sum(allocation) > count:
        candidates = [i for i, n in enumerate(allocation) if n > 1]
        if not candidates:
            break
        idx = min(candidates, key=lambda i: raw[i] - math.floor(raw[i]))
        allocation[idx] -= 1
    remainders = sorted(
        range(len(lines)),
        key=lambda i: (raw[i] - math.floor(raw[i])),
        reverse=True,
    )
    while sum(allocation) < count:
        allocation[remainders[(sum(allocation) - sum(int(math.floor(v)) for v in raw)) % len(remainders)]] += 1

    points_m: list[Point] = []
    for line, n in zip(lines, allocation):
        if n <= 0:
            continue
        for i in range(n):
            # Midpoint sampling avoids vertices, where sharp corners can be awkward.
            points_m.append(line.interpolate((i + 0.5) * line.length / n))

    placements: list[BinPlacement] = []
    for index, point_m in enumerate(points_m, start=1):
        lon, lat = inverse.transform(point_m.x, point_m.y)

        # Validate the unrounded projected point strictly. Do not use a positive
        # buffer here: that would allow a point just outside the polygon to pass.
        if not original_polygon_m.covers(point_m):
            raise ValueError("Generated a bin point outside its location polygon.")

        # Validate the actual coordinates that will be returned after rounding.
        # This catches any edge case where coordinate rounding nudges a point
        # across the boundary. Check both the source GeoJSON polygon and its
        # local metric projection.
        returned_lon = round(float(lon), 7)
        returned_lat = round(float(lat), 7)
        returned_point_wgs84 = Point(returned_lon, returned_lat)
        returned_point_m = transform(
            lambda x, y, z=None: forward_transform.transform(x, y),
            returned_point_wgs84,
        )
        if not original_polygon_wgs84.covers(returned_point_wgs84):
            raise ValueError("Rounded bin coordinates fall outside the source location polygon.")
        if not original_polygon_m.covers(returned_point_m):
            raise ValueError("Rounded bin coordinates fall outside the projected location polygon.")

        boundary_distance = float(point_m.distance(original_polygon_m.boundary))
        placements.append(
            BinPlacement(
                bin_index=index,
                longitude=returned_lon,
                latitude=returned_lat,
                boundary_distance_m=round(boundary_distance, 2),
            )
        )

    # Report minimum adjacent spacing around each sampled component. This is a
    # conservative diagnostic for simple single-polygon event areas.
    actual_spacing = total_length / count if count else 0.0
    return tuple(placements), actual_spacing, requested_inset_m


def _make_location_prediction(
    allocation: LocationWasteAllocation,
    duration_days: int,
    spatial_minimum_bins: int,
    densities: Mapping[str, float],
    geometry: Mapping[str, Any],
    boundary_spacing_m: float,
    boundary_inset_m: float,
    close_spacing_warning_m: float,
) -> LocationBinPrediction:
    if not isinstance(spatial_minimum_bins, int) or spatial_minimum_bins < 0:
        raise ValueError(
            f"Spatial minimum for {allocation.location_name!r} must be a non-negative integer."
        )

    original_wgs84 = _to_shape(geometry, allocation.location_name)
    forward, inverse = _local_transformers(original_wgs84)
    polygon_m = transform(forward.transform, original_wgs84)
    lines, actual_inset = _inset_exterior_lines(polygon_m, boundary_inset_m)
    perimeter_m = sum(line.length for line in lines)
    perimeter_minimum = max(1, math.ceil(perimeter_m / boundary_spacing_m))

    mass_ranges = allocation.composition_kg
    total_volume_litres = {
        endpoint: volume_litres_from_mass_kg(
            {category: getattr(mass_range, endpoint) for category, mass_range in mass_ranges.items()},
            densities,
        )
        for endpoint in ("low", "central", "high")
    }
    # The existing predictor returns location-wise totals over the full event.
    # Bin sizing is based on average daily demand, so divide both the location's
    # total mass and its derived total volume by the event duration before
    # calculating capacity-based bin counts.
    daily_volumes = {
        endpoint: value / duration_days
        for endpoint, value in total_volume_litres.items()
    }
    daily_waste_kg = {
        endpoint: getattr(allocation.total_waste_kg, endpoint) / duration_days
        for endpoint in ("low", "central", "high")
    }
    capacity_counts = BinCountRange(
        bins_for_daily_volume(daily_volumes["low"]),
        bins_for_daily_volume(daily_volumes["central"]),
        bins_for_daily_volume(daily_volumes["high"]),
    )
    recommended_counts = BinCountRange(
        max(capacity_counts.low, spatial_minimum_bins, perimeter_minimum),
        max(capacity_counts.central, spatial_minimum_bins, perimeter_minimum),
        max(capacity_counts.high, spatial_minimum_bins, perimeter_minimum),
    )
    central_count = recommended_counts.central

    placements, actual_spacing, _ = _sample_boundary(
        lines=lines,
        count=central_count,
        inverse=inverse,
        original_polygon_m=polygon_m,
        original_polygon_wgs84=original_wgs84,
        forward_transform=forward,
        requested_inset_m=actual_inset,
    )
    warnings: list[str] = []
    if actual_spacing < close_spacing_warning_m:
        warnings.append(
            f"Placement requires approximately {actual_spacing:.1f} m spacing along the inset "
            f"boundary, below the {close_spacing_warning_m:.1f} m close-spacing warning threshold. "
            "Review clustering/access and collection access manually."
        )
    if actual_inset < boundary_inset_m:
        warnings.append(
            f"Polygon is too narrow for the requested {boundary_inset_m:.2f} m inset; "
            f"the model reduced it to {actual_inset:.2f} m."
        )
    if central_count > perimeter_minimum:
        warnings.append(
            "The waste-capacity estimate requires more bins than perimeter spacing alone; "
            "the bins are distributed more closely around the boundary."
        )

    return LocationBinPrediction(
        location_name=allocation.location_name,
        area=allocation.area,
        activities=allocation.activities,
        waste_kg_per_day_low=daily_waste_kg["low"],
        waste_kg_per_day_central=daily_waste_kg["central"],
        waste_kg_per_day_high=daily_waste_kg["high"],
        volume_litres_per_day_low=daily_volumes["low"],
        volume_litres_per_day_central=daily_volumes["central"],
        volume_litres_per_day_high=daily_volumes["high"],
        capacity_bins=capacity_counts,
        spatial_minimum_bins=spatial_minimum_bins,
        perimeter_spacing_minimum_bins=perimeter_minimum,
        recommended_bins=recommended_counts,
        bin_placements=placements,
        placement_scenario="central",
        boundary_spacing_target_m=boundary_spacing_m,
        actual_boundary_spacing_m=round(actual_spacing, 2),
        boundary_inset_m=round(actual_inset, 2),
        placement_warnings=tuple(warnings),
    )


def predict_on_location_bins(
    fest_input: FestInput,
    waste_prediction: WastePrediction | None = None,
    *,
    location_geometries: Mapping[str, Mapping[str, Any]],
    spatial_minimum_bins: Mapping[str, int] | None = None,
    density_kg_per_m3: Mapping[str, float] = WASTE_DENSITY_KG_PER_M3,
    boundary_spacing_m: float = DEFAULT_BOUNDARY_SPACING_M,
    boundary_inset_m: float = DEFAULT_BOUNDARY_INSET_M,
    close_spacing_warning_m: float = DEFAULT_CLOSE_SPACING_WARNING_M,
) -> OnLocationBinPrediction:
    """Predict bin counts and coordinates for every activity location.

    Args:
        fest_input: Input to the existing waste predictor.
        waste_prediction: Optional precomputed prediction.
        location_geometries: Required mapping from each unique location *name*
            to its GeoJSON Polygon/MultiPolygon geometry. Geometry coordinates
            must be WGS84 [longitude, latitude], as emitted by MapLibre.
        spatial_minimum_bins: Optional additional minimum count by location name.
        density_kg_per_m3: Configurable category bulk densities.
        boundary_spacing_m: Target maximum interval between bins around the
            inset exterior boundary. Default 30 m is a planning guideline.
        boundary_inset_m: Desired inward offset from the location boundary.
        close_spacing_warning_m: Emit a warning if placements are closer than this.

    Returns:
        Per-location capacity counts, final recommended count range, and
        central-scenario coordinates. The coordinates are sampled around the
        inward-offset exterior boundary and are in [longitude, latitude] order.

    Raises:
        ValueError for missing/invalid geometry, duplicate location names,
        unknown minima, invalid parameters, or impossible polygons.
    """
    fest_input.validate()
    _validate_density_map(density_kg_per_m3)
    for value, label in (
        (boundary_spacing_m, "boundary_spacing_m"),
        (boundary_inset_m, "boundary_inset_m"),
        (close_spacing_warning_m, "close_spacing_warning_m"),
    ):
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or value <= 0:
            raise ValueError(f"{label} must be finite and positive.")

    prediction = waste_prediction if waste_prediction is not None else predict_waste(fest_input)
    if not prediction.location_allocations:
        raise ValueError("At least one LocationInput is required for on-location bin prediction.")

    names = [item.location_name for item in prediction.location_allocations]
    if len(names) != len(set(names)):
        raise ValueError(
            "Location names must be unique because the existing waste predictor uses names as keys."
        )

    geometries = dict(location_geometries)
    missing_geometries = set(names) - set(geometries)
    extra_geometries = set(geometries) - set(names)
    if missing_geometries or extra_geometries:
        raise ValueError(
            f"location_geometries must match predicted location names exactly; "
            f"missing={sorted(missing_geometries)}, extra={sorted(extra_geometries)}."
        )

    spatial_minima = dict(spatial_minimum_bins or {})
    unknown_minima = set(spatial_minima) - set(names)
    if unknown_minima:
        raise ValueError(f"Spatial minimums provided for unknown locations: {sorted(unknown_minima)}")

    results = tuple(
        _make_location_prediction(
            allocation=allocation,
            duration_days=fest_input.duration_days,
            spatial_minimum_bins=spatial_minima.get(allocation.location_name, 0),
            densities=density_kg_per_m3,
            geometry=geometries[allocation.location_name],
            boundary_spacing_m=float(boundary_spacing_m),
            boundary_inset_m=float(boundary_inset_m),
            close_spacing_warning_m=float(close_spacing_warning_m),
        )
        for allocation in prediction.location_allocations
    )
    return OnLocationBinPrediction(
        locations=results,
        bin_capacity_litres=BIN_CAPACITY_LITRES,
        usable_fill_fraction=USABLE_FILL_FRACTION,
        emptying_cycles_per_day=EMPTYING_CYCLES_PER_DAY,
        effective_capacity_litres_per_bin_per_day=EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY,
        density_kg_per_m3={key: float(value) for key, value in density_kg_per_m3.items()},
        boundary_spacing_target_m=float(boundary_spacing_m),
        boundary_inset_m=float(boundary_inset_m),
        assumptions=(
            "The existing waste predictor is used without modification.",
            "Waste predictions are total kilograms over the event duration and are divided by duration_days to estimate average daily demand.",
            "Category-wise bulk-density references convert predicted mass to estimated volume; the broad 'Others' category uses a provisional 240 kg/m^3 proxy.",
            "Each 100 L bin is treated as 80 L usable capacity and emptied twice per day, giving 160 L/day effective capacity.",
            "Recommended bin count is the maximum of capacity-based count, any supplied spatial minimum, and the count needed to meet the configured perimeter spacing target.",
            "Coordinates are sampled along an inward-offset exterior boundary; polygon holes are not used as placement boundaries.",
            "The 30 m default is a configurable active-space planning guideline, not a universal statutory standard.",
            "This model does not yet test access paths, doorways, utilities, emergency routes, slope, or exact pedestrian demand; review placements before operational use.",
        ),
    )
