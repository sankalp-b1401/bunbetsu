/**
 * Bunbetsu Waste Prediction API Client
 * Sends event configuration and location data to FastAPI POST /api/prediction/waste.
 * Grounds results exclusively in the frozen Python mathematical model output.
 */

import {
  ActivityType,
  BackendPredictionResponse,
  CampusLocation,
  FestInput,
  FestPredictionPayload,
  PredictionResult,
} from '../types/bunbetsu';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export interface RequestWastePredictionParams {
  totalFootfall: number;
  durationDays: number;
  campusState: string;
  locations: CampusLocation[];
}

/**
 * Validates inputs and calls FastAPI POST /api/prediction/waste.
 */
export async function requestWastePrediction(
  params: RequestWastePredictionParams
): Promise<PredictionResult> {
  const { totalFootfall, durationDays, campusState, locations } = params;

  // 1. Client-side validation prior to network dispatch
  if (totalFootfall <= 0) {
    throw new Error('Expected daily footfall must be a positive integer.');
  }
  if (durationDays <= 0) {
    throw new Error('Fest duration must be at least 1 day.');
  }
  if (!campusState || !campusState.trim()) {
    throw new Error('A campus with a valid state/UT must be selected before requesting waste prediction.');
  }
  if (!locations || locations.length === 0) {
    throw new Error('At least one configured location is required to calculate predictions.');
  }

  for (const loc of locations) {
    if (!loc.name.trim()) {
      throw new Error(`Location "${loc.id}" has an empty name.`);
    }
    if (loc.area <= 0) {
      throw new Error(`Location "${loc.name}" has invalid area (${loc.area} m²). Must be greater than 0.`);
    }
    if (!loc.activities || loc.activities.length === 0) {
      throw new Error(`Location "${loc.name}" must have at least one assigned activity tag.`);
    }
  }

  // 2. Derive unique activities across selected locations
  const distinctActivities = Array.from(
    new Set(locations.flatMap((l) => l.activities))
  ) as ActivityType[];

  // 3. Construct backend payload preserving stable location IDs
  const payload: FestPredictionPayload = {
    total_footfall: totalFootfall,
    duration_days: durationDays,
    campus_state: campusState.trim(),
    activities: distinctActivities,
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      area: loc.area,
      activities: loc.activities,
    })),
  };

  const endpoint = `${API_BASE_URL}/api/prediction/waste`;

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
      `Unable to connect to Bunbetsu prediction backend at ${API_BASE_URL || 'http://localhost:8000'}. Please ensure FastAPI is running.`
    );
  }

  if (response.status === 422) {
    let errorDetail = 'Validation error from prediction model.';
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        if (typeof errJson.detail === 'string') {
          errorDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errorDetail = errJson.detail.map((e: any) => e.msg || e.message).join('; ');
        }
      }
    } catch {
      // Ignore JSON error
    }
    throw new Error(errorDetail);
  }

  if (!response.ok) {
    let errorDetail = `Prediction request failed with HTTP ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = String(errJson.detail);
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }

  let data: BackendPredictionResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error('Malformed JSON received from Bunbetsu prediction endpoint.');
  }

  if (!data || !data.total_waste_kg || !data.composition_kg) {
    throw new Error('Incomplete prediction response received from backend.');
  }

  // 4. Map the model response into frontend presentation structures
  const totalAttendeeDays = totalFootfall * durationDays;
  const baselineTotalKg = Math.round(totalAttendeeDays * data.baseline_rate_kg_per_person_day);

  const totalWasteKg = {
    min: Math.round(data.total_waste_kg.low),
    mean: Math.round(data.total_waste_kg.central),
    max: Math.round(data.total_waste_kg.high),
  };

  const totalWasteTonnes = {
    min: Number((data.total_waste_kg.low / 1000).toFixed(2)),
    mean: Number((data.total_waste_kg.central / 1000).toFixed(2)),
    max: Number((data.total_waste_kg.high / 1000).toFixed(2)),
  };

  const foodKg = Math.round(data.composition_kg['Food']?.central || 0);
  const plasticKg = Math.round(data.composition_kg['Plastic']?.central || 0);
  const paperKg = Math.round(data.composition_kg['Paper']?.central || 0);
  const glassKg = Math.round(data.composition_kg['Glass']?.central || 0);
  const othersKg = Math.round(data.composition_kg['Others']?.central || 0);
  const dryRecyclablesKg = Math.round(data.recyclable_kg.central);

  const wasteBreakdown = {
    foodOrganicKg: foodKg,
    plasticsKg: plasticKg,
    paperCardboardKg: paperKg,
    glassKg: glassKg,
    inertLandfillKg: othersKg,
    dryRecyclablesKg,
  };

  const locationAllocations = data.location_allocations.map((alloc) => {
    const locEstimatedWaste = Math.round(alloc.total_waste_kg.central);
    const locFood = Math.round(alloc.composition_kg['Food']?.central || 0);
    const locRecyclables = Math.round(alloc.recyclable_kg.central || 0);
    const locOthers = Math.round(alloc.composition_kg['Others']?.central || 0);

    // Recommended 240L bins based on stream weight (approx 35kg/bin/day)
    const compostBins = Math.max(1, Math.round(locFood / (durationDays * 35)));
    const recyclingBins = Math.max(1, Math.round(locRecyclables / (durationDays * 35)));
    const landfillBins = Math.max(1, Math.round(locOthers / (durationDays * 35)));

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
  });

  const contractFestInput: FestInput = {
    total_footfall: totalFootfall,
    duration_days: durationDays,
    campus_state: data.campus_state || campusState.trim(),
    activities: distinctActivities,
    locations: locations.map((l) => ({
      name: l.name,
      activities: l.activities,
      area: l.area,
    })),
  };

  return {
    campus_state: data.campus_state,
    baseline_rate_kg_per_person_day: data.baseline_rate_kg_per_person_day,
    baseline_source_year: data.baseline_source_year,
    baseline_rate_source: data.baseline_rate_source,
    baseline_is_national_fallback: data.baseline_is_national_fallback,
    totalAttendeeDays,
    baselineTotalKg,
    total_waste_kg: data.total_waste_kg,
    composition_kg: data.composition_kg,
    composition_percent: data.composition_percent,
    recyclable_kg: data.recyclable_kg,
    disposable_kg: data.disposable_kg,
    activity_allocations: data.activity_allocations,
    location_allocations: locationAllocations,
    locationAllocations: locationAllocations,
    heatmap_data: data.heatmap_data,
    assumptions: data.assumptions,
    totalWasteKg,
    totalWasteTonnes,
    wasteBreakdown,
    payload: contractFestInput,
  };
}
