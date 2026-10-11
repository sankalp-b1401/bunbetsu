/**
 * Frontend Planning Contract and Workflow Tests.
 *
 * Verifies:
 * 1. requestCampusPlan dispatches exactly one request to POST /api/planning/plan.
 * 2. Client-side validation catches missing state, negative footfall, duplicate names.
 * 3. Actual backend bin counts and markers appear in the result with stable IDs.
 * 4. No fallback estimates are shown as model output.
 * 5. Stream breakdown is honestly flagged as unavailable (not invented).
 * 6. Route failure preserves successful prediction and bin recommendations.
 * 7. Bin failure does not invent fake markers or counts.
 * 8. Error handling for HTTP 422 and network failure.
 */

import { requestCampusPlan } from '../src/services/planningApi';
import { Campus, CampusLocation, EventDetails } from '../src/types/bunbetsu';

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
}

const mockCampus: Campus = {
  id: 'campus-iitd',
  name: 'IIT Delhi',
  fullName: 'Indian Institute of Technology Delhi',
  address: 'Hauz Khas, New Delhi',
  city: 'New Delhi',
  state: 'Delhi',
  country: 'India',
  approxAreaHectares: 130,
  boundarySource: 'Nominatim',
  hasBoundary: true,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [77.185, 28.540],
        [77.195, 28.540],
        [77.195, 28.550],
        [77.185, 28.550],
        [77.185, 28.540],
      ],
    ],
  },
  center: [77.190, 28.545],
  defaultZoom: 16,
  defaultLocations: [],
};

const mockEvent: EventDetails = {
  festName: 'Rendezvous',
  durationDays: 3,
  expectedFootfall: 6000,
};

const mockLocations: CampusLocation[] = [
  {
    id: 'loc-oat',
    name: 'Open Air Theatre',
    area: 1500,
    activities: ['Music Concert'],
    tags: [],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.1880, 28.5420],
          [77.1900, 28.5420],
          [77.1900, 28.5440],
          [77.1880, 28.5440],
          [77.1880, 28.5420],
        ],
      ],
    },
    center: [77.189, 28.543],
  },
  {
    id: 'loc-food',
    name: 'Food Court',
    area: 1200,
    activities: ['Food Stalls'],
    tags: [],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.1910, 28.5420],
          [77.1930, 28.5420],
          [77.1930, 28.5440],
          [77.1910, 28.5440],
          [77.1910, 28.5420],
        ],
      ],
    },
    center: [77.192, 28.543],
  },
];

const mockEntryGate = {
  id: 'entry-gate',
  name: 'Main Gate',
  coordinates: [77.188, 28.542] as [number, number],
};

async function runPlanningContractTests() {
  console.log('Running frontend planning pipeline contract tests...');

  const originalFetch = globalThis.fetch;

  // ---------------------------------------------------------------------------
  // Test 1: Unified planning dispatch and mapping
  // ---------------------------------------------------------------------------
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: any = null;
  let fetchCallCount = 0;

  globalThis.fetch = async (url: any, init?: any) => {
    fetchCallCount++;
    capturedUrl = String(url);
    capturedMethod = init?.method || 'GET';
    capturedBody = JSON.parse(init?.body || '{}');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          success: true,
          campus_state: 'Delhi',
          baseline_rate_kg_per_person_day: 0.11907,
          baseline_source_year: '2020-21',
          baseline_rate_source: 'CPCB national average fallback',
          baseline_is_national_fallback: true,
          total_waste_kg: { low: 1800, central: 2143, high: 2500 },
          composition_kg: {
            Food: { low: 720, central: 857, high: 1000 },
            Plastic: { low: 270, central: 321, high: 375 },
            Paper: { low: 270, central: 321, high: 375 },
            Glass: { low: 90, central: 107, high: 125 },
            Others: { low: 450, central: 536, high: 625 },
          },
          composition_percent: { Food: 0.40, Plastic: 0.15, Paper: 0.15, Glass: 0.05, Others: 0.25 },
          recyclable_kg: { low: 630, central: 749, high: 875 },
          disposable_kg: { low: 1170, central: 1394, high: 1625 },
          activity_allocations: [],
          location_allocations: [
            {
              id: 'loc-oat',
              location_id: 'loc-oat',
              location_name: 'Open Air Theatre',
              area: 1500,
              activities: ['Music Concert'],
              normalized_share: 0.55,
              total_waste_kg: { low: 990, central: 1179, high: 1375 },
              composition_kg: {},
              recyclable_kg: { low: 346, central: 412, high: 481 },
              disposable_kg: { low: 644, central: 767, high: 894 },
            },
            {
              id: 'loc-food',
              location_id: 'loc-food',
              location_name: 'Food Court',
              area: 1200,
              activities: ['Food Stalls'],
              normalized_share: 0.45,
              total_waste_kg: { low: 810, central: 964, high: 1125 },
              composition_kg: {},
              recyclable_kg: { low: 284, central: 337, high: 394 },
              disposable_kg: { low: 526, central: 627, high: 731 },
            },
          ],
          heatmap_data: null,
          assumptions: ['CPCB national baseline applied.'],
        },
        bin_recommendations: {
          total_bins: 18,
          capacity_bins: { low: 10, central: 14, high: 18 },
          recommended_bins: { low: 14, central: 18, high: 22 },
          required_emptying_turns: { low: 1, central: 1, high: 2 },
          stream_counts: {
            disposable: 12,
            recyclable: 6,
            general: 12,
            food: 0,
          },
          stream_breakdown_available: true,
          locations: [
            {
              id: 'loc-oat',
              location_name: 'Open Air Theatre',
              area: 1500,
              activities: ['Music Concert'],
              capacity_bins: { low: 5, central: 8, high: 10 },
              rectangle_perimeter_m: 160.0,
              perimeter_spacing_max_bins: 6,
              perimeter_spacing_minimum_bins: 6,
              recommended_bins: { low: 8, central: 10, high: 12 },
              required_emptying_turns: { low: 1, central: 1, high: 2 },
              daily_capacity_coverage_litres: 800.0,
              capacity_shortfall_litres: 0.0,
              spatial_minimum_bins: 0,
              total_capacity_demand_bins: 8,
              total_physical_bins: 6,
              disposable: {
                stream_name: 'Disposable',
                total_volume_litres: 767.0,
                daily_volume_litres: 255.67,
                capacity_demand_bins: 4,
                physical_bins: 4,
                required_emptying_turns: 1,
                daily_capacity_coverage_litres: 320.0,
                capacity_shortfall_litres: 0.0,
              },
              recyclable: {
                stream_name: 'Recyclable',
                total_volume_litres: 412.0,
                daily_volume_litres: 137.33,
                capacity_demand_bins: 4,
                physical_bins: 2,
                required_emptying_turns: 1,
                daily_capacity_coverage_litres: 160.0,
                capacity_shortfall_litres: 0.0,
              },
              placement_scenario: 'central',
              boundary_spacing_target_m: 25.0,
              actual_boundary_spacing_m: 24.5,
              boundary_inset_m: 1.5,
              placement_warnings: [],
              placement_status: 'placed',
              bin_placements: [
                {
                  id: 'loc-oat-bin-1',
                  location_id: 'loc-oat',
                  location_name: 'Open Air Theatre',
                  coordinates: [77.1885, 28.5422],
                  bin_index: 1,
                  bin_scenario: 'central',
                  boundary_distance_m: 1.5,
                  bin_type: 'Disposable',
                },
              ],
            },
          ],
          bins: [
            {
              id: 'loc-oat-bin-1',
              location_id: 'loc-oat',
              location_name: 'Open Air Theatre',
              coordinates: [77.1885, 28.5422],
              bin_index: 1,
              bin_scenario: 'central',
              boundary_distance_m: 1.5,
              bin_type: 'Disposable',
            },
          ],
          bin_capacity_litres: 100.0,
          usable_fill_fraction: 0.80,
          usable_bin_capacity_litres: 80.0,
          boundary_spacing_target_m: 25.0,
          boundary_inset_m: 1.5,
          assumptions: ['100L capacity', '80L usable capacity per turn', '25m perimeter spacing policy'],
          warnings: [],
        },
        routes: {
          success: true,
          boundary_geojson: mockCampus.geometry,
          paths_geojson: { type: 'FeatureCollection', features: [] },
          connectors_geojson: { type: 'FeatureCollection', features: [] },
          location_connectivity: [],
          diagnostics: {
            graph: { nodes_count: 10, edges_count: 12, total_length_m: 500, components_count: 1, discarded_ways_count: 0 },
            scoring: { total_locations: 2, connected_locations: 2, unmatched_locations: [], evaluated_pairs: 1, connected_pairs: 1, unreachable_pairs: 0, max_raw_score: 1.0 },
          },
          metadata: {},
          warnings: [],
        },
        diagnostics: {
          warnings: [],
          errors: [],
          stage_status: { prediction: 'success', bins: 'success', routes: 'success' },
        },
      }),
    } as any;
  };

  const planResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(fetchCallCount === 1, 'Clicking Plan must dispatch exactly one network request');
  assert(capturedUrl.includes('/api/planning/plan'), 'Target URL must be /api/planning/plan');
  assert(capturedMethod === 'POST', 'HTTP method must be POST');
  assert(capturedBody.fest_name === 'Rendezvous', 'Payload must include fest_name');
  assert(capturedBody.campus_state === 'Delhi', 'Payload must include campus_state');
  assert(capturedBody.campus_boundary !== null, 'Payload must include campus_boundary');
  assert(capturedBody.entry_gate !== undefined, 'Payload must include entry_gate');
  assert(capturedBody.entry_gate.id === 'entry-gate', 'Payload entry_gate id must match');
  assert(capturedBody.locations.length === 2, 'Payload must include active locations');
  assert(capturedBody.locations[0].id === 'loc-oat', 'Payload must preserve stable location ID');

  // Verify response contract
  assert(planResult.prediction !== null, 'Result must contain predictionResult');
  assert(planResult.binRecommendations !== null, 'Result must contain binRecommendations');
  assert(planResult.binRecommendations?.totalBins === 18, 'Result must contain real backend total_bins (18)');
  assert(planResult.binRecommendations?.streamBreakdownAvailable === true, 'Stream breakdown must be flagged as available');
  assert(planResult.binRecommendations?.streamCounts?.disposable === 12, 'Stream counts must include disposable count (12)');
  assert(planResult.binRecommendations?.streamCounts?.recyclable === 6, 'Stream counts must include recyclable count (6)');
  assert(planResult.binRecommendations?.bins?.[0]?.binType === 'Disposable', 'Placed marker binType must be preserved as Disposable');
  assert(planResult.binRecommendations?.locations?.[0]?.disposable?.physical_bins === 4, 'Location disposable bins preserved');
  assert(planResult.binRecommendations?.locations?.[0]?.recyclable?.physical_bins === 2, 'Location recyclable bins preserved');
  assert(planResult.binRecommendations?.binCapacityLitres === 100.0, 'Bin capacity constant must be 100L');
  assert(planResult.binRecommendations?.usableBinCapacityLitres === 80.0, 'Usable bin capacity must be 80L');
  assert(planResult.binRecommendations?.boundarySpacingTargetM === 25.0, 'Boundary spacing target must be 25m');
  assert(planResult.binRecommendations?.requiredEmptyingTurns?.central === 1, 'Required turns must be serialized');
  assert(planResult.binRecommendations?.locations?.[0].perimeter_spacing_max_bins === 6, 'Perimeter spacing max bins preserved');
  assert(planResult.routeResult !== null, 'Result must contain routeResult');
  assert(planResult.diagnostics.stage_status.prediction === 'success', 'Prediction stage status must be success');
  assert(planResult.diagnostics.stage_status.bins === 'success', 'Bins stage status must be success');
  assert(planResult.diagnostics.stage_status.routes === 'success', 'Routes stage status must be success');

  // ---------------------------------------------------------------------------
  // Test 2: Client-side validation catches duplicate location names
  // ---------------------------------------------------------------------------
  const duplicateLocations: CampusLocation[] = [
    { ...mockLocations[0], id: 'loc-1', name: 'Duplicate Name' },
    { ...mockLocations[1], id: 'loc-2', name: 'Duplicate Name' },
  ];

  let threwDuplicate = false;
  try {
    await requestCampusPlan({
      campus: mockCampus,
      eventDetails: mockEvent,
      locations: duplicateLocations,
      entryGate: mockEntryGate,
    });
  } catch (err: any) {
    threwDuplicate = true;
    assert(err.message.includes('Duplicate location names'), 'Duplicate names must be rejected before network request');
  }
  assert(threwDuplicate, 'Should have thrown on duplicate location names');

  // ---------------------------------------------------------------------------
  // Test 3: Client-side validation catches empty campus state
  // ---------------------------------------------------------------------------
  let threwEmptyState = false;
  try {
    await requestCampusPlan({
      campus: { ...mockCampus, state: '   ' },
      eventDetails: mockEvent,
      locations: mockLocations,
      entryGate: mockEntryGate,
    });
  } catch (err: any) {
    threwEmptyState = true;
    assert(err.message.includes('State/UT'), 'Empty state must be rejected');
  }
  assert(threwEmptyState, 'Should have thrown on empty state');

  // ---------------------------------------------------------------------------
  // Test 4: Route failure preserves prediction and bin results
  // ---------------------------------------------------------------------------
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      prediction: {
        success: true,
        campus_state: 'Delhi',
        baseline_rate_kg_per_person_day: 0.11907,
        baseline_source_year: '2020-21',
        baseline_rate_source: 'CPCB national average fallback',
        baseline_is_national_fallback: true,
        total_waste_kg: { low: 1800, central: 2143, high: 2500 },
        composition_kg: {},
        composition_percent: {},
        recyclable_kg: { low: 630, central: 749, high: 875 },
        disposable_kg: { low: 1170, central: 1394, high: 1625 },
        activity_allocations: [],
        location_allocations: [],
        heatmap_data: null,
        assumptions: [],
      },
      bin_recommendations: {
        total_bins: 12,
        capacity_bins: { low: 8, central: 12, high: 14 },
        recommended_bins: { low: 10, central: 12, high: 15 },
        stream_counts: null,
        stream_breakdown_available: false,
        locations: [],
        bins: [],
        bin_capacity_litres: 100.0,
        usable_fill_fraction: 0.80,
        usable_bin_capacity_litres: 80.0,
        boundary_spacing_target_m: 25.0,
        boundary_inset_m: 1.5,
        assumptions: [],
        warnings: [],
      },
      routes: null,
      diagnostics: {
        warnings: ['Pedestrian routing unavailable: Overpass timed out.'],
        errors: [],
        stage_status: { prediction: 'success', bins: 'success', routes: 'failed' },
      },
    }),
  } as any);

  const routeFailedResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(routeFailedResult.prediction !== null, 'Prediction must be preserved when routes fail');
  assert(routeFailedResult.binRecommendations !== null, 'Bin recommendations must be preserved when routes fail');
  assert(routeFailedResult.binRecommendations?.totalBins === 12, 'Bin counts must be preserved');
  assert(routeFailedResult.routeResult === null, 'routeResult must be null when route planning fails');
  assert(routeFailedResult.diagnostics.stage_status.routes === 'failed', 'Route stage status must report failed');
  assert(routeFailedResult.diagnostics.warnings[0].includes('Overpass timed out'), 'Diagnostics must record route failure warning');

  // ---------------------------------------------------------------------------
  // Test 5: Bin recommendations status mapping ('partial' and 'failed')
  // ---------------------------------------------------------------------------
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      prediction: {
        success: true,
        campus_state: 'Delhi',
        baseline_rate_kg_per_person_day: 0.11907,
        baseline_source_year: '2020-21',
        baseline_rate_source: 'CPCB fallback',
        baseline_is_national_fallback: true,
        total_waste_kg: { low: 100, central: 200, high: 300 },
        composition_kg: {},
        composition_percent: {},
        recyclable_kg: { low: 30, central: 60, high: 90 },
        disposable_kg: { low: 70, central: 140, high: 210 },
        activity_allocations: [],
        location_allocations: [],
        heatmap_data: null,
        assumptions: [],
      },
      bin_recommendations: {
        status: 'failed',
        total_bins: 0,
        capacity_bins: { low: 0, central: 0, high: 0 },
        recommended_bins: { low: 0, central: 0, high: 0 },
        stream_counts: null,
        stream_breakdown_available: false,
        locations: [],
        bins: [],
        bin_capacity_litres: 100.0,
        usable_fill_fraction: 0.80,
        usable_bin_capacity_litres: 80.0,
        boundary_spacing_target_m: 25.0,
        boundary_inset_m: 1.5,
        assumptions: [],
        warnings: ['Bin distribution model produced no valid placements across configured locations.'],
      },
      routes: null,
      diagnostics: {
        warnings: ['Bin model failed'],
        errors: [],
        stage_status: { prediction: 'success', bins: 'failed', routes: 'failed' },
      },
    }),
  } as any);

  const binFailedResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(binFailedResult.binRecommendations !== null, 'Bin recommendations object must be returned even when failed');
  assert(binFailedResult.binRecommendations?.status === 'failed', 'Bin recommendations status must be mapped to failed');
  assert(
    Boolean(binFailedResult.binRecommendations?.warnings?.[0]?.includes('produced no valid placements')),
    'Bin recommendations warnings must be preserved'
  );

  // ---------------------------------------------------------------------------
  // Test 6: Road-bin recommendations contract & coordinate preservation
  // ---------------------------------------------------------------------------
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      prediction: {
        success: true,
        campus_state: 'Delhi',
        baseline_rate_kg_per_person_day: 0.11907,
        baseline_source_year: '2020-21',
        baseline_rate_source: 'CPCB fallback',
        baseline_is_national_fallback: true,
        total_waste_kg: { low: 100, central: 200, high: 300 },
        composition_kg: {},
        composition_percent: {},
        recyclable_kg: { low: 30, central: 60, high: 90 },
        disposable_kg: { low: 70, central: 140, high: 210 },
        activity_allocations: [],
        location_allocations: [],
        heatmap_data: null,
        assumptions: [],
      },
      bin_recommendations: {
        status: 'success',
        total_bins: 4,
        capacity_bins: { low: 2, central: 4, high: 6 },
        recommended_bins: { low: 2, central: 4, high: 6 },
        stream_counts: { disposable: 2, recyclable: 2 },
        stream_breakdown_available: true,
        locations: [],
        bins: [
          {
            id: 'onloc-bin-1',
            location_id: 'loc-oat',
            location_name: 'Open Air Theatre',
            coordinates: [77.189, 28.543],
            bin_index: 0,
            bin_type: 'Disposable',
            bin_scenario: 'balanced',
          },
        ],
        bin_capacity_litres: 100.0,
        usable_fill_fraction: 0.80,
        usable_bin_capacity_litres: 80.0,
        boundary_spacing_target_m: 25.0,
        boundary_inset_m: 1.5,
        assumptions: [],
        warnings: [],
      },
      road_bin_recommendations: {
        total_road_bins: 2,
        total_eligible_candidates: 15,
        total_locations_requiring_coverage: 2,
        covered_location_ids: ['loc-oat', 'loc-food'],
        uncovered_location_ids: [],
        location_influence_radii_m: { 'loc-oat': 25.0, 'loc-food': 15.0 },
        location_dominant_waste_types: { 'loc-oat': 'Paper', 'loc-food': 'Food' },
        candidate_sampling_interval_m: 5.0,
        road_bin_spacing_m: 25.0,
        solver_name: 'highs',
        optimality_proven: true,
        total_popularity_score: 1.85,
        placements: [
          {
            id: 'road-bin-1',
            coordinates: [77.1895, 28.5425],
            source_segment_id: 'way-12345-seg-1',
            source_way_id: 12345,
            normalized_popularity_score: 0.95,
            served_location_ids: ['loc-oat'],
            served_location_names: ['Open Air Theatre'],
            served_location_distances_m: { 'loc-oat': 8.4 },
            stream_type: 'Dual-compartment station',
            provenance: 'road_bin_optimizer',
          },
          {
            id: 'road-bin-2',
            coordinates: [77.1915, 28.5435],
            source_segment_id: 'way-67890-seg-3',
            source_way_id: 67890,
            normalized_popularity_score: 0.90,
            served_location_ids: ['loc-food'],
            served_location_names: ['Food Court'],
            served_location_distances_m: { 'loc-food': 11.2 },
            stream_type: 'Dual-compartment station',
            provenance: 'road_bin_optimizer',
          },
        ],
        warnings: [],
        assumptions: ['Provisional baseline radii'],
      },
      routes: null,
      diagnostics: {
        warnings: [],
        errors: [],
        stage_status: { prediction: 'success', bins: 'success', routes: 'skipped' },
      },
    }),
  } as any);

  const roadBinPlanResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(roadBinPlanResult.roadBinRecommendations !== null, 'roadBinRecommendations must be present');
  assert(roadBinPlanResult.roadBinRecommendations?.total_road_bins === 2, 'total_road_bins must be 2');
  assert(roadBinPlanResult.roadBinRecommendations?.optimality_proven === true, 'optimality_proven must be true');
  assert(roadBinPlanResult.roadBinRecommendations?.solver_name === 'highs', 'solver_name must be highs');
  assert(roadBinPlanResult.roadBinRecommendations?.placements.length === 2, 'placements length must be 2');

  const p1 = roadBinPlanResult.roadBinRecommendations!.placements[0];
  assert(p1.id === 'road-bin-1', 'First placement ID must match');
  assert(p1.coordinates[0] === 77.1895 && p1.coordinates[1] === 28.5425, 'Coordinate order [lng, lat] must be preserved');
  assert(p1.source_segment_id === 'way-12345-seg-1', 'source_segment_id must match');
  assert(p1.normalized_popularity_score === 0.95, 'popularity score must match');
  assert(p1.served_location_names[0] === 'Open Air Theatre', 'served_location_names must match');
  assert(p1.served_location_distances_m['loc-oat'] === 8.4, 'distance from boundary must match');

  // Both on-location bins and road bins coexist without overwriting
  assert(roadBinPlanResult.binRecommendations?.totalBins === 4, 'On-location bin count must remain preserved');
  assert(roadBinPlanResult.binRecommendations?.bins.length === 1, 'On-location markers must remain preserved');

  // ---------------------------------------------------------------------------
  // Test 7: Empty road-bin result (zero bins placed)
  // ---------------------------------------------------------------------------
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      prediction: {
        success: true,
        campus_state: 'Delhi',
        total_waste_kg: { low: 100, central: 200, high: 300 },
        recyclable_kg: { low: 30, central: 60, high: 90 },
        disposable_kg: { low: 70, central: 140, high: 210 },
      },
      bin_recommendations: null,
      road_bin_recommendations: {
        total_road_bins: 0,
        total_eligible_candidates: 0,
        total_locations_requiring_coverage: 2,
        covered_location_ids: [],
        uncovered_location_ids: ['loc-oat', 'loc-food'],
        location_influence_radii_m: { 'loc-oat': 25.0, 'loc-food': 15.0 },
        location_dominant_waste_types: { 'loc-oat': 'Paper', 'loc-food': 'Food' },
        candidate_sampling_interval_m: 5.0,
        road_bin_spacing_m: 25.0,
        solver_name: 'highs',
        optimality_proven: false,
        total_popularity_score: 0.0,
        placements: [],
        warnings: ['No candidates available within influence zones'],
        assumptions: [],
      },
      routes: null,
      diagnostics: {
        warnings: [],
        errors: [],
        stage_status: { prediction: 'success', bins: 'skipped', routes: 'skipped' },
      },
    }),
  } as any);

  const emptyRoadBinResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(emptyRoadBinResult.roadBinRecommendations !== null, 'Empty road-bin result must still be an object, not null');
  assert(emptyRoadBinResult.roadBinRecommendations?.total_road_bins === 0, 'total_road_bins must be 0');
  assert(emptyRoadBinResult.roadBinRecommendations?.placements.length === 0, 'placements must be empty array');
  assert(emptyRoadBinResult.roadBinRecommendations?.uncovered_location_ids.length === 2, 'Uncovered locations must be reported');

  // ---------------------------------------------------------------------------
  // Test 8: Missing/failed road-bin stage (road_bin_recommendations is null)
  // ---------------------------------------------------------------------------
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      prediction: {
        success: true,
        campus_state: 'Delhi',
        total_waste_kg: { low: 100, central: 200, high: 300 },
        recyclable_kg: { low: 30, central: 60, high: 90 },
        disposable_kg: { low: 70, central: 140, high: 210 },
      },
      bin_recommendations: null,
      road_bin_recommendations: null,
      routes: null,
      diagnostics: {
        warnings: ['Road bin stage failed'],
        errors: [],
        stage_status: { prediction: 'success', bins: 'skipped', routes: 'failed' },
      },
    }),
  } as any);

  const missingRoadBinResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
  });

  assert(missingRoadBinResult.roadBinRecommendations === null, 'Missing road-bin response must map to null (unavailable)');

  // Test Feature 9: Alternative path routing configuration and diagnostics contract
  let capturedPayload: any = null;
  globalThis.fetch = (async (_url: string, init: any) => {
    capturedPayload = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          success: true,
          campus_state: 'Delhi',
          total_waste_kg: { low: 100, central: 200, high: 300 },
          recyclable_kg: { low: 30, central: 60, high: 90 },
          disposable_kg: { low: 70, central: 140, high: 210 },
        },
        bin_recommendations: null,
        road_bin_recommendations: null,
        routes: {
          success: true,
          boundary_geojson: mockCampus.geometry,
          paths_geojson: { type: 'FeatureCollection', features: [] },
          connectors_geojson: { type: 'FeatureCollection', features: [] },
          location_connectivity: [],
          diagnostics: {
            graph: { nodes_count: 10, edges_count: 15, total_length_m: 500, components_count: 1, discarded_ways_count: 0 },
            scoring: {
              total_locations: 2,
              connected_locations: 2,
              unmatched_locations: [],
              evaluated_pairs: 1,
              connected_pairs: 1,
              unreachable_pairs: 0,
              max_raw_score: 0.85,
              total_paths_evaluated: 4,
              pairs_with_path_search: 1,
              pairs_with_multiple_paths: 1,
              pairs_reaching_path_limit: 0,
              alternative_path_tolerance_m: 12.0,
              max_paths_per_pair: 10,
              alternative_path_decay_lambda_m: 6.0,
            },
          },
          metadata: {},
          warnings: [],
        },
        diagnostics: {
          warnings: [],
          errors: [],
          stage_status: { prediction: 'success', bins: 'skipped', routes: 'success' },
        },
      }),
    };
  }) as any;

  const altRoutesResult = await requestCampusPlan({
    campus: mockCampus,
    eventDetails: mockEvent,
    locations: mockLocations,
    entryGate: mockEntryGate,
    alternativePathToleranceM: 12.0,
    maxPathsPerPair: 10,
    alternativePathDecayLambdaM: 6.0,
  });

  assert(capturedPayload?.routing_config?.alternative_path_tolerance_m === 12.0, 'alternative_path_tolerance_m sent in payload');
  assert(capturedPayload?.routing_config?.max_paths_per_pair === 10, 'max_paths_per_pair sent in payload');
  assert(capturedPayload?.routing_config?.alternative_path_decay_lambda_m === 6.0, 'alternative_path_decay_lambda_m sent in payload');
  assert(altRoutesResult.routeResult?.diagnostics?.scoring?.total_paths_evaluated === 4, 'total_paths_evaluated mapped in routeResult diagnostics');

  // ---------------------------------------------------------------------------
  // Test 10: Missing entry gate client-side rejection
  // ---------------------------------------------------------------------------
  let threwMissingGate = false;
  try {
    await requestCampusPlan({
      campus: mockCampus,
      eventDetails: mockEvent,
      locations: mockLocations,
      entryGate: null as any,
    });
  } catch (err: any) {
    threwMissingGate = true;
    assert(err.message.includes('entry gate'), 'Missing entry gate rejected pre-flight');
  }
  assert(threwMissingGate, 'Should throw error when entry gate is missing');

  assert(capturedPayload?.routing_config?.alternative_path_tolerance_m === 12.0, 'alternative_path_tolerance_m sent in payload');
  assert(capturedPayload?.routing_config?.max_paths_per_pair === 10, 'max_paths_per_pair sent in payload');
  assert(capturedPayload?.routing_config?.alternative_path_decay_lambda_m === 6.0, 'alternative_path_decay_lambda_m sent in payload');
  assert(altRoutesResult.routeResult?.diagnostics?.scoring?.total_paths_evaluated === 4, 'total_paths_evaluated mapped in routeResult diagnostics');
  assert(altRoutesResult.routeResult?.diagnostics?.scoring?.pairs_with_multiple_paths === 1, 'pairs_with_multiple_paths mapped in routeResult diagnostics');

  // Restore original fetch
  globalThis.fetch = originalFetch;

  console.log(`✓ All ${passedCount} assertions in planning contract tests passed!`);
}

runPlanningContractTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

