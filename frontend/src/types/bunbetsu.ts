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

// Phase 2: Pedestrian Routing Types
export interface RouteSegmentProperties {
  id: string;
  osm_way_id?: number | null;
  highway: string;
  length_m: number;
  raw_score: number;
  normalized_score: number;
  u: string;
  v: string;
  layer?: number;
  bridge?: boolean;
  tunnel?: boolean;
  provenance: 'osm_mapped';
}

export interface ConnectorProperties {
  id: string;
  location_id: string;
  location_name: string;
  snap_distance_m: number;
  connector_length_m: number;
  status: 'connected' | 'unmatched' | 'flagged';
  provenance: 'connector';
  reason?: string | null;
}

export interface LocationConnectivity {
  location_id: string;
  location_name: string;
  status: 'connected' | 'unmatched' | 'flagged';
  snap_distance_m?: number | null;
  snap_point?: [number, number] | null;
  reason?: string | null;
}

export interface GraphDiagnostics {
  nodes_count: number;
  edges_count: number;
  total_length_m: number;
  components_count: number;
  discarded_ways_count: number;
}

export interface ScoringDiagnostics {
  total_locations: number;
  connected_locations: number;
  unmatched_locations: string[];
  evaluated_pairs: number;
  connected_pairs: number;
  unreachable_pairs: number;
  max_raw_score: number;
}

export interface RouteDiagnostics {
  graph: GraphDiagnostics;
  scoring: ScoringDiagnostics;
}

export interface RoutePlanResult {
  success: boolean;
  boundary_geojson: any;
  paths_geojson: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: string;
      geometry: {
        type: 'LineString';
        coordinates: number[][];
      };
      properties: RouteSegmentProperties;
    }>;
  };
  connectors_geojson: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: string;
      geometry: {
        type: 'LineString';
        coordinates: number[][];
      };
      properties: ConnectorProperties;
    }>;
  };
  intersections_geojson?: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: string;
      geometry: {
        type: 'Point';
        coordinates: [number, number];
      };
      properties: {
        node_id: string;
        degree: number;
        traffic_score: number;
      };
    }>;
  } | null;
  location_connectivity: LocationConnectivity[];
  diagnostics: RouteDiagnostics;
  metadata: {
    version?: string;
    description?: string;
    cost_metric?: string;
    pair_scoring_function?: string;
    score_interpretation?: string;
    [key: string]: any;
  };
  warnings: string[];
}

