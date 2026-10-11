/**
 * Bunbetsu — Heatmap Data Mapping, Monochromatic Palettes & Color Encoding Tests
 *
 * Verifies:
 * 1. Data mapping tests:
 *    - A location with an ID different from its name receives the correct total waste value.
 *    - Recyclable and disposable lookups return the correct location values.
 *    - Category lookup returns the correct category and location value.
 *    - Duplicate location names do not overwrite each other when stable IDs are used.
 *    - Missing values are identified as missing (null) rather than treated as zero.
 *    - A valid zero value is handled correctly (returns 0, not null).
 *    - Switching the category selector changes the values being read.
 *    - normalizeHeatmapData normalizes legacy name keys or location-first structures to stable IDs and category-first nesting.
 *
 * 2. Color & Palette tests:
 *    - Within one heatmap mode, higher values produce darker shades (lower RGB luminance / darker hex).
 *    - Lower values produce lighter shades.
 *    - Different modes use different palette families (total=green, recyclable=green-teal, disposable=amber/orange).
 *    - Different categories use their assigned monochromatic palettes (Food=orange, Plastic=violet, Paper=blue, Glass=teal, Others=slate).
 *    - An all-zero layer avoids division by zero and produces a zero-intensity valid state.
 *    - Missing values do not receive the darkest or misleading lightest color (receive neutral fill MISSING_HEATMAP_COLOR).
 *    - Legend matches the active palette and its numeric scale (min, max, units kg, or no-data state).
 */

import {
  HeatmapData,
  CampusLocation,
  HeatmapMode,
  WasteCategory,
} from '../src/types/bunbetsu';
import {
  getHeatmapValueForLoc,
  getHeatmapPalette,
  getHeatmapColorForRatio,
  interpolateColor,
  normalizeHeatmapData,
  computeHeatmapSummary,
  getGradientCss,
  hexToRgb,
  MISSING_HEATMAP_COLOR,
  HEATMAP_PALETTES,
} from '../src/utils/heatmapPalettes';

let passedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
}

// Helper to compute approximate luminance of an RGB color (0 = black, 255 = white)
function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Sample locations where location ID is distinctly different from its display name
const sampleLocations: CampusLocation[] = [
  {
    id: 'loc-food-zone-99',
    name: 'Main Food Plaza',
    activities: ['Food Stalls'],
    area: 2500,
    tags: [],
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    id: 'loc-arena-stage-02',
    name: 'Concert Ground',
    activities: ['Music Concert'],
    area: 4000,
    tags: [],
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    id: 'loc-food-zone-duplicate-name',
    name: 'Main Food Plaza', // Same name as loc-food-zone-99, but different ID!
    activities: ['Food Stalls'],
    area: 1200,
    tags: [],
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    id: 'loc-zero-waste',
    name: 'Green Info Booth',
    activities: ['Literary & Fine Arts'],
    area: 500,
    tags: [],
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    id: 'loc-missing-data',
    name: 'Unmodelled Pavilion',
    activities: ['Hackathon'],
    area: 1000,
    tags: [],
    geometry: { type: 'Polygon', coordinates: [] },
  },
];

// Sample heatmap data correctly using stable location IDs as keys
const mockHeatmapData: HeatmapData = {
  total_waste_kg: {
    'loc-food-zone-99': { low: 800, central: 1000, high: 1200 },
    'loc-arena-stage-02': { low: 1800, central: 2500, high: 3200 },
    'loc-food-zone-duplicate-name': { low: 400, central: 500, high: 600 },
    'loc-zero-waste': { low: 0, central: 0, high: 0 }, // valid numeric 0
    // 'loc-missing-data' intentionally omitted
  },
  category_waste_kg: {
    Food: {
      'loc-food-zone-99': { low: 400, central: 500, high: 600 },
      'loc-arena-stage-02': { low: 300, central: 400, high: 500 },
      'loc-food-zone-duplicate-name': { low: 200, central: 250, high: 300 },
      'loc-zero-waste': { low: 0, central: 0, high: 0 },
    },
    Plastic: {
      'loc-food-zone-99': { low: 120, central: 150, high: 180 },
      'loc-arena-stage-02': { low: 250, central: 350, high: 450 },
      'loc-food-zone-duplicate-name': { low: 60, central: 75, high: 90 },
      'loc-zero-waste': { low: 0, central: 0, high: 0 },
    },
    Paper: {
      'loc-food-zone-99': { low: 80, central: 100, high: 120 },
      'loc-arena-stage-02': { low: 150, central: 200, high: 250 },
      'loc-food-zone-duplicate-name': { low: 40, central: 50, high: 60 },
      'loc-zero-waste': { low: 0, central: 0, high: 0 },
    },
    Glass: {
      'loc-food-zone-99': { low: 40, central: 50, high: 60 },
      'loc-arena-stage-02': { low: 80, central: 100, high: 120 },
      'loc-food-zone-duplicate-name': { low: 20, central: 25, high: 30 },
      'loc-zero-waste': { low: 0, central: 0, high: 0 },
    },
    Others: {
      'loc-food-zone-99': { low: 160, central: 200, high: 240 },
      'loc-arena-stage-02': { low: 1000, central: 1450, high: 1900 },
      'loc-food-zone-duplicate-name': { low: 80, central: 100, high: 120 },
      'loc-zero-waste': { low: 0, central: 0, high: 0 },
    },
  },
  recyclable_kg: {
    'loc-food-zone-99': { low: 240, central: 300, high: 360 },
    'loc-arena-stage-02': { low: 480, central: 650, high: 820 },
    'loc-food-zone-duplicate-name': { low: 120, central: 150, high: 180 },
    'loc-zero-waste': { low: 0, central: 0, high: 0 },
  },
  disposable_kg: {
    'loc-food-zone-99': { low: 560, central: 700, high: 840 },
    'loc-arena-stage-02': { low: 1300, central: 1850, high: 2400 },
    'loc-food-zone-duplicate-name': { low: 280, central: 350, high: 420 },
    'loc-zero-waste': { low: 0, central: 0, high: 0 },
  },
};

console.log('--- Running Heatmap Data Mapping Tests ---');

// 1. Location with an ID different from its name receives the correct total waste value
const totalVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'total',
  'Food',
  mockHeatmapData
);
assert(
  totalVal === 1000,
  `Location "loc-food-zone-99" (name: Main Food Plaza) should receive central total waste 1000, got ${totalVal}`
);

// Verify querying by display name instead of ID returns null (missing data protection)
const nameQueryVal = getHeatmapValueForLoc(
  'Main Food Plaza',
  'total',
  'Food',
  mockHeatmapData
);
assert(
  nameQueryVal === null,
  `Querying by display name should return null since canonical keys are stable IDs, got ${nameQueryVal}`
);

// 2. Recyclable and disposable lookups return the correct location values
const recycVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'recyclable',
  'Food',
  mockHeatmapData
);
assert(
  recycVal === 300,
  `Recyclable lookup for "loc-food-zone-99" should return 300, got ${recycVal}`
);

const dispVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'disposable',
  'Food',
  mockHeatmapData
);
assert(
  dispVal === 700,
  `Disposable lookup for "loc-food-zone-99" should return 700, got ${dispVal}`
);

// 3. Category lookup returns the correct category and location value
const foodVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'category',
  'Food',
  mockHeatmapData
);
assert(
  foodVal === 500,
  `Category Food lookup for "loc-food-zone-99" should return 500, got ${foodVal}`
);

const plasticVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'category',
  'Plastic',
  mockHeatmapData
);
assert(
  plasticVal === 150,
  `Category Plastic lookup for "loc-food-zone-99" should return 150, got ${plasticVal}`
);

const paperVal = getHeatmapValueForLoc(
  'loc-arena-stage-02',
  'category',
  'Paper',
  mockHeatmapData
);
assert(
  paperVal === 200,
  `Category Paper lookup for "loc-arena-stage-02" should return 200, got ${paperVal}`
);

// 4. Duplicate location names do not overwrite each other when stable IDs are used
const loc1Val = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'total',
  'Food',
  mockHeatmapData
);
const loc2Val = getHeatmapValueForLoc(
  'loc-food-zone-duplicate-name',
  'total',
  'Food',
  mockHeatmapData
);
assert(
  loc1Val === 1000,
  `First location with name "Main Food Plaza" should have value 1000`
);
assert(
  loc2Val === 500,
  `Second location with name "Main Food Plaza" should have value 500`
);
assert(
  loc1Val !== loc2Val,
  `Duplicate names must retain distinct values under stable IDs`
);

// 5. Missing values are identified as missing (null) rather than treated as zero
const missingVal = getHeatmapValueForLoc(
  'loc-missing-data',
  'total',
  'Food',
  mockHeatmapData
);
assert(
  missingVal === null,
  `Missing location data should return null, not 0, got ${missingVal}`
);

const missingCategoryVal = getHeatmapValueForLoc(
  'loc-missing-data',
  'category',
  'Food',
  mockHeatmapData
);
assert(
  missingCategoryVal === null,
  `Missing category location data should return null, got ${missingCategoryVal}`
);

const missingHeatmapDataVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'total',
  'Food',
  null
);
assert(
  missingHeatmapDataVal === null,
  `Null heatmapData should return null, got ${missingHeatmapDataVal}`
);

const noneModeVal = getHeatmapValueForLoc(
  'loc-food-zone-99',
  'none',
  'Food',
  mockHeatmapData
);
assert(
  noneModeVal === null,
  `Mode "none" should return null, got ${noneModeVal}`
);

// 6. A valid zero value is still handled correctly (returns 0, not null)
const zeroVal = getHeatmapValueForLoc(
  'loc-zero-waste',
  'total',
  'Food',
  mockHeatmapData
);
assert(
  zeroVal === 0,
  `A valid zero value should return numeric 0, not null, got ${zeroVal}`
);
assert(
  typeof zeroVal === 'number',
  `Valid zero value must have type 'number'`
);

// 7. Switching the category selector changes the values being read
const foodArena = getHeatmapValueForLoc(
  'loc-arena-stage-02',
  'category',
  'Food',
  mockHeatmapData
);
const othersArena = getHeatmapValueForLoc(
  'loc-arena-stage-02',
  'category',
  'Others',
  mockHeatmapData
);
assert(
  foodArena === 400 && othersArena === 1450,
  `Switching category must change the values read: Food=${foodArena}, Others=${othersArena}`
);

// 8. normalizeHeatmapData normalizes legacy name-keyed and location-first inputs
const legacyRawHeatmap: any = {
  total_waste_kg: {
    'Main Food Plaza': { low: 800, central: 1000, high: 1200 },
  },
  category_waste_kg: {
    // Legacy location-first nesting: [locationName][category]
    'Main Food Plaza': {
      Food: { low: 400, central: 500, high: 600 },
      Plastic: { low: 100, central: 150, high: 200 },
    },
  },
  recyclable_kg: {
    'Main Food Plaza': { low: 200, central: 300, high: 400 },
  },
  disposable_kg: {
    'Main Food Plaza': { low: 600, central: 700, high: 800 },
  },
};

const normalized = normalizeHeatmapData(legacyRawHeatmap, sampleLocations);
assert(normalized !== null, 'normalizeHeatmapData must return a valid HeatmapData object');
assert(
  normalized?.total_waste_kg['loc-food-zone-99']?.central === 1000,
  'normalizeHeatmapData must map location name to stable location ID'
);
assert(
  normalized?.category_waste_kg['Food']?.['loc-food-zone-99']?.central === 500,
  'normalizeHeatmapData must invert legacy location-first nesting into canonical category-first nesting'
);
assert(
  normalized?.recyclable_kg['loc-food-zone-99']?.central === 300,
  'normalizeHeatmapData must map recyclable keys to stable location ID'
);
assert(
  normalized?.disposable_kg['loc-food-zone-99']?.central === 700,
  'normalizeHeatmapData must map disposable keys to stable location ID'
);

console.log('✓ All Data Mapping tests passed!');

console.log('--- Running Monochromatic Palette & Color Tests ---');

// 1. Within one heatmap mode, higher values produce darker shades
const totalPale = getHeatmapColorForRatio(0.0, 'total');
const totalMid = getHeatmapColorForRatio(0.5, 'total');
const totalDark = getHeatmapColorForRatio(1.0, 'total');

const lumPale = getLuminance(totalPale);
const lumMid = getLuminance(totalMid);
const lumDark = getLuminance(totalDark);

assert(
  lumPale > lumMid && lumMid > lumDark,
  `Higher ratio values must produce darker shades (lower luminance): pale(${lumPale}) > mid(${lumMid}) > dark(${lumDark})`
);

// 2. Lower values produce lighter shades
const foodLow = getHeatmapColorForRatio(0.1, 'category', 'Food');
const foodHigh = getHeatmapColorForRatio(0.9, 'category', 'Food');
assert(
  getLuminance(foodLow) > getLuminance(foodHigh),
  `Lower values in Food palette must be lighter than higher values: low=${foodLow} vs high=${foodHigh}`
);

// 3. Different modes use different palette families
const totalPalette = getHeatmapPalette('total');
const recycPalette = getHeatmapPalette('recyclable');
const dispPalette = getHeatmapPalette('disposable');

assert(
  totalPalette.family === 'green',
  `Total waste palette family must be green, got ${totalPalette.family}`
);
assert(
  recycPalette.family === 'green-teal',
  `Recyclable palette family must be green-teal, got ${recycPalette.family}`
);
assert(
  dispPalette.family === 'amber/orange',
  `Disposable palette family must be amber/orange, got ${dispPalette.family}`
);
assert(
  totalPalette.stops[totalPalette.stops.length - 1] !== recycPalette.stops[recycPalette.stops.length - 1],
  'Total and Recyclable must use independent palette endpoints'
);

// 4. Different categories use their assigned monochromatic palettes
const foodPalette = getHeatmapPalette('category', 'Food');
const plasticPalette = getHeatmapPalette('category', 'Plastic');
const paperPalette = getHeatmapPalette('category', 'Paper');
const glassPalette = getHeatmapPalette('category', 'Glass');
const othersPalette = getHeatmapPalette('category', 'Others');

assert(foodPalette.family === 'orange', `Food palette must be orange`);
assert(plasticPalette.family === 'violet', `Plastic palette must be violet`);
assert(paperPalette.family === 'blue', `Paper palette must be blue`);
assert(glassPalette.family === 'teal', `Glass palette must be teal`);
assert(othersPalette.family === 'slate', `Others palette must be slate`);

// Switching from Food to Plastic must change colors
const colorFood = getHeatmapColorForRatio(0.8, 'category', 'Food');
const colorPlastic = getHeatmapColorForRatio(0.8, 'category', 'Plastic');
assert(
  colorFood !== colorPlastic,
  `Switching category from Food to Plastic must produce distinct colors at ratio 0.8: Food=${colorFood}, Plastic=${colorPlastic}`
);

// 5. An all-zero layer does not cause division by zero
const allZeroHeatmap: HeatmapData = {
  total_waste_kg: {
    'loc-1': { low: 0, central: 0, high: 0 },
    'loc-2': { low: 0, central: 0, high: 0 },
  },
  category_waste_kg: {
    Food: {
      'loc-1': { low: 0, central: 0, high: 0 },
      'loc-2': { low: 0, central: 0, high: 0 },
    },
  },
  recyclable_kg: {},
  disposable_kg: {},
};

const zeroSummary = computeHeatmapSummary(
  [
    { id: 'loc-1', name: 'Z1', activities: ['Food Stalls'], area: 100, tags: [], geometry: { type: 'Polygon', coordinates: [] } },
    { id: 'loc-2', name: 'Z2', activities: ['Food Stalls'], area: 200, tags: [], geometry: { type: 'Polygon', coordinates: [] } },
  ],
  'total',
  'Food',
  allZeroHeatmap
);

assert(zeroSummary.hasValidData === true, 'All-zero layer should have valid data');
assert(zeroSummary.isAllZero === true, 'All-zero layer isAllZero should be true');
assert(zeroSummary.minValue === 0 && zeroSummary.maxValue === 0, 'Min and max should both be 0');

// Ratio for all-zero must evaluate to 0 and interpolate safely without NaN or crash
const zeroRatio = zeroSummary.maxValue! > 0 ? 0 / zeroSummary.maxValue! : 0;
const zeroColor = getHeatmapColorForRatio(zeroRatio, 'total');
assert(
  zeroColor === totalPalette.stops[0],
  `All-zero layer ratio must be 0 and produce lightest valid palette shade ${totalPalette.stops[0]}, got ${zeroColor}`
);

// 6. Missing values do not receive the darkest or misleading lightest data color
assert(
  MISSING_HEATMAP_COLOR === '#CBD5E1',
  `Missing data must use neutral swatch #CBD5E1`
);
assert(
  !totalPalette.stops.includes(MISSING_HEATMAP_COLOR),
  'Missing data color must not be an active stop in the total palette'
);
assert(
  !foodPalette.stops.includes(MISSING_HEATMAP_COLOR),
  'Missing data color must not be an active stop in the food palette'
);

// 7. Legend gradient and summary match the active palette and numeric scale
const activeSummary = computeHeatmapSummary(
  sampleLocations,
  'total',
  'Food',
  mockHeatmapData
);
assert(activeSummary.hasValidData === true, 'Summary must have valid data');
assert(activeSummary.minValue === 0, `Min value across valid locations should be 0, got ${activeSummary.minValue}`);
assert(activeSummary.maxValue === 2500, `Max value across valid locations should be 2500, got ${activeSummary.maxValue}`);

const gradientCss = getGradientCss(totalPalette.stops);
assert(
  gradientCss.startsWith('linear-gradient(to right, #EAF5E6,'),
  `Gradient CSS must start with lightest stop #EAF5E6: ${gradientCss}`
);
assert(
  gradientCss.endsWith('#004B20)'),
  `Gradient CSS must end with darkest stop #004B20: ${gradientCss}`
);

// No-data summary handling
const emptySummary = computeHeatmapSummary(
  sampleLocations,
  'category',
  'Glass',
  { total_waste_kg: {}, category_waste_kg: {}, recyclable_kg: {}, disposable_kg: {} }
);
assert(
  emptySummary.hasValidData === false,
  'Empty heatmap layer must produce hasValidData === false'
);

console.log('✓ All Monochromatic Palette & Color tests passed!');

console.log(`\nAll ${passedCount} Heatmap Data Mapping & Color Encoding assertions passed successfully!`);

