import type { Polygon, MultiPolygon } from 'geojson';

export type CampusGeometry = Polygon | MultiPolygon;

export interface CampusData {
  osm_id: number;
  osm_type: string;
  name: string;
  display_name: string;
  latitude: number;
  longitude: number;
  geometry: CampusGeometry;
}

export interface CampusApiResponse {
  success: boolean;
  campus: CampusData;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}

