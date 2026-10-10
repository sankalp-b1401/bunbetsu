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
