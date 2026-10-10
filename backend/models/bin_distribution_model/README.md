# Bunbetsu On-Location Bin Distribution Model

## Overview

The Bunbetsu on-location bin distribution model translates location-level waste predictions into concrete, perimeter-bounded physical bin counts, variable daily emptying turn requirements, and polygon-constrained coordinate placements.

The underlying mathematical waste prediction model (`waste_predictor_model.py`) remains frozen and unmodified.

---

## 1. Core Model Equations

### 1.1 Usable Bin Capacity
Physical bins are standardized 100 L public receptacles. With an 80% usable fill fraction before overflow or compaction limits:

$$\text{usable capacity per bin per use} = 100\,\text{L} \times 0.80 = 80\,\text{L}$$

The model does not force a fixed number of emptying cycles per day. Instead, emptying frequency is dynamically calculated based on predicted waste demand and physical perimeter constraints.

### 1.2 Capacity-Only Demand ($N$)
Given predicted category waste masses converted to bulk volume via empirical bulk density references ($\text{kg/m}^3$) and divided by the event duration ($\text{duration\_days}$):

$$N = \left\lceil \frac{\text{predicted daily waste volume (L)}}{\text{usable capacity per bin per use (80 L)}} \right\rceil$$

If predicted daily waste volume is zero, $N = 0$.

$N$ represents the number of capacity-equivalent bin uses needed per day before considering physical perimeter constraints.

### 1.3 Best-Fit Rectangle Perimeter ($P$)
Each activity location geometry (GeoJSON Polygon or MultiPolygon in WGS84 coordinates) is projected to a local metric azimuthal-equidistant CRS. The minimum rotated bounding rectangle (approximate best-fit rectangle) is computed in projected metres:

$$P = \text{minimum rotated rectangle perimeter (metres)}$$

For **MultiPolygon** geometries representing disconnected activity zones, the minimum rotated rectangle perimeter is calculated independently for each constituent polygon component and summed:

$$P = \sum_{i} P_i$$

This prevents treating the empty space between disconnected zones as a usable placement perimeter, ensuring that aggregate physical capacity is not artificially inflated.

### 1.4 Maximum Physical Bin Count ($M$)
Physical bin density is constrained by Bunbetsu's **25 m minimum perimeter spacing policy**:

$$M = \left\lfloor \frac{P}{25\,\text{m}} \right\rfloor$$

Perimeter spacing serves as a physical upper bound ($M$), not an additive minimum. If $M = 0$ (e.g. for small zones where perimeter $< 25\,\text{m}$), the model does not force a placement and emits an explicit infeasibility warning.

### 1.5 Final Physical Bin Count
For each demand scenario (low, central, high):

$$\text{physical bins} = \begin{cases} 0 & \text{if } N = 0 \text{ or } M = 0 \\ \min(N, M) & \text{if } M > 0 \text{ and } N > 0 \end{cases}$$

If an optional spatial minimum override ($S$) is provided, desired demand is $\max(N, S)$, still capped strictly at $M$.

### 1.6 Variable Emptying Turns
When physical bin capacity $M$ satisfies or exceeds waste demand ($M \ge N$), one capacity-equivalent use per bin per day is sufficient:

$$\text{required turns} = 1 \quad (\text{for } N > 0 \text{ and } M \ge N)$$

When waste demand exceeds physical bin capacity ($N > M$), dynamic emptying turns are calculated using conventional half-up rounding (ties with fractional part $\ge 0.5$ round up):

$$\text{required turns} = \text{round}\left( \frac{N}{\text{physical bins}} \right) \quad (\text{when } N > M)$$

A "capacity-equivalent use" or "emptying turn" includes the initial filling period. The number of additional emptying operations during the day is $\text{required turns} - 1$.

### 1.7 Capacity Coverage and Shortfall Diagnostic
Nearest-integer rounding can leave a daily capacity shortfall when the fraction rounds down (e.g. $N = 7, M = 3 \implies 7/3 \approx 2.33 \to 2$ turns, yielding $3 \times 80 \times 2 = 480\,\text{L}$, leaving an uncovered deficit of $80\,\text{L}$):

$$\text{available daily capacity} = \text{physical bins} \times 80\,\text{L} \times \text{required turns}$$

$$\text{capacity shortfall} = \max\left(0.0,\, \text{predicted daily volume} - \text{available daily capacity}\right)$$

Whenever a shortfall occurs, the model reports `capacity_shortfall_litres` and emits an explicit placement warning.

---

## 2. Spatial Placement Logic

1. **Inward-Offset Exterior Boundary**: Markers are placed strictly along the actual inward-offset exterior boundary of the location polygon (default $1.5\,\text{m}$ inset), **not** along the bounding rectangle. The rectangle is used solely to evaluate perimeter capacity.
2. **Even Midpoint Sampling**: Points are sampled at regular intervals along exterior boundary rings, avoiding vertex corners.
3. **Rigorous Containment Validation**: Every generated coordinate pair is verified in projected metric space and in WGS84 degree space after 7-decimal-place rounding (`covers` check).
4. **MultiPolygon Distribution**: For MultiPolygon geometries, markers are allocated proportionally to each component's inset perimeter length, ensuring no component receives more bins than its perimeter can physically support.

---

## 3. Assumptions and Operational Limitations

- **Policy Status**: The 25 m distance is Bunbetsu's configured planning policy, not a universal statutory standard. Local accessibility regulations, crowd dynamics, and fire codes take precedence.
- **Daily Average Basis**: Bin sizing and emptying requirements reflect average daily volume over the fest duration. Peak-hour surges and burst periods require on-site monitoring.
- **Site Review Required**: The model samples geometric boundaries; it does not check doorways, terrain slope, utility access, emergency ingress/egress routes, or vendor access corridors. Placements must be verified during site layout.
- **Stream Allocation**: The spatial model predicts total physical bin deployment. Specific stream splits (recyclable, compost, landfill) depend on vendor contracts and local waste handling protocols.

