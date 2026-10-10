/**
 * Test to verify frontend prediction API contract and campus normalization.
 * Verifies that:
 * 1. Frontend request sends campus_state and does NOT send a baseline rate.
 * 2. PredictionResult derives baselineTotalKg and exposes resolved baseline metadata from backend.
 * 3. normalizeBackendCampus uses structured raw.state and does not guess from display_name.
 */

import { requestWastePrediction } from '../src/services/predictionApi';
import { normalizeBackendCampus, RawBackendCampus } from '../src/services/campusApi';
import { CampusLocation } from '../src/types/bunbetsu';

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
}

async function testFrontendRequestPayload() {
  const sampleLocations: CampusLocation[] = [
    {
      id: 'loc-1',
      name: 'Main Ground',
      area: 2500,
      activities: ['Food Stalls', 'Music Concert'],
      tags: [],
      geometry: { type: 'Point', coordinates: [0, 0] },
    },
  ];

  let capturedUrl = '';
  let capturedBody: any = null;

  // Mock global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init?: any) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(init?.body || '{}');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        campus_state: 'Uttar Pradesh',
        baseline_rate_kg_per_person_day: 0.06266,
        baseline_source_year: '2020-21',
        baseline_rate_source: 'CPCB statewise rate (Uttar Pradesh)',
        baseline_is_national_fallback: false,
        total_waste_kg: { low: 1000, central: 1200, high: 1400 },
        composition_kg: {
          Food: { low: 400, central: 500, high: 600 },
          Plastic: { low: 100, central: 150, high: 200 },
          Paper: { low: 100, central: 150, high: 200 },
          Glass: { low: 50, central: 70, high: 90 },
          Others: { low: 350, central: 330, high: 310 },
        },
        composition_percent: { Food: 0.4, Plastic: 0.15, Paper: 0.15, Glass: 0.05, Others: 0.25 },
        recyclable_kg: { low: 250, central: 370, high: 490 },
        disposable_kg: { low: 750, central: 830, high: 910 },
        activity_allocations: [],
        location_allocations: [
          {
            id: 'loc-1',
            location_id: 'loc-1',
            location_name: 'Main Ground',
            area: 2500,
            activities: ['Food Stalls', 'Music Concert'],
            normalized_share: 1.0,
            total_waste_kg: { low: 1000, central: 1200, high: 1400 },
            composition_kg: {},
            recyclable_kg: { low: 250, central: 370, high: 490 },
            disposable_kg: { low: 750, central: 830, high: 910 },
          },
        ],
        heatmap_data: null,
        assumptions: ['Assumptions test'],
      }),
    } as any;
  };

  try {
    const result = await requestWastePrediction({
      totalFootfall: 5000,
      durationDays: 2,
      campusState: 'Uttar Pradesh',
      locations: sampleLocations,
    });

    // 1. Check endpoint
    assert(capturedUrl.includes('/api/prediction/waste'), 'Request should target /api/prediction/waste');

    // 2. Check campus_state is present in request body
    assert(capturedBody.campus_state === 'Uttar Pradesh', 'Request payload must include campus_state');

    // 3. Check baseline_rate_kg_per_person_day is NOT sent in request body
    assert(
      !('baseline_rate_kg_per_person_day' in capturedBody),
      'Request payload must NOT contain baseline_rate_kg_per_person_day'
    );
    assert(
      !('baselineRateKgPerPersonDay' in capturedBody),
      'Request payload must NOT contain baselineRateKgPerPersonDay'
    );

    // 4. Check resolved metadata is mapped to result
    assert(result.campus_state === 'Uttar Pradesh', 'Result must reflect campus_state');
    assert(result.baseline_rate_kg_per_person_day === 0.06266, 'Result must reflect resolved rate');
    assert(result.baseline_source_year === '2020-21', 'Result must reflect baseline source year');
    assert(result.baseline_is_national_fallback === false, 'Result must reflect fallback flag');

    // 5. Check baselineTotalKg is calculated from returned rate: 5000 * 2 * 0.06266 = 627 kg
    assert(result.baselineTotalKg === Math.round(5000 * 2 * 0.06266), 'baselineTotalKg must use returned baseline rate');

    // 6. Check contractFestInput payload inside result has campus_state and no rate
    assert(result.payload.campus_state === 'Uttar Pradesh', 'Result payload must contain campus_state');
    assert(!('baseline_rate_kg_per_person_day' in result.payload), 'Result payload must not contain baseline rate');

    console.log('✓ requestWastePrediction contract test passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testEmptyCampusStateRejection() {
  const sampleLocations: CampusLocation[] = [
    {
      id: 'loc-1',
      name: 'Main Ground',
      area: 2500,
      activities: ['Food Stalls'],
      tags: [],
      geometry: { type: 'Point', coordinates: [0, 0] },
    },
  ];

  let threw = false;
  try {
    await requestWastePrediction({
      totalFootfall: 5000,
      durationDays: 2,
      campusState: '',
      locations: sampleLocations,
    });
  } catch (err: any) {
    threw = true;
    assert(err.message.includes('valid state/UT'), 'Error message should mention valid state/UT requirement');
  }
  assert(threw, 'Empty campusState must reject before dispatching request');
  console.log('✓ Empty campusState rejection test passed');
}

function testCampusNormalization() {
  // Case A: structured state is provided
  const rawWithState: RawBackendCampus = {
    osm_id: 101,
    osm_type: 'way',
    name: 'IIT Kanpur',
    display_name: 'IIT Kanpur, Kalyanpur, Kanpur, Uttar Pradesh, 208016, India',
    latitude: 26.5123,
    longitude: 80.2329,
    geometry: null,
    state: 'Uttar Pradesh',
    country: 'India',
  };

  const campusA = normalizeBackendCampus(rawWithState);
  assert(campusA.state === 'Uttar Pradesh', 'normalizeBackendCampus must use structured raw.state');
  assert(campusA.country === 'India', 'normalizeBackendCampus must use structured raw.country');

  // Case B: structured state is missing/null (must NOT guess from display_name.split)
  const rawWithoutState: RawBackendCampus = {
    osm_id: 102,
    osm_type: 'node',
    name: 'Some Campus',
    display_name: 'Some Campus, Fictional City, Invented Province, India',
    latitude: 10,
    longitude: 20,
    geometry: null,
    state: null,
    country: 'India',
  };

  const campusB = normalizeBackendCampus(rawWithoutState);
  assert(campusB.state === '', 'normalizeBackendCampus must not guess state from display_name when structured state is null');

  console.log('✓ normalizeBackendCampus tests passed');
}

async function runAll() {
  console.log('Running frontend prediction contract tests...');
  await testFrontendRequestPayload();
  await testEmptyCampusStateRejection();
  testCampusNormalization();
  console.log(`All ${passedCount} assertions passed successfully!`);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});

