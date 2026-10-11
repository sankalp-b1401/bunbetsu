/**
 * Bunbetsu Campus API Client
 * Connects to the Bunbetsu FastAPI backend (GET /api/map/campus?college=...)
 * Grounded in the real OpenStreetMap Nominatim response.
 */

import { Campus } from '../types/bunbetsu';
import { calculateGeometryAreaM2 } from '../utils/geoUtils';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export interface RawBackendCampus {
  osm_id: number;
  osm_type: string;
  name: string;
  display_name: string;
  latitude: number;
  longitude: number;
  geometry: {
    type: string;
    coordinates: any;
  } | null;
  state?: string | null;
  country?: string | null;
  address?: Record<string, unknown> | null;
  category?: string;
  osm_class?: string;
  osm_type_tag?: string;
}

export interface BackendCampusResponse {
  success: boolean;
  campus: RawBackendCampus;
}

/**
 * Normalizes FastAPI backend response to Bunbetsu frontend Campus model.
 */
export function normalizeBackendCampus(raw: RawBackendCampus): Campus {
  const parts = (raw.display_name || '').split(',').map((p) => p.trim());
  const city = parts.length > 2 ? parts[parts.length - 3] : 'Campus City';

  // Use structured backend state. Do not derive state from display_name.split(',').
  const state = typeof raw.state === 'string' && raw.state.trim() ? raw.state.trim() : '';
  const country = typeof raw.country === 'string' && raw.country.trim()
    ? raw.country.trim()
    : (parts.length > 0 ? parts[parts.length - 1] : 'India');
  const address = parts.length > 3 ? parts.slice(0, 2).join(', ') : raw.display_name;

  const hasValidPolygon = Boolean(
    raw.geometry &&
      (raw.geometry.type === 'Polygon' || raw.geometry.type === 'MultiPolygon') &&
      Array.isArray(raw.geometry.coordinates) &&
      raw.geometry.coordinates.length > 0
  );

  const approxAreaM2 = hasValidPolygon ? calculateGeometryAreaM2(raw.geometry) : 0;
  const approxAreaHectares = Math.round((approxAreaM2 / 10000) * 10) / 10;

  return {
    id: `campus-${raw.osm_id}`,
    osm_id: raw.osm_id,
    osm_type: raw.osm_type,
    name: raw.name || parts[0] || 'Selected Campus',
    fullName: raw.display_name || raw.name,
    display_name: raw.display_name,
    address,
    city,
    state,
    country,
    approxAreaHectares,
    boundarySource: 'OpenStreetMap',
    hasBoundary: hasValidPolygon,
    geometry: raw.geometry,
    boundaryGeometry: raw.geometry,
    center: [raw.longitude, raw.latitude],
    latitude: raw.latitude,
    longitude: raw.longitude,
    defaultZoom: hasValidPolygon ? 15.5 : 15,
    imageUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=80',
    defaultLocations: [],
    category: raw.category,
    osm_class: raw.osm_class,
    osm_type_tag: raw.osm_type_tag,
    structuredAddress: (raw.address as Record<string, unknown>) || undefined,
  };
}

/**
 * Queries FastAPI endpoint GET /api/map/campus?college=<query>
 */
export async function fetchCampusByCollege(query: string): Promise<Campus> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Please enter a college or university name to search.');
  }

  const encoded = encodeURIComponent(trimmed);
  const endpoint = `${API_BASE_URL}/api/map/campus?college=${encoded}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err: any) {
    throw new Error(
      `Unable to connect to the Bunbetsu backend at ${API_BASE_URL || 'http://localhost:8000'}. Please ensure the FastAPI server is running.`
    );
  }

  if (response.status === 404) {
    let detail = `No OpenStreetMap location found for "${trimmed}".`;
    try {
      const errData = await response.json();
      if (errData?.detail) detail = errData.detail;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(detail);
  }

  if (response.status === 502) {
    throw new Error('Unable to retrieve campus data from OpenStreetMap. Please check your connection or try again.');
  }

  if (!response.ok) {
    throw new Error(`Campus search request failed with HTTP ${response.status}.`);
  }

  let data: BackendCampusResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error('Received malformed JSON response from backend campus endpoint.');
  }

  if (!data || !data.success || !data.campus) {
    throw new Error('Malformed campus response structure from backend.');
  }

  return normalizeBackendCampus(data.campus);
}
