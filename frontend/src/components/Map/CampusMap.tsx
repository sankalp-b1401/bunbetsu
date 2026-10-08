import { useEffect, useRef, useState, type FC } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { CampusData } from '../../types/map';
import { getBoundsFromGeometry } from '../../utils/geo';
import './CampusMap.css';

interface CampusMapProps {
  campus: CampusData | null;
}

const SOURCE_CAMPUS_ID = 'campus';
const LAYER_FILL_ID = 'campus-fill';
const LAYER_OUTLINE_ID = 'campus-outline';
const SOURCE_OSM_ID = 'osm-tiles';
const LAYER_OSM_ID = 'osm-basemap-layer';

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Self-contained Bunbetsu Map Style specification.
 *
 * Per the M6 MAP_IMPLEMENTATION_PLAN:
 * - Bunbetsu's GeoJSON layer is the primary product.
 * - Does NOT depend on any external tile server to render the campus polygon and boundary.
 * - The campus source, fill layer, and outline layer are built directly into the style,
 *   so they initialize instantly with WebGL without async event delays or race conditions.
 */
const STANDALONE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    [SOURCE_CAMPUS_ID]: {
      type: 'geojson',
      data: EMPTY_GEOJSON,
    },
  },
  layers: [
    // 1. Clean neutral background canvas
    {
      id: 'background-layer',
      type: 'background',
      paint: {
        'background-color': '#f8fafc', // Clean off-white/light neutral
      },
    },
    // 2. Bunbetsu Campus Fill Layer: prominent grey polygon
    {
      id: LAYER_FILL_ID,
      type: 'fill',
      source: SOURCE_CAMPUS_ID,
      paint: {
        'fill-color': '#475569', // Slate-600 prominent grey
        'fill-opacity': 0.7,     // Strong, clear fill
        'fill-outline-color': '#000000',
      },
    },
    // 3. Bunbetsu Campus Boundary Layer: bold black outline
    {
      id: LAYER_OUTLINE_ID,
      type: 'line',
      source: SOURCE_CAMPUS_ID,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#000000', // Pure black boundary
        'line-width': 3.5,       // Bold, unmistakable boundary
        'line-opacity': 1.0,
      },
    },
  ],
};

/**
 * Constructs a valid GeoJSON FeatureCollection from the campus object.
 */
function toCampusFeatureCollection(campus: CampusData | null): GeoJSON.FeatureCollection {
  if (!campus || !campus.geometry) {
    return EMPTY_GEOJSON;
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: campus.name,
          osm_id: campus.osm_id,
          osm_type: campus.osm_type,
        },
        geometry: campus.geometry,
      },
    ],
  };
}

/**
 * Updates the 'campus' GeoJSON source and frames the viewport to the campus polygon.
 */
function updateAndFrameCampus(map: MapLibreMap, campus: CampusData | null) {
  const geojson = toCampusFeatureCollection(campus);

  const applyData = () => {
    try {
      const source = map.getSource(SOURCE_CAMPUS_ID) as GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      }
    } catch (err) {
      console.warn('[Bunbetsu Map] Error updating campus source:', err);
    }
  };

  if (map.isStyleLoaded()) {
    applyData();
  } else {
    map.once('style.load', applyData);
    map.once('load', applyData);
  }

  // Auto-fit viewport to the actual campus polygon geometry
  if (campus?.geometry) {
    const bounds = getBoundsFromGeometry(campus.geometry);
    if (bounds) {
      const doFit = () => {
        try {
          map.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            {
              padding: 90,
              maxZoom: 16.5,
              duration: 1000,
            }
          );
        } catch (err) {
          console.warn('[Bunbetsu Map] Error in fitBounds:', err);
        }
      };

      // Execute framing immediately or on next animation frame
      if (map.loaded()) {
        doFit();
      } else {
        map.once('load', doFit);
        requestAnimationFrame(doFit);
      }
    } else if (
      Number.isFinite(campus.longitude) &&
      Number.isFinite(campus.latitude)
    ) {
      map.flyTo({
        center: [campus.longitude, campus.latitude],
        zoom: 15,
        duration: 1000,
      });
    }
  }
}

export const CampusMap: FC<CampusMapProps> = ({ campus }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [basemapVisible, setBasemapVisible] = useState(false);

  // Initialize MapLibre instance once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: STANDALONE_MAP_STYLE,
      center: [78.9629, 20.5937], // India overview default
      zoom: 4,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    // Standard navigation and scale controls
    map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Ensure map canvas accurately matches container dimensions
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    map.on('load', () => {
      map.resize();
      if (campus) {
        updateAndFrameCampus(map, campus);
      }
    });

    return () => {
      resizeObserver.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update geometry & auto-frame whenever `campus` prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    updateAndFrameCampus(map, campus);
  }, [campus]);

  // Toggle optional OSM basemap context layer
  const handleToggleBasemap = () => {
    const map = mapRef.current;
    if (!map) return;

    const nextState = !basemapVisible;

    if (nextState) {
      // Add OSM source & layer underneath the campus if not already added
      if (!map.getSource(SOURCE_OSM_ID)) {
        map.addSource(SOURCE_OSM_ID, {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
        });
      }

      if (!map.getLayer(LAYER_OSM_ID)) {
        // Place basemap layer UNDER campus-fill so campus polygon remains on top
        map.addLayer(
          {
            id: LAYER_OSM_ID,
            type: 'raster',
            source: SOURCE_OSM_ID,
            minzoom: 0,
            maxzoom: 19,
            paint: {
              'raster-opacity': 0.45,
              'raster-saturation': -0.5,
            },
          },
          LAYER_FILL_ID
        );
      } else {
        map.setLayoutProperty(LAYER_OSM_ID, 'visibility', 'visible');
      }
    } else {
      if (map.getLayer(LAYER_OSM_ID)) {
        map.setLayoutProperty(LAYER_OSM_ID, 'visibility', 'none');
      }
    }

    setBasemapVisible(nextState);
  };

  return (
    <div className="bunbetsu-map-container" ref={mapContainerRef}>
      {/* Basemap toggle control in top-right */}
      <div className="bunbetsu-basemap-toggle">
        <button
          type="button"
          className={`bunbetsu-toggle-btn ${basemapVisible ? 'active' : ''}`}
          onClick={handleToggleBasemap}
          title="Toggle optional OSM background context"
        >
          <span className="bunbetsu-toggle-indicator" />
          Basemap Context: {basemapVisible ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
};
