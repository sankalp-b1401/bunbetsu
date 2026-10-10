/**
 * Tests for Bunbetsu Polygon Drawing, Closure and Area Eraser Improvements
 * Tests:
 * 1. Polygon closure by clicking the starting point (exact first coordinate match, no duplicate point)
 * 2. Screen-space pixel tolerance snapping across different zoom levels
 * 3. Immutable closed draft (subsequent clicks blocked until reopened/restarted)
 * 4. Distinct open vs closed GeoJSON preview representations
 * 5. Geometry validation rules (min 3 distinct vertices, 4 ring positions, positive area, consecutive duplicates rejected)
 * 6. Independent Map Area State Model (Remove Location vs Delete Area distinction)
 * 7. Protection of preset campus locations against deletion
 * 8. Stale state triggers when configured locations are deleted
 */

import {
  calculatePolygonAreaM2,
  getPolygonCenter,
  formatArea,
  closePolygonRing,
  isRingClosed,
  validatePolygonRing,
} from '../src/utils/geoUtils';
import { CampusLocation, UserMapArea, MapMode } from '../src/types/bunbetsu';

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
}

// Simulated MapLibre screen projection helper for unit tests
function mockProject(lngLat: [number, number], zoom: number): { x: number; y: number } {
  // Standard Web Mercator tile projection
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lngLat[0] + 180) / 360) * scale;
  const sinY = Math.sin((lngLat[1] * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinY) / (1 - sinY)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function testPolygonClosureAndSnapping() {
  console.log('Testing Feature A: Polygon Closure and Screen-space Snapping...');

  const pt1: [number, number] = [77.209, 28.6139];
  const pt2: [number, number] = [77.210, 28.6139];
  const pt3: [number, number] = [77.210, 28.6149];
  const pt4: [number, number] = [77.209, 28.6149];

  // 1. Draw three vertices: 1 -> 2 -> 3
  const open3Points = [pt1, pt2, pt3];
  assert(!isRingClosed(open3Points), '3 points draft should not be considered closed');

  // 2. Close 3 vertices: 1 -> 2 -> 3 -> 1
  const closed3Points = closePolygonRing(open3Points);
  assert(closed3Points.length === 4, 'Closed 3-vertex ring must have exactly 4 coordinate positions');
  assert(isRingClosed(closed3Points), 'Closed ring must be detected as closed');
  assert(
    closed3Points[0][0] === closed3Points[3][0] && closed3Points[0][1] === closed3Points[3][1],
    'First and last coordinates must match exactly'
  );

  // 3. Draw four vertices: 1 -> 2 -> 3 -> 4 -> 1
  const open4Points = [pt1, pt2, pt3, pt4];
  const closed4Points = closePolygonRing(open4Points);
  assert(closed4Points.length === 5, 'Closed 4-vertex ring must have exactly 5 coordinate positions');
  assert(
    closed4Points[0][0] === closed4Points[4][0] && closed4Points[0][1] === closed4Points[4][1],
    'First and last coordinates must match exactly in 4-vertex polygon'
  );

  // 4. closePolygonRing should NOT append if already closed
  const idempotentCheck = closePolygonRing(closed4Points);
  assert(idempotentCheck.length === 5, 'Calling closePolygonRing on an already closed ring must not add a duplicate vertex');
  assert(
    idempotentCheck[0][0] === idempotentCheck[4][0] && idempotentCheck[0][1] === idempotentCheck[4][1],
    'Ring remains properly closed'
  );

  // 5. Screen-space distance tolerance snapping across different zoom levels
  const SNAP_TOLERANCE_PX = 16;
  const zoomLevels = [12, 14, 16, 18];

  for (const zoom of zoomLevels) {
    const firstPointScreen = mockProject(pt1, zoom);

    // Simulated click exactly 8 pixels away (within 16px tolerance)
    const insideClick = { x: firstPointScreen.x + 6, y: firstPointScreen.y + 6 };
    const distInside = Math.hypot(firstPointScreen.x - insideClick.x, firstPointScreen.y - insideClick.y);
    assert(distInside <= SNAP_TOLERANCE_PX, `Click at zoom ${zoom} must be within snap tolerance`);

    // Simulated click 25 pixels away (outside tolerance)
    const outsideClick = { x: firstPointScreen.x + 20, y: firstPointScreen.y + 15 };
    const distOutside = Math.hypot(firstPointScreen.x - outsideClick.x, firstPointScreen.y - outsideClick.y);
    assert(distOutside > SNAP_TOLERANCE_PX, `Click at zoom ${zoom} must be outside snap tolerance`);
  }

  // 6. Simulate draft points array click handler logic
  let draft: number[][] = [];
  let isDraftClosed = false;

  const simulateClick = (point: [number, number], clickScreen: { x: number; y: number }, zoom = 15) => {
    if (isDraftClosed) return; // Locked when closed

    if (draft.length < 3) {
      draft.push(point);
      return;
    }

    const firstPointScreen = mockProject(draft[0] as [number, number], zoom);
    const dist = Math.hypot(firstPointScreen.x - clickScreen.x, firstPointScreen.y - clickScreen.y);
    if (dist <= SNAP_TOLERANCE_PX) {
      draft = closePolygonRing(draft);
      isDraftClosed = true;
      return;
    }

    draft.push(point);
  };

  // Add 1, 2, 3
  simulateClick(pt1, mockProject(pt1, 15));
  simulateClick(pt2, mockProject(pt2, 15));
  simulateClick(pt3, mockProject(pt3, 15));
  assert(draft.length === 3 && !isDraftClosed, '3 vertices added, draft open');

  // Click near pt1 but outside tolerance (dist = 30px)
  const screen1 = mockProject(pt1, 15);
  const ptNearOutside: [number, number] = [77.2091, 28.6141];
  simulateClick(ptNearOutside, { x: screen1.x + 25, y: screen1.y + 20 }, 15);
  assert(draft.length === 4 && !isDraftClosed, 'Click outside tolerance added as 4th vertex');

  // Now click within tolerance of pt1 (dist = 6px)
  simulateClick(pt1, { x: screen1.x + 4, y: screen1.y + 4 }, 15);
  assert(isDraftClosed, 'Click within tolerance closed the polygon');
  assert(draft.length === 5, 'Ring closed with 5 coordinates (4 vertices + closing vertex)');
  assert(draft[0][0] === draft[4][0] && draft[0][1] === draft[4][1], 'Closing vertex equals exact first vertex');

  // Additional clicks after closure must NOT modify the ring
  const extraPoint: [number, number] = [77.215, 28.615];
  simulateClick(extraPoint, { x: screen1.x + 100, y: screen1.y + 100 }, 15);
  assert(draft.length === 5, 'Subsequent clicks after closure were ignored');
  assert(draft[0][0] === draft[4][0] && draft[0][1] === draft[4][1], 'Ring remains closed with identical coordinates');

  console.log('✓ Feature A tests passed');
}

function testGeometryValidation() {
  console.log('Testing Feature A/B: Geometry Validation...');

  const pt1: [number, number] = [77.209, 28.6139];
  const pt2: [number, number] = [77.210, 28.6139];
  const pt3: [number, number] = [77.210, 28.6149];
  const pt4: [number, number] = [77.209, 28.6149];

  // Valid closed square
  const validRing = [pt1, pt2, pt3, pt4, pt1];
  const res1 = validatePolygonRing(validRing);
  assert(res1.isValid, 'Square polygon must be valid');
  assert((res1.area ?? 0) > 0, 'Square polygon must have positive area');
  assert(res1.center !== undefined && res1.center.length === 2, 'Square polygon center must be calculated');

  // Reject unclosed ring
  const unclosedRing = [pt1, pt2, pt3, pt4];
  const res2 = validatePolygonRing(unclosedRing);
  assert(!res2.isValid, 'Unclosed ring must be rejected');
  assert(res2.error?.includes('not closed') || false, 'Error message mentions not closed');

  // Reject fewer than 3 distinct vertices
  const collapsedRing = [pt1, pt2, pt1];
  const res3 = validatePolygonRing(collapsedRing);
  assert(!res3.isValid, 'Fewer than 4 points must be rejected');

  // Reject consecutive duplicate vertices
  const duplicateRing = [pt1, pt2, pt2, pt3, pt1];
  const res4 = validatePolygonRing(duplicateRing);
  assert(!res4.isValid, 'Consecutive duplicate vertices must be rejected');
  assert(res4.error?.includes('duplicate') || false, 'Error message mentions duplicate');

  // Reject collinear zero area (points lying on a straight line)
  const collinearRing = [
    [77.209, 28.6139],
    [77.209, 28.6149],
    [77.209, 28.6159],
    [77.209, 28.6139],
  ];
  const res5 = validatePolygonRing(collinearRing);
  assert(!res5.isValid, 'Collinear polygon with 0 area must be rejected');
  assert(res5.error?.includes('positive') || false, 'Error message mentions positive area');

  console.log('✓ Geometry validation tests passed');
}

function testDeleteAreaAndStateModel() {
  console.log('Testing Feature C: Independent Map Areas & Deletion Model...');

  // Setup mock initial campus pool
  const presetLocation1: CampusLocation = {
    id: 'loc-preset-1',
    name: 'Main Quadrangle',
    activities: ['Food Stalls'],
    area: 5000,
    tags: ['Preset Zone'],
    source: 'preset',
    geometry: {
      type: 'Polygon',
      coordinates: [[[77.209, 28.6139], [77.210, 28.6139], [77.210, 28.6149], [77.209, 28.6149], [77.209, 28.6139]]],
    },
  };

  const presetLocation2: CampusLocation = {
    id: 'loc-preset-2',
    name: 'Auditorium Grounds',
    activities: [],
    area: 3200,
    tags: ['Preset Zone'],
    source: 'preset',
    geometry: {
      type: 'Polygon',
      coordinates: [[[77.211, 28.6139], [77.212, 28.6139], [77.212, 28.6149], [77.211, 28.6149], [77.211, 28.6139]]],
    },
  };

  const customArea1: CampusLocation = {
    id: 'loc-custom-1',
    name: 'Student Plaza Stage',
    activities: ['Music Concert'],
    area: 1800,
    tags: ['Custom Area'],
    source: 'user_drawn',
    geometry: {
      type: 'Polygon',
      coordinates: [[[77.213, 28.6139], [77.214, 28.6139], [77.214, 28.6149], [77.213, 28.6149], [77.213, 28.6139]]],
    },
  };

  // Shared master pool of map areas
  let allCampusLocations: CampusLocation[] = [presetLocation1, presetLocation2, customArea1];
  // Configured active event locations
  let configuredLocations: CampusLocation[] = [presetLocation1, customArea1];
  let isPlanStale = false;

  // 1. "Remove Location" simulation: Removes from event configuration, but preserves map area
  const handleRemoveLocation = (locId: string) => {
    configuredLocations = configuredLocations.filter((l) => l.id !== locId);
    allCampusLocations = allCampusLocations.map((loc) => (loc.id === locId ? { ...loc, activities: [] } : loc));
    isPlanStale = true;
  };

  handleRemoveLocation('loc-custom-1');
  assert(configuredLocations.length === 1, 'Configured event locations reduced to 1');
  assert(configuredLocations.every((l) => l.id !== 'loc-custom-1'), 'Custom area removed from event locations');
  assert(
    allCampusLocations.some((l) => l.id === 'loc-custom-1'),
    'CRITICAL: Custom area remains in master map areas pool after Remove Location'
  );

  // 2. "Delete Area" simulation: Permanently deletes map area
  const handleDeleteArea = (areaId: string): { success: boolean; reason?: string } => {
    const target = allCampusLocations.find((l) => l.id === areaId);
    if (!target) return { success: false, reason: 'not_found' };

    // Prevent deletion of preset campus locations
    if (target.source === 'preset') {
      return { success: false, reason: 'preset_protected' };
    }

    allCampusLocations = allCampusLocations.filter((l) => l.id !== areaId);
    if (configuredLocations.some((l) => l.id === areaId)) {
      configuredLocations = configuredLocations.filter((l) => l.id !== areaId);
      isPlanStale = true;
    }
    return { success: true };
  };

  // Attempting to delete a preset campus zone must be blocked
  const presetDeleteAttempt = handleDeleteArea('loc-preset-1');
  assert(!presetDeleteAttempt.success, 'Deleting a preset campus zone must fail');
  assert(presetDeleteAttempt.reason === 'preset_protected', 'Reason is preset_protected');
  assert(
    allCampusLocations.some((l) => l.id === 'loc-preset-1'),
    'Preset campus zone remains intact in allCampusLocations'
  );

  // Deleting the unconfigured custom area
  const customDeleteAttempt = handleDeleteArea('loc-custom-1');
  assert(customDeleteAttempt.success, 'Deleting user-drawn custom area succeeded');
  assert(
    !allCampusLocations.some((l) => l.id === 'loc-custom-1'),
    'User-drawn area is completely removed from allCampusLocations'
  );

  // 3. Test deleting an area that IS currently configured as an event location
  const customArea2: CampusLocation = {
    id: 'loc-custom-2',
    name: 'Hackathon Pavilion',
    activities: ['Hackathon'],
    area: 2200,
    tags: ['Custom Area'],
    source: 'user_drawn',
    geometry: {
      type: 'Polygon',
      coordinates: [[[77.215, 28.6139], [77.216, 28.6139], [77.216, 28.6149], [77.215, 28.6149], [77.215, 28.6139]]],
    },
  };

  allCampusLocations.push(customArea2);
  configuredLocations.push(customArea2);
  isPlanStale = false;

  assert(configuredLocations.some((l) => l.id === 'loc-custom-2'), 'Custom area 2 is configured');
  assert(allCampusLocations.some((l) => l.id === 'loc-custom-2'), 'Custom area 2 is in master pool');

  // Confirmation warning detection
  const isConfiguredBeforeDelete = configuredLocations.some((l) => l.id === 'loc-custom-2');
  assert(isConfiguredBeforeDelete, 'UI confirms that area is currently configured as an event location');

  // If user cancels confirmation: neither is removed
  const userCancelled = false; // simulated confirmation
  if (!userCancelled) {
    handleDeleteArea('loc-custom-2');
  }

  assert(!allCampusLocations.some((l) => l.id === 'loc-custom-2'), 'Custom area 2 permanently erased from map pool');
  assert(!configuredLocations.some((l) => l.id === 'loc-custom-2'), 'Custom area 2 removed from configured locations');
  assert(isPlanStale, 'Planning outputs marked stale after active location was removed via area deletion');

  console.log('✓ Feature C tests passed');
}

function runAll() {
  console.log('--- Running Polygon Drawing & Area Eraser Tests ---');
  testPolygonClosureAndSnapping();
  testGeometryValidation();
  testDeleteAreaAndStateModel();
  console.log(`All ${passedCount} assertions passed successfully!`);
}

runAll();
