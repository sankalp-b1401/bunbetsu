"""Tests for Bunbetsu on-location bin prediction and polygon placement."""

import math
import unittest
from shapely.geometry import Point, shape

from waste_predictor_model.waste_predictor_model import FestInput, LocationInput, predict as predict_waste
from bin_distribution_model.bin_distribution_model import (
    DEFAULT_BOUNDARY_SPACING_M,
    USABLE_BIN_CAPACITY_LITRES,
    WASTE_DENSITY_KG_PER_M3,
    allocate_streams_largest_remainder,
    bins_for_daily_volume,
    predict_on_location_bins,
    round_half_up,
    volume_litres_from_mass_kg,
)

SQUARE = {
    "type": "Polygon",
    "coordinates": [[
        [-122.0010, 37.0000],
        [-122.0000, 37.0000],
        [-122.0000, 37.0010],
        [-122.0010, 37.0010],
        [-122.0010, 37.0000],
    ]],
}

# Very small polygon (approx 1m x 1m in WGS84 degree offset)
TINY_SQUARE = {
    "type": "Polygon",
    "coordinates": [[
        [-122.00001, 37.00000],
        [-122.00000, 37.00000],
        [-122.00000, 37.00001],
        [-122.00001, 37.00001],
        [-122.00001, 37.00000],
    ]],
}

MULTIPOLYGON_GEOM = {
    "type": "MultiPolygon",
    "coordinates": [
        [[
            [-122.0010, 37.0000],
            [-122.0005, 37.0000],
            [-122.0005, 37.0005],
            [-122.0010, 37.0005],
            [-122.0010, 37.0000],
        ]],
        [[
            [-122.0004, 37.0000],
            [-122.0000, 37.0000],
            [-122.0000, 37.0005],
            [-122.0004, 37.0005],
            [-122.0004, 37.0000],
        ]],
    ],
}


def make_fest(footfall=100, duration=1, campus_state="Delhi", area=500.0):
    return FestInput(
        total_footfall=footfall,
        duration_days=duration,
        activities=("Food Stalls",),
        campus_state=campus_state,
        locations=(
            LocationInput(name="Food Court", activities=("Food Stalls",), area=area),
        ),
    )


class TestBinDistributionModel(unittest.TestCase):
    def test_default_spacing_is_25m_planning_policy(self):
        """Default boundary spacing must be exactly 25 m."""
        self.assertEqual(DEFAULT_BOUNDARY_SPACING_M, 25.0)

    def test_usable_bin_capacity(self):
        """Usable bin capacity per turn is 80 L (100 L * 0.80)."""
        self.assertEqual(USABLE_BIN_CAPACITY_LITRES, 80.0)

    def test_bins_round_up(self):
        """Capacity-only demand divides daily volume by 80 L usable capacity."""
        self.assertEqual(bins_for_daily_volume(0), 0)
        self.assertEqual(bins_for_daily_volume(80), 1)
        self.assertEqual(bins_for_daily_volume(80.01), 2)
        self.assertEqual(bins_for_daily_volume(160), 2)
        self.assertEqual(bins_for_daily_volume(160.01), 3)

    def test_round_half_up(self):
        """Conventional half-up rounding behaves deterministically."""
        self.assertEqual(round_half_up(2.5), 3)
        self.assertEqual(round_half_up(2.49), 2)
        self.assertEqual(round_half_up(2.33), 2)
        self.assertEqual(round_half_up(2.67), 3)
        self.assertEqual(round_half_up(0.0), 0)

    def test_custom_spacing_override(self):
        """Custom boundary spacing override is respected."""
        result = predict_on_location_bins(
            make_fest(footfall=100, duration=1),
            location_geometries={"Food Court": SQUARE},
            boundary_spacing_m=15.0,
        )
        location = result.locations[0]
        self.assertEqual(location.boundary_spacing_target_m, 15.0)
        expected_max = int(math.floor(location.rectangle_perimeter_m / 15.0))
        self.assertEqual(location.perimeter_spacing_max_bins, expected_max)

    def test_rectangle_perimeter_and_max_bins(self):
        """Best-fit rectangle perimeter is measured in projected metres and bounds physical bins."""
        result = predict_on_location_bins(
            make_fest(footfall=100, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        location = result.locations[0]
        self.assertGreater(location.rectangle_perimeter_m, 300.0)
        expected_max = int(math.floor(location.rectangle_perimeter_m / 25.0))
        self.assertEqual(location.perimeter_spacing_max_bins, expected_max)

    def test_allocate_streams_largest_remainder_direct(self):
        """Direct tests for Hamilton's / Largest Remainder allocation."""
        # Case A: Demand fits
        self.assertEqual(allocate_streams_largest_remainder(8, 4, 15), (8, 4))
        self.assertEqual(allocate_streams_largest_remainder(0, 0, 10), (0, 0))

        # Case B: Demand exceeds perimeter capacity
        # N_disp = 8, N_rec = 4, M = 5 -> scaled: 3.333, 1.667 -> remainders: 0.333, 0.667 -> (3, 2)
        b_d, b_r = allocate_streams_largest_remainder(8, 4, 5)
        self.assertEqual((b_d, b_r), (3, 2))
        self.assertEqual(b_d + b_r, 5)

        # Equal remainders, tie broken by higher original demand: 3 vs 1 with M=2 -> scaled: 1.5, 0.5 (equal 0.5 rem)
        # N_disp = 3 > N_rec = 1 -> disposable gets remainder
        self.assertEqual(allocate_streams_largest_remainder(3, 1, 2), (2, 0))

        # Equal remainders, equal demand: 2 vs 2 with M=3 -> scaled: 1.5, 1.5 -> disposable preferred
        self.assertEqual(allocate_streams_largest_remainder(2, 2, 3), (2, 1))

        # Zero physical capacity
        self.assertEqual(allocate_streams_largest_remainder(10, 5, 0), (0, 0))

    def test_demand_below_perimeter_limit_places_demand_bins(self):
        """When M >= N, physical bins equal capacity demand for each stream and 1 turn is required."""
        result = predict_on_location_bins(
            make_fest(footfall=50, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        location = result.locations[0]
        self.assertGreater(location.perimeter_spacing_max_bins, location.capacity_bins.central)
        self.assertEqual(location.disposable_physical_bins.central, location.disposable_capacity_bins.central)
        self.assertEqual(location.recyclable_physical_bins.central, location.recyclable_capacity_bins.central)
        self.assertEqual(location.recommended_bins.central, location.capacity_bins.central)
        self.assertEqual(location.disposable_required_turns.central, 1)
        self.assertEqual(location.recyclable_required_turns.central, 1)
        self.assertEqual(len(location.bin_placements), location.recommended_bins.central)
        self.assertEqual(location.capacity_shortfall_litres, 0.0)

    def test_demand_above_perimeter_limit_caps_bins_and_calculates_turns(self):
        """When N > M, physical bins scale proportionally to M and stream turns are calculated."""
        # Very high footfall produces demand exceeding SQUARE perimeter capacity (~15 bins)
        result = predict_on_location_bins(
            make_fest(footfall=25000, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        location = result.locations[0]
        M = location.perimeter_spacing_max_bins
        N_disp = location.disposable_capacity_bins.central
        N_rec = location.recyclable_capacity_bins.central
        B_disp = location.disposable_physical_bins.central
        B_rec = location.recyclable_physical_bins.central

        self.assertGreater(location.capacity_bins.central, M)
        self.assertEqual(location.recommended_bins.central, M)
        self.assertEqual(B_disp + B_rec, M)
        self.assertEqual(len(location.bin_placements), M)

        # Turns calculated separately for each stream
        expected_disp_turns = max(1, round_half_up(N_disp / B_disp))
        expected_rec_turns = max(1, round_half_up(N_rec / B_rec))
        self.assertEqual(location.disposable_required_turns.central, expected_disp_turns)
        self.assertEqual(location.recyclable_required_turns.central, expected_rec_turns)
        self.assertEqual(location.required_emptying_turns.central, max(expected_disp_turns, expected_rec_turns))

        # Marker tagging matches stream allocation
        disp_markers = [p for p in location.bin_placements if p.bin_type == "Disposable"]
        rec_markers = [p for p in location.bin_placements if p.bin_type == "Recyclable"]
        self.assertEqual(len(disp_markers), B_disp)
        self.assertEqual(len(rec_markers), B_rec)

    def test_rounding_shortfall_reported(self):
        """When nearest-integer rounding underestimates demand, shortfall is reported per stream."""
        result = predict_on_location_bins(
            make_fest(footfall=25000, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        location = result.locations[0]

        disp_available = (
            location.disposable_physical_bins.central
            * USABLE_BIN_CAPACITY_LITRES
            * location.disposable_required_turns.central
        )
        rec_available = (
            location.recyclable_physical_bins.central
            * USABLE_BIN_CAPACITY_LITRES
            * location.recyclable_required_turns.central
        )
        expected_disp_shortfall = max(0.0, location.disposable_volume_litres_per_day_central - disp_available)
        expected_rec_shortfall = max(0.0, location.recyclable_volume_litres_per_day_central - rec_available)
        expected_total_shortfall = expected_disp_shortfall + expected_rec_shortfall

        self.assertAlmostEqual(location.disposable_capacity_shortfall_litres, expected_disp_shortfall, places=1)
        self.assertAlmostEqual(location.recyclable_capacity_shortfall_litres, expected_rec_shortfall, places=1)
        self.assertAlmostEqual(location.capacity_shortfall_litres, expected_total_shortfall, places=1)
        if location.capacity_shortfall_litres > 0.001:
            self.assertTrue(any("shortfall" in w.lower() for w in location.placement_warnings))

    def test_zero_capacity_polygon_produces_infeasible_warning(self):
        """A tiny polygon with M == 0 cannot accommodate bins and reports infeasibility."""
        result = predict_on_location_bins(
            make_fest(footfall=500, duration=1, area=1.0),
            location_geometries={"Food Court": TINY_SQUARE},
        )
        location = result.locations[0]
        self.assertEqual(location.perimeter_spacing_max_bins, 0)
        self.assertEqual(location.recommended_bins.central, 0)
        self.assertEqual(len(location.bin_placements), 0)
        self.assertTrue(any("cannot accommodate" in w.lower() for w in location.placement_warnings))

    def test_multipolygon_geometry_handling(self):
        """MultiPolygon components are summed for perimeter and placements are valid."""
        result = predict_on_location_bins(
            make_fest(footfall=500, duration=1),
            location_geometries={"Food Court": MULTIPOLYGON_GEOM},
        )
        location = result.locations[0]
        self.assertGreater(location.rectangle_perimeter_m, 0)
        self.assertGreater(location.perimeter_spacing_max_bins, 0)
        self.assertEqual(len(location.bin_placements), location.recommended_bins.central)

        geom = shape(MULTIPOLYGON_GEOM)
        for placement in location.bin_placements:
            pt = Point(placement.longitude, placement.latitude)
            self.assertTrue(geom.covers(pt))

    def test_returned_coordinates_are_inside_original_polygon(self):
        """All returned bin coordinates fall strictly within the source polygon."""
        result = predict_on_location_bins(
            make_fest(footfall=1000, duration=2),
            location_geometries={"Food Court": SQUARE},
        )
        polygon = shape(SQUARE)
        for placement in result.locations[0].bin_placements:
            self.assertTrue(polygon.covers(Point(placement.longitude, placement.latitude)))
            self.assertGreater(placement.boundary_distance_m, 0)

    def test_spatial_minimum_is_capped_at_perimeter_max(self):
        """Spatial minimum cannot exceed the perimeter spacing upper bound."""
        result = predict_on_location_bins(
            make_fest(footfall=100, duration=1),
            location_geometries={"Food Court": SQUARE},
            spatial_minimum_bins={"Food Court": 50},
        )
        location = result.locations[0]
        # Square fits ~15 bins at 25m spacing, so 50 must be capped at M (~15)
        self.assertLessEqual(location.recommended_bins.central, location.perimeter_spacing_max_bins)
        self.assertEqual(location.recommended_bins.central, location.perimeter_spacing_max_bins)
        self.assertTrue(any("exceeds the physical perimeter limit" in w for w in location.placement_warnings))

    def test_scenarios_remain_ordered(self):
        """Low, central, high scenario values must satisfy 0 <= low <= central <= high."""
        result = predict_on_location_bins(
            make_fest(footfall=5000, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        loc = result.locations[0]
        self.assertTrue(0 <= loc.capacity_bins.low <= loc.capacity_bins.central <= loc.capacity_bins.high)
        self.assertTrue(0 <= loc.recommended_bins.low <= loc.recommended_bins.central <= loc.recommended_bins.high)
        self.assertTrue(0 <= loc.required_emptying_turns.low <= loc.required_emptying_turns.central <= loc.required_emptying_turns.high)

    def test_location_waste_is_divided_by_event_duration(self):
        """Waste is divided by event duration before capacity bin calculation."""
        one_day_fest = make_fest(footfall=1000, duration=1)
        existing_prediction = predict_waste(one_day_fest)
        two_day_fest = make_fest(footfall=1000, duration=2)

        one_day = predict_on_location_bins(
            one_day_fest,
            waste_prediction=existing_prediction,
            location_geometries={"Food Court": SQUARE},
        ).locations[0]
        two_day = predict_on_location_bins(
            two_day_fest,
            waste_prediction=existing_prediction,
            location_geometries={"Food Court": SQUARE},
        ).locations[0]

        self.assertAlmostEqual(two_day.waste_kg_per_day_central, one_day.waste_kg_per_day_central / 2)
        self.assertAlmostEqual(two_day.volume_litres_per_day_central, one_day.volume_litres_per_day_central / 2)

    def test_volume_conversion_uses_category_density(self):
        densities = {name: 1000.0 for name in ("Food", "Plastic", "Paper", "Glass", "Others")}
        self.assertAlmostEqual(
            volume_litres_from_mass_kg({"Food": 2.0, "Paper": 3.0}, densities),
            5.0,
        )

    def test_requires_geometry_for_every_location(self):
        with self.assertRaises(ValueError):
            predict_on_location_bins(make_fest(), location_geometries={})

    def test_rejects_unknown_spatial_minimum_location(self):
        with self.assertRaises(ValueError):
            predict_on_location_bins(
                make_fest(),
                location_geometries={"Food Court": SQUARE},
                spatial_minimum_bins={"Unknown": 2},
            )

    def test_rejects_point_geometry(self):
        with self.assertRaises(ValueError):
            predict_on_location_bins(
                make_fest(),
                location_geometries={"Food Court": {"type": "Point", "coordinates": [-122, 37]}},
            )

    def test_density_map_covers_all_categories(self):
        self.assertEqual(
            set(WASTE_DENSITY_KG_PER_M3),
            {"Food", "Plastic", "Paper", "Glass", "Others"},
        )

    def test_stream_waste_categorization(self):
        """Disposable corresponds to Food + Others; Recyclable corresponds to Plastic + Paper + Glass."""
        result = predict_on_location_bins(
            make_fest(footfall=1000, duration=1),
            location_geometries={"Food Court": SQUARE},
        )
        location = result.locations[0]

        # Sizing satisfies N = N_disp + N_rec
        self.assertEqual(
            location.capacity_bins.central,
            location.disposable_capacity_bins.central + location.recyclable_capacity_bins.central,
        )
        # Physical bins sum to total recommended bins
        self.assertEqual(
            location.recommended_bins.central,
            location.disposable_physical_bins.central + location.recyclable_physical_bins.central,
        )
        # Volume sums match total
        self.assertAlmostEqual(
            location.volume_litres_per_day_central,
            location.disposable_volume_litres_per_day_central + location.recyclable_volume_litres_per_day_central,
            places=1,
        )

    def test_stream_positive_demand_zero_bins_warning(self):
        """When a stream has positive demand but receives 0 bins, it emits an explicit warning."""
        # Custom tiny spacing or small polygon where M=0
        result = predict_on_location_bins(
            make_fest(footfall=500, duration=1, area=1.0),
            location_geometries={"Food Court": TINY_SQUARE},
        )
        location = result.locations[0]
        self.assertEqual(location.perimeter_spacing_max_bins, 0)
        self.assertEqual(location.disposable_physical_bins.central, 0)
        self.assertEqual(location.recyclable_physical_bins.central, 0)
        # Warnings report unaccommodated demand
        self.assertTrue(any("cannot accommodate" in w.lower() for w in location.placement_warnings))


if __name__ == "__main__":
    unittest.main()
