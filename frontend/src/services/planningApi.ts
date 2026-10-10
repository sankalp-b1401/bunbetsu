/**
 * Bunbetsu Unified Planning API Client
 *
 * Sends campus, event configuration, activity locations, and geometries to
 * FastAPI endpoint POST /api/planning/plan.
 * Orchestrates waste prediction, spatial polygon bin placement, and pedestrian routing.
 */

import {
  ActivityType,
  BackendCampusPlanResponse,
  BinRecommendationResult,
  Campus,
  CampusLocation,
  CampusPlanPayload,
  CampusPlanResult,
  EventDetails,
  FestInput,
  LocationWasteAllocation,
  PredictionResult,
  RecommendedBinItem,
} from '../types/bunbetsu';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export interface RequestCampusPlanParams {
  eventDetails: EventDetails;
  campus: Campus;
  locations: CampusLocation[];
  maxSnapDistanceM?: number;
}

/**
 * Validates inputs, dispatches unified planning request, and maps backend models
 * to frontend-ready structures for the Plan Dashboard.
 */
export async function requestCampusPlan(
  params: RequestCampusPlanParams
): Promise<CampusPlanResult> {
  const { eventDetails, campus, locations, maxSnapDistanceM = 50.0 } = params;

  // 1. Client-side pre-flight validation
  if (!campus) {
    throw new Error('A campus must be selected before planning.');
  }
  if (!campus.state || !campus.state.trim()) {
    throw new Error(
      'The selected campus does not possess an established State/UT required for baseline waste rate lookup.'
    );
  }
  if (!eventDetails.festName || !eventDetails.festName.trim()) {
    throw new Error('Event name is required.');
  }
  if (!eventDetails.durationDays || eventDetails.durationDays <= 0) {
    throw new Error('Event duration must be at least 1 day.');
  }
  if (!eventDetails.expectedFootfall || eventDetails.expectedFootfall <= 0) {
    throw new Error('Expected footfall must be a positive integer.');
  }
  if (!locations || locations.length === 0) {
    throw new Error('At least one event location must be configured.');
  }

  // Validate location integrity & unique names
  const locationNames = locations.map((loc) => loc.name.trim());
  const uniqueNames = new Set(locationNames);
  if (uniqueNames.size !== locationNames.length) {
    const duplicates = locationNames.filter(
      (name, idx) => locationNames.indexOf(name) !== idx
    );
    throw new Error(
      `Duplicate location names detected: ${Array.from(new Set(duplicates)).join(
        ', '
      )}. Each location must have a unique name for spatial bin distribution modeling.`
    );
  }

  for (const loc of locations) {
    if (!loc.id) {
      throw new Error('Every configured location must possess a stable unique identifier.');
    }
    if (!loc.name || !loc.name.trim()) {
      throw new Error(`Location "${loc.id}" has an empty name.`);
    }
    if (!loc.area || loc.area <= 0) {
      throw new Error(
        `Location "${loc.name}" has invalid area (${loc.area} m²). Must be greater than 0.`
      );
    }
    if (!loc.activities || loc.activities.length === 0) {
      throw new Error(`Location "${loc.name}" must have at least one activity tag.`);
    }
    if (!loc.geometry || !loc.geometry.type || !loc.geometry.coordinates) {
      throw new Error(`Location "${loc.name}" has invalid or missing geometry.`);
    }
  }

  // 2. Prepare payload
  const distinctActivities = Array.from(
    new Set(locations.flatMap((l) => l.activities))
  ) as ActivityType[];

  const boundary = campus.geometry || campus.boundaryGeometry || null;

  const payload: CampusPlanPayload = {
    fest_name: eventDetails.festName.trim(),
    total_footfall: eventDetails.expectedFootfall,
    duration_days: eventDetails.durationDays,
    campus_state: campus.state.trim(),
    activities: distinctActivities,
    campus_boundary: boundary,
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name.trim(),
      area: loc.area,
      activities: loc.activities,
      geometry: loc.geometry,
      center: loc.center,
    })),
    routing_config: {
      max_snap_distance_m: maxSnapDistanceM,
      overpass_timeout_s: 25.0,
      check_barriers: true,
    },
  };

  const endpoint = `${API_BASE_URL}/api/planning/plan`;

  // 3. Dispatch network request
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new Error(
      `Unable to connect to Bunbetsu planning backend at ${
        API_BASE_URL || 'http://localhost:8000'
      }. Please ensure the backend server is running.`
    );
  }

  if (response.status === 422) {
    let errorDetail = 'Validation error from Bunbetsu planning pipeline.';
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        if (typeof errJson.detail === 'string') {
          errorDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errorDetail = errJson.detail.map((e: any) => e.msg || e.message).join('; ');
        }
      }
    } catch {
      // Ignore JSON parse failure
    }
    throw new Error(errorDetail);
  }

  if (!response.ok) {
    let errorDetail = `Planning request failed with HTTP ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errorDetail = String(errJson.detail);
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }

  let data: BackendCampusPlanResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error('Received malformed JSON from planning endpoint.');
  }

  if (!data || typeof data.success !== 'boolean') {
    throw new Error('Incomplete planning response received from backend.');
  }

  // 4. Transform waste prediction output
  let predictionResult: PredictionResult | null = null;
  if (data.prediction && data.prediction.total_waste_kg && data.prediction.composition_kg) {
    const pred = data.prediction;
    const totalAttendeeDays = eventDetails.expectedFootfall * eventDetails.durationDays;
    const baselineTotalKg = Math.round(
      totalAttendeeDays * pred.baseline_rate_kg_per_person_day
    );

    const totalWasteKg = {
      min: Math.round(pred.total_waste_kg.low),
      mean: Math.round(pred.total_waste_kg.central),
      max: Math.round(pred.total_waste_kg.high),
    };

    const totalWasteTonnes = {
      min: Number((pred.total_waste_kg.low / 1000).toFixed(2)),
      mean: Number((pred.total_waste_kg.central / 1000).toFixed(2)),
      max: Number((pred.total_waste_kg.high / 1000).toFixed(2)),
    };

    const foodKg = Math.round(pred.composition_kg['Food']?.central || 0);
    const plasticKg = Math.round(pred.composition_kg['Plastic']?.central || 0);
    const paperKg = Math.round(pred.composition_kg['Paper']?.central || 0);
    const glassKg = Math.round(pred.composition_kg['Glass']?.central || 0);
    const othersKg = Math.round(pred.composition_kg['Others']?.central || 0);
    const dryRecyclablesKg = Math.round(pred.recyclable_kg.central);

    const wasteBreakdown = {
      foodOrganicKg: foodKg,
      plasticsKg: plasticKg,
      paperCardboardKg: paperKg,
      glassKg: glassKg,
      inertLandfillKg: othersKg,
      dryRecyclablesKg,
    };

    const locationAllocations: LocationWasteAllocation[] = pred.location_allocations.map(
      (alloc) => {
        const locEstimatedWaste = Math.round(alloc.total_waste_kg.central);
        const locFood = Math.round(alloc.composition_kg['Food']?.central || 0);
        const locRecyclables = Math.round(alloc.recyclable_kg.central || 0);
        const locOthers = Math.round(alloc.composition_kg['Others']?.central || 0);

        // UI-only derived estimate (clearly separated from python bin model output)
        const compostBins = Math.max(1, Math.round(locFood / (eventDetails.durationDays * 35)));
        const recyclingBins = Math.max(
          1,
          Math.round(locRecyclables / (eventDetails.durationDays * 35))
        );
        const landfillBins = Math.max(
          1,
          Math.round(locOthers / (eventDetails.durationDays * 35))
        );

        return {
          ...alloc,
          estimatedWasteKg: locEstimatedWaste,
          spatialSharePercent: Number((alloc.normalized_share * 100).toFixed(1)),
          binsRecommended: {
            compost: compostBins,
            recycling: recyclingBins,
            landfill: landfillBins,
          },
        };
      }
    );

    const contractFestInput: FestInput = {
      total_footfall: eventDetails.expectedFootfall,
      duration_days: eventDetails.durationDays,
      campus_state: pred.campus_state || campus.state.trim(),
      activities: distinctActivities,
      locations: locations.map((l) => ({
        name: l.name,
        activities: l.activities,
        area: l.area,
      })),
    };

    predictionResult = {
      campus_state: pred.campus_state,
      baseline_rate_kg_per_person_day: pred.baseline_rate_kg_per_person_day,
      baseline_source_year: pred.baseline_source_year,
      baseline_rate_source: pred.baseline_rate_source,
      baseline_is_national_fallback: pred.baseline_is_national_fallback,
      totalAttendeeDays,
      baselineTotalKg,
      total_waste_kg: pred.total_waste_kg,
      composition_kg: pred.composition_kg,
      composition_percent: pred.composition_percent,
      recyclable_kg: pred.recyclable_kg,
      disposable_kg: pred.disposable_kg,
      activity_allocations: pred.activity_allocations,
      location_allocations: locationAllocations,
      locationAllocations,
      heatmap_data: pred.heatmap_data,
      assumptions: pred.assumptions,
      totalWasteKg,
      totalWasteTonnes,
      wasteBreakdown,
      payload: contractFestInput,
    };
  }

  // 5. Transform bin recommendations output
  let binRecommendations: BinRecommendationResult | null = null;
  if (data.bin_recommendations) {
    const rawBins = data.bin_recommendations;

    const markers: RecommendedBinItem[] = (rawBins.bins || []).map((b) => ({
      id: b.id,
      locationId: b.location_id,
      locationName: b.location_name,
      binType: (b.bin_type || 'Disposable') as any,
      coordinates: b.coordinates,
      binIndex: b.bin_index,
      binScenario: b.bin_scenario,
      boundaryDistanceM: b.boundary_distance_m,
      capacityLitres: rawBins.bin_capacity_litres,
    }));

    const locItems = (rawBins.locations || []).map((loc) => ({
      id: loc.id,
      location_name: loc.location_name,
      area: loc.area,
      activities: loc.activities,
      capacity_bins: loc.capacity_bins,
      rectangle_perimeter_m: loc.rectangle_perimeter_m ?? 0,
      perimeter_spacing_max_bins: loc.perimeter_spacing_max_bins ?? 0,
      perimeter_spacing_minimum_bins:
        loc.perimeter_spacing_minimum_bins ?? loc.perimeter_spacing_max_bins ?? 0,
      recommended_bins: loc.recommended_bins,
      required_emptying_turns: loc.required_emptying_turns ?? { low: 1, central: 1, high: 1 },
      daily_capacity_coverage_litres: loc.daily_capacity_coverage_litres ?? 0,
      capacity_shortfall_litres: loc.capacity_shortfall_litres ?? 0,
      spatial_minimum_bins: loc.spatial_minimum_bins ?? 0,
      placement_scenario: loc.placement_scenario,
      boundary_spacing_target_m: loc.boundary_spacing_target_m ?? 25.0,
      actual_boundary_spacing_m: loc.actual_boundary_spacing_m,
      boundary_inset_m: loc.boundary_inset_m,
      placement_warnings: loc.placement_warnings,
      placement_status: loc.placement_status,
      disposable: loc.disposable
        ? {
            capacity_demand_bins: loc.disposable.capacity_demand_bins,
            physical_bins: loc.disposable.physical_bins,
            required_turns: loc.disposable.required_turns,
            daily_waste_kg: loc.disposable.daily_waste_kg,
            daily_volume_litres: loc.disposable.daily_volume_litres,
            available_capacity_litres: loc.disposable.available_capacity_litres,
            capacity_shortfall_litres: loc.disposable.capacity_shortfall_litres,
            placements: (loc.disposable.placements || []).map((p) => ({
              id: p.id,
              locationId: p.location_id,
              locationName: p.location_name,
              binType: (p.bin_type || 'Disposable') as any,
              coordinates: p.coordinates,
              binIndex: p.bin_index,
              binScenario: p.bin_scenario,
              boundaryDistanceM: p.boundary_distance_m,
              capacityLitres: rawBins.bin_capacity_litres,
            })),
          }
        : undefined,
      recyclable: loc.recyclable
        ? {
            capacity_demand_bins: loc.recyclable.capacity_demand_bins,
            physical_bins: loc.recyclable.physical_bins,
            required_turns: loc.recyclable.required_turns,
            daily_waste_kg: loc.recyclable.daily_waste_kg,
            daily_volume_litres: loc.recyclable.daily_volume_litres,
            available_capacity_litres: loc.recyclable.available_capacity_litres,
            capacity_shortfall_litres: loc.recyclable.capacity_shortfall_litres,
            placements: (loc.recyclable.placements || []).map((p) => ({
              id: p.id,
              locationId: p.location_id,
              locationName: p.location_name,
              binType: (p.bin_type || 'Recyclable') as any,
              coordinates: p.coordinates,
              binIndex: p.bin_index,
              binScenario: p.bin_scenario,
              boundaryDistanceM: p.boundary_distance_m,
              capacityLitres: rawBins.bin_capacity_litres,
            })),
          }
        : undefined,
      total_capacity_demand_bins: loc.total_capacity_demand_bins,
      total_physical_bins: loc.total_physical_bins,
      bin_placements: (loc.bin_placements || []).map((p) => ({
        id: p.id,
        locationId: p.location_id,
        locationName: p.location_name,
        binType: (p.bin_type || 'Disposable') as any,
        coordinates: p.coordinates,
        binIndex: p.bin_index,
        binScenario: p.bin_scenario,
        boundaryDistanceM: p.boundary_distance_m,
        capacityLitres: rawBins.bin_capacity_litres,
      })),
    }));

    let streamCounts: {
      disposable: number;
      recyclable: number;
      general?: number;
      food?: number;
    } | null = null;
    if (rawBins.stream_breakdown_available && rawBins.stream_counts) {
      const dispCount =
        rawBins.stream_counts['disposable'] ??
        ((rawBins.stream_counts['general'] || 0) + (rawBins.stream_counts['food'] || 0));
      const recCount = rawBins.stream_counts['recyclable'] || 0;
      streamCounts = {
        disposable: dispCount,
        recyclable: recCount,
        general: dispCount,
        food: 0,
      };
    }

    const binStatus: 'success' | 'partial' | 'failed' =
      rawBins.status || (rawBins.total_bins > 0 ? 'success' : 'failed');

    binRecommendations = {
      status: binStatus,
      totalBins: rawBins.total_bins,
      capacityBins: rawBins.capacity_bins,
      recommendedBins: rawBins.recommended_bins,
      requiredEmptyingTurns: rawBins.required_emptying_turns,
      streamCounts,
      streamBreakdownAvailable: rawBins.stream_breakdown_available,
      bins: markers,
      locations: locItems,
      binCapacityLitres: rawBins.bin_capacity_litres,
      usableFillFraction: rawBins.usable_fill_fraction,
      usableBinCapacityLitres:
        rawBins.usable_bin_capacity_litres ??
        rawBins.bin_capacity_litres * rawBins.usable_fill_fraction,
      emptyingCyclesPerDay: rawBins.emptying_cycles_per_day,
      effectiveCapacityLitresPerBinPerDay: rawBins.effective_capacity_litres_per_bin_per_day,
      boundarySpacingTargetM: rawBins.boundary_spacing_target_m ?? 25.0,
      boundaryInsetM: rawBins.boundary_inset_m,
      assumptions: rawBins.assumptions || [],
      warnings: rawBins.warnings || [],
    };
  }

  return {
    prediction: predictionResult,
    binRecommendations,
    routeResult: data.routes || null,
    diagnostics: data.diagnostics,
  };
}

