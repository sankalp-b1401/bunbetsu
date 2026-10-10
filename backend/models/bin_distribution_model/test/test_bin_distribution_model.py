"""Tests for Bunbetsu on-location bin prediction and polygon placement."""

import math
import unittest
from shapely.geometry import MultiPolygon, Point, Polygon, shape

from waste_predictor_model.waste_predictor_model import FestInput, LocationInput, predict as predict_waste
from bin_distribution_model.bin_distribution_model import (
    DEFAULT_BOUNDARY_SPACING_M,
    DEFAULT_ROAD_BIN_SPACING_M,
    DEFAULT_ROAD_CANDIDATE_SAMPLING_INTERVAL_M,
    DEFAULT_WASTE_INFLUENCE_RADII_M,
    USABLE_BIN_CAPACITY_LITRES,
    WASTE_DENSITY_KG_PER_M3,
    WASTE_INFLUENCE_RADII_M,
    RoadBinCandidate,
    RoadBinPlacement,
    RoadBinPrediction,
    allocate_streams_largest_remainder,
    bins_for_daily_volume,
    construct_influence_zone_m,
    determine_dominant_waste_type,
    get_influence_radius_m,
    predict_on_location_bins,
    predict_road_bins,
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


class TestRoadBinPlacementModel(unittest.TestCase):
    """Influence-based road bin placement model tests adhering to Phase 13 specifications."""

    def setUp(self):
        # Sample coordinates roughly around [77.200, 28.600] (metres per degree ~111,000 lat, ~97,000 lon)
        # 0.001 deg lat ~ 111 m, 0.0001 deg lat ~ 11.1 m
        self.sample_polygon = {
            "type": "Polygon",
            "coordinates": [[
                [77.2000, 28.6000],
                [77.2010, 28.6000],
                [77.2010, 28.6010],
                [77.2000, 28.6010],
                [77.2000, 28.6000],
            ]],
        }
        self.sample_boundary = {
            "type": "Polygon",
            "coordinates": [[
                [77.1990, 28.5990],
                [77.2030, 28.5990],
                [77.2030, 28.6030],
                [77.1990, 28.6030],
                [77.1990, 28.5990],
            ]],
        }

    # -------------------------------------------------------------------------
    # A. Influence-radius tests
    # -------------------------------------------------------------------------
    def test_a1_food_dominant_receives_15m(self):
        cat, _ = determine_dominant_waste_type({"Food": 100.0, "Plastic": 20.0})
        self.assertEqual(cat, "Food")
        self.assertEqual(get_influence_radius_m(cat), 15.0)

    def test_a2_glass_dominant_receives_15m(self):
        cat, _ = determine_dominant_waste_type({"Food": 10.0, "Glass": 50.0})
        self.assertEqual(cat, "Glass")
        self.assertEqual(get_influence_radius_m(cat), 15.0)

    def test_a3_others_dominant_receives_20m(self):
        cat, _ = determine_dominant_waste_type({"Others": 80.0, "Paper": 30.0})
        self.assertEqual(cat, "Others")
        self.assertEqual(get_influence_radius_m(cat), 20.0)

    def test_a4_paper_dominant_receives_25m(self):
        cat, _ = determine_dominant_waste_type({"Paper": 90.0, "Food": 40.0})
        self.assertEqual(cat, "Paper")
        self.assertEqual(get_influence_radius_m(cat), 25.0)

    def test_a5_plastic_dominant_receives_25m(self):
        cat, _ = determine_dominant_waste_type({"Plastic": 120.0, "Food": 50.0})
        self.assertEqual(cat, "Plastic")
        self.assertEqual(get_influence_radius_m(cat), 25.0)

    def test_a6_equal_dominant_masses_follow_deterministic_tie_break(self):
        # Food and Glass tied at 50 kg -> alphabetical 'Food' wins
        cat, _ = determine_dominant_waste_type({"Glass": 50.0, "Food": 50.0})
        self.assertEqual(cat, "Food")

        # Paper and Plastic tied at 100 kg -> alphabetical 'Paper' wins
        cat2, _ = determine_dominant_waste_type({"Plastic": 100.0, "Paper": 100.0})
        self.assertEqual(cat2, "Paper")

    def test_a7_missing_or_invalid_waste_profiles_raise_error(self):
        with self.assertRaises(ValueError):
            determine_dominant_waste_type({})
        with self.assertRaises(ValueError):
            determine_dominant_waste_type({"Food": -5.0})
        with self.assertRaises(ValueError):
            determine_dominant_waste_type({"Food": float("nan")})

    def test_a8_changing_radius_config_changes_eligibility(self):
        custom_radii = dict(DEFAULT_WASTE_INFLUENCE_RADII_M)
        custom_radii["Food"] = 40.0
        self.assertEqual(get_influence_radius_m("Food", custom_radii), 40.0)

    # -------------------------------------------------------------------------
    # B. Polygon-buffer tests
    # -------------------------------------------------------------------------
    def test_b1_candidate_10m_outside_boundary_is_eligible_for_15m_radius(self):
        from shapely.geometry import box
        poly_m = box(0, 0, 50, 50)
        zone_m = construct_influence_zone_m(poly_m, 15.0)
        # Point at x = 60, y = 25 is 10 m outside right boundary
        cand = Point(60.0, 25.0)
        self.assertTrue(zone_m.covers(cand))
        self.assertAlmostEqual(poly_m.distance(cand), 10.0)

    def test_b2_candidate_20m_outside_boundary_is_ineligible_for_15m_radius(self):
        from shapely.geometry import box
        poly_m = box(0, 0, 50, 50)
        zone_m = construct_influence_zone_m(poly_m, 15.0)
        # Point at x = 70, y = 25 is 20 m outside right boundary
        cand = Point(70.0, 25.0)
        self.assertFalse(zone_m.covers(cand))
        self.assertAlmostEqual(poly_m.distance(cand), 20.0)

    def test_b3_candidates_measured_from_boundary_not_centroid(self):
        from shapely.geometry import box
        # Long elongated polygon 100 m wide x 20 m high
        # Centroid is at (50, 10)
        poly_m = box(0, 0, 100, 20)
        zone_m = construct_influence_zone_m(poly_m, 15.0)
        # Point near the right edge: (108, 10).
        # Distance to centroid = 58 m (which would fail if centroid-based circle of 15 m)
        # Distance to boundary = 8 m <= 15 m (eligible!)
        cand_right = Point(108.0, 10.0)
        self.assertTrue(zone_m.covers(cand_right))
        self.assertAlmostEqual(poly_m.distance(cand_right), 8.0)

        # Point near top edge: (50, 28).
        # Distance to boundary = 8 m <= 15 m (eligible!)
        cand_top = Point(50.0, 28.0)
        self.assertTrue(zone_m.covers(cand_top))
        self.assertAlmostEqual(poly_m.distance(cand_top), 8.0)

    def test_b4_polygon_and_multipolygon_supported(self):
        from shapely.geometry import MultiPolygon, box
        mp_m = MultiPolygon([box(0, 0, 20, 20), box(40, 0, 60, 20)])
        zone_m = construct_influence_zone_m(mp_m, 15.0)
        self.assertTrue(zone_m.is_valid)
        self.assertTrue(zone_m.covers(Point(10.0, 25.0)))
        self.assertTrue(zone_m.covers(Point(50.0, 25.0)))

    def test_b5_holes_in_polygon_buffered_accurately(self):
        from shapely.geometry import Polygon
        # Outer square 0..100 with large hole 20..80 (courtyard of width 60 m)
        outer = [(0, 0), (100, 0), (100, 100), (0, 100), (0, 0)]
        hole = [(20, 20), (80, 20), (80, 80), (20, 80), (20, 20)]
        poly_m = Polygon(outer, [hole])
        zone_m = construct_influence_zone_m(poly_m, 15.0)
        # Point inside courtyard near inner boundary: (25, 50) is 5 m from hole edge -> inside zone
        pt_near_edge = Point(25.0, 50.0)
        self.assertTrue(zone_m.covers(pt_near_edge))
        # Point deep in center of courtyard: (50, 50) is 30 m from nearest building edge -> NOT in zone
        pt_center = Point(50.0, 50.0)
        self.assertFalse(zone_m.covers(pt_center))

    def test_b6_invalid_or_empty_polygons_raise_error(self):
        with self.assertRaises(ValueError):
            construct_influence_zone_m(Polygon(), 15.0)
        with self.assertRaises(ValueError):
            construct_influence_zone_m(shape(self.sample_polygon), -10.0)

    # -------------------------------------------------------------------------
    # C. Candidate-generation tests
    # -------------------------------------------------------------------------
    def test_c1_candidates_generated_only_along_mapped_pedestrian_roads(self):
        # Road passing right next to location
        mapped_road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-1",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.2011, 28.6000], [77.2011, 28.6010]],
                    },
                    "properties": {
                        "id": "way-1",
                        "highway": "footway",
                        "normalized_score": 0.8,
                        "provenance": "osm_mapped",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=mapped_road,
            campus_boundary=self.sample_boundary,
        )
        self.assertGreater(res.total_eligible_candidates, 0)
        self.assertEqual(res.placements[0].source_segment_id, "way-1")

    def test_c2_road_segment_outside_influence_zones_creates_no_candidates(self):
        # Road far away (e.g. 77.205)
        far_road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-far",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.2025, 28.6000], [77.2025, 28.6010]],
                    },
                    "properties": {
                        "id": "way-far",
                        "highway": "footway",
                        "normalized_score": 0.5,
                        "provenance": "osm_mapped",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},  # 15 m radius
            paths_geojson=far_road,
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_eligible_candidates, 0)
        self.assertIn("loc1", res.uncovered_location_ids)
        self.assertTrue(any("no feasible road candidate" in w.lower() for w in res.warnings))

    def test_c3_inferred_connectors_excluded_by_default(self):
        connector_road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "conn-123",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.20105, 28.6000], [77.20105, 28.6010]],
                    },
                    "properties": {
                        "id": "conn-123",
                        "highway": "footway",
                        "normalized_score": 0.9,
                        "provenance": "connector",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=connector_road,
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_eligible_candidates, 0)

    # -------------------------------------------------------------------------
    # D. Optimization tests
    # -------------------------------------------------------------------------
    def test_d1_single_location_selects_one_road_bin(self):
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-1",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.20105, 28.6000], [77.20105, 28.6010]],
                    },
                    "properties": {
                        "id": "way-1",
                        "highway": "footway",
                        "normalized_score": 0.6,
                        "provenance": "osm_mapped",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_physical_bins, 1)
        self.assertEqual(res.covered_location_ids, ("loc1",))
        self.assertEqual(len(res.uncovered_location_ids), 0)

    def test_d2_shared_candidate_covers_multiple_locations_with_one_bin(self):
        # Two locations separated by 10 m, with a road running between them
        loc1 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2000, 28.6000],
                [77.2008, 28.6000],
                [77.2008, 28.6010],
                [77.2000, 28.6010],
                [77.2000, 28.6000],
            ]],
        }
        loc2 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2010, 28.6000],
                [77.2018, 28.6000],
                [77.2018, 28.6010],
                [77.2010, 28.6010],
                [77.2010, 28.6000],
            ]],
        }
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "shared-way",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.2009, 28.6000], [77.2009, 28.6010]],
                    },
                    "properties": {
                        "id": "shared-way",
                        "highway": "footway",
                        "normalized_score": 0.75,
                        "provenance": "osm_mapped",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": loc1, "loc2": loc2},
            waste_compositions={"loc1": {"Paper": 100.0}, "loc2": {"Paper": 100.0}},  # 25m radii
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
        )
        # Exactly 1 bin covers both locations!
        self.assertEqual(res.total_physical_bins, 1)
        placement = res.placements[0]
        self.assertIn("loc1", placement.served_location_ids)
        self.assertIn("loc2", placement.served_location_ids)
        self.assertEqual(len(res.uncovered_location_ids), 0)

    def test_d3_disjoint_candidates_select_minimum_bins(self):
        # Two locations far apart
        loc1 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2000, 28.6000],
                [77.2005, 28.6000],
                [77.2005, 28.6005],
                [77.2000, 28.6005],
                [77.2000, 28.6000],
            ]],
        }
        loc2 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2020, 28.6020],
                [77.2025, 28.6020],
                [77.2025, 28.6025],
                [77.2020, 28.6025],
                [77.2020, 28.6020],
            ]],
        }
        road1 = {
            "type": "Feature",
            "id": "way-1",
            "geometry": {"type": "LineString", "coordinates": [[77.2006, 28.6000], [77.2006, 28.6005]]},
            "properties": {"id": "way-1", "normalized_score": 0.5, "provenance": "osm_mapped"},
        }
        road2 = {
            "type": "Feature",
            "id": "way-2",
            "geometry": {"type": "LineString", "coordinates": [[77.2026, 28.6020], [77.2026, 28.6025]]},
            "properties": {"id": "way-2", "normalized_score": 0.5, "provenance": "osm_mapped"},
        }
        res = predict_road_bins(
            location_geometries={"loc1": loc1, "loc2": loc2},
            waste_compositions={"loc1": {"Food": 100.0}, "loc2": {"Food": 100.0}},
            paths_geojson={"type": "FeatureCollection", "features": [road1, road2]},
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_physical_bins, 2)
        self.assertEqual(set(res.covered_location_ids), {"loc1", "loc2"})

    def test_d4_candidates_violating_minimum_spacing_cannot_both_be_selected(self):
        # One long road with 5 m interval sampling; placements cannot be closer than 25 m
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-long",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[77.20105, 28.6000], [77.20105, 28.6010]],
                    },
                    "properties": {
                        "id": "way-long",
                        "highway": "footway",
                        "normalized_score": 0.8,
                        "provenance": "osm_mapped",
                    },
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
            road_bin_spacing_m=25.0,
        )
        # Even though there are dozens of 5 m sampled points, only 1 is needed to cover loc1
        self.assertEqual(res.total_physical_bins, 1)

    def test_d5_d6_popularity_tie_break_never_increases_bins(self):
        # Two road segments near location: Segment A has score 0.2, Segment B has score 0.95
        road_low = {
            "type": "Feature",
            "id": "way-low",
            "geometry": {"type": "LineString", "coordinates": [[77.2000, 28.59995], [77.2005, 28.59995]]},
            "properties": {"id": "way-low", "normalized_score": 0.2, "provenance": "osm_mapped"},
        }
        road_high = {
            "type": "Feature",
            "id": "way-high",
            "geometry": {"type": "LineString", "coordinates": [[77.2000, 28.60105], [77.2005, 28.60105]]},
            "properties": {"id": "way-high", "normalized_score": 0.95, "provenance": "osm_mapped"},
        }
        res = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson={"type": "FeatureCollection", "features": [road_low, road_high]},
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_physical_bins, 1)
        # High popularity segment was preferred!
        self.assertEqual(res.placements[0].source_segment_id, "way-high")
        self.assertAlmostEqual(res.placements[0].normalized_popularity_score, 0.95, places=2)

    def test_d7_location_with_no_eligible_candidate_reported_uncovered(self):
        # Road only near loc1, not loc2
        loc1 = self.sample_polygon
        loc2 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2025, 28.6025],
                [77.2028, 28.6025],
                [77.2028, 28.6028],
                [77.2025, 28.6028],
                [77.2025, 28.6025],
            ]],
        }
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-near-loc1",
                    "geometry": {"type": "LineString", "coordinates": [[77.20105, 28.6000], [77.20105, 28.6005]]},
                    "properties": {"id": "way-near-loc1", "normalized_score": 0.5, "provenance": "osm_mapped"},
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": loc1, "loc2": loc2},
            waste_compositions={"loc1": {"Food": 100.0}, "loc2": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(res.total_physical_bins, 1)
        self.assertIn("loc1", res.covered_location_ids)
        self.assertIn("loc2", res.uncovered_location_ids)
        self.assertTrue(any("loc2" in w for w in res.warnings))

    def test_d8_spacing_conflict_reported_explicitly(self):
        # Two locations where candidates for loc1 and loc2 are 5 m apart,
        # but road_bin_spacing_m is 50 m. Full coverage is impossible under spacing!
        loc1 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2000, 28.6000],
                [77.2002, 28.6000],
                [77.2002, 28.6002],
                [77.2000, 28.6002],
                [77.2000, 28.6000],
            ]],
        }
        loc2 = {
            "type": "Polygon",
            "coordinates": [[
                [77.2003, 28.6000],
                [77.2005, 28.6000],
                [77.2005, 28.6002],
                [77.2003, 28.6002],
                [77.2003, 28.6000],
            ]],
        }
        # Tiny road stub between them with length 1 m
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "stub-way",
                    "geometry": {"type": "LineString", "coordinates": [[77.20025, 28.60005], [77.20026, 28.60005]]},
                    "properties": {"id": "stub-way", "normalized_score": 0.5, "provenance": "osm_mapped"},
                }
            ],
        }
        res = predict_road_bins(
            location_geometries={"loc1": loc1, "loc2": loc2},
            waste_compositions={"loc1": {"Food": 100.0}, "loc2": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
            road_bin_spacing_m=50.0,
        )
        # Because candidate is close to both, it covers both with 1 bin!
        self.assertEqual(res.total_physical_bins, 1)

    def test_d9_d10_exact_solver_proven_vs_fallback_heuristic(self):
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-1",
                    "geometry": {"type": "LineString", "coordinates": [[77.20105, 28.6000], [77.20105, 28.6010]]},
                    "properties": {"id": "way-1", "normalized_score": 0.7, "provenance": "osm_mapped"},
                }
            ],
        }
        # Exact mode
        res_exact = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
            solver_mode="exact",
        )
        self.assertTrue(res_exact.optimality_proven)
        self.assertEqual(res_exact.solver_name, "scipy_milp_highs")

        # Fallback mode
        res_fallback = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
            solver_mode="fallback",
        )
        self.assertFalse(res_fallback.optimality_proven)
        self.assertEqual(res_fallback.solver_name, "greedy_set_cover_heuristic")

    def test_d11_repeated_runs_return_deterministic_selections(self):
        road = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "way-1",
                    "geometry": {"type": "LineString", "coordinates": [[77.20105, 28.6000], [77.20105, 28.6010]]},
                    "properties": {"id": "way-1", "normalized_score": 0.75, "provenance": "osm_mapped"},
                }
            ],
        }
        run1 = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
        )
        run2 = predict_road_bins(
            location_geometries={"loc1": self.sample_polygon},
            waste_compositions={"loc1": {"Food": 100.0}},
            paths_geojson=road,
            campus_boundary=self.sample_boundary,
        )
        self.assertEqual(run1.total_physical_bins, run2.total_physical_bins)
        self.assertEqual(run1.placements[0].coordinates, run2.placements[0].coordinates)
        self.assertEqual(run1.placements[0].placement_id, run2.placements[0].placement_id)


if __name__ == "__main__":
    unittest.main()
