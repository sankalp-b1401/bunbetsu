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
