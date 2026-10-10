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

export type MapMode = 'select' | 'addArea' | 'deleteArea';

export interface LocationGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: any;
}

export interface UserMapArea {
  id: string;
  name: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  area: number;
  source: 'user_drawn';
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
  source?: 'preset' | 'user_drawn';
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
  structuredAddress?: Record<string, unknown>;
}

export interface EventDetails {
  festName: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  expectedFootfall: number;
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
  campus_state: string;
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
  campus_state: string;
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
  campus_state: string;
  baseline_rate_kg_per_person_day: number;
  baseline_source_year: string;
  baseline_rate_source: string;
  baseline_is_national_fallback: boolean;
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
  campus_state: string;
  baseline_rate_kg_per_person_day: number;
  baseline_source_year: string;
  baseline_rate_source: string;
  baseline_is_national_fallback: boolean;
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

// Plan Dashboard Presentation & Heatmap Types
export type HeatmapMode = 'none' | 'total' | 'category' | 'recyclable' | 'disposable';
export type WasteCategory = 'Food' | 'Plastic' | 'Paper' | 'Glass' | 'Others';

export interface BaselineSensitivityPoint {
  baselineRate: number; // kg/person/day
  totalWasteKg: number;
  isCurrent?: boolean;
}

export interface RecommendedBinItem {
  id: string;
  locationId: string;
  locationName?: string;
  binType?: 'General' | 'Recyclable' | 'Food' | string;
  coordinates: [number, number]; // [lng, lat]
  capacityLitres?: number;
  allocationNote?: string;
  binIndex?: number;
  binScenario?: string;
  boundaryDistanceM?: number;
}

export interface LocationBinRecommendationItem {
  id: string;
  location_name: string;
  area: number;
  activities: string[];
  capacity_bins: RangeModel;
  rectangle_perimeter_m: number;
  perimeter_spacing_max_bins: number;
  perimeter_spacing_minimum_bins?: number;
  recommended_bins: RangeModel;
  required_emptying_turns: RangeModel;
  daily_capacity_coverage_litres: number;
  capacity_shortfall_litres: number;
  spatial_minimum_bins: number;
  placement_scenario: string;
  boundary_spacing_target_m: number;
  actual_boundary_spacing_m: number;
  boundary_inset_m: number;
  placement_warnings: string[];
  placement_status: 'placed' | 'unsupported_geometry' | 'failed';
  bin_placements: RecommendedBinItem[];
}

export interface BinRecommendationResult {
  status?: 'success' | 'partial' | 'failed';
  totalBins: number;
  capacityBins?: RangeModel;
  recommendedBins?: RangeModel;
  requiredEmptyingTurns?: RangeModel;
  streamCounts: {
    general: number;
    recyclable: number;
    food: number;
  } | null;
  streamBreakdownAvailable: boolean;
  bins: RecommendedBinItem[];
  locations?: LocationBinRecommendationItem[];
  metadata?: Record<string, any>;
  binCapacityLitres?: number;
  usableFillFraction?: number;
  usableBinCapacityLitres?: number;
  emptyingCyclesPerDay?: number | null;
  effectiveCapacityLitresPerBinPerDay?: number | null;
  boundarySpacingTargetM?: number;
  boundaryInsetM?: number;
  assumptions?: string[];
  warnings?: string[];
}

// Unified Planning Pipeline Types
export interface LocationPlanPayload {
  id: string;
  name: string;
  area: number;
  activities: ActivityType[];
  geometry: LocationGeometry;
  center?: [number, number];
}

export interface CampusPlanPayload {
  fest_name: string;
  total_footfall: number;
  duration_days: number;
  campus_state: string;
  baseline_rate_kg_per_person_day?: number;
  activities?: ActivityType[];
  campus_boundary?: any;
  locations: LocationPlanPayload[];
  routing_config?: {
    max_snap_distance_m?: number;
    overpass_timeout_s?: number;
    check_barriers?: boolean;
  };
}

export interface StageStatus {
  prediction: 'success' | 'failed';
  bins: 'success' | 'partial' | 'failed' | 'skipped';
  routes: 'success' | 'failed' | 'skipped';
}

export interface CampusPlanDiagnostics {
  warnings: string[];
  errors: string[];
  stage_status: StageStatus;
}

export interface BackendCampusPlanResponse {
  success: boolean;
  prediction: BackendPredictionResponse | null;
  bin_recommendations: {
    status?: 'success' | 'partial' | 'failed';
    total_bins: number;
    capacity_bins: RangeModel;
    recommended_bins: RangeModel;
    required_emptying_turns?: RangeModel;
    stream_counts: Record<string, number> | null;
    stream_breakdown_available: boolean;
    locations: Array<{
      id: string;
      location_name: string;
      area: number;
      activities: string[];
      capacity_bins: RangeModel;
      rectangle_perimeter_m?: number;
      perimeter_spacing_max_bins?: number;
      perimeter_spacing_minimum_bins?: number;
      recommended_bins: RangeModel;
      required_emptying_turns?: RangeModel;
      daily_capacity_coverage_litres?: number;
      capacity_shortfall_litres?: number;
      spatial_minimum_bins: number;
      placement_scenario: string;
      boundary_spacing_target_m: number;
      actual_boundary_spacing_m: number;
      boundary_inset_m: number;
      placement_warnings: string[];
      placement_status: 'placed' | 'unsupported_geometry' | 'failed';
      bin_placements: Array<{
        id: string;
        location_id: string;
        location_name: string;
        coordinates: [number, number];
        bin_index: number;
        bin_scenario: string;
        boundary_distance_m?: number;
      }>;
    }>;
    bins: Array<{
      id: string;
      location_id: string;
      location_name: string;
      coordinates: [number, number];
      bin_index: number;
      bin_scenario: string;
      boundary_distance_m?: number;
    }>;
    bin_capacity_litres: number;
    usable_fill_fraction: number;
    usable_bin_capacity_litres?: number;
    emptying_cycles_per_day?: number | null;
    effective_capacity_litres_per_bin_per_day?: number | null;
    boundary_spacing_target_m: number;
    boundary_inset_m: number;
    assumptions: string[];
    warnings: string[];
  } | null;
  routes: RoutePlanResult | null;
  diagnostics: CampusPlanDiagnostics;
}

export interface CampusPlanResult {
  prediction: PredictionResult | null;
  binRecommendations: BinRecommendationResult | null;
  routeResult: RoutePlanResult | null;
  diagnostics: CampusPlanDiagnostics;
}

export interface PlanDashboardProps {
  campus: Campus;
  eventDetails: EventDetails;
  locations: CampusLocation[];

  prediction: PredictionResult | null;
  predictionLoading: boolean;
  predictionError: string | null;
  predictionStale?: boolean;

  routeResult: RoutePlanResult | null;
  routesLoading?: boolean;
  routesError?: string | null;
  routesStale?: boolean;

  binRecommendations?: BinRecommendationResult | null;
  sensitivitySeries?: BaselineSensitivityPoint[];
  diagnostics?: CampusPlanDiagnostics | null;

  onBackToConfigure: () => void;
  onRecalculatePrediction: () => void;
  onCalculateRoutes?: () => void;
}

