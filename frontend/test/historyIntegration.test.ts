import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEventSnapshot,
} from '../src/services/historyApi';
import type {
  Campus,
  CampusLocation,
  EventDetails,
  EntryGate,
  PredictionResult,
  BinRecommendationResult,
  RoadBinRecommendationResult,
  RoutePlanResult,
  EventHistorySnapshot,
} from '../src/types/bunbetsu';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runHistoryIntegrationTests() {
  console.log('--- Running Event History Integration Tests ---');

  // =========================================================================
  // 1. Snapshot Validation & Serialization Tests
  // =========================================================================
  console.log('1. Testing event snapshot validation & serialization...');

  const mockCampus: Campus = {
    id: 'campus-iit-delhi',
    name: 'IIT Delhi',
    fullName: 'Indian Institute of Technology Delhi',
    address: 'Hauz Khas, New Delhi',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    approxAreaHectares: 130,
    boundarySource: 'osm',
    hasBoundary: true,
    center: [77.1928, 28.545],
    defaultZoom: 16,
    defaultLocations: [],
  };

  const mockLocations: CampusLocation[] = [
    {
      id: 'loc-food-court-1',
      name: 'Main Food Plaza',
      activities: ['Food Stalls'],
      area: 2500,
      tags: ['food', 'high-density'],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.192, 28.544],
            [77.194, 28.544],
            [77.194, 28.546],
            [77.192, 28.546],
            [77.192, 28.544],
          ],
        ],
      },
      center: [77.193, 28.545],
      source: 'preset',
    },
    {
      id: 'loc-concert-lawn',
      name: 'Open Air Theatre',
      activities: ['Music Concert'],
      area: 4000,
      tags: ['concert', 'evening'],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.195, 28.546],
            [77.197, 28.546],
            [77.197, 28.548],
            [77.195, 28.548],
            [77.195, 28.546],
          ],
        ],
      },
      center: [77.196, 28.547],
      source: 'user_drawn',
    },
  ];

  const mockEventDetails: EventDetails = {
    festName: 'Rendezvous 2026',
    durationDays: 4,
    expectedFootfall: 20000,
    startDate: '2026-10-15',
    endDate: '2026-10-18',
  };

  const mockEntryGate: EntryGate = {
    id: 'gate-main-north',
    name: 'Main North Gate',
    coordinates: [77.1925, 28.5442],
  };

  const mockPrediction: PredictionResult = {
    campus_state: 'Delhi',
    baseline_rate_kg_per_person_day: 0.45,
    baseline_source_year: '2024',
    baseline_rate_source: 'CPCB',
    baseline_is_national_fallback: false,
    totalAttendeeDays: 80000,
    baselineTotalKg: 36000,
    total_waste_kg: { low: 30000, central: 36000, high: 42000 },
    composition_kg: {},
    composition_percent: {},
    recyclable_kg: { low: 10000, central: 12000, high: 14000 },
    disposable_kg: { low: 20000, central: 24000, high: 28000 },
    activity_allocations: [],
    location_allocations: [],
    locationAllocations: [],
    heatmap_data: null,
    assumptions: ['CPCB municipal baseline rate used'],
    totalWasteTonnes: { min: 30.0, mean: 36.0, max: 42.0 },
    totalWasteKg: { min: 30000, mean: 36000, max: 42000 },
    wasteBreakdown: {
      foodOrganicKg: 18000,
      dryRecyclablesKg: 12000,
      plasticsKg: 4000,
      paperCardboardKg: 2000,
      glassKg: 0,
      inertLandfillKg: 0,
    },
    payload: {
      total_footfall: 20000,
      duration_days: 4,
      activities: ['Food Stalls', 'Music Concert'],
      campus_state: 'Delhi',
      locations: [],
    },
  };

  const mockBinRecommendations: BinRecommendationResult = {
    status: 'success',
    totalBins: 42,
    streamCounts: { disposable: 26, recyclable: 16 },
    streamBreakdownAvailable: true,
    bins: [
      {
        id: 'bin-1',
        locationId: 'loc-food-court-1',
        binType: 'Disposable',
        coordinates: [77.193, 28.545],
      },
    ],
    locations: [],
  };

  const mockRoadBinRecommendations: RoadBinRecommendationResult = {
    total_road_bins: 8,
    total_eligible_candidates: 12,
    total_locations_requiring_coverage: 2,
    covered_location_ids: ['loc-food-court-1', 'loc-concert-lawn'],
    uncovered_location_ids: [],
    location_influence_radii_m: { 'loc-food-court-1': 50, 'loc-concert-lawn': 60 },
    location_dominant_waste_types: { 'loc-food-court-1': 'Food', 'loc-concert-lawn': 'Plastic' },
    candidate_sampling_interval_m: 25,
    road_bin_spacing_m: 30,
    solver_name: 'greedy_set_cover',
    optimality_proven: true,
    total_popularity_score: 95.5,
    placements: [
      {
        id: 'road-bin-1',
        coordinates: [77.1935, 28.5455],
        source_segment_id: 'seg-101',
        normalized_popularity_score: 0.92,
        served_location_ids: ['loc-food-court-1'],
        served_location_names: ['Main Food Plaza'],
        served_location_distances_m: { 'loc-food-court-1': 15.2 },
        stream_type: 'Disposable',
        stream_types: ['Disposable'],
        provenance: 'osm_mapped',
      },
    ],
    warnings: [],
    assumptions: [],
  };

  const mockRouteResult: RoutePlanResult = {
    success: true,
    boundary_geojson: null,
    paths_geojson: { type: 'FeatureCollection', features: [] },
    connectors_geojson: { type: 'FeatureCollection', features: [] },
    location_connectivity: [
      { location_id: 'loc-food-court-1', location_name: 'Main Food Plaza', status: 'connected' },
      { location_id: 'loc-concert-lawn', location_name: 'Open Air Theatre', status: 'connected' },
    ],
    diagnostics: {
      graph: { nodes_count: 120, edges_count: 145, total_length_m: 3200, components_count: 1, discarded_ways_count: 0 },
      scoring: { total_locations: 2, connected_locations: 2, unmatched_locations: [], evaluated_pairs: 1, connected_pairs: 1, unreachable_pairs: 0, max_raw_score: 1.0 },
    },
    metadata: { version: '1.0' },
    warnings: [],
  };

  const validSnapshotPayload: EventHistorySnapshot = {
    schema_version: 1,
    campus: mockCampus,
    allCampusLocations: mockLocations,
    locations: mockLocations,
    eventDetails: mockEventDetails,
    entryGate: mockEntryGate,
    prediction: mockPrediction,
    binRecommendations: mockBinRecommendations,
    roadBinRecommendations: mockRoadBinRecommendations,
    routeResult: mockRouteResult,
    diagnostics: null,
    templateName: 'Standard Fest Template',
    savedAt: '2026-10-11T12:00:00.000Z',
  };

  const validationResult = validateEventSnapshot(validSnapshotPayload);
  assert.strictEqual(validationResult.valid, true, 'Valid event snapshot must pass validation');
  assert.ok(validationResult.data, 'Validated snapshot data must be populated');
  assert.strictEqual(validationResult.data?.schema_version, 1, 'Schema version must be 1');
  assert.strictEqual(validationResult.data?.campus.name, 'IIT Delhi', 'Campus name preserved');
  assert.strictEqual(validationResult.data?.locations.length, 2, 'Locations length preserved');
  assert.strictEqual(validationResult.data?.locations[0].geometry.type, 'Polygon', 'Geometry type preserved');
  assert.strictEqual(validationResult.data?.eventDetails.festName, 'Rendezvous 2026', 'Fest name preserved');
  assert.strictEqual(validationResult.data?.eventDetails.expectedFootfall, 20000, 'Footfall preserved');
  assert.strictEqual(validationResult.data?.entryGate?.name, 'Main North Gate', 'Entry gate preserved');
  assert.strictEqual(validationResult.data?.prediction?.baselineTotalKg, 36000, 'Prediction data preserved');
  assert.strictEqual(validationResult.data?.binRecommendations?.totalBins, 42, 'Bin recommendations preserved');
  assert.strictEqual(validationResult.data?.roadBinRecommendations?.total_road_bins, 8, 'Road bins preserved');
  assert.strictEqual(validationResult.data?.routeResult?.success, true, 'Route result preserved');
  assert.strictEqual(validationResult.data?.templateName, 'Standard Fest Template', 'Template name preserved');
  console.log('✓ Valid snapshot validation and preservation passed');

  // =========================================================================
  // 2. Malformed Snapshot Handling Tests
  // =========================================================================
  console.log('2. Testing malformed snapshot error handling...');

  assert.strictEqual(validateEventSnapshot(null).valid, false, 'null must fail');
  assert.strictEqual(validateEventSnapshot(undefined).valid, false, 'undefined must fail');
  assert.strictEqual(validateEventSnapshot('string').valid, false, 'primitive string must fail');
  assert.strictEqual(validateEventSnapshot({}).valid, false, 'empty object without campus must fail');

  const missingCampusId = { ...validSnapshotPayload, campus: { ...mockCampus, id: '' } };
  assert.strictEqual(validateEventSnapshot(missingCampusId).valid, false, 'Campus without id must fail');

  const missingLocations = { ...validSnapshotPayload, locations: 'not-an-array' as any };
  assert.strictEqual(validateEventSnapshot(missingLocations).valid, false, 'Non-array locations must fail');

  const locationMissingGeometry = {
    ...validSnapshotPayload,
    locations: [{ ...mockLocations[0], geometry: null as any }],
  };
  assert.strictEqual(validateEventSnapshot(locationMissingGeometry).valid, false, 'Location without geometry must fail');

  console.log('✓ Malformed snapshot rejection passed');

  // =========================================================================
  // 3. Nullable Fields Handling Tests
  // =========================================================================
  console.log('3. Testing nullable fields handling...');

  const minimalSnapshot: EventHistorySnapshot = {
    schema_version: 1,
    campus: mockCampus,
    locations: mockLocations,
    eventDetails: mockEventDetails,
    entryGate: null,
    prediction: null,
    binRecommendations: null,
    roadBinRecommendations: null,
    routeResult: null,
    diagnostics: null,
  };

  const minimalResult = validateEventSnapshot(minimalSnapshot);
  assert.strictEqual(minimalResult.valid, true, 'Minimal snapshot with null optional results must be valid');
  assert.strictEqual(minimalResult.data?.entryGate, null, 'Entry gate must be null');
  assert.strictEqual(minimalResult.data?.prediction, null, 'Prediction must be null');
  assert.strictEqual(minimalResult.data?.binRecommendations, null, 'Bin recommendations must be null');
  assert.strictEqual(minimalResult.data?.roadBinRecommendations, null, 'Road bins must be null');
  assert.strictEqual(minimalResult.data?.routeResult, null, 'Route result must be null');
  console.log('✓ Nullable optional fields validated cleanly');

  // =========================================================================
  // 4. Source Code Contract Compliance Tests
  // =========================================================================
  console.log('4. Testing source code contract compliance...');

  // historyApi.ts contracts
  const historyApiPath = path.join(__dirname, '../src/services/historyApi.ts');
  assert.ok(fs.existsSync(historyApiPath), 'historyApi.ts must exist');
  const historyApiContent = fs.readFileSync(historyApiPath, 'utf-8');

  assert.ok(
    historyApiContent.includes("from '../lib/supabase'"),
    'historyApi must import from ../lib/supabase'
  );
  assert.ok(
    historyApiContent.includes('supabase.auth.getUser()'),
    'historyApi must authenticate session via supabase.auth.getUser()'
  );
  assert.ok(
    historyApiContent.includes(".from('event_history')"),
    'historyApi must target public.event_history table'
  );
  assert.ok(
    historyApiContent.includes('.order(\'created_at\', { ascending: false })'),
    'historyApi must order events by created_at descending'
  );

  // RLS constraint verification: Frontend API MUST NOT have update or delete methods
  assert.ok(
    !historyApiContent.includes('.delete()'),
    'historyApi MUST NOT implement delete operations (enforced by RLS constraint)'
  );
  assert.ok(
    !historyApiContent.includes('.update('),
    'historyApi MUST NOT implement update operations (enforced by RLS constraint)'
  );
  console.log('✓ historyApi.ts contract and RLS bounds verified');

  // App.tsx reopening and state restoration contracts
  const appPath = path.join(__dirname, '../src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  assert.ok(
    appContent.includes('handleSelectEvent'),
    'App.tsx must define handleSelectEvent for opening history'
  );
  assert.ok(
    appContent.includes('validateEventSnapshot'),
    'App.tsx must validate historical snapshots before restoring'
  );
  assert.ok(
    appContent.includes('setIsHistoricalView(true)'),
    'App.tsx must activate isHistoricalView when opening history'
  );
  assert.ok(
    appContent.includes('setPredictionResult(data.prediction'),
    'App.tsx must restore frozen prediction results directly'
  );
  assert.ok(
    appContent.includes('setBinRecommendations(data.binRecommendations'),
    'App.tsx must restore frozen bin recommendations directly'
  );
  assert.ok(
    appContent.includes('setRoadBinRecommendations(data.roadBinRecommendations'),
    'App.tsx must restore frozen road bin recommendations directly'
  );
  assert.ok(
    appContent.includes('setRouteResult(data.routeResult'),
    'App.tsx must restore frozen route results directly'
  );
  assert.ok(
    appContent.includes('setCurrentStep(3)'),
    'App.tsx must navigate directly to Step 3 PlanDashboard on history opening'
  );

  // Contract: Opening historical events must NOT recalculate predictions or route network
  const handleSelectEventBlock = appContent.slice(
    appContent.indexOf('const handleSelectEvent'),
    appContent.indexOf('const handleExitHistoricalView')
  );
  assert.ok(
    !handleSelectEventBlock.includes('executePlan()'),
    'handleSelectEvent MUST NOT execute live planning pipeline recalculations'
  );
  assert.ok(
    !handleSelectEventBlock.includes('requestCampusPlan('),
    'handleSelectEvent MUST NOT request new plans from backend'
  );
  console.log('✓ App.tsx historical restoration without live recalculation verified');

  // PlanDashboard.tsx contracts
  const planDashboardPath = path.join(__dirname, '../src/components/Step3Plan/PlanDashboard.tsx');
  const planDashboardContent = fs.readFileSync(planDashboardPath, 'utf-8');

  assert.ok(
    planDashboardContent.includes('isHistoricalView'),
    'PlanDashboard must accept isHistoricalView prop'
  );
  assert.ok(
    planDashboardContent.includes('Historical Event Plan'),
    'PlanDashboard must render historical banner'
  );
  assert.ok(
    planDashboardContent.includes('Read-Only') || planDashboardContent.includes('read-only'),
    'PlanDashboard must indicate read-only status'
  );
  assert.ok(
    planDashboardContent.includes('onExitHistoricalView'),
    'PlanDashboard must support onExitHistoricalView'
  );
  assert.ok(
    planDashboardContent.includes('onSaveHistory'),
    'PlanDashboard must support onSaveHistory'
  );
  console.log('✓ PlanDashboard.tsx historical view and saving contracts verified');

  // SavePlanModal.tsx contracts
  const savePlanModalPath = path.join(__dirname, '../src/components/Step3Plan/SavePlanModal.tsx');
  assert.ok(fs.existsSync(savePlanModalPath), 'SavePlanModal.tsx must exist');
  const savePlanModalContent = fs.readFileSync(savePlanModalPath, 'utf-8');

  assert.ok(
    savePlanModalContent.includes('isGuest'),
    'SavePlanModal must handle isGuest prop'
  );
  assert.ok(
    savePlanModalContent.includes('Event history requires an account') || savePlanModalContent.includes('Sign in required'),
    'SavePlanModal must explain guest restrictions'
  );
  assert.ok(
    savePlanModalContent.includes('Save to History') || savePlanModalContent.includes('Save to Event History'),
    'SavePlanModal must provide save action button'
  );
  console.log('✓ SavePlanModal.tsx guest restrictions and action contracts verified');

  // DashboardPage & RecentEventsPanel integration contracts
  const dashboardPagePath = path.join(__dirname, '../src/components/Dashboard/DashboardPage.tsx');
  const dashboardContent = fs.readFileSync(dashboardPagePath, 'utf-8');
  assert.ok(
    dashboardContent.includes('recentEvents'),
    'DashboardPage must accept recentEvents'
  );
  assert.ok(
    dashboardContent.includes('onSelectEvent'),
    'DashboardPage must accept onSelectEvent'
  );

  console.log('✓ DashboardPage history wiring verified');
  console.log('All Event History integration assertions passed successfully!\n');
}

runHistoryIntegrationTests().catch((err) => {
  console.error('History integration tests failed:', err);
  process.exit(1);
});
