/**
 * Geographic calculation utilities for Bunbetsu
 * Calculates area in square metres without heavy external GIS libraries.
 */

const EARTH_RADIUS = 6378137; // WGS84 major radius in meters

/**
 * Calculates geodetic polygon area in square metres using spherical excess formula
 * Coordinates format: Array of [longitude, latitude]
 */
export function calculatePolygonAreaM2(coordinates: number[][]): number {
  if (!coordinates || coordinates.length < 3) return 0;

  let area = 0;
  const len = coordinates.length;

  for (let i = 0; i < len; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[(i + 1) % len];

    const lon1Rad = (p1[0] * Math.PI) / 180;
    const lat1Rad = (p1[1] * Math.PI) / 180;
    const lon2Rad = (p2[0] * Math.PI) / 180;
    const lat2Rad = (p2[1] * Math.PI) / 180;

    area += (lon2Rad - lon1Rad) * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad));
  }

  area = Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
  return Math.round(area);
}

/**
 * Calculates total area in square metres for GeoJSON Polygon or MultiPolygon.
 */
export function calculateGeometryAreaM2(geometry: any): number {
  if (!geometry || !geometry.type || !geometry.coordinates) return 0;

  if (geometry.type === 'Polygon') {
    const outerRing = geometry.coordinates[0];
    return outerRing ? calculatePolygonAreaM2(outerRing) : 0;
  }

  if (geometry.type === 'MultiPolygon') {
    let total = 0;
    for (const poly of geometry.coordinates) {
      if (poly && poly[0]) {
        total += calculatePolygonAreaM2(poly[0]);
      }
    }
    return Math.round(total);
  }

  return 0;
}

/**
 * Computes simple bounding box center [lng, lat]
 */
export function getPolygonCenter(coordinates: number[][]): [number, number] {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  let sumLng = 0;
  let sumLat = 0;
  for (const pt of coordinates) {
    sumLng += pt[0];
    sumLat += pt[1];
  }
  return [sumLng / coordinates.length, sumLat / coordinates.length];
}

/**
 * Formats square metres nicely (e.g., "12,500 m²")
 */
export function formatArea(m2: number): string {
  if (!m2 || m2 <= 0) return '0 m²';
  return `${Math.round(m2).toLocaleString()} m²`;
}

export interface PolygonValidationResult {
  isValid: boolean;
  error?: string;
  area?: number;
  center?: [number, number];
}

/**
 * Closes a coordinate ring by copying the exact first coordinate to the end.
 * If the ring is already closed or has fewer than 3 points, returns the points appropriately.
 */
export function closePolygonRing(points: number[][]): number[][] {
  if (!points || points.length < 3) return points ? points.map((p) => [...p]) : [];
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return points.map((p) => [...p]);
  }
  return [...points.map((p) => [...p]), [first[0], first[1]]];
}

/**
 * Checks whether a ring is explicitly closed (at least 4 points and first coordinate equals last coordinate).
 */
export function isRingClosed(points: number[][]): boolean {
  if (!points || points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Validates a polygon coordinate ring according to Bunbetsu rules:
 * - Requires at least 3 distinct vertices.
 * - Requires at least 4 positions in the closed ring.
 * - Ensures first and last coordinates match exactly.
 * - Disallows consecutive duplicate vertices.
 * - Requires area > 0 using calculatePolygonAreaM2.
 */
export function validatePolygonRing(points: number[][]): PolygonValidationResult {
  if (!points || points.length < 4) {
    return {
      isValid: false,
      error: 'A closed polygon requires at least 4 coordinate positions (at least 3 distinct vertices plus closing vertex).',
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return {
      isValid: false,
      error: 'The polygon is not closed: first and last coordinates must be identical.',
    };
  }

  const distinctVertices = points.slice(0, points.length - 1);
  if (distinctVertices.length < 3) {
    return {
      isValid: false,
      error: 'The polygon must have at least 3 distinct vertices.',
    };
  }

  // Check for consecutive duplicate vertices
  for (let i = 0; i < distinctVertices.length; i++) {
    const nextIdx = (i + 1) % distinctVertices.length;
    const curr = distinctVertices[i];
    const next = distinctVertices[nextIdx];
    if (curr[0] === next[0] && curr[1] === next[1]) {
      return {
        isValid: false,
        error: 'The polygon contains duplicate consecutive vertices.',
      };
    }
  }

  const area = calculatePolygonAreaM2(points);
  if (!area || area <= 0) {
    return {
      isValid: false,
      error: 'The polygon does not enclose a valid positive area.',
    };
  }

  const center = getPolygonCenter(points);

  return {
    isValid: true,
    area,
    center,
  };
}
