# Bunbetsu Bin Distribution Model

Comprehensive research, mathematical formulation, spatial placement logic, and engineering specification for on-location and road-corridor event bin distribution.

---

## Table of Contents

- [1. What It Does](#1-what-it-does)
- [2. Input Structure](#2-input-structure)
  - [2.1 On-Location Model Inputs](#21-on-location-model-inputs)
  - [2.2 Road-Bin Model Inputs](#22-road-bin-model-inputs)
  - [2.3 Code Usage Example](#23-code-usage-example)
- [3. Output Structure](#3-output-structure)
  - [3.1 On-Location Model Output (`OnLocationBinPrediction`)](#31-on-location-model-output-onlocationbinprediction)
  - [3.2 Road-Bin Model Output (`RoadBinPrediction`)](#32-road-bin-model-output-roadbinprediction)
  - [3.3 Conceptual JSON Output Examples](#33-conceptual-json-output-examples)
- [4. Waste Stream Classification & Bulk Density](#4-waste-stream-classification--bulk-density)
  - [4.1 Operational Stream Aggregation](#41-operational-stream-aggregation)
  - [4.2 Category-Specific Bulk Density](#42-category-specific-bulk-density)
  - [4.3 Mass-to-Volume Conversion Formula](#43-mass-to-volume-conversion-formula)
  - [4.4 Why Lower-Mass Streams Demand More Bins](#44-why-lower-mass-streams-demand-more-bins)
- [5. On-Location Bin Distribution Mathematics](#5-on-location-bin-distribution-mathematics)
  - [5.1 Usable Bin Capacity](#51-usable-bin-capacity)
  - [5.2 Daily Volume & Capacity-Only Demand](#52-daily-volume--capacity-only-demand)
  - [5.3 Geometric Perimeter Limit ($M$)](#53-geometric-perimeter-limit-m)
  - [5.4 Proportional Allocation (Largest-Remainder Method)](#54-proportional-allocation-largest-remainder-method)
  - [5.5 Variable Emptying Turns per Stream](#55-variable-emptying-turns-per-stream)
  - [5.6 Capacity Coverage & Shortfall Diagnostics](#56-capacity-coverage--shortfall-diagnostics)
  - [5.7 Boundary Placement Coordinates & Stream Interleaving](#57-boundary-placement-coordinates--stream-interleaving)
- [6. Road-Bin Distribution Model Mathematics](#6-road-bin-distribution-model-mathematics)
  - [6.1 Purpose and System Scope](#61-purpose-and-system-scope)
  - [6.2 Stream-Specific Influence Radii & Dominant Waste Types](#62-stream-specific-influence-radii--dominant-waste-types)
  - [6.3 Road Candidate Generation & Sampling](#63-road-candidate-generation--sampling)
  - [6.4 Route Popularity Scoring](#64-route-popularity-scoring)
  - [6.5 Existing Road-Spacing Policy](#65-existing-road-spacing-policy)
  - [6.6 Proposed Variable Road-Spacing Policy](#66-proposed-variable-road-spacing-policy)
  - [6.7 Positive-Popularity Corridor Coverage](#67-positive-popularity-corridor-coverage)
  - [6.8 Physical-Bin vs. Station Accounting](#68-physical-bin-vs-station-accounting)
  - [6.9 Solvers & Constraint Validation](#69-solvers--constraint-validation)
- [7. Variables and Equations Reference](#7-variables-and-equations-reference)
  - [7.1 On-Location Model Variables](#71-on-location-model-variables)
  - [7.2 Road-Bin Model Variables](#72-road-bin-model-variables)
- [8. Research Basis, Evidence & Source Ledger](#8-research-basis-evidence--source-ledger)
- [9. Validation Invariants & Operational Limitations](#9-validation-invariants--operational-limitations)
  - [9.1 On-Location Validation Invariants](#91-on-location-validation-invariants)
  - [9.2 Road-Bin Validation Invariants](#92-road-bin-validation-invariants)
  - [9.3 Operational and Site-Review Limitations](#93-operational-and-site-review-limitations)
- [10. End-to-End Mathematical Pipeline & Final Assessment](#10-end-to-end-mathematical-pipeline--final-assessment)

---

## 1. What It Does

Bunbetsu's **Bin Prediction System** bridges the gap between aggregate solid-waste forecasting and tactical, on-the-ground infrastructure placement. It converts predicted waste masses into actionable bin procurement counts, operational emptying turns, and coordinate-level map placements.

The system comprises two specialized spatial engines:

1. **On-Location Bin Distribution (`predict_on_location_bins`):**
   - Converts category-specific waste mass into volumetric demand (litres) using bulk density coefficients.
   - Calculates unconstrained daily capacity demand ($N$) based on 80 L usable capacity per 100 L receptacle.
   - Projects location polygons (WGS84 GeoJSON) into local metric azimuthal-equidistant coordinates to measure the minimum rotated bounding rectangle perimeter ($P$).
   - Enforces a **25 m physical perimeter spacing constraint** establishing a hard physical upper bound: $M = \lfloor P / 25 \rfloor$.
   - Proportionally apportions physical bins between **Disposable** and **Recyclable** streams using Hamilton's largest-remainder method.
   - Calculates variable daily emptying turn frequencies ($T_{\text{disposable}}$ and $T_{\text{recyclable}}$) when physical bin counts are perimeter-constrained.
   - Generates exact WGS84 placement coordinates sampled along an inward-offset polygon boundary (default 1.5 m inset), systematically interleaving stream labels and validating polygon containment.
   - Computes capacity coverage and shortfall diagnostics.

2. **Road-Bin Distribution (`predict_road_bins`):**
   - Analyzes mapped pedestrian corridors connecting event hubs.
   - Establishes outward spatial influence buffers ($100\text{--}150\text{ m}$) from location polygons based on the dominant material in each waste stream.
   - Samples candidate placement coordinates along eligible mapped road centerlines (default 5 m sampling interval; 0.5 m deduplication).
   - Solves a multi-objective spatial optimization problem (exact Mixed-Integer Linear Program with a greedy heuristic fallback) that:
     - Satisfies location-stream waste coverage requirements.
     - Enforces corridor-aware minimum spacing (default 25 m).
     - Minimizes total physical bins by consolidating multi-stream stations where possible.
     - Prioritizes placements on corridors with high normalized pedestrian route-popularity scores.

> [!NOTE]
> The upstream waste predictor (`backend/models/waste_predictor_model`) serves as the strict source of truth for waste mass. The bin distribution model consumes its **central waste estimate** for principal planning, preserving the frozen waste prediction mechanics without modification.

---

## 2. Input Structure

The system is implemented in [`bin_distribution_model.py`](file:///d:/BearLabs/Projects/bunbetsu/backend/models/bin_distribution_model/bin_distribution_model.py).

### 2.1 On-Location Model Inputs

Invoked via `predict_on_location_bins()`:

| Parameter | Type | Required | Description | Constraints / Defaults |
| :--- | :--- | :---: | :--- | :--- |
| `fest_input` | `FestInput` | Yes | Festival configuration (footfall, duration, activities, campus state). | Must be validated; total footfall and duration $> 0$. |
| `waste_prediction` | `WastePrediction \| None` | No | Precomputed waste prediction dataclass. If omitted, `predict_waste(fest_input)` is called automatically. | Defaults to `None`. |
| `location_geometries` | `Mapping[str, Mapping[str, Any]]` | Yes | Mapping from location name (or ID) to GeoJSON `Polygon` or `MultiPolygon` in WGS84 `[longitude, latitude]` order. | Must match locations in `fest_input`. Coordinate pairs must be valid. |
| `spatial_minimum_bins` | `Mapping[str, int] \| None` | No | Optional policy override specifying minimum physical bins per location. | Defaults to `None`. |
| `density_kg_per_m3` | `Mapping[str, float]` | No | Bulk density per category in $\text{kg/m}^3$. | Defaults to `WASTE_DENSITY_KG_PER_M3`. Must contain all 5 categories. |
| `boundary_spacing_m` | `float` | No | Target perimeter spacing between adjacent bins. | Default: `25.0` m (Bunbetsu planning policy). Must be $> 0$. |
| `boundary_inset_m` | `float` | No | Inward buffer distance from exterior polygon perimeter for placement. | Default: `1.5` m. Must be $> 0$. |
| `close_spacing_warning_m`| `float` | No | Threshold triggering a diagnostic close-spacing warning. | Default: `3.0` m. |

### 2.2 Road-Bin Model Inputs

Invoked via `predict_road_bins()`:

| Parameter | Type | Required | Description | Constraints / Defaults |
| :--- | :--- | :---: | :--- | :--- |
| `location_geometries` | `Mapping[str, Mapping[str, Any]]` | Yes | GeoJSON Polygons/MultiPolygons for all activity locations. | Coordinates in WGS84 `[lng, lat]`. |
| `waste_compositions` | `Mapping[str, Any]` | Yes | Waste composition mapping keyed by location ID or display name. | Contains category masses (kg) or fractions. |
| `paths_geojson` | `Mapping[str, Any]` | Yes | GeoJSON FeatureCollection of mapped pedestrian road segments. Each segment feature includes properties like `normalized_popularity_score` ($0\le p\le 1$) and `segment_id`. | Road geometries must be `LineString` or `MultiLineString`. |
| `campus_boundary` | `Mapping[str, Any] \| None` | No | Optional GeoJSON Polygon/MultiPolygon clipping eligible road candidates. | Coordinates in WGS84. |
| `location_names` | `Mapping[str, str] \| None` | No | Mapping from location IDs to human-readable names. | Defaults to `{}`. |
| `waste_influence_radii_m`| `Mapping[str, float] \| None`| No | Per-category outward buffer radii in metres. | Defaults to `DEFAULT_WASTE_INFLUENCE_RADII_M` (100–150 m). |
| `candidate_sampling_interval_m` | `float` | No | Linear spacing interval along roads for sampling candidate points. | Default: `5.0` m. Must be $> 0$. |
| `road_bin_spacing_m` | `float` | No | Minimum spacing between road-bin placements along continuous corridors. | Default: `25.0` m. Must be $> 0$. |
| `solver_mode` | `str` | No | Optimizer mode: `"exact"` (MILP using SciPy) or `"greedy"`. | Default: `"exact"`. |
| `max_candidates_threshold` | `int` | No | Threshold above which solver auto-falls back to greedy if exact is too large. | Default: `2500`. |

### 2.3 Code Usage Example

```python
from models.waste_predictor_model.waste_predictor_model import FestInput, LocationInput
from models.bin_distribution_model.bin_distribution_model import (
    predict_on_location_bins,
    predict_road_bins,
)

# 1. Configure Festival & Geometries
fest_input = FestInput(
    total_footfall=10_000,
    duration_days=3,
    activities=("Food Stalls", "Music Concert"),
    campus_state="Uttar Pradesh",
    locations=(
        LocationInput(name="Main Ground", area=8000.0, activities=("Food Stalls", "Music Concert"), location_id="loc_1"),
    ),
)

location_geometries = {
    "Main Ground": {
        "type": "Polygon",
        "coordinates": [[[77.100, 28.600], [77.102, 28.600], [77.102, 28.602], [77.100, 28.602], [77.100, 28.600]]],
    }
}

# 2. Run On-Location Bin Model
on_loc_prediction = predict_on_location_bins(
    fest_input,
    location_geometries=location_geometries,
    boundary_spacing_m=25.0,
    boundary_inset_m=1.5,
)

# 3. Run Road-Bin Model along Pedestrian Paths
road_prediction = predict_road_bins(
    location_geometries=location_geometries,
    waste_compositions={"loc_1": {"Food": 500.0, "Plastic": 150.0, "Paper": 100.0, "Glass": 50.0, "Others": 200.0}},
    paths_geojson=paths_feature_collection,
    road_bin_spacing_m=25.0,
)
```

---

## 3. Output Structure

### 3.1 On-Location Model Output (`OnLocationBinPrediction`)

Top-level container holding predictions for all activity locations.

- **`locations`** (`tuple[LocationBinPrediction, ...]`): Per-location bin plans.
- **`bin_capacity_litres`** (`float`): Nominal capacity ($100.0\text{ L}$).
- **`usable_fill_fraction`** (`float`): Usable fraction ($0.80$).
- **`usable_bin_capacity_litres`** (`float`): Usable volume per turn ($80.0\text{ L}$).
- **`boundary_spacing_target_m`** (`float`): Target perimeter spacing ($25.0\text{ m}$).
- **`boundary_inset_m`** (`float`): Inward boundary inset ($1.5\text{ m}$).
- **`density_kg_per_m3`** (`dict[str, float]`): Configured bulk density map.
- **`assumptions`** (`tuple[str, ...]`): Auditable list of model assumptions.
- **Aggregate Properties:**
  - `total_disposable_physical_bins` (`int`): Sum of central disposable physical bins.
  - `total_recyclable_physical_bins` (`int`): Sum of central recyclable physical bins.
  - `emptying_cycles_per_day` (`int`): Peak emptying turns across all locations.

#### Per-Location Result (`LocationBinPrediction`)
Each location reports:
- **Identification:** `location_name`, `area`, `activities`.
- **Daily Mass (kg/day):** `waste_kg_per_day_low`, `waste_kg_per_day_central`, `waste_kg_per_day_high`, `disposable_waste_kg_per_day_central`, `recyclable_waste_kg_per_day_central`.
- **Daily Volume (L/day):** `volume_litres_per_day_low`, `volume_litres_per_day_central`, `volume_litres_per_day_high`, `disposable_volume_litres_per_day_central`, `recyclable_volume_litres_per_day_central`.
- **Capacity-Only Demand:** `capacity_bins`, `disposable_capacity_bins`, `recyclable_capacity_bins` (each a `BinCountRange(low, central, high)`).
- **Perimeter Constraints:** `rectangle_perimeter_m`, `perimeter_spacing_max_bins` ($M$).
- **Allocated Physical Bins:** `recommended_bins`, `disposable_physical_bins`, `recyclable_physical_bins` (`BinCountRange`).
- **Required Emptying Turns:** `required_emptying_turns`, `disposable_required_turns`, `recyclable_required_turns` (`BinCountRange`).
- **Capacity & Shortfall Diagnostics:** `daily_capacity_coverage_litres`, `capacity_shortfall_litres`, `disposable_capacity_shortfall_litres`, `recyclable_capacity_shortfall_litres`.
- **Coordinate Placements:** `bin_placements` (`tuple[BinPlacement, ...]`), where each placement provides:
  - `bin_index`: 1-based sequential index.
  - `longitude`, `latitude`: WGS84 coordinates.
  - `boundary_distance_m`: Distance from exterior perimeter.
  - `bin_type`: `"Disposable"` or `"Recyclable"`.
- **Diagnostics:** `placement_scenario`, `actual_boundary_spacing_m`, `placement_warnings`.

### 3.2 Road-Bin Model Output (`RoadBinPrediction`)

Container holding the road-network placement plan.

- **`placements`** (`tuple[RoadBinPlacement, ...]`): Selected placements along pedestrian corridors.
  - `placement_id`: Unique identifier.
  - `longitude`, `latitude`: WGS84 coordinates.
  - `source_segment_id`: Identifier of underlying mapped road segment.
  - `normalized_popularity_score`: Route score ($0 \le p \le 1$).
  - `served_location_ids`, `served_location_names`: Activity locations covered.
  - `served_location_distances_m`: Metric distance to each served location polygon.
  - `stream_type`: Station description (e.g. `"Dual-compartment station"`).
  - `stream_types`: Streams served (`("Disposable", "Recyclable")`).
  - `physical_bin_count`: Number of physical receptacles (e.g., $2$ for a dual-stream station).
  - `required_spacing_m`: Spacing constraint enforced for this placement.
- **Aggregate Counts:** `total_physical_bins`, `total_stations`, `total_eligible_candidates`.
- **Stream Breakdown:** `total_disposable_physical_bins`, `total_recyclable_physical_bins`.
- **Coverage Status:** `total_locations_requiring_coverage`, `covered_location_ids`, `uncovered_location_ids`, `covered_disposable_location_ids`, `covered_recyclable_location_ids`.
- **Dominant Streams & Radii:** `location_dominant_waste_types_by_stream`, `location_influence_radii_m_by_stream`.
- **Corridor Coverage Statistics:** `total_eligible_corridor_sections`, `covered_corridor_sections`, `uncovered_corridor_sections`.
- **Solver Metadata:** `solver_name`, `optimality_proven`, `total_popularity_score`, `warnings`, `spacing_validation_passed`, `spacing_violations`.

---

### 3.3 Conceptual JSON Output Examples

#### On-Location Output (Snippet)
```json
{
  "location_name": "Main Ground",
  "area": 8000.0,
  "daily_waste_kg_central": 560.4,
  "daily_volume_litres_central": 4210.5,
  "capacity_only_demand": { "disposable": 28, "recyclable": 25, "total": 53 },
  "rectangle_perimeter_m": 360.0,
  "perimeter_max_bins": 14,
  "physical_bins_allocated": { "disposable": 7, "recyclable": 7, "total": 14 },
  "required_emptying_turns": { "disposable": 4, "recyclable": 4, "peak": 4 },
  "capacity_shortfall_litres": 0.0,
  "placements": [
    { "bin_index": 1, "coordinates": [77.10015, 28.60015], "bin_type": "Disposable" },
    { "bin_index": 2, "coordinates": [77.10045, 28.60015], "bin_type": "Recyclable" }
  ]
}
```

#### Road-Bin Output (Snippet)
```json
{
  "total_stations": 6,
  "total_physical_bins": 12,
  "solver_name": "scipy_milp",
  "optimality_proven": true,
  "covered_locations": ["loc_1", "loc_2"],
  "uncovered_locations": [],
  "placements": [
    {
      "placement_id": "road_bin_004",
      "coordinates": [77.10120, 28.60150],
      "source_segment_id": "seg_1092",
      "normalized_popularity_score": 0.85,
      "stream_types": ["Disposable", "Recyclable"],
      "physical_bin_count": 2,
      "served_locations": ["loc_1"]
    }
  ]
}
```

---

## 4. Waste Stream Classification & Bulk Density

The bin prediction model converts predicted mass into volume because **bin capacity is measured in litres, not kilograms**.

### 4.1 Operational Stream Aggregation
The five core waste categories are partitioned into two operational streams:

$$\boxed{W_D = W_{\text{Food}} + W_{\text{Others}}} \quad (\text{Disposable Stream})$$

$$\boxed{W_R = W_{\text{Plastic}} + W_{\text{Paper}} + W_{\text{Glass}}} \quad (\text{Recyclable Stream})$$

At individual location $i$:

$$W_{i,D} = W_{i,\text{Food}} + W_{i,\text{Others}}, \qquad W_{i,R} = W_{i,\text{Plastic}} + W_{i,\text{Paper}} + W_{i,\text{Glass}}$$

### 4.2 Category-Specific Bulk Density
Bulk densities represent uncompacted, as-collected municipal waste conditions:

| Waste Category | Bulk Density ($\rho_c$) | Approximate Volume per Kilogram ($1{,}000 / \rho_c$) |
| :--- | :---: | :---: |
| **Food** | $290.0\,\text{kg/m}^3$ | $3.45\,\text{L/kg}$ |
| **Plastic** | $62.5\,\text{kg/m}^3$ | $16.00\,\text{L/kg}$ |
| **Paper** | $88.0\,\text{kg/m}^3$ | $11.36\,\text{L/kg}$ |
| **Glass** | $197.5\,\text{kg/m}^3$ | $5.06\,\text{L/kg}$ |
| **Others** | $240.0\,\text{kg/m}^3$ *(provisional proxy)* | $4.17\,\text{L/kg}$ |

### 4.3 Mass-to-Volume Conversion Formula
For waste category $c$ with predicted mass $m_c$ ($\text{kg}$):

$$\boxed{V_c = \frac{m_c}{\rho_c} \times 1{,}000} \quad (\text{litres})$$

For stream $s \in \{D, R\}$:

$$V_s = \sum_{c \in s} \frac{m_c}{\rho_c} \times 1{,}000$$

### 4.4 Why Lower-Mass Streams Demand More Bins
Consider an identical mass of $100\,\text{kg}$ for Plastic versus Food:

$$V_{\text{Plastic}} = \frac{100\,\text{kg}}{62.5\,\text{kg/m}^3} \times 1{,}000 = \mathbf{1{,}600\,\text{L}}$$

$$V_{\text{Food}} = \frac{100\,\text{kg}}{290.0\,\text{kg/m}^3} \times 1{,}000 \approx \mathbf{345\,\text{L}}$$

Even though both weigh $100\,\text{kg}$, **Plastic occupies more than $4.6\times$ the volume of Food**. Consequently, physical bin demand cannot be inferred from waste weight alone; material density and composition are decisive.

---

## 5. On-Location Bin Distribution Mathematics

### 5.1 Usable Bin Capacity
Standard event bins have a nominal capacity of $100\,\text{L}$. Applying an $80\%$ usable fill fraction to prevent litter overflow, lid obstruction, and compaction failure:

$$\boxed{C_{\text{usable}} = 100\,\text{L} \times 0.80 = \mathbf{80\,\text{L per bin per emptying turn}}}$$

### 5.2 Daily Volume & Capacity-Only Demand
Total event volume represents the cumulative festival duration. Average daily demand is:

$$V_{s,\text{daily}} = \frac{V_s}{D}$$

where $D$ is the active festival duration in days.

Capacity-only demand represents the number of bin uses required per day before applying physical perimeter constraints:

$$\boxed{N_s = \left\lceil \frac{V_{s,\text{daily}}}{80\,\text{L}} \right\rceil}$$

$$N_{\text{total}} = N_D + N_R$$

If $V_{s,\text{daily}} = 0$, then $N_s = 0$.

### 5.3 Geometric Perimeter Limit ($M$)
To avoid clustering and overcrowding, physical bins placed around an activity zone are bounded by its perimeter.

#### Geometry Processing:
1. Reproject the WGS84 GeoJSON polygon to a local metric azimuthal-equidistant CRS centered on the polygon centroid.
2. Compute the **minimum rotated bounding rectangle** (approximate best-fit rectangle).
3. Measure perimeter $P$ in metres.
4. For a `MultiPolygon` representing disjoint activity sub-zones, compute each component's bounding rectangle perimeter independently and sum them ($P = \sum P_i$) to prevent inflating perimeter across intervening empty space.

Under Bunbetsu's **25 m minimum boundary spacing policy**:

$$\boxed{M = \left\lfloor \frac{P}{25\,\text{m}} \right\rfloor}$$

*Example:* A zone with a best-fit rectangle perimeter of $250\,\text{m}$ yields:
$$M = \left\lfloor \frac{250}{25} \right\rfloor = 10 \text{ physical bins maximum}$$

### 5.4 Proportional Allocation (Largest-Remainder Method)
When capacity-only demand exceeds the geometric limit ($N > M$), the model allocates the $M$ available physical receptacles proportionally between Disposable and Recyclable streams using **Hamilton's largest-remainder method**.

#### Case A: Demand Fits ($N_D + N_R \le M$)
$$B_D = N_D, \qquad B_R = N_R$$

#### Case B: Demand Exceeds Perimeter ($N_D + N_R > M > 0$)
1. **Compute Proportional Quotas:**
   $$x_D = \frac{M \times N_D}{N_D + N_R}, \qquad x_R = \frac{M \times N_R}{N_D + N_R}$$
2. **Compute Integer Floors:**
   $$f_D = \lfloor x_D \rfloor, \qquad f_R = \lfloor x_R \rfloor$$
3. **Calculate Unallocated Bins:**
   $$r = M - (f_D + f_R)$$
4. **Evaluate Fractional Remainders:**
   $$q_D = x_D - f_D, \qquad q_R = x_R - f_R$$
5. **Assign Remaining Bins:** Assign $r$ bin(s) to the stream with the larger remainder.
6. **Deterministic Tie-Breaking:**
   - If $q_D = q_R$, award the bin to the stream with larger original demand ($N_D$ vs. $N_R$).
   - If original demands also tie, award to Disposable first.
7. **Guaranteed Invariant:**
   $$\boxed{B_D + B_R \equiv M}$$

#### Case C: Zero Perimeter Capacity ($M = 0$ and $N > 0$)
$$B_D = 0, \qquad B_R = 0$$
The model emits an explicit infeasibility warning indicating unaccommodated waste demand.

---

### 5.5 Variable Emptying Turns per Stream
When physical bin counts are perimeter-capped ($B_s < N_s$), the shortfall must be met by emptying bins multiple times per day.

For stream $s \in \{D, R\}$:

$$\boxed{T_s = \begin{cases}
0, & \text{if } N_s = 0 \text{ or } B_s = 0 \\
\max\left(1, \operatorname{round}_{\text{half-up}}\left(\frac{N_s}{B_s}\right)\right), & \text{otherwise}
\end{cases}}$$

The peak location turn requirement is:

$$T_{\text{required}} = \max(T_D, T_R)$$

This allows independent servicing schedules (e.g. food bins emptied 4 times/day while recyclables are emptied twice/day).

---

### 5.6 Capacity Coverage & Shortfall Diagnostics
For stream $s$, daily available capacity is:

$$C_s = B_s \times 80\,\text{L} \times T_s$$

Capacity shortfall represents unserved daily waste volume:

$$\boxed{S_s = \max\left(0.0, V_{s,\text{daily}} - C_s\right)}$$

$$S_{\text{total}} = S_D + S_R$$

If $S_{\text{total}} > 0$, the model exposes `capacity_shortfall_litres` and emits diagnostic warnings.

---

### 5.7 Boundary Placement Coordinates & Stream Interleaving

1. **Inward Boundary Inset:** Offsets the polygon exterior boundary inward by $1.5\,\text{m}$ in metric space to keep bins within accessible venue borders.
2. **Equidistant Sampling:** Samples $B_{\text{total}} = B_D + B_R$ points along the inset line using single-pass midpoint sampling.
3. **Stream Interleaving:** Interleaves Disposable and Recyclable labels systematically using cumulative threshold assignment:
   $$\operatorname{round}_{\text{half-up}}\left(\frac{(i + 1) \times B_D}{B_{\text{total}}}\right) > \text{assigned}_D \implies \text{Disposable, else Recyclable}$$
   This guarantees that exactly $B_D$ markers are labeled Disposable and $B_R$ Recyclable, distributed evenly without clustering.
4. **Containment Verification:** Coordinates are verified via Shapely `covers` checks in projected metric space and in WGS84 degree space after 7-decimal-place rounding.
5. **MultiPolygon Component Allocation:** For multi-part polygons, sample points are allocated proportionally to each component's inset perimeter length.

---

## 6. Road-Bin Distribution Model Mathematics

### 6.1 Purpose and System Scope
Road bins are positioned along pedestrian thoroughfares rather than perimeter borders. The model generates candidates along mapped paths, determines which activity zones they cover, and optimizes placement to minimize bins while honoring spacing and route popularity.

### 6.2 Stream-Specific Influence Radii & Dominant Waste Types
Waste bins have limited draw distances. Bunbetsu models catchment areas using outward buffer radii based on the dominant category in each stream:

| Category | Influence Radius ($R_c$) |
| :--- | :---: |
| **Food** | $100\,\text{m}$ |
| **Glass** | $100\,\text{m}$ |
| **Others** | $125\,\text{m}$ |
| **Paper** | $150\,\text{m}$ |
| **Plastic** | $150\,\text{m}$ |

For location $i$, dominant categories are determined independently:

$$t_i^D = \arg\max_{c \in \{\text{Food, Others}\}} W_{i,c}, \qquad r_i^D = R_{t_i^D}$$

$$t_i^R = \arg\max_{c \in \{\text{Plastic, Paper, Glass}\}} W_{i,c}, \qquad r_i^R = R_{t_i^R}$$

*(Ties are broken alphabetically).*

#### Influence Zone Geometry
For location polygon $B_i$, the stream influence zone is an outward Minkowski sum:

$$\boxed{I_i^s = B_i \oplus D(r_i^s)}$$

where $D(r)$ is a metric circular buffer. Road segments intersecting $I_i^s$ are eligible to serve stream $s$ for location $i$.

---

### 6.3 Road Candidate Generation & Sampling
- Mapped pedestrian road centerlines (from routing GeoJSON) are sampled at $5\,\text{m}$ intervals.
- Candidate points closer than $0.5\,\text{m}$ are deduplicated.
- Each candidate records its source segment ID, metric coordinates, route popularity score, and eligible location/stream associations.
- Inferred connectors are excluded; only eligible mapped roads host placements.

---

### 6.4 Route Popularity Scoring
Each road segment has a normalized pedestrian route-popularity score:

$$0.0 \le p \le 1.0$$

Score $1.0$ indicates highest modeled footfall traffic; $0.0$ indicates minimal modeled usage.

---

### 6.5 Existing Road-Spacing Policy
The baseline implementation enforces:

$$\text{DEFAULT\_ROAD\_BIN\_SPACING\_M} = \mathbf{25.0\,\text{m}}$$

Spacing conflicts are evaluated along continuous corridors (corridor-aware distance) across road-segment intersections, preventing bins from clustering within $25\,\text{m}$ of one another.

---

### 6.6 Proposed Variable Road-Spacing Policy
The enhanced design links minimum road spacing to route popularity tiers:

| Popularity Tier | Score Threshold ($p$) | Minimum Spacing ($d$) |
| :--- | :---: | :---: |
| **High** | $p \ge 0.60$ | **25 m** |
| **Medium** | $0.25 \le p < 0.60$ | **50 m** |
| **Low (Positive)** | $0.0 < p < 0.25$ | **100 m** |
| **Zero** | $p = 0.0$ | No placement required by popularity rule |

#### Pair-Specific Spacing
When two candidates $i$ and $j$ share a corridor:

$$\boxed{d_{\text{required}}(i, j) = \max(d_i, d_j)}$$

- High / High $\to 25\,\text{m}$
- High / Medium $\to 50\,\text{m}$
- Medium / Low $\to 100\,\text{m}$
- Low / Low $\to 100\,\text{m}$

---

### 6.7 Positive-Popularity Corridor Coverage
To ensure high-traffic routes are not left unserviced simply because a nearby quiet path satisfies location coverage, the enhanced formulation treats eligible positive-popularity corridors as mandatory coverage requirements:

1. **Location Coverage:** Every active location stream $(i, s)$ within reach must be covered by at least one selected station.
2. **Corridor Coverage:** Every eligible mapped road section with $p > 0$ inside an active influence zone must receive placement coverage respecting its spacing tier.
3. **Joint Minimization:** Stations are shared across intersecting influence zones to minimize total physical receptacles.

---

### 6.8 Physical-Bin vs. Station Accounting
- **Station ($N_{\text{stations}}$):** A physical geographic coordinate where receptacles are located.
- **Physical Bin ($N_{\text{physical}}$):** An individual stream receptacle. A dual-compartment station serving both Disposable and Recyclable waste counts as **$1$ station and $2$ physical bins**.

$$N_{\text{physical}} = N_D + N_R \ge N_{\text{stations}}$$

---

### 6.9 Solvers & Constraint Validation
The optimization problem is solved using:

1. **Exact MILP Solver (SciPy):** Binary decision variables per candidate and stream; minimizes total physical bins with popularity weight tie-breaking subject to hard coverage and spacing constraints.
2. **Greedy Fallback Solver:** Activated if SciPy is unavailable or candidate space exceeds threshold ($> 2500$); greedily selects candidates covering the most unserved requirements while strictly preserving spacing.
3. **Post-Solve Validation:** A validator checks the final solution against all spacing constraints and coverage requirements, reporting any discrepancy.

---

## 7. Variables and Equations Reference

### 7.1 On-Location Model Variables

| Symbol | Description | Units |
| :---: | :--- | :---: |
| $m_c$ | Predicted waste mass for category $c$ | $\text{kg}$ |
| $\rho_c$ | Bulk density of category $c$ | $\text{kg/m}^3$ |
| $V_c$ | Category waste volume | $\text{L}$ |
| $V_s$ | Total waste volume for stream $s$ | $\text{L}$ |
| $V_{s,\text{daily}}$ | Daily volume for stream $s$ | $\text{L/day}$ |
| $D$ | Active festival duration | $\text{days}$ |
| $C_{\text{usable}}$ | Usable capacity per bin per turn ($80\,\text{L}$) | $\text{L}$ |
| $N_s$ | Capacity-only bin demand | $\text{bins/day}$ |
| $P$ | Minimum rotated bounding rectangle perimeter | $\text{m}$ |
| $M$ | Maximum physical bins under perimeter spacing | $\text{bins}$ |
| $B_s$ | Allocated physical bins for stream $s$ | $\text{bins}$ |
| $T_s$ | Required emptying turns per day for stream $s$ | $\text{turns/day}$ |
| $C_s$ | Available daily volumetric capacity | $\text{L/day}$ |
| $S_s$ | Capacity shortfall volume | $\text{L/day}$ |

### 7.2 Road-Bin Model Variables

| Symbol / Variable | Description | Units |
| :---: | :--- | :---: |
| $B_i$ | Polygon geometry of activity location $i$ | GeoJSON |
| $r_i^s$ | Catchment influence radius for stream $s$ at location $i$ | $\text{m}$ |
| $I_i^s$ | Spatial influence zone ($B_i \oplus D(r_i^s)$) | Polygon |
| $p$ | Normalized pedestrian route-popularity score | Dimensionless ($0\text{--}1$) |
| $d_{\text{required}}$ | Required spacing between consecutive corridor placements | $\text{m}$ |
| $N_{\text{stations}}$ | Total geographic placement locations | Stations |
| $N_{\text{physical}}$ | Total physical receptacles deployed | Bins |

---

## 8. Research Basis, Evidence & Source Ledger

The bin model builds upon operational waste management literature and engineering assumptions documented in `bunbetsu_waste_predictor_source_ledger_v1.csv`:

1. **Mass-to-Volume Conversion:** Uses standard empirical bulk density ranges for uncompacted event municipal waste. (Note: The $240\,\text{kg/m}^3$ value for "Others" is a provisional engineering proxy).
2. **Usable Fill Fraction ($80\%$):** Grounded in event sanitation best practices (e.g., US EPA Special Events Guide) to mitigate overflow spillage and jamming.
3. **Perimeter Spacing ($25\text{ m}$):** Configured planning rule designed to avoid obstruction while ensuring visual bin discovery across open campus plazas.
4. **Influence Radii ($100\text{--}150\text{ m}$):** Practical catchment assumptions reflecting pedestrian willingness to carry waste before littering.
5. **Route Popularity:** Derived from network topology and shortest-path centrality scores; represents relative modeled importance, not direct sensor counts.

---

## 9. Validation Invariants & Operational Limitations

### 9.1 On-Location Validation Invariants
The engine strictly tests and enforces:
1. $V_c \equiv \frac{m_c}{\rho_c} \times 1{,}000$ for all categories.
2. $V_s \equiv \sum_{c \in s} V_c$ for Disposable and Recyclable streams.
3. $N_s \equiv \lceil V_{s,\text{daily}} / 80 \rceil$.
4. $B_D + B_R \le M$ for all valid perimeters ($M \ge 0$).
5. $B_D + B_R \equiv M$ whenever $N_D + N_R > M > 0$.
6. $T_s \ge 1$ whenever $B_s > 0$ and $N_s > 0$.
7. $S_s \ge 0$ (shortfalls are strictly non-negative).
8. Exact count matching: Count of generated coordinates $\equiv B_D + B_R$.
9. All coordinates satisfy polygon containment after WGS84 7-decimal-place coordinate rounding.

### 9.2 Road-Bin Validation Invariants
1. Placements occur exclusively on eligible mapped road geometries.
2. Candidate stream associations match location requirements.
3. Spacing constraints are strictly honored across continuous road segments.
4. Exact solver and greedy fallback enforce identical feasibility rules.
5. Stations serving both streams are accurately accounted as 1 station and 2 physical bins.

### 9.3 Operational and Site-Review Limitations
- **Average Daily Demand:** Calculations assume steady daily generation; temporal peak surges during concerts or meal times require operational monitoring.
- **Geometric vs. Physical Feasibility:** Midpoint boundary sampling does not check for doorways, emergency exits, grade/slope, terrain obstacles, or utility access.
- **Contamination Risk:** The model assumes clean stream separation. Actual recycling efficacy requires clear signage and behavioral adherence.
- **Field Site Review Mandatory:** Automated placements provide a baseline plan; final deployment requires human venue inspection.

---

## 10. End-to-End Mathematical Pipeline & Final Assessment

```
┌───────────────────────────────┐
│ Upstream Predicted Waste Mass │  (mc for Food, Plastic, Paper, Glass, Others)
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Bulk Density Conversion (ρc)  │  Vc = (mc / ρc) × 1,000
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Daily Stream Volumes (Vs,day) │  Vs,daily = (Σ Vc) / D
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Capacity-Only Demand (Ns)     │  Ns = ⌈ Vs,daily / 80 ⌉
└───────┬───────────────┬───────┘
        │               │
        ▼               ▼
┌───────────────┐ ┌──────────────────────────────────────┐
│  On-Location  │ │ Road-Bin Distribution Model          │
│  Perimeter    │ │                                      │
│  Constraint   │ │ • Dominant radii: Ii = Bi ⊕ D(ri)    │
│  M = ⌊P / 25⌋ │ │ • Candidate sampling on roads (~5 m) │
└───────┬───────┘ │ • Corridor-aware spacing (25 m)      │
        │         │ • MILP / Greedy Solver Optimization  │
        ▼         └──────────────────┬───────────────────┘
┌───────────────────────────────┐    │
│ Hamilton's Apportionment      │    │
│ BD + BR = min(M, ND + NR)     │    │
└───────┬───────────────────────┘    │
        │                            │
        ▼                            ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│ Servicing Turns & Coordinates │ │ Selected Road Bins   │
│ Ts = round(Ns / Bs)           │ │ Stations & Dual Bins │
│ 1.5 m Inset Point Sampling    │ │ Stream Coverage      │
└───────────────────────────────┘ └──────────────────────┘
```

### Final Assessment
Bunbetsu's Bin Distribution Model provides a rigorous, transparent planning framework that harmonizes solid-waste volume demands with physical spatial boundaries. By explicitly isolating capacity demand, geometric perimeter ceilings, operational emptying cycles, and road-corridor coverage, the system delivers an auditable, field-ready deployment blueprint for campus events.
