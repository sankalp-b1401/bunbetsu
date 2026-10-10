"""Tests for Bunbetsu on-location bin prediction and polygon placement."""

import unittest
from shapely.geometry import Point, shape

from waste_predictor_model.waste_predictor_model import FestInput, LocationInput, predict as predict_waste
from bin_distribution_model.bin_distribution_model import (
    DEFAULT_BOUNDARY_SPACING_M,
    EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY,
    WASTE_DENSITY_KG_PER_M3,
    bins_for_daily_volume,
    predict_on_location_bins,
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


def make_fest(footfall=100, duration=1, campus_state="Delhi"):
    return FestInput(
        total_footfall=footfall,
        duration_days=duration,
        activities=("Food Stalls",),
        campus_state=campus_state,
        locations=(
            LocationInput(name="Food Court", activities=("Food Stalls",), area=500.0),
        ),
    )


class TestBinDistributionModel(unittest.TestCase):
    def test_effective_capacity(self):
        self.assertEqual(EFFECTIVE_BIN_CAPACITY_LITRES_PER_DAY, 160.0)

    def test_volume_conversion_uses_category_density(self):
        densities = {name: 1000.0 for name in ("Food", "Plastic", "Paper", "Glass", "Others")}
        self.assertAlmostEqual(
            volume_litres_from_mass_kg({"Food": 2.0, "Paper": 3.0}, densities),
            5.0,
        )

    def test_bins_round_up(self):
        self.assertEqual(bins_for_daily_volume(0), 0)
        self.assertEqual(bins_for_daily_volume(160), 1)
        self.assertEqual(bins_for_daily_volume(160.01), 2)
        self.assertEqual(bins_for_daily_volume(320), 2)

    def test_predicts_counts_and_returns_polygon_constrained_coordinates(self):
        result = predict_on_location_bins(
            make_fest(footfall=1000, duration=2),
            location_geometries={"Food Court": SQUARE},
        )
        self.assertEqual(len(result.locations), 1)
        location = result.locations[0]
        self.assertEqual(len(location.bin_placements), location.recommended_bins.central)
        self.assertGreaterEqual(
            location.recommended_bins.central,
            location.perimeter_spacing_minimum_bins,
        )
        self.assertLessEqual(location.capacity_bins.low, location.capacity_bins.central)
        self.assertLessEqual(location.capacity_bins.central, location.capacity_bins.high)

        polygon = shape(SQUARE)
        for placement in location.bin_placements:
            point = Point(placement.longitude, placement.latitude)
            self.assertTrue(polygon.covers(point), f"placement outside polygon: {point}")
            self.assertGreater(placement.boundary_distance_m, 0)
            self.assertLessEqual(placement.boundary_distance_m, 2.0)

    def test_returned_coordinates_are_inside_original_polygon(self):
        result = predict_on_location_bins(
            make_fest(footfall=1000, duration=2),
            location_geometries={"Food Court": SQUARE},
        )
        polygon = shape(SQUARE)
        for placement in result.locations[0].bin_placements:
            # Check the exact rounded coordinates returned by the API model.
            self.assertTrue(polygon.covers(Point(placement.longitude, placement.latitude)))

    def test_location_waste_is_divided_by_event_duration_before_bin_sizing(self):
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

        self.assertAlmostEqual(
            two_day.waste_kg_per_day_central,
            one_day.waste_kg_per_day_central / 2,
        )
        self.assertAlmostEqual(
            two_day.volume_litres_per_day_central,
            one_day.volume_litres_per_day_central / 2,
        )
        self.assertLessEqual(
            two_day.capacity_bins.central,
            one_day.capacity_bins.central,
        )

    def test_default_spacing_is_30m_planning_guideline(self):
        self.assertEqual(DEFAULT_BOUNDARY_SPACING_M, 30.0)

    def test_spatial_minimum_is_floor_not_added_to_capacity(self):
        result = predict_on_location_bins(
            make_fest(footfall=100, duration=1),
            location_geometries={"Food Court": SQUARE},
            spatial_minimum_bins={"Food Court": 20},
        )
        location = result.locations[0]
        self.assertEqual(location.spatial_minimum_bins, 20)
        self.assertEqual(location.recommended_bins.central, max(
            location.capacity_bins.central,
            location.perimeter_spacing_minimum_bins,
            20,
        ))
        self.assertEqual(len(location.bin_placements), location.recommended_bins.central)

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


if __name__ == "__main__":
    unittest.main()
