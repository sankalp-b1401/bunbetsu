/**
 * Bunbetsu Heatmap Palette and Color Interpolation Utilities
 *
 * Implements mode-aware monochromatic color ramps grounded in Bunbetsu's design system:
 * - Total waste: green (pale green -> deep forest green)
 * - Food: orange (pale orange -> deep burnt orange)
 * - Plastic: violet (pale lavender -> deep purple)
 * - Paper: blue (pale blue -> deep blue)
 * - Glass: teal (pale teal -> deep teal)
 * - Others: slate (pale slate -> deep dark slate)
 * - Recyclable: green-teal (pale mint -> deep teal-green)
 * - Disposable: amber/orange (pale amber -> deep burnt orange)
 *
 * Provides smooth continuous color interpolation, explicit data contract validation,
 * and canonical normalization.
 */

import {
  HeatmapData,
  HeatmapMode,
  WasteCategory,
  RangeModel,
  CampusLocation,
} from '../types/bunbetsu';

export interface HeatmapPalette {
  name: string;
  family: string;
  stops: string[]; // Monochromatic color stops ordered from lightest (0.0) to darkest (1.0)
  description: string;
}

export const HEATMAP_PALETTES: Record<string, HeatmapPalette> = {
  total: {
    name: 'Total Waste',
    family: 'green',
    stops: ['#EAF5E6', '#B7E4C7', '#52B788', '#1B7A43', '#004B20'],
    description: 'Pale green to deep forest green',
  },
  Food: {
    name: 'Food',
    family: 'orange',
    stops: ['#FFF3E0', '#FFCC80', '#FB8C00', '#E65100', '#872700'],
    description: 'Pale cream orange to deep burnt orange',
  },
  Plastic: {
    name: 'Plastic',
    family: 'violet',
    stops: ['#F3E8FF', '#D8B4FE', '#9333EA', '#6B21A8', '#3B0764'],
    description: 'Pale lavender to deep purple',
  },
  Paper: {
    name: 'Paper',
    family: 'blue',
    stops: ['#EFF6FF', '#93C5FD', '#2563EB', '#1D4ED8', '#172554'],
    description: 'Pale blue to deep blue',
  },
  Glass: {
    name: 'Glass',
    family: 'teal',
    stops: ['#F0FDFA', '#5EEAD4', '#0D9488', '#0F766E', '#134E4A'],
    description: 'Pale aqua teal to deep teal',
  },
  Others: {
    name: 'Others',
    family: 'slate',
    stops: ['#F1F5F9', '#CBD5E1', '#64748B', '#334155', '#0F172A'],
    description: 'Pale slate to deep dark slate',
  },
  recyclable: {
    name: 'Recyclable',
    family: 'green-teal',
    stops: ['#ECFDF5', '#A7F3D0', '#059669', '#047857', '#064E3B'],
    description: 'Pale mint to deep teal-green',
  },
  disposable: {
    name: 'Disposable',
    family: 'amber/orange',
    stops: ['#FFFBEB', '#FDE68A', '#D97706', '#B45309', '#78350F'],
    description: 'Pale amber to deep burnt orange',
  },
};

/** Muted neutral color for missing or unmodelled location data */
export const MISSING_HEATMAP_COLOR = '#CBD5E1';

/** Opacity levels for MapLibre rendering */
export const MISSING_HEATMAP_OPACITY = 0.35;
export const ACTIVE_HEATMAP_OPACITY = 0.65;

/**
 * Resolves the active monochromatic palette for a given heatmap mode and category.
 */
export function getHeatmapPalette(
  mode: HeatmapMode,
  category: WasteCategory = 'Food'
): HeatmapPalette {
  if (mode === 'category') {
    return HEATMAP_PALETTES[category] || HEATMAP_PALETTES.Food;
  }
  if (mode === 'total') return HEATMAP_PALETTES.total;
  if (mode === 'recyclable') return HEATMAP_PALETTES.recyclable;
  if (mode === 'disposable') return HEATMAP_PALETTES.disposable;
  return HEATMAP_PALETTES.total;
}

/**
 * Converts a hex color string to [r, g, b] numbers (0-255).
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Converts [r, g, b] numbers to a lowercase hex string (#rrggbb).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Continuous linear color interpolation across arbitrary color stops.
 * ratio: normalized value in [0, 1].
 */
export function interpolateColor(stops: string[], ratio: number): string {
  if (stops.length === 0) return '#64748B';
  if (stops.length === 1) return stops[0];

  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const segmentCount = stops.length - 1;
  const position = r * segmentCount;
  const idx = Math.min(Math.floor(position), segmentCount - 1);
  const t = position - idx;

  const [r1, g1, b1] = hexToRgb(stops[idx]);
  const [r2, g2, b2] = hexToRgb(stops[idx + 1]);

  const rInterp = r1 + (r2 - r1) * t;
  const gInterp = g1 + (g2 - g1) * t;
  const bInterp = b1 + (b2 - b1) * t;

  return rgbToHex(rInterp, gInterp, bInterp);
}

/**
 * Returns the monochromatic color for a given normalized ratio [0, 1]
 * matching the active mode and category palette.
 */
export function getHeatmapColorForRatio(
  ratio: number,
  mode: HeatmapMode,
  category: WasteCategory = 'Food'
): string {
  const palette = getHeatmapPalette(mode, category);
  return interpolateColor(palette.stops, ratio);
}

/**
 * Retrieves the central waste estimate for a specific location in the active heatmap mode.
 *
 * Rules:
 * - Returns `number` (including valid 0) when valid numeric estimate exists.
 * - Returns `null` when:
 *   - data is missing
 *   - mode is "none"
 *   - location ID is missing
 *   - category is missing (in category mode)
 *   - central estimate is missing or non-finite
 * - Never treats missing data as a silent 0.
 * - Emits development warnings when data is unexpectedly missing.
 */
export function getHeatmapValueForLoc(
  locId: string,
  mode: HeatmapMode = 'none',
  cat: WasteCategory = 'Food',
  data: HeatmapData | null = null
): number | null {
  if (!data || !mode || mode === 'none' || !locId) {
    return null;
  }

  let range: RangeModel | undefined;

  switch (mode) {
    case 'total':
      range = data.total_waste_kg?.[locId];
      break;
    case 'category':
      if (!cat) return null;
      range = data.category_waste_kg?.[cat]?.[locId];
      break;
    case 'recyclable':
      range = data.recyclable_kg?.[locId];
      break;
    case 'disposable':
      range = data.disposable_kg?.[locId];
      break;
    default:
      return null;
  }

  if (
    !range ||
    typeof range.central !== 'number' ||
    !Number.isFinite(range.central)
  ) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(
        `[Bunbetsu Heatmap] Missing prediction value for location "${locId}" in mode "${mode}"${
          mode === 'category' ? ` (category: ${cat})` : ''
        }.`
      );
    }
    return null;
  }

  return range.central;
}

/**
 * Normalizes backend heatmap data into the canonical frontend contract:
 * 1. All location keys are mapped to stable location IDs (`loc.id`).
 * 2. Category nesting is strictly category-first: `category_waste_kg[category][locationId]`.
 * 3. Preserves all central estimates and ranges faithfully.
 */
export function normalizeHeatmapData(
  rawHeatmap: HeatmapData | null | undefined,
  locations: CampusLocation[]
): HeatmapData | null {
  if (!rawHeatmap) return null;

  const nameToId = new Map<string, string>();
  for (const l of locations) {
    const trimmed = l.name.trim();
    if (!nameToId.has(trimmed)) {
      nameToId.set(trimmed, l.id);
    }
  }
  const knownIds = new Set(locations.map((l) => l.id));

  const resolveKey = (key: string): string => {
    if (knownIds.has(key)) return key;
    const trimmed = key.trim();
    if (nameToId.has(trimmed)) return nameToId.get(trimmed)!;
    return key;
  };

  const normalizeRangeRecord = (
    record: Record<string, RangeModel> | undefined
  ): Record<string, RangeModel> => {
    if (!record) return {};
    const result: Record<string, RangeModel> = {};
    for (const [key, range] of Object.entries(record)) {
      result[resolveKey(key)] = range;
    }
    return result;
  };

  // Handle category_waste_kg: Ensure category-first: [category][locationId]
  const normalizedCategoryWaste: Record<string, Record<string, RangeModel>> = {};
  const standardCategories = ['Food', 'Plastic', 'Paper', 'Glass', 'Others'];

  if (rawHeatmap.category_waste_kg) {
    const rawKeys = Object.keys(rawHeatmap.category_waste_kg);
    const hasCategoryTopLevel = rawKeys.some((k) => standardCategories.includes(k));

    if (hasCategoryTopLevel) {
      // Already category-first: rawHeatmap.category_waste_kg[category][locationId]
      for (const [cat, locMap] of Object.entries(rawHeatmap.category_waste_kg)) {
        normalizedCategoryWaste[cat] = normalizeRangeRecord(locMap);
      }
    } else {
      // Legacy location-first: rawHeatmap.category_waste_kg[locationId][category]
      for (const [locKey, catMap] of Object.entries(rawHeatmap.category_waste_kg)) {
        const canonicalLocId = resolveKey(locKey);
        if (catMap && typeof catMap === 'object') {
          for (const [cat, range] of Object.entries(catMap)) {
            if (!normalizedCategoryWaste[cat]) {
              normalizedCategoryWaste[cat] = {};
            }
            normalizedCategoryWaste[cat][canonicalLocId] = range as RangeModel;
          }
        }
      }
    }
  }

  return {
    total_waste_kg: normalizeRangeRecord(rawHeatmap.total_waste_kg),
    category_waste_kg: normalizedCategoryWaste,
    recyclable_kg: normalizeRangeRecord(rawHeatmap.recyclable_kg),
    disposable_kg: normalizeRangeRecord(rawHeatmap.disposable_kg),
  };
}

export interface HeatmapSummary {
  validValues: number[];
  minValue: number | null;
  maxValue: number | null;
  hasValidData: boolean;
  isAllZero: boolean;
}

/**
 * Computes summary statistics (valid values, min, max, all-zero flag)
 * across the provided locations for the active layer.
 * Missing data is explicitly excluded from calculations.
 */
export function computeHeatmapSummary(
  locations: CampusLocation[],
  mode: HeatmapMode,
  category: WasteCategory,
  data: HeatmapData | null
): HeatmapSummary {
  if (!data || !mode || mode === 'none') {
    return {
      validValues: [],
      minValue: null,
      maxValue: null,
      hasValidData: false,
      isAllZero: false,
    };
  }

  const validValues: number[] = [];
  for (const loc of locations) {
    const val = getHeatmapValueForLoc(loc.id, mode, category, data);
    if (val !== null && typeof val === 'number' && Number.isFinite(val)) {
      validValues.push(val);
    }
  }

  if (validValues.length === 0) {
    return {
      validValues: [],
      minValue: null,
      maxValue: null,
      hasValidData: false,
      isAllZero: false,
    };
  }

  const minValue = Math.min(...validValues);
  const maxValue = Math.max(...validValues);
  const isAllZero = maxValue === 0 && minValue === 0;

  return {
    validValues,
    minValue,
    maxValue,
    hasValidData: true,
    isAllZero,
  };
}

/**
 * Returns a CSS `linear-gradient` string from the palette color stops.
 */
export function getGradientCss(stops: string[]): string {
  if (stops.length === 0) return 'linear-gradient(to right, #CBD5E1, #CBD5E1)';
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
