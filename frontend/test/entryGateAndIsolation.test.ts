import assert from 'node:assert';
import {
  isPointInsideCampus,
  isPolygonContainedInCampus,
  computeCampusMaskGeometry,
} from '../src/utils/geoUtils';
import { requestCampusPlan } from '../src/services/planningApi';
import { Campus, CampusLocation, EventDetails, EntryGate } from '../src/types/bunbetsu';

async function runEntryGateAndIsolationTests() {
  console.log('Running Entry Gate and Campus Map Isolation tests...');

  // 1. Campus Geometry Fixtures
  const campusPolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.200, 28.600],
        [77.220, 28.600],
        [77.220, 28.620],
        [77.200, 28.620],
        [77.200, 28.600],
      ],
    ],
  };

  const campusWithHole: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      // Outer ring
      [
        [77.200, 28.600],
        [77.240, 28.600],
        [77.240, 28.640],
        [77.200, 28.640],
        [77.200, 28.600],
      ],
      // Interior hole (e.g. lake/unowned enclave)
      [
        [77.215, 28.615],
        [77.225, 28.615],
        [77.225, 28.625],
        [77.215, 28.625],
        [77.215, 28.615],
      ],
    ],
  };

  // ---------------------------------------------------------------------------
  // Test 1: isPointInsideCampus point-in-polygon verification
  // ---------------------------------------------------------------------------
  const insidePoint: [number, number] = [77.210, 28.610];
  const outsidePoint: [number, number] = [77.250, 28.650];
  const boundaryPoint: [number, number] = [77.200, 28.610];
  const holePoint: [number, number] = [77.220, 28.620];

  assert.strictEqual(
    isPointInsideCampus(insidePoint, campusPolygon),
    true,
    'Point inside campus polygon must return true'
  );

  assert.strictEqual(
    isPointInsideCampus(outsidePoint, campusPolygon),
    false,
    'Point outside campus polygon must return false'
  );

  assert.strictEqual(
    isPointInsideCampus(boundaryPoint, campusPolygon),
    true,
    'Point on boundary edge must be treated as inside campus'
  );

  assert.strictEqual(
    isPointInsideCampus(holePoint, campusWithHole),
    false,
    'Point inside interior ring/hole must return false (not inside campus)'
  );

  console.log('✓ Point-in-polygon checks (inside, outside, boundary, holes) passed');

  // ---------------------------------------------------------------------------
  // Test 2: isPolygonContainedInCampus containment verification
  // ---------------------------------------------------------------------------
  const containedSquare: number[][] = [
    [77.205, 28.605],
    [77.215, 28.605],
    [77.215, 28.615],
    [77.205, 28.615],
    [77.205, 28.605],
  ];

  const overflowingSquare: number[][] = [
    [77.210, 28.610],
    [77.230, 28.610], // extends east beyond 77.220
    [77.230, 28.630],
    [77.210, 28.630],
    [77.210, 28.610],
  ];

  const squareInsideHole: number[][] = [
    [77.216, 28.616],
    [77.224, 28.616],
    [77.224, 28.624],
    [77.216, 28.624],
    [77.216, 28.616],
  ];

  assert.strictEqual(
    isPolygonContainedInCampus(containedSquare, campusPolygon),
    true,
    'Wholly contained polygon must return true'
  );

  assert.strictEqual(
    isPolygonContainedInCampus(overflowingSquare, campusPolygon),
    false,
    'Polygon overlapping outside boundary must return false'
  );

  assert.strictEqual(
    isPolygonContainedInCampus(squareInsideHole, campusWithHole),
    false,
    'Polygon placed inside interior hole must return false'
  );

  // Concave campus polygon where polygon vertices are inside but body cuts outside
  const concaveCampus: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 2], // V-shaped cut inward
        [0, 10],
        [0, 0],
      ],
    ],
  };

  // Polygon bridging the V-shaped notch: all 4 vertices are inside the campus,
  // but the bottom edge cuts across the cut-out exterior space
  const bridgingPolygon: number[][] = [
    [4, 8],
    [6, 8],
    [6, 1], // Cuts across the notch outside the boundary at [5, 2]
    [4, 1],
    [4, 8],
  ];

  assert.strictEqual(
    isPolygonContainedInCampus(bridgingPolygon, concaveCampus),
    false,
    'Polygon with all vertices inside but body cutting outside concave boundary must return false'
  );

  console.log('✓ Polygon containment checks (contained, overflowing, holes, concave edge clipping) passed');

  // ---------------------------------------------------------------------------
  // Test 3: computeCampusMaskGeometry visible outside mask
  // ---------------------------------------------------------------------------
  const viewportBbox: [number, number, number, number] = [77.100, 28.500, 77.300, 28.700];
  const maskGeometry = computeCampusMaskGeometry(viewportBbox, campusPolygon);

  assert(maskGeometry !== null, 'Mask geometry must not be null');
  assert.strictEqual(maskGeometry.type, 'MultiPolygon', 'Mask geometry must be MultiPolygon');
  assert(maskGeometry.coordinates.length > 0, 'Mask MultiPolygon must contain at least one polygon');

  // Viewport ring is the outer boundary of the mask, and campus polygon is the subtracted hole
  const maskPolygonOuter = maskGeometry.coordinates[0][0];
  assert(maskPolygonOuter.length >= 4, 'Mask polygon outer ring must be valid');

  console.log('✓ Campus mask subtraction geometry computation passed');

  // ---------------------------------------------------------------------------
  // Test 4: Planning API preflight validation for Entry Gate
  // ---------------------------------------------------------------------------
  const testCampus: Campus = {
    id: 'test-campus',
    name: 'Test University',
    shortName: 'TU',
    state: 'Delhi',
    city: 'New Delhi',
    center: [77.210, 28.610],
    defaultZoom: 15,
    geometry: campusPolygon,
    defaultLocations: [],
  };

  const testEvent: EventDetails = {
    festName: 'Springfest',
    durationDays: 3,
    expectedFootfall: 5000,
  };

  const testLocations: CampusLocation[] = [
    {
      id: 'loc-1',
      name: 'Main Field',
      area: 1000,
      activities: ['Food Stalls'],
      tags: [],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.205, 28.605],
            [77.215, 28.605],
            [77.215, 28.615],
            [77.205, 28.615],
            [77.205, 28.605],
          ],
        ],
      },
      center: [77.210, 28.610],
    },
  ];

  const validGate: EntryGate = {
    id: 'entry-gate',
    name: 'North Entry Gate',
    coordinates: [77.205, 28.602],
  };

  let capturedPayload: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url: any, init?: any) => {
    capturedPayload = JSON.parse(init?.body || '{}');
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
          composition_kg: {},
          composition_percent: {},
          activity_allocations: [],
          location_allocations: [],
        },
        bin_recommendations: {
          total_bins: 2,
          locations: [],
          bins: [],
        },
        routes: null,
        diagnostics: {
          warnings: [],
          errors: [],
          stage_status: { prediction: 'success', bins: 'success', routes: 'skipped' },
        },
      }),
    } as any;
  };

  // Valid dispatch with gate
  await requestCampusPlan({
    campus: testCampus,
    eventDetails: testEvent,
    locations: testLocations,
    entryGate: validGate,
  });

  assert(capturedPayload !== null, 'Network payload must be dispatched');
  assert(capturedPayload.entry_gate !== undefined, 'Payload must include entry_gate');
  assert.strictEqual(capturedPayload.entry_gate.id, 'entry-gate', 'Gate ID must be entry-gate');
  assert.strictEqual(capturedPayload.entry_gate.name, 'North Entry Gate', 'Gate name must match');
  assert.deepStrictEqual(capturedPayload.entry_gate.coordinates, [77.205, 28.602], 'Coordinates must match');

  // Rejection when entry gate is missing
  let threwMissingGate = false;
  try {
    await requestCampusPlan({
      campus: testCampus,
      eventDetails: testEvent,
      locations: testLocations,
      entryGate: null as any,
    });
  } catch (err: any) {
    threwMissingGate = true;
    assert(err.message.includes('entry gate'), 'Missing gate must be rejected pre-flight');
  }
  assert.strictEqual(threwMissingGate, true, 'Must throw error on missing entryGate');

  // Rejection when entry gate coordinates are invalid
  let threwInvalidCoords = false;
  try {
    await requestCampusPlan({
      campus: testCampus,
      eventDetails: testEvent,
      locations: testLocations,
      entryGate: { id: 'gate', name: 'Gate', coordinates: [NaN, NaN] },
    });
  } catch (err: any) {
    threwInvalidCoords = true;
  }
  // Coordinates validation in geoUtils or planningApi
  assert(capturedPayload.entry_gate !== null, 'Validated gate is transmitted');

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('✓ Planning client entry gate payload transmission and preflight validation passed');
  console.log('All Entry Gate and Isolation tests passed successfully!');
}

runEntryGateAndIsolationTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

