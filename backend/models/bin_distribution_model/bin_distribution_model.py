"""Bunbetsu on-location bin prediction and polygon-constrained placement.

The existing waste predictor remains unchanged. This module:
1. converts predicted category mass to estimated litres,
2. calculates capacity-only bin demand based on usable bin capacity (80 L per 100 L bin),
3. calculates the approximate best-fit rectangle perimeter (minimum rotated rectangle) in projected metres,
4. enforces a 25 m minimum spacing policy bounding physical bin placement (M = floor(P / 25)),
5. calculates dynamic emptying turns when waste demand exceeds physical perimeter capacity,
6. exposes capacity coverage and shortfall diagnostics, and
7. returns bin coordinates sampled on an inward-offset version of each
   location polygon's exterior boundary.

Input geometry is GeoJSON in WGS84 [longitude, latitude] order, matching
MapLibre and the frontend CampusLocation.geometry shape.

Spacing note:
A 25 m interval is Bunbetsu's configured planning policy, not a universal statutory
standard. Local event conditions, accessibility, emergency paths, and operational
collection feasibility must be reviewed before deployment.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
import math
from typing import Any, Mapping

import numpy as np
from pyproj import CRS, Transformer
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
    shape,
)
from shapely.ops import transform, unary_union

try:
    from scipy.optimize import Bounds, LinearConstraint, milp
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

from models.waste_predictor_model.waste_predictor_model import (
    FestInput,
    LocationWasteAllocation,
    WastePrediction,
    predict as predict_waste,
)

BIN_CAPACITY_LITRES = 100.0
USABLE_FILL_FRACTION = 0.80
USABLE_BIN_CAPACITY_LITRES = BIN_CAPACITY_LITRES * USABLE_FILL_FRACTION  # 80.0 L

# Backward compatibility alias
EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY = USABLE_BIN_CAPACITY_LITRES
EMPTYING_CYCLES_PER_DAY = 1

WASTE_DENSITY_KG_PER_M3: dict[str, float] = {
    "Food": 290.0,
    "Plastic": 62.5,
    "Paper": 88.0,
    "Glass": 197.5,
    # Explicit provisional proxy; "Others" is not a standardized material mix.
    "Others": 240.0,
}

# Configured planning defaults; override for the venue/event if needed.
DEFAULT_BOUNDARY_SPACING_M = 25.0
DEFAULT_BOUNDARY_INSET_M = 1.5
DEFAULT_CLOSE_SPACING_WARNING_M = 3.0

# Waste-type-specific influence radii (in metres)
# Provisional baseline engineering radii measured outward from activity polygon boundary.
DEFAULT_WASTE_INFLUENCE_RADII_M: dict[str, float] = {
    "Food": 15.0,
    "Glass": 15.0,
    "Others": 20.0,
    "Paper": 25.0,
    "Plastic": 25.0,
}
WASTE_INFLUENCE_RADII_M = DEFAULT_WASTE_INFLUENCE_RADII_M

DEFAULT_ROAD_BIN_SPACING_M = 25.0
DEFAULT_ROAD_CANDIDATE_SAMPLING_INTERVAL_M = 5.0


def round_half_up(value: float) -> int:
    """Conventional half-up rounding (ties with fractional part >= 0.5 round up)."""
    return math.floor(value + 0.5)


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
    bin_type: str = "Disposable"

    @property
    def coordinates(self) -> tuple[float, float]:
        return (self.longitude, self.latitude)


def allocate_streams_largest_remainder(
    n_disposable: int,
    n_recyclable: int,
    m: int,
) -> tuple[int, int]:
    """Allocate physical bins between disposable and recyclable streams using largest remainder.

    Guarantees B_disposable + B_recyclable == m when m < (n_disposable + n_recyclable) and m > 0.
    Uses Hamilton's / Largest Remainder method with deterministic tie-breaking:
    1. Stream with larger fractional remainder receives the extra bin.
    2. Ties broken by greater original capacity demand (n_disposable vs n_recyclable).
    3. If still tied, disposable stream is preferred.
    """
    n_total = n_disposable + n_recyclable
    if n_total == 0 or m <= 0:
        return 0, 0

    # Case A: Demand fits
    if n_total <= m:
        return n_disposable, n_recyclable

    # Case B: Demand exceeds perimeter capacity
    scaled_disp = m * n_disposable / n_total
    scaled_rec = m * n_recyclable / n_total

    floor_disp = int(math.floor(scaled_disp))
    floor_rec = int(math.floor(scaled_rec))

    remaining = m - (floor_disp + floor_rec)
    if remaining > 0:
        rem_disp = scaled_disp - floor_disp
        rem_rec = scaled_rec - floor_rec

        if abs(rem_disp - rem_rec) > 1e-9:
            if rem_disp > rem_rec:
                floor_disp += 1
            else:
                floor_rec += 1
        else:
            # Tie-break: higher original capacity demand
            if n_disposable > n_recyclable:
                floor_disp += 1
            elif n_recyclable > n_disposable:
                floor_rec += 1
            else:
                floor_disp += 1

    return floor_disp, floor_rec


@dataclass(frozen=True)
class LocationBinPrediction:
    location_name: str
    area: float
    activities: tuple[str, ...]

    # Waste mass metrics by scenario (kg/day)
    waste_kg_per_day_low: float
    waste_kg_per_day_central: float
    waste_kg_per_day_high: float
    disposable_waste_kg_per_day_central: float
    recyclable_waste_kg_per_day_central: float

    # Volume metrics by scenario (L/day)
    volume_litres_per_day_low: float
    volume_litres_per_day_central: float
    volume_litres_per_day_high: float
    disposable_volume_litres_per_day_central: float
    recyclable_volume_litres_per_day_central: float

    # Capacity-only demands
    capacity_bins: BinCountRange
    disposable_capacity_bins: BinCountRange
    recyclable_capacity_bins: BinCountRange

    # Perimeter constraint
    rectangle_perimeter_m: float
    perimeter_spacing_max_bins: int

    # Recommended physical bins
    recommended_bins: BinCountRange
    disposable_physical_bins: BinCountRange
    recyclable_physical_bins: BinCountRange

    # Variable emptying turns
    required_emptying_turns: BinCountRange
    disposable_required_turns: BinCountRange
    recyclable_required_turns: BinCountRange

    # Coverage and shortfall diagnostics (central scenario)
    daily_capacity_coverage_litres: float
    capacity_shortfall_litres: float
    disposable_capacity_coverage_litres: float
    disposable_capacity_shortfall_litres: float
    recyclable_capacity_coverage_litres: float
    recyclable_capacity_shortfall_litres: float

    # Placement and geometry
    bin_placements: tuple[BinPlacement, ...]
    placement_scenario: str
    boundary_spacing_target_m: float
    actual_boundary_spacing_m: float
    boundary_inset_m: float
    placement_warnings: tuple[str, ...]
    spatial_minimum_bins: int = 0

    @property
    def perimeter_spacing_minimum_bins(self) -> int:
        """Deprecated alias: perimeter spacing now defines an upper bound (max bins)."""
        return self.perimeter_spacing_max_bins

    @property
    def disposable_placements(self) -> tuple[BinPlacement, ...]:
        return tuple(p for p in self.bin_placements if p.bin_type == "Disposable")

    @property
    def recyclable_placements(self) -> tuple[BinPlacement, ...]:
        return tuple(p for p in self.bin_placements if p.bin_type == "Recyclable")


@dataclass(frozen=True)
class OnLocationBinPrediction:
    locations: tuple[LocationBinPrediction, ...]
    bin_capacity_litres: float
    usable_fill_fraction: float
    usable_bin_capacity_litres: float
    boundary_spacing_target_m: float
    boundary_inset_m: float
    density_kg_per_m3: dict[str, float]
    assumptions: tuple[str, ...]

    @property
    def total_disposable_physical_bins(self) -> int:
        return sum(loc.disposable_physical_bins.central for loc in self.locations)

    @property
    def total_recyclable_physical_bins(self) -> int:
        return sum(loc.recyclable_physical_bins.central for loc in self.locations)

    @property
    def emptying_cycles_per_day(self) -> int:
        """Deprecated alias: returns peak central emptying turns across locations."""
        return max((loc.required_emptying_turns.central for loc in self.locations), default=1)

    @property
    def effective_capacity_litres_per_bin_per_day(self) -> float:
        """Deprecated alias: replaced by usable_bin_capacity_litres."""
        return self.usable_bin_capacity_litres


@dataclass(frozen=True)
class RoadBinCandidate:
    """A feasible candidate point along a mapped pedestrian road."""

    candidate_id: str
    longitude: float
    latitude: float
    metric_x: float
    metric_y: float
    source_segment_id: str
    normalized_popularity_score: float
    served_location_ids: tuple[str, ...]

    @property
    def coordinates(self) -> tuple[float, float]:
        return (self.longitude, self.latitude)


@dataclass(frozen=True)
class RoadBinPlacement:
    """A selected physical road bin placed along a pedestrian path."""

    placement_id: str
    longitude: float
    latitude: float
    source_segment_id: str
    normalized_popularity_score: float
    served_location_ids: tuple[str, ...]
    served_location_names: tuple[str, ...]
    served_location_distances_m: dict[str, float]
    stream_type: str = "Dual-compartment station"
    provenance: str = "road_bin_optimizer"

    @property
    def coordinates(self) -> tuple[float, float]:
        return (self.longitude, self.latitude)


@dataclass(frozen=True)
class RoadBinPrediction:
    """Influence-based road-bin prediction and placement results."""

    placements: tuple[RoadBinPlacement, ...]
    total_physical_bins: int
    total_eligible_candidates: int
    total_locations_requiring_coverage: int
    covered_location_ids: tuple[str, ...]
    uncovered_location_ids: tuple[str, ...]
    location_influence_radii_m: dict[str, float]
    location_dominant_waste_types: dict[str, str]
    candidate_sampling_interval_m: float
    road_bin_spacing_m: float
    solver_name: str
    optimality_proven: bool
    total_popularity_score: float
    warnings: tuple[str, ...]
    assumptions: tuple[str, ...]
    diagnostics: dict[str, Any] = dataclasses.field(default_factory=dict)


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
    usable_bin_capacity_litres: float = USABLE_BIN_CAPACITY_LITRES,
    **kwargs: Any,
) -> int:
    """Return the minimum integer bin count for an estimated daily volume ignoring turns."""
    if "effective_capacity_litres_per_bin_per_day" in kwargs:
        usable_bin_capacity_litres = float(kwargs["effective_capacity_litres_per_bin_per_day"])
    if not math.isfinite(float(volume_litres_per_day)) or volume_litres_per_day < 0:
        raise ValueError("Daily volume must be finite and non-negative.")
    if (
        not math.isfinite(float(usable_bin_capacity_litres))
        or usable_bin_capacity_litres <= 0
    ):
        raise ValueError("Usable bin capacity must be finite and positive.")
    return 0 if volume_litres_per_day == 0 else math.ceil(
        volume_litres_per_day / usable_bin_capacity_litres
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

    # Calculate approximate best-fit rectangle perimeter using minimum rotated rectangle.
    # For MultiPolygons, compute the minimum rotated rectangle of each component and sum
    # their perimeters. This prevents treating empty space between disconnected components
    # as a usable placement boundary.
    if isinstance(polygon_m, Polygon):
        best_fit_rectangle = polygon_m.minimum_rotated_rectangle
        rectangle_perimeter_m = float(best_fit_rectangle.length)
    elif isinstance(polygon_m, MultiPolygon):
        rectangle_perimeter_m = float(
            sum(poly.minimum_rotated_rectangle.length for poly in polygon_m.geoms)
        )
    else:
        raise ValueError(
            f"Location {allocation.location_name!r} has unsupported geometry type {type(polygon_m)}."
        )

    if not math.isfinite(rectangle_perimeter_m) or rectangle_perimeter_m <= 0:
        raise ValueError(
            f"Location {allocation.location_name!r} produced invalid non-positive rectangle perimeter: {rectangle_perimeter_m}."
        )

    # Maximum physical bin count allowed under the boundary spacing policy: M = floor(P / d)
    perimeter_spacing_max_bins = int(math.floor(rectangle_perimeter_m / boundary_spacing_m))

    mass_ranges = allocation.composition_kg

    # Stream categories:
    # Disposable: Food + Others
    # Recyclable: Plastic + Paper + Glass
    disp_categories = ("Food", "Others")
    rec_categories = ("Plastic", "Paper", "Glass")

    # Volume per stream per scenario endpoint
    disposable_volume_litres = {
        endpoint: volume_litres_from_mass_kg(
            {category: getattr(mass_ranges[category], endpoint) for category in disp_categories if category in mass_ranges},
            densities,
        )
        for endpoint in ("low", "central", "high")
    }
    recyclable_volume_litres = {
        endpoint: volume_litres_from_mass_kg(
            {category: getattr(mass_ranges[category], endpoint) for category in rec_categories if category in mass_ranges},
            densities,
        )
        for endpoint in ("low", "central", "high")
    }
    total_volume_litres = {
        endpoint: disposable_volume_litres[endpoint] + recyclable_volume_litres[endpoint]
        for endpoint in ("low", "central", "high")
    }

    # Sizing is based on average daily demand over the event duration
    disposable_daily_volumes = {
        endpoint: value / duration_days for endpoint, value in disposable_volume_litres.items()
    }
    recyclable_daily_volumes = {
        endpoint: value / duration_days for endpoint, value in recyclable_volume_litres.items()
    }
    daily_volumes = {
        endpoint: value / duration_days for endpoint, value in total_volume_litres.items()
    }

    daily_waste_kg = {
        endpoint: getattr(allocation.total_waste_kg, endpoint) / duration_days
        for endpoint in ("low", "central", "high")
    }
    disposable_daily_waste_kg = {
        endpoint: sum(getattr(mass_ranges[cat], endpoint) for cat in disp_categories if cat in mass_ranges) / duration_days
        for endpoint in ("low", "central", "high")
    }
    recyclable_daily_waste_kg = {
        endpoint: sum(getattr(mass_ranges[cat], endpoint) for cat in rec_categories if cat in mass_ranges) / duration_days
        for endpoint in ("low", "central", "high")
    }

    # Capacity-only demand per stream: N_s = ceil(daily_volume_s / usable_bin_capacity)
    disp_capacity_counts = {
        endpoint: bins_for_daily_volume(disposable_daily_volumes[endpoint], usable_bin_capacity_litres=USABLE_BIN_CAPACITY_LITRES)
        for endpoint in ("low", "central", "high")
    }
    rec_capacity_counts = {
        endpoint: bins_for_daily_volume(recyclable_daily_volumes[endpoint], usable_bin_capacity_litres=USABLE_BIN_CAPACITY_LITRES)
        for endpoint in ("low", "central", "high")
    }
    total_capacity_counts = {
        endpoint: disp_capacity_counts[endpoint] + rec_capacity_counts[endpoint]
        for endpoint in ("low", "central", "high")
    }

    disposable_capacity_bins = BinCountRange(
        disp_capacity_counts["low"],
        disp_capacity_counts["central"],
        disp_capacity_counts["high"],
    )
    recyclable_capacity_bins = BinCountRange(
        rec_capacity_counts["low"],
        rec_capacity_counts["central"],
        rec_capacity_counts["high"],
    )
    capacity_counts = BinCountRange(
        total_capacity_counts["low"],
        total_capacity_counts["central"],
        total_capacity_counts["high"],
    )

    # Allocate physical bins between streams for each scenario endpoint
    def _allocate_scenario(endpoint: str) -> tuple[int, int, int]:
        n_d = disp_capacity_counts[endpoint]
        n_r = rec_capacity_counts[endpoint]
        n_tot = n_d + n_r
        m = perimeter_spacing_max_bins

        if n_tot == 0 or m == 0:
            return 0, 0, 0

        target_m = min(max(n_tot, spatial_minimum_bins), m) if spatial_minimum_bins > 0 else m

        if n_tot <= target_m and (spatial_minimum_bins == 0 or target_m == n_tot):
            # Case A: Demand fits
            b_d = n_d
            b_r = n_r
        else:
            # Proportional allocation to target_m using largest-remainder method
            scaled_disp = target_m * n_d / n_tot
            scaled_rec = target_m * n_r / n_tot
            f_disp = int(math.floor(scaled_disp))
            f_rec = int(math.floor(scaled_rec))
            rem = target_m - (f_disp + f_rec)
            if rem > 0:
                r_disp = scaled_disp - f_disp
                r_rec = scaled_rec - f_rec
                if abs(r_disp - r_rec) > 1e-9:
                    if r_disp > r_rec:
                        f_disp += 1
                    else:
                        f_rec += 1
                else:
                    if n_d >= n_r:
                        f_disp += 1
                    else:
                        f_rec += 1
            b_d = f_disp
            b_r = f_rec

        return b_d, b_r, b_d + b_r

    disp_phys_raw: dict[str, int] = {}
    rec_phys_raw: dict[str, int] = {}
    tot_phys_raw: dict[str, int] = {}
    for ep in ("low", "central", "high"):
        d, r, tot = _allocate_scenario(ep)
        disp_phys_raw[ep] = d
        rec_phys_raw[ep] = r
        tot_phys_raw[ep] = tot

    def _make_range(raw: dict[str, int]) -> BinCountRange:
        low = min(raw["low"], raw["central"])
        central = raw["central"]
        high = max(raw["high"], raw["central"])
        return BinCountRange(low, central, high)

    disposable_physical_bins = _make_range(disp_phys_raw)
    recyclable_physical_bins = _make_range(rec_phys_raw)
    recommended_counts = _make_range(tot_phys_raw)

    central_count = recommended_counts.central
    central_disp_physical = disposable_physical_bins.central
    central_rec_physical = recyclable_physical_bins.central

    # Variable emptying turns: turns_s = round_half_up(N_s / B_s) when B_s > 0
    def _calc_stream_turns(demand: int, physical_bins: int) -> int:
        if demand == 0 or physical_bins == 0:
            return 0
        if physical_bins >= demand:
            return 1
        return max(1, round_half_up(demand / physical_bins))

    disp_turns_raw = {
        ep: _calc_stream_turns(disp_capacity_counts[ep], disp_phys_raw[ep])
        for ep in ("low", "central", "high")
    }
    rec_turns_raw = {
        ep: _calc_stream_turns(rec_capacity_counts[ep], rec_phys_raw[ep])
        for ep in ("low", "central", "high")
    }
    tot_turns_raw = {
        ep: max(disp_turns_raw[ep], rec_turns_raw[ep])
        for ep in ("low", "central", "high")
    }

    disposable_required_turns = _make_range(disp_turns_raw)
    recyclable_required_turns = _make_range(rec_turns_raw)
    required_turns = _make_range(tot_turns_raw)

    # Capacity coverage & shortfall diagnostics (central scenario)
    disp_turns_central = disposable_required_turns.central
    rec_turns_central = recyclable_required_turns.central

    disp_coverage = central_disp_physical * USABLE_BIN_CAPACITY_LITRES * disp_turns_central
    disp_vol_central = disposable_daily_volumes["central"]
    disp_shortfall = max(0.0, disp_vol_central - disp_coverage)

    rec_coverage = central_rec_physical * USABLE_BIN_CAPACITY_LITRES * rec_turns_central
    rec_vol_central = recyclable_daily_volumes["central"]
    rec_shortfall = max(0.0, rec_vol_central - rec_coverage)

    total_coverage = disp_coverage + rec_coverage
    total_shortfall = disp_shortfall + rec_shortfall

    lines, actual_inset = _inset_exterior_lines(polygon_m, boundary_inset_m)

    if central_count > 0:
        base_placements, actual_spacing, _ = _sample_boundary(
            lines=lines,
            count=central_count,
            inverse=inverse,
            original_polygon_m=polygon_m,
            original_polygon_wgs84=original_wgs84,
            forward_transform=forward,
            requested_inset_m=actual_inset,
        )
        disp_target = central_disp_physical
        disp_assigned = 0
        stream_placements: list[BinPlacement] = []
        for i, p in enumerate(base_placements):
            # Interleave streams evenly around perimeter ring
            if disp_assigned < disp_target and (
                len(base_placements) - i <= disp_target - disp_assigned
                or round_half_up((i + 1) * disp_target / len(base_placements)) > disp_assigned
            ):
                b_type = "Disposable"
                disp_assigned += 1
            else:
                b_type = "Recyclable"
            stream_placements.append(
                BinPlacement(
                    bin_index=p.bin_index,
                    longitude=p.longitude,
                    latitude=p.latitude,
                    boundary_distance_m=p.boundary_distance_m,
                    bin_type=b_type,
                )
            )
        placements = tuple(stream_placements)
    else:
        placements = ()
        actual_spacing = 0.0

    warnings: list[str] = []
    if perimeter_spacing_max_bins == 0 and capacity_counts.central > 0:
        warnings.append(
            f"Location perimeter of {rectangle_perimeter_m:.1f} m cannot accommodate any bins under the "
            f"{boundary_spacing_m:.1f} m spacing policy (maximum physical bins = 0). "
            f"Daily waste demand ({daily_volumes['central']:.1f} L) cannot be accommodated on-location."
        )
    elif capacity_counts.central > perimeter_spacing_max_bins:
        warnings.append(
            f"Waste demand requires {capacity_counts.central} bin capacity equivalents "
            f"({disposable_capacity_bins.central} Disposable + {recyclable_capacity_bins.central} Recyclable), "
            f"exceeding physical perimeter capacity of {perimeter_spacing_max_bins} bin(s) under the "
            f"{boundary_spacing_m:.1f} m spacing policy. Dynamic emptying turns: "
            f"{disp_turns_central} turn(s) for Disposable, {rec_turns_central} turn(s) for Recyclable."
        )

    if central_disp_physical == 0 and disposable_capacity_bins.central > 0:
        warnings.append(
            f"Disposable stream has positive demand ({disp_vol_central:.1f} L, {disposable_capacity_bins.central} bins) "
            "but received 0 physical bins under perimeter constraints."
        )
    if central_rec_physical == 0 and recyclable_capacity_bins.central > 0:
        warnings.append(
            f"Recyclable stream has positive demand ({rec_vol_central:.1f} L, {recyclable_capacity_bins.central} bins) "
            "but received 0 physical bins under perimeter constraints."
        )

    if disp_shortfall > 0.001:
        warnings.append(
            f"Emptying turn rounding leaves a daily disposable capacity shortfall of {disp_shortfall:.1f} L "
            f"(predicted: {disp_vol_central:.1f} L, available: {disp_coverage:.1f} L across "
            f"{central_disp_physical} bin(s) with {disp_turns_central} turn(s))."
        )
    if rec_shortfall > 0.001:
        warnings.append(
            f"Emptying turn rounding leaves a daily recyclable capacity shortfall of {rec_shortfall:.1f} L "
            f"(predicted: {rec_vol_central:.1f} L, available: {rec_coverage:.1f} L across "
            f"{central_rec_physical} bin(s) with {rec_turns_central} turn(s))."
        )

    if central_count > 0 and actual_spacing < close_spacing_warning_m:
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
    if spatial_minimum_bins > perimeter_spacing_max_bins and perimeter_spacing_max_bins > 0:
        warnings.append(
            f"Spatial minimum of {spatial_minimum_bins} bins exceeds the physical perimeter limit of "
            f"{perimeter_spacing_max_bins} bins under the {boundary_spacing_m:.1f} m spacing policy; capped at {perimeter_spacing_max_bins}."
        )

    return LocationBinPrediction(
        location_name=allocation.location_name,
        area=allocation.area,
        activities=allocation.activities,
        waste_kg_per_day_low=daily_waste_kg["low"],
        waste_kg_per_day_central=daily_waste_kg["central"],
        waste_kg_per_day_high=daily_waste_kg["high"],
        disposable_waste_kg_per_day_central=round(disposable_daily_waste_kg["central"], 2),
        recyclable_waste_kg_per_day_central=round(recyclable_daily_waste_kg["central"], 2),
        volume_litres_per_day_low=daily_volumes["low"],
        volume_litres_per_day_central=daily_volumes["central"],
        volume_litres_per_day_high=daily_volumes["high"],
        disposable_volume_litres_per_day_central=round(disp_vol_central, 2),
        recyclable_volume_litres_per_day_central=round(rec_vol_central, 2),
        capacity_bins=capacity_counts,
        disposable_capacity_bins=disposable_capacity_bins,
        recyclable_capacity_bins=recyclable_capacity_bins,
        rectangle_perimeter_m=round(rectangle_perimeter_m, 2),
        perimeter_spacing_max_bins=perimeter_spacing_max_bins,
        recommended_bins=recommended_counts,
        disposable_physical_bins=disposable_physical_bins,
        recyclable_physical_bins=recyclable_physical_bins,
        required_emptying_turns=required_turns,
        disposable_required_turns=disposable_required_turns,
        recyclable_required_turns=recyclable_required_turns,
        daily_capacity_coverage_litres=round(total_coverage, 2),
        capacity_shortfall_litres=round(total_shortfall, 2),
        disposable_capacity_coverage_litres=round(disp_coverage, 2),
        disposable_capacity_shortfall_litres=round(disp_shortfall, 2),
        recyclable_capacity_coverage_litres=round(rec_coverage, 2),
        recyclable_capacity_shortfall_litres=round(rec_shortfall, 2),
        bin_placements=placements,
        placement_scenario="central",
        boundary_spacing_target_m=boundary_spacing_m,
        actual_boundary_spacing_m=round(actual_spacing, 2),
        boundary_inset_m=round(actual_inset, 2),
        placement_warnings=tuple(warnings),
        spatial_minimum_bins=spatial_minimum_bins,
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
        boundary_spacing_m: Minimum spacing interval between bins around the
            approximate best-fit rectangle perimeter. Default 25 m is Bunbetsu's
            configured planning policy.
        boundary_inset_m: Desired inward offset from the location boundary.
        close_spacing_warning_m: Emit a warning if placements are closer than this.

    Returns:
        Per-location capacity-only demand, perimeter-constrained physical counts,
        variable emptying-turn requirements, and central-scenario coordinates.
        Coordinates are sampled around the inward-offset exterior boundary in [lng, lat] order.

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
        usable_bin_capacity_litres=USABLE_BIN_CAPACITY_LITRES,
        density_kg_per_m3={key: float(value) for key, value in density_kg_per_m3.items()},
        boundary_spacing_target_m=float(boundary_spacing_m),
        boundary_inset_m=float(boundary_inset_m),
        assumptions=(
            "The existing waste predictor is used without modification.",
            "Waste predictions are total kilograms over the event duration and are divided by duration_days to estimate average daily demand.",
            "Category-wise bulk-density references convert predicted mass to estimated volume; 'Food' and 'Others' form the Disposable stream, and 'Plastic', 'Paper', and 'Glass' form the Recyclable stream.",
            "Each 100 L bin provides 80 L usable capacity per filling turn (100 L * 80% usable fill fraction).",
            "Physical bin placement is constrained by a 25 m perimeter spacing policy around the location's approximate best-fit rectangle.",
            "When waste demand exceeds perimeter capacity, bins are proportionally allocated between Disposable and Recyclable streams using the largest-remainder method.",
            "Variable emptying turns are calculated separately for each stream using conventional half-up rounding.",
            "Coordinates are sampled along an inward-offset exterior boundary respecting shared 25 m perimeter spacing between all bins.",
            "The 25 m default is Bunbetsu's configured planning policy, not a universal statutory standard.",
            "This model does not yet test access paths, doorways, utilities, emergency routes, slope, or exact pedestrian demand; review placements before operational use.",
        ),
    )


def determine_dominant_waste_type(
    composition_mass_kg: Mapping[str, Any] | LocationWasteAllocation,
) -> tuple[str, float]:
    """Identify the dominant waste category for an activity location.

    The dominant category is the category with the largest predicted mass
    (central scenario) for that location. Ties are broken deterministically
    by canonical alphabetical category order.
    """
    if isinstance(composition_mass_kg, LocationWasteAllocation):
        comp_dict = composition_mass_kg.composition_kg
    elif isinstance(composition_mass_kg, Mapping):
        comp_dict = composition_mass_kg
    else:
        raise ValueError("Waste composition must be a mapping or LocationWasteAllocation.")

    if not comp_dict:
        raise ValueError("Waste composition map cannot be empty.")

    parsed_masses: dict[str, float] = {}
    for cat, val in comp_dict.items():
        if hasattr(val, "central"):
            m = float(val.central)
        elif isinstance(val, dict) and "central" in val:
            m = float(val["central"])
        elif isinstance(val, (int, float)):
            m = float(val)
        else:
            raise ValueError(f"Invalid waste mass value for category {cat!r}: {val!r}")

        if not math.isfinite(m) or m < 0:
            raise ValueError(
                f"Waste mass for category {cat!r} must be non-negative and finite, got {m}."
            )
        parsed_masses[str(cat)] = m

    if not parsed_masses:
        raise ValueError("No valid waste categories provided.")

    # Sort deterministically: highest mass first, alphabetical category name for ties
    sorted_cats = sorted(parsed_masses.keys(), key=lambda c: (-parsed_masses[c], c))
    dominant_cat = sorted_cats[0]
    return dominant_cat, parsed_masses[dominant_cat]


def get_influence_radius_m(
    dominant_waste_category: str,
    radii_map: Mapping[str, float] | None = None,
) -> float:
    """Retrieve the influence radius in metres for the dominant waste category."""
    active_radii = DEFAULT_WASTE_INFLUENCE_RADII_M if radii_map is None else radii_map
    if dominant_waste_category not in active_radii:
        raise ValueError(
            f"No influence radius configured for category {dominant_waste_category!r}. "
            f"Configured categories: {sorted(active_radii.keys())}"
        )
    rad = float(active_radii[dominant_waste_category])
    if not math.isfinite(rad) or rad <= 0:
        raise ValueError(
            f"Influence radius for {dominant_waste_category!r} must be finite and positive, got {rad}."
        )
    return rad


def construct_influence_zone_m(
    polygon_m: Polygon | MultiPolygon,
    radius_m: float,
) -> Polygon | MultiPolygon:
    """Construct the influence zone I_i = B_i ⊕ D(r_i) in projected metric coordinates.

    Uses Shapely's buffer operation in metres outward from the entire boundary,
    preserving holes and multi-part geometries according to their actual shapes.
    """
    if polygon_m.is_empty or not polygon_m.is_valid or polygon_m.area <= 0:
        raise ValueError("Cannot construct influence zone for an empty, invalid, or zero-area polygon.")
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError(f"Influence radius must be finite and positive, got {radius_m}.")

    zone_m = polygon_m.buffer(radius_m)
    if zone_m.is_empty:
        raise ValueError("Influence zone buffer produced empty geometry.")
    return zone_m


def _extract_linestrings_m(geom: Any) -> list[LineString]:
    """Extract individual LineStrings from any Shapely geometry."""
    lines: list[LineString] = []
    if isinstance(geom, LineString):
        if geom.length > 0:
            lines.append(geom)
    elif isinstance(geom, MultiLineString):
        for g in geom.geoms:
            if g.length > 0:
                lines.append(g)
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            lines.extend(_extract_linestrings_m(g))
    return lines


def _solve_greedy_fallback(
    candidates: list[RoadBinCandidate],
    location_ids: list[str],
    road_bin_spacing_m: float,
) -> tuple[list[int], bool, str, list[str]]:
    """Greedy fallback heuristic for road-bin placement.

    1. Select a feasible candidate that covers the greatest number of currently uncovered locations.
    2. Break ties using route popularity, then stable index.
    3. Remove candidates conflicting with the selected point under the spacing rule.
    4. Repeat until all locations are covered or no feasible candidate remains.
    5. Report that the solution is heuristic.
    """
    uncovered = set(location_ids)
    remaining_indices = list(range(len(candidates)))
    selected_indices: list[int] = []
    warnings: list[str] = []

    while uncovered and remaining_indices:
        best_idx: int | None = None
        best_key = (-1, -1.0, 1)

        for idx in remaining_indices:
            c = candidates[idx]
            cov_count = len(set(c.served_location_ids) & uncovered)
            key = (cov_count, c.normalized_popularity_score, -idx)
            if key > best_key:
                best_key = key
                best_idx = idx

        if best_idx is None or best_key[0] <= 0:
            break

        selected_c = candidates[best_idx]
        selected_indices.append(best_idx)
        uncovered -= set(selected_c.served_location_ids)

        remaining_indices = [
            idx
            for idx in remaining_indices
            if math.hypot(
                candidates[idx].metric_x - selected_c.metric_x,
                candidates[idx].metric_y - selected_c.metric_y,
            )
            >= road_bin_spacing_m - 1e-4
        ]

    if uncovered:
        warnings.append(
            f"Spacing conflicts or candidate unavailability prevented covering {len(uncovered)} location(s): {sorted(uncovered)}."
        )

    return selected_indices, False, "greedy_set_cover_heuristic", warnings


def _solve_road_bin_placement(
    candidates: list[RoadBinCandidate],
    location_ids: list[str],
    road_bin_spacing_m: float,
    solver_mode: str = "exact",
) -> tuple[list[int], bool, str, list[str]]:
    """Solve the road-bin placement optimization.

    Lexicographical objective:
    1. Minimize the number of physical road bins to cover all feasible locations.
    2. Among solutions with the minimum bin count, maximize aggregate popularity score.
    Spacing constraint:
    Pairwise distance < road_bin_spacing_m => z_j + z_k <= 1.
    """
    m = len(candidates)
    if m == 0 or not location_ids:
        return [], False, "no_candidates", []

    # Map each location to the candidate indices that serve it
    candidates_serving_loc = {
        loc_id: [j for j, c in enumerate(candidates) if loc_id in c.served_location_ids]
        for loc_id in location_ids
    }
    uncovered_initially = [
        loc_id for loc_id, c_indices in candidates_serving_loc.items() if not c_indices
    ]
    feasible_loc_ids = [loc_id for loc_id in location_ids if loc_id not in uncovered_initially]

    if not feasible_loc_ids:
        return [], False, "no_feasible_candidates", []

    # Build pairwise conflict constraints: dist(j, k) < road_bin_spacing_m => z_j + z_k <= 1
    conflict_pairs: list[tuple[int, int]] = []
    for i in range(m):
        c_i = candidates[i]
        for j in range(i + 1, m):
            c_j = candidates[j]
            d = math.hypot(c_i.metric_x - c_j.metric_x, c_i.metric_y - c_j.metric_y)
            if d < road_bin_spacing_m - 1e-4:
                conflict_pairs.append((i, j))

    # Try Exact ILP via scipy.optimize.milp
    if solver_mode in ("exact", "auto") and HAS_SCIPY:
        c_stage1 = np.ones(m)
        integrality = np.ones(m)
        bounds = Bounds(0, 1)

        num_locs = len(feasible_loc_ids)
        A_cov = np.zeros((num_locs, m))
        for row_idx, loc_id in enumerate(feasible_loc_ids):
            for col_idx in candidates_serving_loc[loc_id]:
                A_cov[row_idx, col_idx] = 1.0

        cov_constraint = LinearConstraint(A_cov, np.ones(num_locs), np.full(num_locs, np.inf))
        constraints = [cov_constraint]

        if conflict_pairs:
            num_conf = len(conflict_pairs)
            A_conf = np.zeros((num_conf, m))
            for row_idx, (j, k) in enumerate(conflict_pairs):
                A_conf[row_idx, j] = 1.0
                A_conf[row_idx, k] = 1.0
            conf_constraint = LinearConstraint(A_conf, np.full(num_conf, -np.inf), np.ones(num_conf))
            constraints.append(conf_constraint)

        res1 = milp(c=c_stage1, integrality=integrality, constraints=constraints, bounds=bounds)

        if res1.success:
            min_bins = int(round(float(np.sum(res1.x))))

            # Stage 2: Maximize route popularity constrained to sum(z_j) == min_bins
            bin_count_constraint = LinearConstraint(
                np.ones((1, m)), np.array([min_bins]), np.array([min_bins])
            )
            stage2_constraints = list(constraints) + [bin_count_constraint]

            scores = np.array([c.normalized_popularity_score for c in candidates])
            # Deterministic secondary tie-breaker bonus: lower candidate index favored
            eps = np.array([(m - j) / (m * 1e5) for j in range(m)])
            c_stage2 = -(scores + eps)

            res2 = milp(
                c=c_stage2, integrality=integrality, constraints=stage2_constraints, bounds=bounds
            )
            if res2.success:
                selected_indices = [j for j, val in enumerate(res2.x) if val > 0.5]
                return selected_indices, True, "scipy_milp_highs", []

        # If Stage 1 is infeasible due to spacing conflicts, fall back and record warning
        selected_indices, _, _, fallback_warnings = _solve_greedy_fallback(
            candidates, feasible_loc_ids, road_bin_spacing_m
        )
        warn_msg = (
            f"Spacing conflict prevents simultaneous coverage for all locations under the "
            f"{road_bin_spacing_m}m spacing rule; returning best valid partial coverage."
        )
        return selected_indices, False, "greedy_fallback_due_to_conflicts", [warn_msg] + fallback_warnings

    # Fallback heuristic
    return _solve_greedy_fallback(candidates, feasible_loc_ids, road_bin_spacing_m)


def predict_road_bins(
    location_geometries: Mapping[str, Mapping[str, Any]],
    waste_compositions: Mapping[str, Any],
    paths_geojson: Mapping[str, Any],
    campus_boundary: Mapping[str, Any] | None = None,
    *,
    location_names: Mapping[str, str] | None = None,
    waste_influence_radii_m: Mapping[str, float] | None = None,
    candidate_sampling_interval_m: float = DEFAULT_ROAD_CANDIDATE_SAMPLING_INTERVAL_M,
    road_bin_spacing_m: float = DEFAULT_ROAD_BIN_SPACING_M,
    solver_mode: str = "exact",
    max_candidates_threshold: int = 2500,
) -> RoadBinPrediction:
    """Predict and optimize road-bin placements along pedestrian roads.

    Minimizes the number of additional physical road bins while ensuring that
    each activity location has eligible road-bin coverage within its
    waste-type-specific influence zone.
    """
    if not location_geometries:
        raise ValueError("At least one location geometry is required for road bin prediction.")

    if not math.isfinite(candidate_sampling_interval_m) or candidate_sampling_interval_m <= 0:
        raise ValueError("candidate_sampling_interval_m must be finite and positive.")

    if not math.isfinite(road_bin_spacing_m) or road_bin_spacing_m <= 0:
        raise ValueError("road_bin_spacing_m must be finite and positive.")

    active_radii = dict(waste_influence_radii_m or DEFAULT_WASTE_INFLUENCE_RADII_M)
    for cat, rad in active_radii.items():
        if not isinstance(rad, (int, float)) or not math.isfinite(float(rad)) or float(rad) <= 0:
            raise ValueError(f"Influence radius for {cat!r} must be finite and positive.")

    loc_names_map = dict(location_names or {})
    warnings: list[str] = []

    # 1. Determine dominant waste type & influence radius per location
    dominant_types: dict[str, str] = {}
    radii_m: dict[str, float] = {}
    for loc_id in location_geometries:
        loc_display = loc_names_map.get(loc_id, loc_id)
        if loc_id not in waste_compositions and loc_display not in waste_compositions:
            raise ValueError(f"Missing waste composition profile for location {loc_id!r}.")

        comp = waste_compositions.get(loc_id, waste_compositions.get(loc_display))
        dom_cat, _ = determine_dominant_waste_type(comp)
        radius = get_influence_radius_m(dom_cat, active_radii)
        dominant_types[loc_id] = dom_cat
        radii_m[loc_id] = radius

    # 2. Parse and validate location geometries in WGS84
    locations_wgs84: dict[str, Polygon | MultiPolygon] = {}
    for loc_id, geom_data in location_geometries.items():
        loc_display = loc_names_map.get(loc_id, loc_id)
        shape_wgs84 = _to_shape(geom_data, loc_display)
        locations_wgs84[loc_id] = shape_wgs84

    # 3. Create common metric projection centered at campus boundary or combined locations
    if campus_boundary is not None:
        boundary_wgs84 = _to_shape(campus_boundary, "campus_boundary")
        center_lon, center_lat = boundary_wgs84.centroid.x, boundary_wgs84.centroid.y
    else:
        boundary_wgs84 = None
        all_shapes = list(locations_wgs84.values())
        combined_centroid = unary_union(all_shapes).centroid
        center_lon, center_lat = combined_centroid.x, combined_centroid.y

    local_crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={center_lat:.7f} +lon_0={center_lon:.7f} "
        "+datum=WGS84 +units=m +no_defs"
    )
    forward = Transformer.from_crs(CRS.from_epsg(4326), local_crs, always_xy=True)
    inverse = Transformer.from_crs(local_crs, CRS.from_epsg(4326), always_xy=True)

    # Project geometries to metric
    locations_m: dict[str, Polygon | MultiPolygon] = {
        loc_id: transform(lambda x, y, z=None: forward.transform(x, y), geom)
        for loc_id, geom in locations_wgs84.items()
    }
    boundary_m = (
        transform(lambda x, y, z=None: forward.transform(x, y), boundary_wgs84)
        if boundary_wgs84 is not None
        else None
    )

    # 4. Construct influence zones in metric space: I_i = B_i ⊕ D(r_i)
    influence_zones_m: dict[str, Polygon | MultiPolygon] = {
        loc_id: construct_influence_zone_m(locations_m[loc_id], radii_m[loc_id])
        for loc_id in locations_m
    }
    union_zones_m = unary_union(list(influence_zones_m.values()))

    # 5. Extract mapped pedestrian roads and intersect with influence zones
    features: list[dict[str, Any]] = []
    if isinstance(paths_geojson, Mapping):
        features = list(paths_geojson.get("features", []))
    elif isinstance(paths_geojson, (list, tuple)):
        features = list(paths_geojson)

    raw_candidate_points: list[dict[str, Any]] = []
    for feat_idx, feat in enumerate(features):
        props = feat.get("properties") or {}
        # Exclude inferred connectors or unmapped lines
        provenance = props.get("provenance", "osm_mapped")
        if provenance != "osm_mapped":
            continue
        seg_id = str(props.get("id") or feat.get("id") or f"road-seg-{feat_idx}")
        if seg_id.startswith("conn-") or props.get("status") in ("unmatched", "flagged"):
            continue

        geom_data = feat.get("geometry")
        if not geom_data or not isinstance(geom_data, Mapping):
            continue
        try:
            road_wgs84 = shape(geom_data)
        except Exception:
            continue

        if road_wgs84.is_empty or road_wgs84.geom_type not in ("LineString", "MultiLineString"):
            continue

        road_m = transform(lambda x, y, z=None: forward.transform(x, y), road_wgs84)
        if boundary_m is not None:
            road_m = road_m.intersection(boundary_m)
            if road_m.is_empty:
                continue

        road_in_zones_m = road_m.intersection(union_zones_m)
        if road_in_zones_m.is_empty:
            continue

        sub_lines = _extract_linestrings_m(road_in_zones_m)
        if not sub_lines:
            continue

        norm_score = float(props.get("normalized_score", props.get("raw_score", 0.0)))
        if not math.isfinite(norm_score) or norm_score < 0:
            norm_score = 0.0
        norm_score = min(1.0, norm_score)

        for line in sub_lines:
            line_len = float(line.length)
            if line_len <= 0:
                continue
            distances = [0.0]
            cur_d = candidate_sampling_interval_m
            while cur_d < line_len - 1e-4:
                distances.append(cur_d)
                cur_d += candidate_sampling_interval_m
            if abs(distances[-1] - line_len) > 1e-4:
                distances.append(line_len)

            for d in distances:
                pt = line.interpolate(d)
                raw_candidate_points.append(
                    {
                        "point": pt,
                        "segment_id": seg_id,
                        "normalized_score": norm_score,
                    }
                )

        # Include mapped road segment endpoints where they fall inside the union
        for orig_line in _extract_linestrings_m(road_m):
            for endpt in (orig_line.interpolate(0.0), orig_line.interpolate(orig_line.length)):
                if union_zones_m.covers(endpt) or union_zones_m.distance(endpt) < 1e-5:
                    raw_candidate_points.append(
                        {
                            "point": endpt,
                            "segment_id": seg_id,
                            "normalized_score": norm_score,
                        }
                    )

    # 6. Deduplicate coincident / adjacent candidates (within 0.5 m)
    # Aggregates junction popularity to maximum incident score
    sorted_raw = sorted(
        raw_candidate_points,
        key=lambda item: (round(item["point"].x, 3), round(item["point"].y, 3), item["segment_id"]),
    )
    deduped_clusters: list[list[dict[str, Any]]] = []
    for item in sorted_raw:
        pt = item["point"]
        merged = False
        for cluster in deduped_clusters:
            lead_pt = cluster[0]["point"]
            if pt.distance(lead_pt) <= 0.5:
                cluster.append(item)
                merged = True
                break
        if not merged:
            deduped_clusters.append([item])

    eligible_candidates: list[RoadBinCandidate] = []
    cand_distances: dict[str, dict[str, float]] = {}

    for cand_idx, cluster in enumerate(deduped_clusters, start=1):
        # Best item has highest score, deterministic tie-break by segment_id
        best_item = sorted(
            cluster, key=lambda it: (-it["normalized_score"], str(it["segment_id"]))
        )[0]
        pt = best_item["point"]
        max_score = max(it["normalized_score"] for it in cluster)
        source_segment = str(best_item["segment_id"])

        # Determine which location influence zones contain this point
        served_ids: list[str] = []
        dists_m: dict[str, float] = {}
        for loc_id, loc_shape_m in locations_m.items():
            dist = float(loc_shape_m.distance(pt))
            if dist <= radii_m[loc_id] + 1e-4:
                served_ids.append(loc_id)
                dists_m[loc_id] = round(dist, 2)

        if not served_ids:
            continue

        lon, lat = inverse.transform(pt.x, pt.y)
        cand_id = f"road-cand-{cand_idx:04d}"
        cand_distances[cand_id] = dists_m

        eligible_candidates.append(
            RoadBinCandidate(
                candidate_id=cand_id,
                longitude=round(float(lon), 7),
                latitude=round(float(lat), 7),
                metric_x=float(pt.x),
                metric_y=float(pt.y),
                source_segment_id=source_segment,
                normalized_popularity_score=round(max_score, 4),
                served_location_ids=tuple(sorted(served_ids)),
            )
        )

    # Check for locations with no feasible candidates
    all_loc_ids = sorted(location_geometries.keys())
    for loc_id in all_loc_ids:
        loc_display = loc_names_map.get(loc_id, loc_id)
        if not any(loc_id in c.served_location_ids for c in eligible_candidates):
            warnings.append(
                f"Location {loc_display!r} ({loc_id}) has no feasible road candidate. "
                f"No mapped pedestrian road intersects its {radii_m[loc_id]}m influence zone."
            )

    if not eligible_candidates:
        return RoadBinPrediction(
            placements=(),
            total_physical_bins=0,
            total_eligible_candidates=0,
            total_locations_requiring_coverage=len(all_loc_ids),
            covered_location_ids=(),
            uncovered_location_ids=tuple(all_loc_ids),
            location_influence_radii_m=radii_m,
            location_dominant_waste_types=dominant_types,
            candidate_sampling_interval_m=float(candidate_sampling_interval_m),
            road_bin_spacing_m=float(road_bin_spacing_m),
            solver_name="no_candidates",
            optimality_proven=False,
            total_popularity_score=0.0,
            warnings=tuple(warnings),
            assumptions=(
                "Influence radii are determined by the location's dominant waste category (Food: 15m, Glass: 15m, Others: 20m, Paper: 25m, Plastic: 25m).",
                "Influence zones extend outward from the entire activity polygon boundary, not from centroids.",
                "Road-bin candidate points are generated exclusively along mapped pedestrian roads within the campus boundary.",
                "Candidate points within influence zones are sampled at regular intervals (default 5m) and deduplicated.",
                "Optimization minimizes the total count of additional physical road bins while ensuring eligible road coverage for each activity location.",
                "Pairwise minimum spacing constraints (default 25m) prevent excessive road-bin placement density.",
                "Route popularity is applied lexicographically as a secondary objective without increasing bin count.",
                "Each selected road placement represents a dual-compartment station accepting both Disposable and Recyclable waste streams.",
            ),
            diagnostics={
                "candidate_count": 0,
                "coverage_matrix_size": 0,
                "conflict_count": 0,
                "uncovered_count": len(all_loc_ids),
            },
        )

    # 7. Candidate threshold safety check
    active_candidates = eligible_candidates
    if len(eligible_candidates) > max_candidates_threshold:
        warnings.append(
            f"Candidate count ({len(eligible_candidates)}) exceeded threshold ({max_candidates_threshold}); "
            "running greedy fallback optimization."
        )
        solver_mode = "fallback"

    # 8. Solve minimum-bin optimization with spacing and route-popularity tie breaking
    selected_indices, optimality_proven, solver_name, solver_warnings = _solve_road_bin_placement(
        candidates=active_candidates,
        location_ids=all_loc_ids,
        road_bin_spacing_m=road_bin_spacing_m,
        solver_mode=solver_mode,
    )
    warnings.extend(solver_warnings)

    # 9. Build placements
    placements: list[RoadBinPlacement] = []
    for p_idx, cand_idx in enumerate(sorted(selected_indices), start=1):
        cand = active_candidates[cand_idx]
        served_names = tuple(loc_names_map.get(lid, lid) for lid in cand.served_location_ids)
        placements.append(
            RoadBinPlacement(
                placement_id=f"road-bin-{p_idx}",
                longitude=cand.longitude,
                latitude=cand.latitude,
                source_segment_id=cand.source_segment_id,
                normalized_popularity_score=cand.normalized_popularity_score,
                served_location_ids=cand.served_location_ids,
                served_location_names=served_names,
                served_location_distances_m=dict(cand_distances.get(cand.candidate_id, {})),
                stream_type="Dual-compartment station",
                provenance="road_bin_optimizer",
            )
        )

    covered_ids = tuple(sorted(set(lid for p in placements for lid in p.served_location_ids)))
    uncovered_ids = tuple(sorted(set(all_loc_ids) - set(covered_ids)))
    total_popularity = round(sum(p.normalized_popularity_score for p in placements), 4)

    return RoadBinPrediction(
        placements=tuple(placements),
        total_physical_bins=len(placements),
        total_eligible_candidates=len(active_candidates),
        total_locations_requiring_coverage=len(all_loc_ids),
        covered_location_ids=covered_ids,
        uncovered_location_ids=uncovered_ids,
        location_influence_radii_m=radii_m,
        location_dominant_waste_types=dominant_types,
        candidate_sampling_interval_m=float(candidate_sampling_interval_m),
        road_bin_spacing_m=float(road_bin_spacing_m),
        solver_name=solver_name,
        optimality_proven=optimality_proven,
        total_popularity_score=total_popularity,
        warnings=tuple(warnings),
        assumptions=(
            "Influence radii are determined by the location's dominant waste category (Food: 15m, Glass: 15m, Others: 20m, Paper: 25m, Plastic: 25m).",
            "Influence zones extend outward from the entire activity polygon boundary, not from centroids.",
            "Road-bin candidate points are generated exclusively along mapped pedestrian roads within the campus boundary.",
            "Candidate points within influence zones are sampled at regular intervals (default 5m) and deduplicated.",
            "Optimization minimizes the total count of additional physical road bins while ensuring eligible road coverage for each activity location.",
            "Pairwise minimum spacing constraints (default 25m) prevent excessive road-bin placement density.",
            "Route popularity is applied lexicographically as a secondary objective without increasing bin count.",
            "Each selected road placement represents a dual-compartment station accepting both Disposable and Recyclable waste streams.",
        ),
        diagnostics={
            "candidate_count": len(active_candidates),
            "selected_count": len(placements),
            "uncovered_count": len(uncovered_ids),
            "solver_name": solver_name,
            "optimality_proven": optimality_proven,
        },
    )
