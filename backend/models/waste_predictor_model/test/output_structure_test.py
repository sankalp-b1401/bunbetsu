"""
Bunbetsu Waste Predictor — Mock Prediction Demo

Run from the project root:

    python test/mock_prediction_demo.py

This is a human-readable demo, not a pytest test.
It feeds one realistic mock college-fest configuration into the
waste predictor and prints the complete prediction + spatial/heatmap output.
"""

from pathlib import Path
import sys

# Make this demo work when the model is stored in the project root and this
# script is stored in /test.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from waste_predictor_model.waste_predictor_model import (
    ACTIVITY_WEIGHTS,
    FestInput,
    LocationInput,
    predict,
)


def tonnes(value_kg):
    return value_kg / 1000


def print_range(label, value, unit="kg"):
    if unit == "tonnes":
        values = (
            tonnes(value.low),
            tonnes(value.central),
            tonnes(value.high),
        )
        print(
            f"{label:<20} "
            f"Low: {values[0]:8.2f} t | "
            f"Central: {values[1]:8.2f} t | "
            f"High: {values[2]:8.2f} t"
        )
    else:
        print(
            f"{label:<20} "
            f"Low: {value.low:10.2f} kg | "
            f"Central: {value.central:10.2f} kg | "
            f"High: {value.high:10.2f} kg"
        )


def main():
    # ---------------------------------------------------------
    # MOCK FEST INPUT
    # ---------------------------------------------------------
    inputs = FestInput(
        total_footfall=12_000,
        duration_days=3,

        activities=(
            "Food Stalls",
            "Music Concert",
            "Performing Arts",
            "Literary & Fine Arts",
            "Sports",
            "Hackathon",
        ),

        campus_state="Uttar Pradesh",

        locations=(
            LocationInput(
                name="Main Ground",
                area=8_000,
                activities=("Food Stalls", "Music Concert"),
            ),

            LocationInput(
                name="Auditorium",
                area=2_500,
                activities=("Performing Arts", "Literary & Fine Arts"),
            ),

            LocationInput(
                name="Sports Complex",
                area=6_000,
                activities=("Sports",),
            ),

            LocationInput(
                name="Innovation Block",
                area=3_000,
                activities=("Hackathon",),
            ),

            # Same activity set as Main Ground.
            # The model should therefore divide their spatial
            # contribution equally.
            LocationInput(
                name="Open Food Court",
                area=4_000,
                activities=("Food Stalls", "Music Concert"),
            ),
        ),
    )

    result = predict(inputs)

    # ---------------------------------------------------------
    # FEST INPUT
    # ---------------------------------------------------------
    print("=" * 72)
    print("BUNBETSU — WASTE PREDICTOR MOCK DEMO")
    print("=" * 72)

    print("\nFEST INPUT")
    print("-" * 72)
    print(f"Campus state            : {result.campus_state}")
    print(f"Expected daily footfall : {inputs.total_footfall:,} people")
    print(f"Duration                : {inputs.duration_days} days")
    print(
        f"Expected attendee-days  : "
        f"{inputs.total_footfall * inputs.duration_days:,}"
    )
    print(
        f"Resolved baseline rate  : "
        f"{result.baseline_rate_kg_per_person_day:.5f} kg/person/day "
        f"({result.baseline_rate_source}, {result.baseline_source_year})"
    )
    print(
        f"National fallback applied: "
        f"{'Yes' if result.baseline_is_national_fallback else 'No'}"
    )

    print("\nSelected activities:")
    for activity in inputs.activities:
        print(
            f"  - {activity:<24} "
            f"predefined relative weight = {ACTIVITY_WEIGHTS[activity]:.2f}"
        )

    print("\nSelected map locations:")
    for location in inputs.locations:
        print(
            f"  - {location.name:<20} "
            f"{location.area:>7,.0f} m² | "
            f"{', '.join(location.activities)}"
        )

    # ---------------------------------------------------------
    # TOTAL WASTE
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("1. TOTAL FEST WASTE")
    print("=" * 72)

    print_range(
        "Total waste",
        result.total_waste_kg,
        unit="tonnes",
    )

    # ---------------------------------------------------------
    # COMPOSITION
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("2. WASTE COMPOSITION")
    print("=" * 72)

    for category, value in result.composition_kg.items():
        percentage = result.composition_percent[category] * 100

        print(
            f"{category:<12} "
            f"{percentage:6.2f}% | "
            f"Low: {tonnes(value.low):7.3f} t | "
            f"Central: {tonnes(value.central):7.3f} t | "
            f"High: {tonnes(value.high):7.3f} t"
        )

    print("\nDerived groups:")
    print_range("Recyclable", result.recyclable_kg, unit="tonnes")
    print_range("Disposable", result.disposable_kg, unit="tonnes")

    # ---------------------------------------------------------
    # ACTIVITY ALLOCATION
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("3. INTERNAL ACTIVITY ALLOCATION")
    print("=" * 72)

    for allocation in result.activity_allocations:
        print(
            f"\n{allocation.activity}"
            f"\n  Normalized weight : {allocation.normalized_weight:.4f}"
            f"\n  Intensity         : "
            f"{allocation.intensity.low:.2f} - "
            f"{allocation.intensity.central:.2f} - "
            f"{allocation.intensity.high:.2f}"
            f"\n  Internal waste    : "
            f"{tonnes(allocation.internal_waste_range_kg.low):.3f} - "
            f"{tonnes(allocation.internal_waste_range_kg.central):.3f} - "
            f"{tonnes(allocation.internal_waste_range_kg.high):.3f} t"
        )

    # ---------------------------------------------------------
    # LOCATION CONTRIBUTION
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("4. LOCATION-WISE CONTRIBUTION")
    print("=" * 72)

    for location in result.location_allocations:
        print(f"\n{location.location_name}")
        print(f"  Area              : {location.area:,.0f} m²")
        print(f"  Activities        : {', '.join(location.activities)}")
        print(f"  Spatial share     : {location.normalized_share:.2%}")

        print(
            f"  Total waste       : "
            f"{tonnes(location.total_waste_kg.low):.3f} - "
            f"{tonnes(location.total_waste_kg.central):.3f} - "
            f"{tonnes(location.total_waste_kg.high):.3f} t"
        )

        print("  Composition:")
        for category, value in location.composition_kg.items():
            print(
                f"    {category:<10} "
                f"{tonnes(value.central):.3f} t central"
            )

        print(
            f"  Recyclable       : "
            f"{tonnes(location.recyclable_kg.central):.3f} t central"
        )
        print(
            f"  Disposable       : "
            f"{tonnes(location.disposable_kg.central):.3f} t central"
        )

    # ---------------------------------------------------------
    # HEATMAP DATA
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("5. HEATMAP-READY DATA")
    print("=" * 72)

    heatmap = result.heatmap_data

    if heatmap is None:
        print("No locations were supplied; heatmap data is unavailable.")
    else:
        print("\nTOTAL WASTE HEATMAP")
        for name, value in heatmap.total_waste_kg.items():
            print(f"  {name:<20} {tonnes(value.central):.3f} t")

        for category, values in heatmap.category_waste_kg.items():
            print(f"\n{category.upper()} WASTE HEATMAP")
            for name, value in values.items():
                print(f"  {name:<20} {tonnes(value.central):.3f} t")

        print("\nRECYCLABLE WASTE HEATMAP")
        for name, value in heatmap.recyclable_kg.items():
            print(f"  {name:<20} {tonnes(value.central):.3f} t")

        print("\nDISPOSABLE WASTE HEATMAP")
        for name, value in heatmap.disposable_kg.items():
            print(f"  {name:<20} {tonnes(value.central):.3f} t")

    # ---------------------------------------------------------
    # DUPLICATE ACTIVITY-SET CHECK
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("6. DUPLICATE ACTIVITY-SET CHECK")
    print("=" * 72)

    main_ground = next(
        x for x in result.location_allocations
        if x.location_name == "Main Ground"
    )
    open_food_court = next(
        x for x in result.location_allocations
        if x.location_name == "Open Food Court"
    )

    print("Main Ground activities    :", main_ground.activities)
    print("Open Food Court activities:", open_food_court.activities)
    print(
        "Equal spatial share?      :",
        main_ground.normalized_share == open_food_court.normalized_share,
    )
    print(
        "Main Ground share         :",
        f"{main_ground.normalized_share:.2%}",
    )
    print(
        "Open Food Court share     :",
        f"{open_food_court.normalized_share:.2%}",
    )

    # ---------------------------------------------------------
    # AUDIT / ASSUMPTIONS
    # ---------------------------------------------------------
    print("\n" + "=" * 72)
    print("7. MODEL ASSUMPTIONS")
    print("=" * 72)

    for assumption in result.assumptions:
        print(f"- {assumption}")

    print("\n" + "=" * 72)
    print("DEMO COMPLETE")
    print("=" * 72)


if __name__ == "__main__":
    main()
