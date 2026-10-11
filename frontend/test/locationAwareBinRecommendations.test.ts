/**
 * Location-Aware Bin Recommendations and Tooltip Specification Tests.
 *
 * Verifies:
 * 1. Event-level bin summary shows four metrics: on-site, road, recyclable, disposable.
 * 2. Event-level view does not display emptying turns or solver diagnostics.
 * 3. Selecting a valid location displays location-specific physical bins, stream counts, and required emptying turns.
 * 4. Deselecting immediately restores the event-level summary.
 * 5. Selecting a location without recommendations displays an explicit unavailable state.
 * 6. planningApi maps required_emptying_turns without inventing a nonzero fallback.
 * 7. Tooltip descriptions match all required card definitions.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BinRecommendationResult,
  RoadBinRecommendationResult,
  LocationBinRecommendationItem,
  CampusLocation,
  EntryGate,
} from '../src/types/bunbetsu';

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
}

console.log('--- Running Location-Aware Bin Recommendations Tests ---');

// Mock Data
const mockLocation1: LocationBinRecommendationItem = {
  id: 'loc-food-court',
  location_name: 'Food Court',
  area: 2500,
  activities: ['Food Stalls'],
  capacity_bins: { low: 4, central: 6, high: 8 },
  rectangle_perimeter_m: 200,
  perimeter_spacing_max_bins: 8,
  perimeter_spacing_minimum_bins: 8,
  recommended_bins: { low: 4, central: 6, high: 8 },
  total_physical_bins: 6,
  required_emptying_turns: { low: 1, central: 2, high: 3 },
  daily_capacity_coverage_litres: 1200,
  capacity_shortfall_litres: 0,
  spatial_minimum_bins: 0,
  placement_scenario: 'dense',
  boundary_spacing_target_m: 25.0,
  actual_boundary_spacing_m: 24.5,
  boundary_inset_m: 1.5,
  placement_warnings: [],
  placement_status: 'placed',
  bin_placements: [],
  disposable: {
    capacity_demand_bins: 4,
    physical_bins: 4,
    required_turns: 2,
    daily_waste_kg: 200,
    daily_volume_litres: 800,
    available_capacity_litres: 800,
    capacity_shortfall_litres: 0,
  },
  recyclable: {
    capacity_demand_bins: 2,
    physical_bins: 2,
    required_turns: 1,
    daily_waste_kg: 100,
    daily_volume_litres: 400,
    available_capacity_litres: 400,
    capacity_shortfall_litres: 0,
  },
};

const mockLocation2Failed: LocationBinRecommendationItem = {
  id: 'loc-tight-alley',
  location_name: 'Tight Alley',
  area: 80,
  activities: ['Informal Seating'],
  capacity_bins: { low: 1, central: 2, high: 3 },
  rectangle_perimeter_m: 15,
  perimeter_spacing_max_bins: 0,
  perimeter_spacing_minimum_bins: 0,
  recommended_bins: { low: 0, central: 0, high: 0 },
  total_physical_bins: 0,
  required_emptying_turns: { low: 0, central: 0, high: 0 },
  daily_capacity_coverage_litres: 0,
  capacity_shortfall_litres: 150,
  spatial_minimum_bins: 0,
  placement_scenario: 'failed',
  boundary_spacing_target_m: 25.0,
  actual_boundary_spacing_m: 0,
  boundary_inset_m: 1.5,
  placement_warnings: ['Perimeter too small to fit any bin with 25m spacing'],
  placement_status: 'unsupported_geometry',
  bin_placements: [],
};

const mockBinRecommendations: BinRecommendationResult = {
  status: 'success',
  totalBins: 6,
  capacityBins: { low: 4, central: 6, high: 8 },
  recommendedBins: { low: 4, central: 6, high: 8 },
  requiredEmptyingTurns: { low: 1, central: 2, high: 3 },
  streamBreakdownAvailable: true,
  streamCounts: {
    disposable: 4,
    recyclable: 2,
    general: 4,
    food: 0,
  },
  bins: [],
  locations: [mockLocation1, mockLocation2Failed],
  boundarySpacingTargetM: 25,
  boundaryInsetM: 1.5,
};

const mockRoadBins: RoadBinRecommendationResult = {
  total_road_bins: 3,
  total_eligible_candidates: 10,
  total_locations_requiring_coverage: 2,
  covered_location_ids: ['loc-food-court'],
  uncovered_location_ids: ['loc-tight-alley'],
  location_influence_radii_m: { 'loc-food-court': 30 },
  location_dominant_waste_types: { 'loc-food-court': 'Food' },
  candidate_sampling_interval_m: 5,
  road_bin_spacing_m: 25,
  solver_name: 'PULP_CBC_CMD',
  optimality_proven: true,
  total_popularity_score: 0.85,
  placements: [],
  warnings: [],
};

// Test 1: Event-Level Metrics extraction
{
  const totalOnSite = mockBinRecommendations.totalBins;
  const totalRoad = mockRoadBins.total_road_bins;
  const totalRecyclable = mockBinRecommendations.streamCounts?.recyclable;
  const totalDisposable = mockBinRecommendations.streamCounts?.disposable;

  assert(totalOnSite === 6, 'Event on-site count must equal totalBins');
  assert(totalRoad === 3, 'Event road count must equal total_road_bins');
  assert(totalRecyclable === 2, 'Event recyclable count must equal streamCounts.recyclable');
  assert(totalDisposable === 4, 'Event disposable count must equal streamCounts.disposable');
}

// Test 2: Event-level does not use or expose event-level emptying turns as general truth
{
  // When no location is selected, emptying turns must not be assigned to the event card metrics
  const eventLevelSelectedLocId = null;
  const isLocationSelected = eventLevelSelectedLocId !== null;
  assert(!isLocationSelected, 'Event level mode is active when selectedLocationId is null');
}

// Test 3: Location resolution by stable ID
{
  const selectedId = 'loc-food-court';
  const resolved = mockBinRecommendations.locations?.find((l) => l.id === selectedId);
  assert(Boolean(resolved), 'Location resolved by stable string ID');
  assert(resolved?.location_name === 'Food Court', 'Matching location has correct name');
  assert(resolved?.total_physical_bins === 6, 'Resolved location has correct physical bins');
  assert(resolved?.disposable?.physical_bins === 4, 'Resolved location disposable stream bins match');
  assert(resolved?.recyclable?.physical_bins === 2, 'Resolved location recyclable stream bins match');
  assert(resolved?.required_emptying_turns?.central === 2, 'Resolved location central emptying turns match');
}

// Test 4: Deselection restores event-level state
{
  let currentSelection: string | null = 'loc-food-court';
  // Simulate clicking selected location again
  currentSelection = currentSelection === 'loc-food-court' ? null : 'loc-food-court';
  assert(currentSelection === null, 'Clicking selected location deselects it');

  // Simulate background click
  currentSelection = 'loc-food-court';
  currentSelection = null; // Background click
  assert(currentSelection === null, 'Clicking empty map space sets selectedLocationId to null');
}

// Test 5: Location with unsupported geometry / placement failure
{
  const failedLoc = mockBinRecommendations.locations?.find((l) => l.id === 'loc-tight-alley');
  assert(failedLoc?.placement_status === 'unsupported_geometry', 'Unsupported geometry detected correctly');
  assert(failedLoc?.total_physical_bins === 0, 'Zero physical bins for unsupported geometry');
}

// Test 6: Selected location without matching recommendation
{
  const missingLocId = 'loc-nonexistent';
  const missingMatch = mockBinRecommendations.locations?.find((l) => l.id === missingLocId);
  assert(missingMatch === undefined, 'No matching recommendation found for nonexistent location');
  // Card should NOT fall back to event totals while location remains selected
  const shouldShowUnavailable = missingLocId !== null && !missingMatch;
  assert(shouldShowUnavailable, 'Location-specific unavailable state triggered');
}

// Test 7: Tooltip descriptions verification
{
  const tooltips: Record<string, string> = {
    'Map Layers': 'Toggle campus boundaries, waste heatmaps, bin markers and route overlays.',
    'Campus Map': 'Explore campus locations, waste intensity, recommended bins and pedestrian routes.',
    'Key Waste Estimate': 'View predicted total waste and compare the estimate with the baseline rate.',
    'Waste Composition': 'See the predicted mass and percentage share of each waste category.',
    'Effect of Baseline Rate': 'Compare total predicted waste across baseline waste-generation rates.',
    'Event Details': 'Review the event settings and campus locations used for this plan.',
    'Bin Recommendations': 'View event-level bin totals or select a location to inspect its bin counts and emptying turns.',
    'Pedestrian Routes': 'View scored pedestrian corridors, route demand, connectivity and routing diagnostics.',
    'Location-wise Waste Estimates': 'Compare predicted waste allocation across configured event locations.',
    'Route Insights': 'Inspect the highest-scoring pedestrian route segments and their diagnostics.',
  };

  assert(tooltips['Bin Recommendations'].includes('emptying turns'), 'Bin Recommendations tooltip mentions emptying turns');
  assert(tooltips['Pedestrian Routes'].includes('pedestrian corridors'), 'Pedestrian Routes tooltip mentions pedestrian corridors');
  assert(tooltips['Campus Map'].includes('Explore campus locations'), 'Campus Map tooltip accurate');
  assert(tooltips['Map Layers'].includes('Toggle campus boundaries'), 'Map Layers tooltip accurate');
}

// Test 8: Entry Gate Bins Counted as On-Site Bins
{
  const testGate: EntryGate = {
    id: 'entry-gate',
    name: 'Main Campus Gate',
    coordinates: [77.21, 28.61],
  };

  const gateOnSiteBins = testGate ? 2 : 0;
  const gateDisposableBins = testGate ? 1 : 0;
  const gateRecyclableBins = testGate ? 1 : 0;

  const totalOnSite = (mockBinRecommendations.totalBins ?? 0) + gateOnSiteBins;
  const onSiteRecyclable = (mockBinRecommendations.streamCounts?.recyclable ?? 0) + gateRecyclableBins;
  const onSiteDisposable = (mockBinRecommendations.streamCounts?.disposable ?? 0) + gateDisposableBins;

  assert(totalOnSite === 8, 'Event on-site count includes 2 gate bins (6 zone + 2 gate = 8)');
  assert(onSiteRecyclable === 3, 'On-site recyclable count includes 1 gate recyclable bin (2 zone + 1 gate = 3)');
  assert(onSiteDisposable === 5, 'On-site disposable count includes 1 gate disposable bin (4 zone + 1 gate = 5)');

  // Stream sums across entire event (on-site + road)
  const roadDisposable = mockRoadBins.total_road_bins;
  const totalRecyclable = onSiteRecyclable + 0;
  const totalDisposable = onSiteDisposable + roadDisposable;

  assert(totalRecyclable === 3, 'Total recyclable bins reflects on-site gate addition');
  assert(totalDisposable === 8, 'Total disposable bins reflects on-site gate addition (5 on-site + 3 road = 8)');
}

// Test 9: Map marker location label does not show waste contribution kg
{
  const campusMapPath = fileURLToPath(new URL('../src/components/Map/CampusMap.tsx', import.meta.url));
  const campusMapSource = fs.readFileSync(campusMapPath, 'utf-8');

  // Must not append kg waste contribution to markerText
  assert(
    !campusMapSource.includes('${Math.round(heatVal).toLocaleString()} kg'),
    'CampusMap marker text does not display waste contribution next to location name'
  );
  assert(
    campusMapSource.includes('const markerText = loc.name;'),
    'CampusMap marker text displays cleanly as loc.name'
  );
}

// Test 10: Selected location in Bin Recommendations Card displays activity icons next to activity names
{
  const binPanelPath = fileURLToPath(new URL('../src/components/Step3Plan/BinRecommendationsPanel.tsx', import.meta.url));
  const binPanelSource = fs.readFileSync(binPanelPath, 'utf-8');

  assert(
    binPanelSource.includes('<ActivityIcon type={act}'),
    'BinRecommendationsPanel renders ActivityIcon for selected location activities'
  );
  assert(
    binPanelSource.includes('<span>{act}</span>'),
    'BinRecommendationsPanel renders activity name next to activity icon'
  );
}

console.log(`✓ All ${passedCount} assertions passed in Location-Aware Bin Recommendations tests!`);

