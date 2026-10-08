import type { CampusGeometry } from '../types/map';

export type BoundingBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/**
 * Calculates the bounding box for GeoJSON Polygon or MultiPolygon geometries.
 * Returns [minLng, minLat, maxLng, maxLat] or null if geometry is invalid or has no points.
 */
export function getBoundsFromGeometry(geometry?: CampusGeometry | null): BoundingBox | null {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const updatePoint = (coord: unknown) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    for (const ring of rings) {
      if (Array.isArray(ring)) {
        for (const pt of ring) {
          updatePoint(pt);
        }
      }
    }
  } else if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates;
    for (const polygon of polygons) {
      if (Array.isArray(polygon)) {
        for (const ring of polygon) {
          if (Array.isArray(ring)) {
            for (const pt of ring) {
              updatePoint(pt);
            }
          }
        }
      }
    }
  } else {
    return null;
  }

  if (minLng === Infinity || minLat === Infinity || maxLng === -Infinity || maxLat === -Infinity) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

