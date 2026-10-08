"""Bunbetsu waste-prediction mathematical model.

This implementation intentionally contains no empirical re-calibration logic.
It encodes the frozen model inputs/profiles available to the project and keeps
the model deterministic and auditable.

Important:
- total_footfall means the expected number of people attending the fest.
- The model assumes this expected footfall applies to each fest day.
- duration_days converts footfall into total attendee-days.
- activity weights are relative contribution weights, not attendance estimates.
- activity/location quantities are internal spatial allocations.
- mathematical prediction is separate from XAI/RAG.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from enum import Enum
from typing import Mapping, Sequence


class WasteCategory(str, Enum):
    FOOD = "Food"
    PLASTIC = "Plastic"
    PAPER = "Paper"
    GLASS = "Glass"
    OTHERS = "Others"


ACTIVITIES = (
    "Food Stalls",
    "Music Concert",
    "Performing Arts",
    "Sports",
    "Literary & Fine Arts",
    "Hackathon",
)


# Predefined relative contribution weights. These are model parameters, not user inputs.
ACTIVITY_WEIGHTS = {
    "Food Stalls": 5,
    "Music Concert": 4,
    "Performing Arts": 3,
    "Literary & Fine Arts": 2,
    "Sports": 1,
    "Hackathon": 1,
}


# Frozen activity-intensity bands from the research phase.
# These are priors, not fitted values.
ACTIVITY_INTENSITY = {
    "Food Stalls": (1.5, 1.7, 1.9),
    "Music Concert": (1.2, 1.35, 1.5),
    "Performing Arts": (1.0, 1.15, 1.3),
    "Sports": (1.1, 1.3, 1.5),
    "Literary & Fine Arts": (0.8, 0.9, 1.0),
    "Hackathon": (0.9, 1.05, 1.2),
}


# Frozen central composition priors from the research phase.
# Order: Food, Plastic, Paper, Glass, Others.
ACTIVITY_COMPOSITION = {
    "Food Stalls": (0.50, 0.15, 0.10, 0.05, 0.20),
    "Music Concert": (0.25, 0.12, 0.10, 0.08, 0.45),
    "Performing Arts": (0.25, 0.12, 0.12, 0.05, 0.46),
    "Sports": (0.35, 0.15, 0.10, 0.05, 0.35),
    "Literary & Fine Arts": (0.25, 0.15, 0.10, 0.03, 0.47),
    "Hackathon": (0.25, 0.15, 0.15, 0.02, 0.43),
}


@dataclass(frozen=True)
class LocationInput:
    """A map-selected fest location and its selected activity tags."""

    name: str
    activities: tuple[str, ...]
    area: float

    def validate(self) -> None:
        if not self.name.strip():
            raise ValueError("Location name must not be empty.")
        if self.area <= 0:
            raise ValueError("Location area must be > 0.")
        if not self.activities:
            raise ValueError(f"At least one activity is required for location: {self.name}.")
        unknown = set(self.activities) - set(ACTIVITIES)
        if unknown:
            raise ValueError(
                f"Unknown activities in location {self.name!r}: {sorted(unknown)}"
            )


@dataclass(frozen=True)
class FestInput:
    total_footfall: int
    duration_days: int
    activities: tuple[str, ...]

    # kg of waste per person per day.
    baseline_rate_kg_per_person_day: float

    # Map-selected locations used for spatial allocation and heatmaps.
    locations: tuple[LocationInput, ...] = ()

    def validate(self) -> None:
        if self.total_footfall <= 0:
            raise ValueError("total_footfall must be > 0.")

        if self.duration_days <= 0:
            raise ValueError("duration_days must be > 0.")

        if not self.activities:
            raise ValueError("At least one activity is required.")

        unknown = set(self.activities) - set(ACTIVITIES)
        if unknown:
            raise ValueError(
                f"Unknown activities: {sorted(unknown)}"
            )

        missing = set(self.activities) - set(ACTIVITY_WEIGHTS)
        if missing:
            raise ValueError(
                f"No predefined activity weights found for: {sorted(missing)}"
            )

        if sum(ACTIVITY_WEIGHTS[a] for a in self.activities) <= 0:
            raise ValueError("Selected activities must have a positive total predefined weight.")

        for location in self.locations:
            location.validate()

        if self.baseline_rate_kg_per_person_day <= 0:
            raise ValueError(
                "baseline_rate_kg_per_person_day must be > 0."
            )


@dataclass(frozen=True)
class Range:
    low: float
    central: float
    high: float

    def __post_init__(self) -> None:
        if not (
            self.low <= self.central <= self.high
        ):
            raise ValueError(
                "Range must satisfy low <= central <= high."
            )

        if self.low < 0:
            raise ValueError(
                "Range values cannot be negative."
            )


@dataclass(frozen=True)
class Composition:
    food: float
    plastic: float
    paper: float
    glass: float
    others: float

    def __post_init__(self) -> None:
        values = (
            self.food,
            self.plastic,
            self.paper,
            self.glass,
            self.others,
        )

        if any(v < 0 for v in values):
            raise ValueError(
                "Composition fractions cannot be negative."
            )

        if not math.isclose(
            sum(values),
            1.0,
            abs_tol=1e-9,
        ):
            raise ValueError(
                f"Composition must sum to 1.0; got {sum(values)}"
            )

    def as_dict(self) -> dict[str, float]:
        return {
            WasteCategory.FOOD.value: self.food,
            WasteCategory.PLASTIC.value: self.plastic,
            WasteCategory.PAPER.value: self.paper,
            WasteCategory.GLASS.value: self.glass,
            WasteCategory.OTHERS.value: self.others,
        }


@dataclass(frozen=True)
class ActivityAllocation:
    activity: str
    normalized_weight: float
    intensity: Range
    relative_intensity: Range
    internal_waste_range_kg: Range


@dataclass(frozen=True)
class LocationWasteAllocation:
    """Heatmap-ready waste contribution for one selected location."""

    location_name: str
    area: float
    activities: tuple[str, ...]
    normalized_share: float
    total_waste_kg: Range
    composition_kg: dict[str, Range]
    recyclable_kg: Range
    disposable_kg: Range


@dataclass(frozen=True)
class HeatmapData:
    """Location-wise values for each heatmap layer."""

    total_waste_kg: dict[str, Range]
    category_waste_kg: dict[str, dict[str, Range]]
    recyclable_kg: dict[str, Range]
    disposable_kg: dict[str, Range]


@dataclass(frozen=True)
class WastePrediction:
    total_waste_kg: Range
    composition_kg: dict[str, Range]
    composition_percent: dict[str, float]
    recyclable_kg: Range
    disposable_kg: Range
    activity_allocations: tuple[ActivityAllocation, ...]
    location_allocations: tuple[LocationWasteAllocation, ...] = ()
    heatmap_data: HeatmapData | None = None
    assumptions: tuple[str, ...] = field(
        default_factory=tuple
    )


def weighted_intensity(
    activities: Sequence[str],
) -> Range:
    """Weighted mean of activity-intensity bands.

    The same normalized activity contribution weights are used
    at each uncertainty endpoint.

    This does not infer attendance by activity.
    """

    total_weight = sum(
        ACTIVITY_WEIGHTS[a]
        for a in activities
    )

    normalized = {
        a: ACTIVITY_WEIGHTS[a] / total_weight
        for a in activities
    }

    lows = sum(
        normalized[a] * ACTIVITY_INTENSITY[a][0]
        for a in activities
    )

    centrals = sum(
        normalized[a] * ACTIVITY_INTENSITY[a][1]
        for a in activities
    )

    highs = sum(
        normalized[a] * ACTIVITY_INTENSITY[a][2]
        for a in activities
    )

    return Range(
        lows,
        centrals,
        highs,
    )


def weighted_composition(
    activities: Sequence[str],
) -> Composition:
    """Weighted mean of frozen activity composition priors."""

    total_weight = sum(
        ACTIVITY_WEIGHTS[a]
        for a in activities
    )

    normalized = {
        a: ACTIVITY_WEIGHTS[a] / total_weight
        for a in activities
    }

    columns = list(
        zip(
            *(
                ACTIVITY_COMPOSITION[a]
                for a in activities
            )
        )
    )

    values = [
        sum(
            normalized[a]
            * ACTIVITY_COMPOSITION[a][i]
            for a in activities
        )
        for i in range(5)
    ]

    return Composition(*values)


def _allocate_locations(
    locations: Sequence[LocationInput],
    total_waste: Range,
    composition: Composition,
) -> tuple[LocationWasteAllocation, ...]:
    """Allocate fest-level waste to locations for spatial visualization.

    A location score is the sum of the selected activities' relative weights.
    Therefore locations with the same activity set receive equal shares.
    Area is retained as metadata and is not used as a waste multiplier.
    """
    if not locations:
        return ()

    scores = [sum(ACTIVITY_WEIGHTS[a] for a in loc.activities) for loc in locations]
    score_total = sum(scores)
    if score_total <= 0:
        raise ValueError("Location activity contribution score must be > 0.")

    allocations = []
    for location, score in zip(locations, scores):
        share = score / score_total
        location_total = Range(
            total_waste.low * share,
            total_waste.central * share,
            total_waste.high * share,
        )
        location_composition = {
            category: Range(
                location_total.low * fraction,
                location_total.central * fraction,
                location_total.high * fraction,
            )
            for category, fraction in composition.as_dict().items()
        }
        recyclable = Range(
            location_composition["Plastic"].low + location_composition["Paper"].low + location_composition["Glass"].low,
            location_composition["Plastic"].central + location_composition["Paper"].central + location_composition["Glass"].central,
            location_composition["Plastic"].high + location_composition["Paper"].high + location_composition["Glass"].high,
        )
        disposable = Range(
            location_composition["Food"].low + location_composition["Others"].low,
            location_composition["Food"].central + location_composition["Others"].central,
            location_composition["Food"].high + location_composition["Others"].high,
        )
        allocations.append(
            LocationWasteAllocation(
                location_name=location.name,
                area=location.area,
                activities=location.activities,
                normalized_share=share,
                total_waste_kg=location_total,
                composition_kg=location_composition,
                recyclable_kg=recyclable,
                disposable_kg=disposable,
            )
        )
    return tuple(allocations)


def _build_heatmap_data(
    allocations: Sequence[LocationWasteAllocation],
) -> HeatmapData:
    """Build total/category/recyclable/disposable heatmap layers."""
    return HeatmapData(
        total_waste_kg={a.location_name: a.total_waste_kg for a in allocations},
        category_waste_kg={
            category: {a.location_name: a.composition_kg[category] for a in allocations}
            for category in ("Food", "Plastic", "Paper", "Glass", "Others")
        },
        recyclable_kg={a.location_name: a.recyclable_kg for a in allocations},
        disposable_kg={a.location_name: a.disposable_kg for a in allocations},
    )


def predict(inputs: FestInput) -> WastePrediction:
    """Run the Bunbetsu mathematical model.

    Model:

        W = F * D * R * I

    where:

        F = expected people attending the fest
        D = number of fest days
        R = baseline waste generation rate in kg/person/day
        I = weighted activity intensity

    The model assumes the expected footfall is applicable to
    each fest day. Therefore:

        total_attendee_days = F * D

    Duration is not an additional activity modifier. It is
    used once to convert expected daily footfall into total
    attendee-day exposure.

    This function does not calibrate or fit parameters.
    """

    inputs.validate()

    intensity = weighted_intensity(inputs.activities)

    # Expected total attendee-day exposure.
    attendee_days = (
        inputs.total_footfall
        * inputs.duration_days
    )

    total = Range(
        attendee_days
        * inputs.baseline_rate_kg_per_person_day
        * intensity.low,

        attendee_days
        * inputs.baseline_rate_kg_per_person_day
        * intensity.central,

        attendee_days
        * inputs.baseline_rate_kg_per_person_day
        * intensity.high,
    )

    composition = weighted_composition(inputs.activities)

    composition_ranges: dict[str, Range] = {}

    for category, fraction in composition.as_dict().items():
        composition_ranges[category] = Range(
            total.low * fraction,
            total.central * fraction,
            total.high * fraction,
        )

    recyclable = Range(
        composition_ranges["Plastic"].low
        + composition_ranges["Paper"].low
        + composition_ranges["Glass"].low,

        composition_ranges["Plastic"].central
        + composition_ranges["Paper"].central
        + composition_ranges["Glass"].central,

        composition_ranges["Plastic"].high
        + composition_ranges["Paper"].high
        + composition_ranges["Glass"].high,
    )

    disposable = Range(
        composition_ranges["Food"].low
        + composition_ranges["Others"].low,

        composition_ranges["Food"].central
        + composition_ranges["Others"].central,

        composition_ranges["Food"].high
        + composition_ranges["Others"].high,
    )

    # Internal activity allocation.
    total_weight = sum(
        ACTIVITY_WEIGHTS[a]
        for a in inputs.activities
    )

    allocations = []

    for activity in inputs.activities:

        normalized_weight = (
            ACTIVITY_WEIGHTS[activity]
            / total_weight
        )

        intensity_values = ACTIVITY_INTENSITY[activity]

        activity_intensity = Range(
            *intensity_values
        )

        relative = Range(
            normalized_weight
            * intensity_values[0],

            normalized_weight
            * intensity_values[1],

            normalized_weight
            * intensity_values[2],
        )

        allocations.append(
            ActivityAllocation(
                activity=activity,
                normalized_weight=normalized_weight,
                intensity=activity_intensity,
                relative_intensity=relative,
                internal_waste_range_kg=Range(
                    total.low * normalized_weight,
                    total.central * normalized_weight,
                    total.high * normalized_weight,
                ),
            )
        )

    location_allocations = _allocate_locations(
        inputs.locations, total, composition
    )
    heatmap_data = (
        _build_heatmap_data(location_allocations)
        if location_allocations
        else None
    )

    return WastePrediction(
        total_waste_kg=total,
        composition_kg=composition_ranges,
        composition_percent=composition.as_dict(),
        recyclable_kg=recyclable,
        disposable_kg=disposable,
        activity_allocations=tuple(allocations),
        location_allocations=location_allocations,
        heatmap_data=heatmap_data,
        assumptions=(
            "Footfall is the expected number of people attending the fest.",
            "The model assumes the expected footfall applies to each fest day.",
            "Duration converts expected footfall into total attendee-days.",
            "Baseline rate is expressed in kg/person/day.",
            "Activity weights are predefined model parameters for relative contribution, not attendance estimates.",
            "Current predefined activity weights are Food Stalls=5, Music Concert=4, Performing Arts=3, Literary & Fine Arts=2, Sports=1, Hackathon=1.",
            "Activity/location quantities are internal and should not be presented as precise measurements.",
            "Location area is spatial metadata and is not used as a waste multiplier.",
            "Location contributions preserve the fest-level prediction and are intended for heatmap visualization.",
            "Locations with identical activity sets receive equal spatial shares.",
            "Different location activity sets are weighted using the predefined activity contribution weights.",
            "CPCB/state municipal rates are reference benchmarks; they are not automatically treated as event coefficients.",
            "No parameter fitting or validation calibration is performed by this model.",
        ),
    )