import type { CampusApiResponse, CampusData } from '../types/map';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Fetches campus boundary data for a given college name.
 * Strictly communicates only with the Bunbetsu backend API (/api/map/campus).
 */
export async function fetchCampus(college: string): Promise<CampusData> {
  const trimmed = college.trim();
  if (!trimmed) {
    throw new Error('Please enter a college name.');
  }

  const url = `${API_BASE_URL}/api/map/campus?college=${encodeURIComponent(trimmed)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      'Unable to connect to the Bunbetsu backend. Please verify the backend server is running.'
    );
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson && typeof errorJson.detail === 'string') {
        errorDetail = errorJson.detail;
      }
    } catch {
      // response is not json
    }

    if (response.status === 404) {
      throw new Error(errorDetail || `No campus boundary found for "${trimmed}".`);
    }

    if (response.status === 502) {
      throw new Error(errorDetail || 'Geographic provider is temporarily unavailable.');
    }

    throw new Error(errorDetail);
  }

  const data = (await response.json()) as CampusApiResponse;

  if (!data || !data.campus) {
    throw new Error('Invalid response received from the campus API.');
  }

  if (
    !data.campus.geometry ||
    !['Polygon', 'MultiPolygon'].includes(data.campus.geometry.type) ||
    !Array.isArray(data.campus.geometry.coordinates) ||
    data.campus.geometry.coordinates.length === 0
  ) {
    throw new Error('Campus boundary could not be rendered for this result.');
  }

  return data.campus;
}

