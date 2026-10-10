# Bunbetsu On-Location Bin Distribution Model

## Overview

The Bunbetsu on-location bin distribution model translates location-level waste predictions into concrete, perimeter-bounded physical bin counts for **disposable waste** and **recyclable waste**, variable daily emptying turn requirements per stream, and polygon-constrained coordinate placements.

The underlying mathematical waste prediction model (`waste_predictor_model.py`) remains frozen and unmodified.

---

## 1. Waste Stream Classification

Predicted category waste masses over the event duration are divided by `duration_days` to calculate average daily demand and converted to bulk volume using category-specific bulk density references ($\text{kg/m}^3$):

- **Disposable Stream ($V_{\text{disposable}}$):** Food waste ($290\,\text{kg/m}^3$) + Other waste ($240\,\text{kg/m}^3$ provisional proxy).
- **Recyclable Stream ($V_{\text{recyclable}}$):** Recyclable materials comprising Plastic ($62.5\,\text{kg/m}^3$) + Paper ($88.0\,\text{kg/m}^3$) + Glass ($197.5\,\text{kg/m}^3$).

Total daily volume is:
$$V_{\text{total}} = V_{\text{disposable}} + V_{\text{recyclable}}$$

---

## 2. Core Model Equations

### 2.1 Usable Bin Capacity
Physical bins are standardized 100 L public receptacles. With an 80% usable fill fraction before overflow or compaction limits:

$$\text{usable capacity per bin per turn } (C_{\text{usable}}) = 100\,\text{L} \times 0.80 = 80\,\text{L}$$

The model does not force a fixed number of emptying cycles per day. Instead, emptying frequency is dynamically calculated based on predicted waste demand and physical perimeter constraints.

### 2.2 Capacity-Only Demand by Stream
For each stream, capacity-only demand represents the number of capacity-equivalent bin uses needed per day before physical perimeter constraints:

$$N_{\text{disposable}} = \left\lceil \frac{V_{\text{disposable}}}{C_{\text{usable}}} \right\rceil$$

$$N_{\text{recyclable}} = \left\lceil \frac{V_{\text{recyclable}}}{C_{\text{usable}}} \right\rceil$$

Total capacity demand is defined consistently as the sum of stream demands:
$$N = N_{\text{disposable}} + N_{\text{recyclable}}$$

If a stream has zero waste volume, its capacity demand is zero.

### 2.3 Best-Fit Rectangle Perimeter ($P$)
Each activity location geometry (GeoJSON Polygon or MultiPolygon in WGS84 coordinates) is projected to a local metric azimuthal-equidistant CRS. The minimum rotated bounding rectangle (approximate best-fit rectangle) is computed in projected metres:

$$P = \text{minimum rotated rectangle perimeter (metres)}$$

For **MultiPolygon** geometries representing disconnected activity zones, the minimum rotated rectangle perimeter is calculated independently for each constituent polygon component and summed:

$$P = \sum_{i} P_i$$

This prevents treating the empty space between disconnected zones as a usable placement perimeter, ensuring that aggregate physical capacity is not artificially inflated.

### 2.4 Maximum Physical Bin Count ($M$)
Physical bin density is constrained by Bunbetsu's **25 m minimum perimeter spacing policy**:

$$M = \left\lfloor \frac{P}{25\,\text{m}} \right\rfloor$$

Perimeter spacing serves as a physical upper bound ($M$), not an additive minimum. If $M = 0$ (e.g. for small zones where perimeter $< 25\,\text{m}$), the model does not force a placement and emits an explicit infeasibility warning.

### 2.5 Proportional Physical Bin Allocation (Largest-Remainder Method)

#### Case A: Demand fits ($N \le M$)
When perimeter capacity satisfies total capacity demand:
$$B_{\text{disposable}} = N_{\text{disposable}}$$
$$B_{\text{recyclable}} = N_{\text{recyclable}}$$
$$B_{\text{total}} = B_{\text{disposable}} + B_{\text{recyclable}} = N$$

#### Case B: Demand exceeds perimeter capacity ($N > M$ and $M > 0$)
Both stream demands are scaled proportionally to $M$:
$$\text{scaled}_{\text{disposable}} = \frac{M \times N_{\text{disposable}}}{N}$$
$$\text{scaled}_{\text{recyclable}} = \frac{M \times N_{\text{recyclable}}}{N}$$

Counts are converted to integers using the **largest-remainder method** (Hamilton's method):
1. Compute integer floors: $f_{\text{disp}} = \lfloor \text{scaled}_{\text{disposable}} \rfloor$, $f_{\text{rec}} = \lfloor \text{scaled}_{\text{recyclable}} \rfloor$.
2. Compute unallocated bins: $\text{remaining} = M - (f_{\text{disp}} + f_{\text{rec}})$.
3. Assign the remaining bin(s) to the stream with the larger fractional remainder:
   $$\text{rem}_{\text{disp}} = \text{scaled}_{\text{disposable}} - f_{\text{disp}}$$
   $$\text{rem}_{\text{rec}} = \text{scaled}_{\text{recyclable}} - f_{\text{rec}}$$
4. **Deterministic Tie-Break:**
   - If remainders are equal, assign to the stream with higher original demand ($N_{\text{disposable}}$ vs $N_{\text{recyclable}}$).
   - If still tied, assign to Disposable first.
5. Invariant guaranteed:
   $$B_{\text{disposable}} + B_{\text{recyclable}} \equiv M$$

#### Case C: Zero perimeter capacity ($M = 0$ and $N > 0$)
$$B_{\text{disposable}} = 0, \quad B_{\text{recyclable}} = 0$$
The model emits an explicit infeasibility warning and reports the unaccommodated demand.

### 2.6 Variable Emptying Turns per Stream
Emptying requirements are calculated independently for each stream:

$$\text{turns}_{\text{disposable}} = \max\left(1, \text{round}\left( \frac{N_{\text{disposable}}}{B_{\text{disposable}}} \right)\right) \quad (\text{when } B_{\text{disposable}} > 0)$$

$$\text{turns}_{\text{recyclable}} = \max\left(1, \text{round}\left( \frac{N_{\text{recyclable}}}{B_{\text{recyclable}}} \right)\right) \quad (\text{when } B_{\text{recyclable}} > 0)$$

Using conventional half-up rounding (ties with fractional part $\ge 0.5$ round up).
If $B_s = 0$ or $N_s = 0$, $\text{turns}_s = 0$.

Overall peak turns for the location is:
$$\text{required turns} = \max(\text{turns}_{\text{disposable}}, \text{turns}_{\text{recyclable}})$$

### 2.7 Capacity Coverage and Shortfall Diagnostic
Available daily volume capacity and shortfalls are tracked per stream:

$$\text{available}_{\text{disposable}} = B_{\text{disposable}} \times C_{\text{usable}} \times \text{turns}_{\text{disposable}}$$
$$\text{shortfall}_{\text{disposable}} = \max\left(0.0, V_{\text{disposable}} - \text{available}_{\text{disposable}}\right)$$

$$\text{available}_{\text{recyclable}} = B_{\text{recyclable}} \times C_{\text{usable}} \times \text{turns}_{\text{recyclable}}$$
$$\text{shortfall}_{\text{recyclable}} = \max\left(0.0, V_{\text{recyclable}} - \text{available}_{\text{recyclable}}\right)$$

$$\text{total shortfall} = \text{shortfall}_{\text{disposable}} + \text{shortfall}_{\text{recyclable}}$$

Whenever a shortfall occurs, the model exposes `capacity_shortfall_litres` and emits explicit diagnostic warnings.

---

## 3. Spatial Placement Logic

1. **Shared Perimeter Spacing:** $B_{\text{total}}$ points are sampled along the actual inward-offset exterior boundary (default 1.5 m inset) using single-pass midpoint sampling. This guarantees that all physical bins share the 25 m spacing constraint without overlapping or crowding.
2. **Even Stream Interleaving:** Sampled markers are systematically interleaved between Disposable and Recyclable streams around the perimeter ring using cumulative threshold assignment:
   $$\text{round\_half\_up}\left(\frac{(i + 1) \times B_{\text{disposable}}}{B_{\text{total}}}\right) > \text{assigned}_{\text{disposable}} \implies \text{Disposable, else Recyclable}$$
   This guarantees that exactly $B_{\text{disposable}}$ markers are labeled `"Disposable"` and $B_{\text{recyclable}}$ markers are labeled `"Recyclable"`.
3. **Rigorous Containment Validation:** Every generated coordinate pair is verified in projected metric space and in WGS84 degree space after 7-decimal-place rounding (`covers` check).
4. **MultiPolygon Distribution:** For MultiPolygon geometries, markers are allocated proportionally to each component's inset perimeter length, ensuring no component receives more bins than its perimeter physically supports.

---

## 4. Assumptions and Operational Limitations

- **Policy Status:** The 25 m distance is Bunbetsu's configured planning policy, not a universal statutory standard. Local accessibility regulations, crowd dynamics, and fire codes take precedence.
- **Daily Average Basis:** Bin sizing and emptying requirements reflect average daily volume over the fest duration. Peak-hour surges and burst periods require on-site monitoring.
- **Site Review Required:** The model samples geometric boundaries; it does not check doorways, terrain slope, utility access, emergency ingress/egress routes, or vendor access corridors. Placements must be verified during site layout.
- **Stream Separation:** Disposable waste represents Food + Other waste, while Recyclable waste represents Plastic + Paper + Glass. Waste contamination and sorting fidelity in practice depend on signage and attendee behavior.
