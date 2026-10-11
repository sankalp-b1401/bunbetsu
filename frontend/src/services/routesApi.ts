/**
 * Bunbetsu Pedestrian Routes API Client
 * Connects to FastAPI endpoint POST /api/routes/plan.
 * Acquires pedestrian network from OpenStreetMap, connects activity locations,
 * and calculates demand-weighted route importance.
 */

import { Campus, CampusLocation, RoutePlanResult } from "../types/bunbetsu";

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export interface PlanCampusRoutesParams {
  campus: Campus;
  locations: CampusLocation[];
  maxSnapDistanceM?: number;
  alternativePathToleranceM?: number;
  maxPathsPerPair?: number;
  alternativePathDecayLambdaM?: number | null;
}

/**
 * Validates inputs and dispatches pedestrian route planning request to FastAPI backend.
 */
export async function planCampusRoutes(
  params: PlanCampusRoutesParams,
): Promise<RoutePlanResult> {
  const {
    campus,
    locations,
    maxSnapDistanceM = 50.0,
    alternativePathToleranceM = 500.0,
    maxPathsPerPair = 20,
    alternativePathDecayLambdaM = null,
  } = params;

  // 1. Client-side pre-flight validation
  const boundary = campus.geometry || campus.boundaryGeometry;
  if (
    !boundary ||
    (boundary.type !== "Polygon" && boundary.type !== "MultiPolygon")
  ) {
    throw new Error(
      "Selected campus boundary is not a valid polygon. Please choose a campus with an established boundary.",
    );
  }

  if (!locations || locations.length === 0) {
    throw new Error(
      "At least one configured activity location is required to calculate pedestrian routes.",
    );
  }

  for (const loc of locations) {
    if (!loc.id) {
      throw new Error("All locations must possess stable unique identifiers.");
    }
    if (!loc.name || !loc.name.trim()) {
      throw new Error(`Location "${loc.id}" has an empty name.`);
    }
    if (!loc.geometry || !loc.geometry.type || !loc.geometry.coordinates) {
      throw new Error(
        `Location "${loc.name}" has invalid or missing geometry.`,
      );
    }
  }

  // 2. Prepare payload
  const payload = {
    boundary,
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      activities: loc.activities,
      geometry: loc.geometry,
      center: loc.center,
    })),
    config: {
      max_snap_distance_m: maxSnapDistanceM,
      overpass_timeout_s: 25.0,
      check_barriers: true,
      alternative_path_tolerance_m: alternativePathToleranceM,
      max_paths_per_pair: maxPathsPerPair,
      alternative_path_decay_lambda_m: alternativePathDecayLambdaM,
    },
  };

  const endpoint = `${API_BASE_URL}/api/routes/plan`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    throw new Error(
      `Unable to connect to Bunbetsu routing service at ${
        API_BASE_URL || "http://localhost:8000"
      }. Please ensure the FastAPI server is running.`,
    );
  }

  if (response.status === 422) {
    let errorDetail =
      "Validation error occurred while processing routing request.";
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        if (typeof errJson.detail === "string") {
          errorDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errorDetail = errJson.detail
            .map((e: any) => e.msg || e.message)
            .join("; ");
        }
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorDetail);
  }

  if (response.status === 504) {
    throw new Error(
      "OpenStreetMap Overpass API timed out while acquiring pedestrian paths. Please try again in a few moments.",
    );
  }

  if (response.status === 502) {
    let detail = "Unable to retrieve pedestrian network from OpenStreetMap.";
    try {
      const errJson = await response.json();
      if (errJson?.detail) detail = String(errJson.detail);
    } catch {
      // Ignore
    }
    throw new Error(detail);
  }

  if (!response.ok) {
    let detail = `Pedestrian routing request failed with HTTP ${response.status}.`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) detail = String(errJson.detail);
    } catch {
      // Ignore
    }
    throw new Error(detail);
  }

  let data: RoutePlanResult;
  try {
    data = await response.json();
  } catch {
    throw new Error("Received malformed JSON from pedestrian routes endpoint.");
  }

  if (
    !data ||
    !data.success ||
    !data.paths_geojson ||
    !data.connectors_geojson
  ) {
    throw new Error(
      "Incomplete pedestrian route result returned from backend.",
    );
  }

  return data;
}
