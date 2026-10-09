/**
 * BUNBETSU Data Types and Model Contracts
 * Grounded in the frozen Python waste-prediction model contract.
 */

export type ActivityType =
  | 'Food Stalls'
  | 'Music Concert'
  | 'Performing Arts'
  | 'Sports'
  | 'Literary & Fine Arts'
  | 'Hackathon';

export interface LocationGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: any;
}

export interface CampusLocation {
  id: string;
  name: string;
  activities: ActivityType[];
  area: number; // square metres (positive numeric)
  description?: string;
  relativeIntensity?: 'Low' | 'Medium' | 'High'; // UI-only annotation
  tags: string[];
  geometry: LocationGeometry;
  center?: [number, number]; // [lng, lat]
}

export interface Campus {
  id: string;
  osm_id?: number;
  osm_type?: string;
  name: string;
  fullName: string;
  display_name?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  approxAreaHectares: number;
  boundarySource: string;
  hasBoundary: boolean;
  geometry?: any | null; // Real GeoJSON geometry from Nominatim
  boundaryGeometry?: any | null; // Same real GeoJSON geometry (for MapLibre)
  center: [number, number]; // [lng, lat]
  latitude?: number;
  longitude?: number;
  defaultZoom: number;
  imageUrl?: string;
  defaultLocations: CampusLocation[];
  category?: string;
  osm_class?: string;
  osm_type_tag?: string;
}

export interface EventDetails {
  festName: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  expectedFootfall: number;
  baselineRateKgPerPersonDay: number;
}

// Frozen Model Input Contract
export interface LocationInput {
  name: string;
  activities: ActivityType[];
  area: number; // square metres
}

export interface FestInput {
  total_footfall: number;
  duration_days: number;
  activities: ActivityType[];
  baseline_rate_kg_per_person_day: number;
  locations: LocationInput[];
}

export interface LocationPredictionPayload {
  id: string;
  name: string;
  area: number;
  activities: ActivityType[];
}

export interface FestPredictionPayload {
  total_footfall: number;
  duration_days: number;
  baseline_rate_kg_per_person_day: number;
  activities: ActivityType[];
  locations: LocationPredictionPayload[];
}

export interface RangeModel {
  low: number;
  central: number;
  high: number;
}

export interface ActivityAllocation {
  activity: string;
  normalized_weight: number;
  intensity: RangeModel;
  relative_intensity: RangeModel;
  internal_waste_range_kg: RangeModel;
}

export interface LocationWasteAllocation {
  id: string;
  location_id: string;
  location_name: string;
  area: number;
  activities: ActivityType[];
  normalized_share: number;
  total_waste_kg: RangeModel;
  composition_kg: Record<string, RangeModel>;
  recyclable_kg: RangeModel;
  disposable_kg: RangeModel;
  // UI computed metrics from model numbers
  estimatedWasteKg: number;
  spatialSharePercent: number;
  binsRecommended: {
    compost: number;
    recycling: number;
    landfill: number;
  };
}

export interface HeatmapData {
  total_waste_kg: Record<string, RangeModel>;
  category_waste_kg: Record<string, Record<string, RangeModel>>;
  recyclable_kg: Record<string, RangeModel>;
  disposable_kg: Record<string, RangeModel>;
}

export interface BackendPredictionResponse {
  success: boolean;
  total_waste_kg: RangeModel;
  composition_kg: Record<string, RangeModel>;
  composition_percent: Record<string, number>;
  recyclable_kg: RangeModel;
  disposable_kg: RangeModel;
  activity_allocations: ActivityAllocation[];
  location_allocations: LocationWasteAllocation[];
  heatmap_data: HeatmapData | null;
  assumptions: string[];
}

export interface PredictionResult {
  totalAttendeeDays: number;
  baselineTotalKg: number;
  total_waste_kg: RangeModel;
  composition_kg: Record<string, RangeModel>;
  composition_percent: Record<string, number>;
  recyclable_kg: RangeModel;
  disposable_kg: RangeModel;
  activity_allocations: ActivityAllocation[];
  location_allocations: LocationWasteAllocation[];
  locationAllocations: LocationWasteAllocation[];
  heatmap_data: HeatmapData | null;
  assumptions: string[];

  // Metric helpers for UI
  totalWasteTonnes: {
    min: number;
    mean: number;
    max: number;
  };
  totalWasteKg: {
    min: number;
    mean: number;
    max: number;
  };
  wasteBreakdown: {
    foodOrganicKg: number;
    dryRecyclablesKg: number;
    plasticsKg: number;
    paperCardboardKg: number;
    glassKg: number;
    inertLandfillKg: number;
  };
  payload: FestInput;
}
