# Bunbetsu Waste Prediction Model

Deterministic mathematical planning model for estimating solid waste generation, material composition, stream categorization, and spatial distribution during university and college festivals.

---

## Table of Contents

- [1. What It Does](#1-what-it-does)
- [2. Input Structure](#2-input-structure)
- [3. Output Structure](#3-output-structure)
- [4. Objective and Product Scope](#4-objective-and-product-scope)
- [5. Core Mathematical Model](#5-core-mathematical-model)
- [6. Baseline Waste-Generation Rate](#6-baseline-waste-generation-rate)
- [7. Frozen Activity Types and Relative Weights](#7-frozen-activity-types-and-relative-weights)
- [8. Activity-Intensity Coefficients](#8-activity-intensity-coefficients)
- [9. Normalization and Weighted Intensity Formulation](#9-normalization-and-weighted-intensity-formulation)
- [10. Worked Total-Waste Calculation Example](#10-worked-total-waste-calculation-example)
- [11. Waste Composition Analysis](#11-waste-composition-analysis)
- [12. Recyclable and Disposable Waste Classification](#12-recyclable-and-disposable-waste-classification)
- [13. Spatial Allocation and Heatmap Mathematics](#13-spatial-allocation-and-heatmap-mathematics)
- [14. Empirical Evidence & Scientific Findings](#14-empirical-evidence--scientific-findings)
- [15. Research Resources & Source Ledger](#15-research-resources--source-ledger)
- [16. Evidence Dataset and Validation Findings](#16-evidence-dataset-and-validation-findings)
- [17. Implementation Architecture & System Integration](#17-implementation-architecture--system-integration)
- [18. Consolidated Modeling Assumptions](#18-consolidated-modeling-assumptions)
- [19. Limitations and Future Improvements Roadmap](#19-limitations-and-future-improvements-roadmap)
- [20. Final Status & Conclusion](#20-final-status--conclusion)

---

## 1. What It Does

The **Bunbetsu Waste Prediction Model** is a deterministic, auditable planning engine designed to estimate municipal solid waste generated across university campus festivals. It computes:

1. **Total Waste Mass ($W$):** Predicts total festival waste in kilograms ($\text{kg}$) across low, central, and high uncertainty bounds.
2. **Category-Wise Waste Composition:** Disaggregates the total waste mass into five core material streams:
   - **Food**
   - **Plastic**
   - **Paper**
   - **Glass**
   - **Others** (residual/miscellaneous solid waste)
3. **Operational Waste Stream Aggregation:** Combines categories into two actionable collection streams:
   - **Recyclable:** $\text{Plastic} + \text{Paper} + \text{Glass}$
   - **Disposable:** $\text{Food} + \text{Others}$
4. **Spatial Allocation & Heatmap Generation:** Distributes festival-level waste projections across map-selected activity zones/polygons using normalized activity contribution scores. It produces layered spatial datasets ready for frontend rendering (Total Waste, Category Streams, Recyclable, Disposable).
5. **Automated Statewise Baseline Resolution:** Automatically resolves municipal baseline solid waste generation rates from the Central Pollution Control Board (CPCB) dataset based on the campus state or union territory (with a fallback to the India national average).
6. **Downstream Integration:** Supplies deterministic waste projections directly to:
   - The **Bin Distribution Model** (`backend/models/bin_distribution_model`), which calculates physical bin counts, perimeter placement constraints, and daily emptying schedules.
   - The **Explainable AI (XAI) / RAG Layer**, providing auditable assumptions, parameters, and baseline provenance without allowing the LLM to alter numeric quantities.

> [!NOTE]
> The model is a **deterministic planning model with research-informed provisional priors**, not an empirically fitted or scientifically validated forecast engine. It intentionally contains no black-box ML or runtime recalibration routines.

---

## 2. Input Structure

The model is invoked via Python dataclasses defined in [`waste_predictor_model.py`](file:///d:/BearLabs/Projects/bunbetsu/backend/models/waste_predictor_model/waste_predictor_model.py).

### 2.1 `FestInput`

Top-level configuration object defining the festival parameters.

| Field | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `total_footfall` | `int` | Yes | Expected daily footfall attending the fest (people/day). | Must be $> 0$. |
| `duration_days` | `int` | Yes | Active duration of the festival in days. | Must be $> 0$. |
| `activities` | `tuple[str, ...]` | Yes | Tuple of festival activity names. | Must be non-empty; subset of the 6 frozen activities. |
| `campus_state` | `str` | Yes | Name of the Indian State or Union Territory of the campus. | Non-empty string; matched against CPCB records. |
| `locations` | `tuple[LocationInput, ...]` | No | Map-selected campus locations for spatial allocation. | Default `()`. If provided, each location must be valid. |

### 2.2 `LocationInput`

Represents an individual physical zone/polygon on the campus map.

| Field | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `str` | Yes | Human-readable name of the location (e.g., `"Main Ground"`). | Non-empty string. |
| `activities` | `tuple[str, ...]` | Yes | Activity tags assigned to this specific location. | Must contain at least one valid activity from `ACTIVITIES`. |
| `area` | `float` | Yes | Surface area in square metres ($\text{m}^2$). | Must be $> 0$. Retained as spatial metadata. |
| `location_id` | `str` | No | Unique identifier for frontend/map referencing. | Defaults to `""`. |
| `id` | `str` | No | Alternative unique identifier field. | Defaults to `""`. |

### 2.3 Input Example (Python)

```python
from waste_predictor_model.waste_predictor_model import FestInput, LocationInput, predict

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
            area=8_000.0,
            activities=("Food Stalls", "Music Concert"),
            location_id="loc_001",
        ),
        LocationInput(
            name="Auditorium",
            area=2_500.0,
            activities=("Performing Arts", "Literary & Fine Arts"),
            location_id="loc_002",
        ),
        LocationInput(
            name="Sports Complex",
            area=6_000.0,
            activities=("Sports",),
            location_id="loc_003",
        ),
        LocationInput(
            name="Innovation Block",
            area=3_000.0,
            activities=("Hackathon",),
            location_id="loc_004",
        ),
    ),
)

prediction = predict(inputs)
```

---

## 3. Output Structure

Calling `predict(inputs)` returns a frozen [`WastePrediction`](file:///d:/BearLabs/Projects/bunbetsu/backend/models/waste_predictor_model/waste_predictor_model.py#L423-L440) dataclass.

### 3.1 Dataclass Schemas

#### `WastePrediction`
- `total_waste_kg` (`Range`): Low, central, and high total festival waste in kg.
- `composition_kg` (`dict[str, Range]`): Waste mass per category (`"Food"`, `"Plastic"`, `"Paper"`, `"Glass"`, `"Others"`).
- `composition_percent` (`dict[str, float]`): Normalized fractional proportions for each category (sums to `1.0`).
- `recyclable_kg` (`Range`): Sum of Plastic, Paper, and Glass waste mass ranges.
- `disposable_kg` (`Range`): Sum of Food and Others waste mass ranges.
- `activity_allocations` (`tuple[ActivityAllocation, ...]`): Per-activity intensity, relative intensity, and internal waste allocations.
- `location_allocations` (`tuple[LocationWasteAllocation, ...]`): Spatial distribution across map locations.
- `heatmap_data` (`HeatmapData | None`): Structured dictionary mappings keyed by `location_id` for GIS/heatmap rendering.
- `assumptions` (`tuple[str, ...]`): Complete list of modeling assumptions applied to this run.
- `campus_state` (`str`): Resolved campus state.
- `baseline_rate_kg_per_person_day` (`float`): CPCB baseline rate used.
- `baseline_source_year` (`str`): Source publication year (e.g., `"2020-21"`).
- `baseline_rate_source` (`str`): Provenance string (e.g., `"CPCB statewise rate (Uttar Pradesh)"`).
- `baseline_is_national_fallback` (`bool`): `True` if the national average fallback was utilized.

#### Supporting Output Structures
- **`Range`**: `(low: float, central: float, high: float)` where $0 \le \text{low} \le \text{central} \le \text{high}$.
- **`Composition`**: `(food: float, plastic: float, paper: float, glass: float, others: float)` where each $\ge 0$ and $\sum = 1.0$.
- **`ActivityAllocation`**:
  - `activity`: Activity name.
  - `normalized_weight`: Normalized share among selected activities ($q_a$).
  - `intensity`: Activity-specific intensity `Range`.
  - `relative_intensity`: Normalized weight multiplied by intensity endpoints.
  - `internal_waste_range_kg`: Internal waste contribution `Range`.
- **`LocationWasteAllocation`**:
  - `location_name`: Location title.
  - `area`: Area in $\text{m}^2$.
  - `activities`: Associated activity tags.
  - `normalized_share`: Proportional share of festival waste assigned to this location ($h_l$).
  - `total_waste_kg`: Allocated total waste `Range`.
  - `composition_kg`: Allocated category breakdown `dict[str, Range]`.
  - `recyclable_kg`: Allocated recyclable waste `Range`.
  - `disposable_kg`: Allocated disposable waste `Range`.
  - `location_id`: Identifier string.
- **`HeatmapData`**:
  - `total_waste_kg`: `dict[location_id, Range]`
  - `category_waste_kg`: `dict[category_name, dict[location_id, Range]]`
  - `recyclable_kg`: `dict[location_id, Range]`
  - `disposable_kg`: `dict[location_id, Range]`

### 3.2 Output Serialization Example (Conceptual JSON)

```json
{
  "campus_state": "Uttar Pradesh",
  "baseline_rate_kg_per_person_day": 0.06266,
  "baseline_source_year": "2020-21",
  "baseline_rate_source": "CPCB statewise rate (Uttar Pradesh)",
  "baseline_is_national_fallback": false,
  "total_waste_kg": {
    "low": 2486.35,
    "central": 2988.88,
    "high": 3491.42
  },
  "composition_percent": {
    "Food": 0.3531,
    "Plastic": 0.1388,
    "Paper": 0.1088,
    "Glass": 0.0519,
    "Others": 0.3475
  },
  "composition_kg": {
    "Food": { "low": 877.99, "central": 1055.45, "high": 1232.90 },
    "Plastic": { "low": 344.98, "central": 414.71, "high": 484.44 },
    "Paper": { "low": 270.39, "central": 324.97, "high": 379.55 },
    "Glass": { "low": 128.98, "central": 155.05, "high": 181.12 },
    "Others": { "low": 864.01, "central": 1038.70, "high": 1213.40 }
  },
  "recyclable_kg": {
    "low": 744.35,
    "central": 894.73,
    "high": 1045.11
  },
  "disposable_kg": {
    "low": 1742.00,
    "central": 2094.15,
    "high": 2446.30
  },
  "location_allocations": [
    {
      "location_id": "loc_001",
      "location_name": "Main Ground",
      "normalized_share": 0.5625,
      "total_waste_kg": { "low": 1398.57, "central": 1681.25, "high": 1963.92 }
    }
  ]
}
```

---

## 4. Objective and Product Scope

Bunbetsu estimates solid waste expected during a college fest, including total quantity, material composition, and relative distribution across selected campus locations.

### Workflow
1. **Campus Resolution:** Identify college campus and its geographical state/UT.
2. **Zone Tagging:** Select campus regions on the interactive map.
3. **Activity Assignment:** Assign one or more activities to each region.
4. **Exposure Parameters:** Enter expected daily footfall and fest duration.
5. **Baseline Resolution:** Resolve baseline municipal waste-generation rate from campus state.
6. **Prediction:** Predict total waste and category-wise quantities across uncertainty bounds.
7. **Spatial Allocation:** Allocate predicted waste across activities and locations for heatmaps.
8. **Downstream Handoff:** Pass location-wise projections to the bin-planning system.
9. **Explainability:** Use the XAI/RAG layer to explain model mechanics, assumptions, and source evidence.

> [!IMPORTANT]
> The mathematical model is the **strict source of truth for quantities**. The LLM explainability layer may explain predictions but must never arbitrarily modify numerical outputs.

---

## 5. Core Mathematical Model

The governing formulation is:

$$\boxed{W = F \times D \times R \times I}$$

| Variable | Meaning | Unit |
| :---: | :--- | :---: |
| $W$ | Total solid waste generated over the entire fest | $\text{kg}$ |
| $F$ | Expected daily footfall | $\text{people/day}$ |
| $D$ | Number of active fest days | $\text{days}$ |
| $R$ | Baseline municipal solid waste generation rate | $\text{kg/person/day}$ |
| $I$ | Weighted activity-intensity multiplier | $\text{dimensionless}$ |

### Formulation Decomposition
The equation separates exposure from event activity dynamics:

$$\underbrace{F \times D}_{\text{attendee-day exposure } (A)} \times \underbrace{R}_{\text{baseline rate}} \times \underbrace{I}_{\text{activity adjustment}}$$

### Footfall and Duration Exposure
Expected footfall ($F$) applies to **each active fest day**, representing daily attendance rather than total unique festival visitors:

$$A = F \times D$$

*Example:* A 3-day fest with an expected daily footfall of 12,000 yields:
$$A = 12{,}000 \times 3 = 36{,}000 \text{ attendee-days}$$

**Critical Invariant:** Festival duration ($D$) is applied exactly once to determine attendee-day exposure. It is never multiplied into the formula again as an activity-level adjustment.

---

## 6. Baseline Waste-Generation Rate

The baseline rate ($R$) represents the municipal solid waste (MSW) generation rate used as an anchor before applying activity intensity adjustments.

### Automated State-Based Resolution Flow
1. Obtain campus State or Union Territory from structured location data.
2. Look up the corresponding rate in `CPCB_STATEWISE_RATES_KG_PER_PERSON_DAY` ([`cpcb_statewise_rates.py`](file:///d:/BearLabs/Projects/bunbetsu/backend/models/waste_predictor_model/cpcb_statewise_rates.py)).
3. Apply aliases and case-insensitive matching (e.g., mapping `"Orissa"` $\to$ `"Odisha"`, `"NCT of Delhi"` $\to$ `"Delhi"`).
4. If the state is recognized but its rate is unrecorded (e.g., Ladakh = `None`) or unrecognized, apply the **India National Average Fallback**.
5. Return the applied rate, publication year, and source metadata alongside the prediction.

### Reference Rates & Fallback
- **National Average Fallback (CPCB 2020–21):**
  $$\mathbf{0.11907 \text{ kg/person/day}} \quad (119.07 \text{ g/person/day})$$
- If the campus state itself cannot be identified, the system must request resolution rather than guessing.

### Context and Data-Quality Caveats
- The CPCB baseline is a **municipal reference proxy**, not an event-measured rate. Festival waste is not mathematically bound to exceed the baseline.
- **Reporting Year Caveat:** Statewise rates in CPCB's 2020–21 Annual Report were published in graphical form (Figure 5 / Annexure II). While CPCB 2021–22 reports an updated national average of $123.45\text{ g/person/day}$, its statewise per-capita figures also remain graphical without an official tabular dataset. Rates from different reporting years must not be mixed without documenting the inconsistency.

---

## 7. Frozen Activity Types and Relative Weights

Six activity types are recognized. Legacy labels (*"Dance & Theatre"* and *"Debate"*) were superseded by *"Performing Arts"* and *"Literary & Fine Arts"*.

| Activity | Predefined Weight ($w_a$) | Normalized Weight ($q_a$) (All 6 Selected) |
| :--- | :---: | :---: |
| **Food Stalls** | 5 | $31.25\%$ |
| **Music Concert** | 4 | $25.00\%$ |
| **Performing Arts** | 3 | $18.75\%$ |
| **Literary & Fine Arts** | 2 | $12.50\%$ |
| **Sports** | 1 | $6.25\%$ |
| **Hackathon** | 1 | $6.25\%$ |
| **Total** | **16** | **100.00%** |

> [!NOTE]
> Weights are **fixed internal model parameters**, not user inputs or attendance estimates. They represent the provisional relative contribution of each activity toward overall waste intensity and spatial distribution.

---

## 8. Activity-Intensity Coefficients

Each activity has research-informed low, central, and high intensity multipliers.

| Activity | Low ($I_{a,L}$) | Central ($I_{a,C}$) | High ($I_{a,H}$) |
| :--- | :---: | :---: | :---: |
| **Food Stalls** | 1.50 | 1.70 | 1.90 |
| **Music Concert** | 1.20 | 1.35 | 1.50 |
| **Performing Arts** | 1.00 | 1.15 | 1.30 |
| **Sports** | 1.10 | 1.30 | 1.50 |
| **Literary & Fine Arts** | 0.80 | 0.90 | 1.00 |
| **Hackathon** | 0.90 | 1.05 | 1.20 |

### Rationale for Ranges
The uncertainty band reflects empirical variation observed across literature:
- Catering and stage zones consistently exhibit elevated littering and waste generation compared to sedentary activities.
- Literary, fine arts, and hackathon values are provisional analogies due to sparse empirical event audit data.
- **Caveat:** Ranges represent parameter uncertainty; they are **not statistical confidence intervals** (e.g., they do not claim 95% coverage).

---

## 9. Normalization and Weighted Intensity Formulation

Let $S$ be the set of activities selected for the festival. For activity $a \in S$, its normalized contribution weight is:

$$q_a = \frac{w_a}{\sum_{j \in S} w_j}, \quad \text{such that} \quad \sum_{a \in S} q_a = 1$$

### Weighted Intensity Calculation
The model computes the weighted mean independently for each endpoint:

$$I_L = \sum_{a \in S} q_a I_{a,L}, \quad I_C = \sum_{a \in S} q_a I_{a,C}, \quad I_H = \sum_{a \in S} q_a I_{a,H}$$

**Why a Weighted Mean Instead of a Sum?**
A direct summation would artificially inflate the multiplier simply because more activity tags were selected. The weighted mean preserves the multiplier on the proper empirical scale of individual activity intensities.

### Worked Example: All Six Activities
$$\begin{aligned}
I_C &= \frac{5(1.70) + 4(1.35) + 3(1.15) + 2(0.90) + 1(1.30) + 1(1.05)}{16} \\
&= \frac{8.50 + 5.40 + 3.45 + 1.80 + 1.30 + 1.05}{16} = \frac{21.20}{16} = \mathbf{1.325}
\end{aligned}$$

Using the same weights for low and high:
- $I_L = \frac{5(1.50) + 4(1.20) + 3(1.00) + 2(0.80) + 1(1.10) + 1(0.90)}{16} = \frac{18.90}{16} = \mathbf{1.18125}$
- $I_H = \frac{5(1.90) + 4(1.50) + 3(1.30) + 2(1.00) + 1(1.50) + 1(1.20)}{16} = \frac{23.60}{16} = \mathbf{1.475}$

---

## 10. Worked Total-Waste Calculation Example

Assume the following illustrative inputs:
- Daily footfall: $F = 12{,}000 \text{ people/day}$
- Duration: $D = 3 \text{ days}$
- Baseline rate: $R = 0.20 \text{ kg/person/day}$ *(illustrative benchmark)*
- All 6 activities selected: $I = (1.18125, 1.325, 1.475)$

### Total Waste Projections
- **Central:**
  $$W_C = 12{,}000 \times 3 \times 0.20 \times 1.325 = \mathbf{9{,}540 \text{ kg}} \quad (9.54 \text{ tonnes})$$
- **Low:**
  $$W_L = 12{,}000 \times 3 \times 0.20 \times 1.18125 = \mathbf{8{,}505 \text{ kg}} \quad (8.505 \text{ tonnes})$$
- **High:**
  $$W_H = 12{,}000 \times 3 \times 0.20 \times 1.475 = \mathbf{10{,}620 \text{ kg}} \quad (10.62 \text{ tonnes})$$

---

## 11. Waste Composition Analysis

The model evaluates waste across five distinct material categories.

### Central Composition Priors by Activity

| Activity | Food | Plastic | Paper | Glass | Others | Total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Food Stalls** | $50\%$ | $15\%$ | $10\%$ | $5\%$ | $20\%$ | $100\%$ |
| **Music Concert** | $25\%$ | $12\%$ | $10\%$ | $8\%$ | $45\%$ | $100\%$ |
| **Performing Arts** | $25\%$ | $12\%$ | $12\%$ | $5\%$ | $46\%$ | $100\%$ |
| **Sports** | $35\%$ | $15\%$ | $10\%$ | $5\%$ | $35\%$ | $100\%$ |
| **Literary & Fine Arts** | $25\%$ | $15\%$ | $10\%$ | $3\%$ | $47\%$ | $100\%$ |
| **Hackathon** | $25\%$ | $15\%$ | $15\%$ | $2\%$ | $43\%$ | $100\%$ |

### Weighted Composition Formula
For waste category $c \in \{\text{Food, Plastic, Paper, Glass, Others}\}$:

$$p_c = \sum_{a \in S} q_a p_{a,c}, \quad \text{guaranteeing} \quad \sum_c p_c = 1.0$$

### Converting Composition into Mass
Category masses are calculated by scaling the total predicted waste endpoints by the central category proportion:

$$W_c = W \times p_c$$

*Example:* If $W_C = 9{,}540\text{ kg}$ and $p_{\text{Food}} = 35\%$:
$$W_{\text{Food}, C} = 9{,}540 \times 0.35 = 3{,}339\text{ kg}$$

---

## 12. Recyclable and Disposable Waste Classification

Bunbetsu applies a fixed operational aggregation:

$$\boxed{W_{\text{recyclable}} = W_{\text{plastic}} + W_{\text{paper}} + W_{\text{glass}}}$$

$$\boxed{W_{\text{disposable}} = W_{\text{food}} + W_{\text{others}}}$$

### Operational Context
- **Food** is strictly a waste category, never an activity.
- **Others** covers mixed packaging, sanitary, composite, and residual municipal solid waste.
- This grouping represents Bunbetsu's **operational field-sorting requirements** for physical bin provisioning, rather than a universal material recovery specification.

---

## 13. Spatial Allocation and Heatmap Mathematics

Spatial allocation distributes fest-level waste across individual map locations for relative visualization.

### Step 1: Location Activity Score
For location $l$ with assigned activity set $S_l$:

$$s_l = \sum_{a \in S_l} w_a$$

### Step 2: Normalized Spatial Share
For $n$ mapped locations:

$$h_l = \frac{s_l}{\sum_{k=1}^n s_k}, \quad \text{satisfying} \quad \sum_{l=1}^n h_l = 1.0$$

### Step 3: Location Waste Allocation
Total and category waste are allocated conservatively:

$$W_l = h_l W, \quad W_{l,c} = W_l p_c$$

$$\sum_{l=1}^n W_l \equiv W \quad (\text{conserves total festival mass})$$

### Invariant Rules
- **Duplicate Activity-Set Rule:** If two locations have identical activity tags, their scores $s_l$ are identical, and they receive identical spatial shares regardless of their physical area.
- **Area Treatment:** Physical area ($\text{m}^2$) is maintained as spatial metadata for GIS queries but is **not used as a multiplier** in waste mass calculations (as no defensible area-to-waste empirical elasticity exists).
- **Heatmap Layers:** Structured exports support layers for Total Waste, Food, Plastic, Paper, Glass, Others, Recyclable, and Disposable streams.

---

## 14. Empirical Evidence & Scientific Findings

Our research investigated five fundamental event waste dynamics:

1. **Footfall vs. Total Waste:** Footfall serves as a primary exposure variable. However, literature shows that per-capita waste varies inversely with event size in small-scale events (e.g., Dodds & Walsh reported $r = -0.630, p = 0.002$ across Canadian festivals), and camping festivals generate nearly $2\times$ the waste of non-camping events ($1.3\text{--}1.4\text{ kg}$ vs $0.5\text{--}0.8\text{ kg/attendee/day}$, *A Greener Future*).
2. **Duration vs. Total Waste:** Duration acts linearly on exposure ($F \times D$). Multi-day normalizations require caution regarding whether attendance refers to unique visitors, ticket scans, or daily entries.
3. **Activity Type vs. Intensity:** Outdoor festival litter studies (e.g., German festival GIS research) prove litter density is concentrated around stages, food plazas, and thoroughfares rather than perimeter zones.
4. **Activity Type vs. Composition:** Food-service zones generate high organic waste and disposable packaging (Whole Earth Festival, UC Davis documented $0.22\text{ kg/person/day}$ reduced by 27% via reusable dishware).
5. **Additional Parameters:** Reusable dishware, camping accommodations, and vendor packaging rules substantially alter generation rates. Area alone does not reliably predict waste quantity.

### Evidence Strength Matrix

| Claim / Component | Empirical Strength | Status in Bunbetsu |
| :--- | :---: | :--- |
| Footfall & duration as primary exposure ($F \times D$) | **Moderate to Strong** | Core model foundation |
| Waste rates vary by event type & boundary | **Strong** | Acknowledged; provisional baseline used |
| Composition differs across activity zones | **Moderate to Strong** | Modeled via activity composition priors |
| Activity classes have relative intensity differences | **Moderate** | Modeled via relative intensity priors |
| Exact intensity values for Bunbetsu's 6 activities | **Weak / Provisional** | Research-informed provisional priors |
| Exact 5-category composition percentages | **Weak / Provisional** | Literature-synthesized priors |
| Universal waste rate across all college fests | **Not Supported** | Rejected; state baselines used |
| Empirically calibrated activity contribution weights | **Not Supported** | Provisional weights ($5:4:3:2:1:1$) |
| Area alone determines waste volume | **Not Established** | Excluded from mass calculation |

---

## 15. Research Resources & Source Ledger

1. **CPCB Annual Report on Solid Waste Management (2020–21):** Primary source for statewise per-capita municipal waste generation baselines ([CPCB Report](https://cpcb.nic.in/uploads/MSW/MSW_AnnualReport_2020-21.pdf)).
2. **CPCB Annual Report on Solid Waste Management (2021–22):** Reference for updated national average ($123.45\text{ g/person/day}$) ([CPCB Report](https://cpcb.nic.in/uploads/MSW/MSW_AnnualReport_2021-22.pdf)).
3. **Cape Town 2010 FIFA World Cup Green Goal Legacy Report:** Venue-specific waste streams, fan fest comparisons, and boundary reconciliation ([Resource Page](https://www.dffe.gov.za/ccaq_projectsprogrammes_gegesd.legacy_2010fifaworldcup)).
4. **Litter Management at Festivals in Semi-Natural Landscapes:** GIS spatial distribution of litter across festival zones (*ScienceDirect*, 2011).
5. **Whole Earth Festival, UC Davis:** Campus festival waste audits evaluating reusable dishware interventions (*ResearchGate*).
6. **US EPA Special Event Best Practices Guide:** Event waste characterization, recycling infrastructure, and vendor prevention guidelines ([EPA Guide](https://www.epa.gov/system/files/documents/2026-03/zero-waste-special-event-best-practices-guide.pdf)).
7. **Victorian Event Waste Guide Review:** Guidelines for event waste infrastructure and site planning ([Sustainability Victoria](https://assets.sustainability.vic.gov.au/susvic/Improving-event-waste-management-in-north-east-victoria_Alpine-Shire-Council_20220223.pdf)).
8. **A Greener Future Festival Reports:** Multi-year benchmarks on camping vs. non-camping festival waste rates ([A Greener Future](https://agreenerfuture.com/)).

---

## 16. Evidence Dataset and Validation Findings

Model plausibility was evaluated against empirical observations from published festival audits (`bunbetsu_evidence_phase1.csv`).

### Event Observations Summary

| Event / Dataset | Observed Footfall / Duration | Reported Waste | Key Limitations |
| :--- | :--- | :--- | :--- |
| **Hyderabad Marathon 2024** | 15,000 attendees | 4,062 kg | Managed waste, not total generated. |
| **Hyderabad Marathon 5K 2024** | 10,000 attendees | 810.5 kg | Managed boundary only. |
| **Kaushal Mahotsav 2023** | 9,000 attendees | 276.8 kg | Job fair format; metric differences. |
| **Whole Earth Festival** | Campus festival | ~0.22 kg/person/day | Reusable ware intervention active. |
| **Rheinkultur** | Single-day festival | ~0.30 kg/attendee/day | Venue boundary and cleanup differences. |
| **Fusion Festival** | Multi-day festival | ~0.29 kg/attendee/day | Multi-day denominator interpretation. |
| **Wacken Open Air** | Multi-day camping fest | ~2.67 kg/attendee/day | Extensive camping and gear abandonment. |
| **Oktoberfest 2025** | 6.5M visitors / 16 days | 764,000 kg | Derived rate depends on visitor-day counts. |

### Earlier Validation Benchmark
Initial uncalibrated validation across diverse event scales produced:
- **Interval Coverage:** $0\%$ on eligible multi-scale observations.
- **Mean Absolute Error (MAE):** $\approx 290{,}056.5\text{ kg}$
- **Root Mean Squared Error (RMSE):** $\approx 456{,}169.3\text{ kg}$

*Diagnostic Examples:*
- Rheinkultur: Observed $51{,}000\text{ kg}$ vs. Predicted $28{,}332\text{ kg}$
- Fusion Festival: Observed $70{,}000\text{ kg}$ vs. Predicted $9{,}999\text{ kg}$
- Wacken Open Air: Observed $800{,}000\text{ kg}$ vs. Predicted $12{,}499\text{ kg}$

### Key Calibration Insights
1. **Unidentifiable Activity Weights:** Total waste records from single-activity venues cannot isolate multi-activity relative weights.
2. **Unidentifiable Composition:** Published event reports rarely publish audited 5-category mass breakdowns.
3. **Camping & Footprint Dominance:** Camping festivals (e.g., Wacken) operate under radically different regimes than non-residential college fests.
4. **Decision:** Bunbetsu maintains **frozen research-informed priors** rather than fabricating ungrounded numerical calibrations.

---

## 17. Implementation Architecture & System Integration

### Campus State Resolution Pipeline
1. `backend/map/nominatim.py` queries OpenStreetMap/Nominatim with `addressdetails=1`.
2. `backend/map/campus.py` extracts structured address properties (`state`, `state_district`).
3. `backend/api/map_api.py` exposes structured campus metadata to the frontend.
4. `frontend/src/services/campusApi.ts` supplies the structured `campus_state` to the prediction endpoint.
5. `waste_predictor_model.py` canonicalizes the state and resolves the baseline CPCB rate.

### Architectural Boundary: Model vs. XAI/RAG
```
┌────────────────────────────────┐
│   Nominatim / Campus Service   │
└───────────────┬────────────────┘
                │ campus_state
                ▼
┌────────────────────────────────┐
│    Waste Prediction Model      │ ◄── Deterministic Truth (W = F × D × R × I)
└───────────────┬────────────────┘
                │ WastePrediction
        ┌───────┴────────────────┐
        ▼                        ▼
┌───────────────┐        ┌───────────────┐
│ Bin Planning  │        │   XAI / RAG   │ (Explains assumptions & provenance;
│ Model (Bins)  │        │  Explanation  │  CANNOT modify quantities)
└───────────────┘        └───────────────┘
```

---

## 18. Consolidated Modeling Assumptions

1. **Footfall Meaning:** Expected footfall ($F$) applies to each active fest day.
2. **Linear Exposure:** Duration ($D$) multiplies footfall exactly once ($A = F \times D$).
3. **Operational Scope:** Includes attendee, vendor, organizer, and back-of-house waste during active festival operation.
4. **Exclusions:** Setup, staging, construction, and post-fest teardown waste are excluded.
5. **Activity Tags:** Activities represent qualitative functional tags, not exact headcount allocations.
6. **Multi-Tagging:** Multiple activities may occur in one location, and an activity can span multiple locations.
7. **Provisional Weights:** Predefined contribution weights are fixed at $5:4:3:2:1:1$.
8. **Provisional Intensities:** Intensity bands are research-informed priors, not empirically calibrated truths.
9. **Provisional Compositions:** Category percentages are central priors synthesized from literature.
10. **Composition Invariant:** Weighted composition fractions strictly sum to $1.0$.
11. **Baseline as Proxy:** CPCB baseline is a municipal proxy, not a festival-specific lower bound.
12. **State Prioritization:** State-specific CPCB baseline is preferred over national fallback.
13. **No Baseline Guessing:** If the campus state cannot be identified, the model rejects execution rather than guessing.
14. **Area Neutrality:** Polygon area is metadata and does not scale waste mass.
15. **Spatial Heuristic:** Location allocation is a weight-based visualization heuristic, not a localized forecast.
16. **Identical Location Tagging:** Locations with identical activity sets receive equal spatial shares.
17. **Recyclable Definition:** Recyclable waste is defined as $\text{Plastic} + \text{Paper} + \text{Glass}$.
18. **Disposable Definition:** Disposable waste is defined as $\text{Food} + \text{Others}$.
19. **Mass Conservation:** Spatial and activity allocations strictly conserve total festival waste mass.
20. **Boundary Vigilance:** External audit comparisons must account for differences between managed, collected, and littered waste.
21. **No Runtime Recalibration:** Model execution is completely deterministic and static.
22. **LLM Invariance:** The XAI/LLM layer must never modify predicted numerical values.
23. **Range Interpretation:** Low/high bounds express parameter uncertainty, not formal confidence intervals.

---

## 19. Limitations and Future Improvements Roadmap

The primary engineering and research priorities for subsequent iterations include:

- [ ] **Tabular Verification of CPCB Rates:** Validate each state/UT figure against official numeric publications to eliminate graphical interpolation artifacts.
- [ ] **Empirical College Fest Waste Audits:** Gather ground-truth datasets from Indian college fests recording daily footfall, duration, total mass, and 5-category audited sorting.
- [ ] **Boundary Standardization:** Standardize measurement definitions across generated, collected, managed, and littered waste.
- [ ] **Denominators Standardization:** Clarify visitor counts across ticket scans, unique visitors, and turnstile entries.
- [ ] **Multi-Activity Calibration:** Collect multi-zone audit data to calibrate relative activity contribution weights ($w_a$).
- [ ] **Heatmap Empirical Validation:** Compare weight-allocated spatial predictions against actual bin weights across campus zones.
- [ ] **Event-Specific Baselines:** Evaluate whether university campus operational waste rates offer a more accurate anchor than municipal per-capita averages.

---

## 20. Final Status & Conclusion

The Bunbetsu Waste Prediction Model provides a transparent, deterministic mathematical foundation for event solid-waste estimation. Its core formulation balances attendee-day exposure, municipal baseline anchors, activity intensities, material compositions, and spatial allocations.

Its present limitations stem from empirical data availability rather than algebraic structure. By maintaining strict separation between mathematical prediction, physical bin distribution, and natural-language explanation, the system ensures complete auditability while providing a clear pathway for empirical calibration as field audit data becomes available.
