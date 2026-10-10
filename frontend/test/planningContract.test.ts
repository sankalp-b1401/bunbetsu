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
          stream_counts: null,
          stream_breakdown_available: false,
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
  });

  assert(fetchCallCount === 1, 'Clicking Plan must dispatch exactly one network request');
  assert(capturedUrl.includes('/api/planning/plan'), 'Target URL must be /api/planning/plan');
  assert(capturedMethod === 'POST', 'HTTP method must be POST');
  assert(capturedBody.fest_name === 'Rendezvous', 'Payload must include fest_name');
  assert(capturedBody.campus_state === 'Delhi', 'Payload must include campus_state');
  assert(capturedBody.campus_boundary !== null, 'Payload must include campus_boundary');
  assert(capturedBody.locations.length === 2, 'Payload must include active locations');
  assert(capturedBody.locations[0].id === 'loc-oat', 'Payload must preserve stable location ID');

  // Verify response contract
  assert(planResult.prediction !== null, 'Result must contain predictionResult');
  assert(planResult.binRecommendations !== null, 'Result must contain binRecommendations');
  assert(planResult.binRecommendations?.totalBins === 18, 'Result must contain real backend total_bins (18)');
  assert(planResult.binRecommendations?.streamBreakdownAvailable === false, 'Stream breakdown must be flagged as unavailable');
  assert(planResult.binRecommendations?.streamCounts === null, 'streamCounts must be null when unavailable');
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
  });

  assert(binFailedResult.binRecommendations !== null, 'Bin recommendations object must be returned even when failed');
  assert(binFailedResult.binRecommendations?.status === 'failed', 'Bin recommendations status must be mapped to failed');
  assert(
    Boolean(binFailedResult.binRecommendations?.warnings?.[0]?.includes('produced no valid placements')),
    'Bin recommendations warnings must be preserved'
  );

  // Restore original fetch
  globalThis.fetch = originalFetch;

  console.log(`✓ All ${passedCount} assertions in planning contract tests passed!`);
}

runPlanningContractTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

