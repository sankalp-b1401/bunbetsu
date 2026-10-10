import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { Plus, Minus, Navigation, ShieldCheck, Check, X } from "lucide-react";
import {
  Campus,
  CampusLocation,
  ActivityType,
  RoutePlanResult,
  HeatmapMode,
  WasteCategory,
  HeatmapData,
  BinRecommendationResult,
} from "../../types/bunbetsu";
import { ACTIVITIES, ActivityIcon } from "../../constants/activities";
import { calculatePolygonAreaM2, getPolygonCenter } from "../../utils/geoUtils";
import { ActivityLegend } from "./ActivityLegend";
import { MapToolbar } from "./MapToolbar";
import { RouteLegend } from "./RouteLegend";

// Ensure MapLibre Web Worker resolves correctly in Vite / Cloud Run environments
if (typeof window !== "undefined") {
  try {
    const workerUrl = new URL("/maplibre-gl-worker.mjs", window.location.href)
      .href;
    maplibregl.setWorkerUrl(workerUrl);
  } catch {
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
  }
}

const DEFAULT_MAP_CENTER: [number, number] = [78.9629, 20.5937]; // Center of India overview
const DEFAULT_MAP_ZOOM = 4.8;

interface CampusMapProps {
  campus: Campus | null;
  locations?: CampusLocation[];
  selectedLocationId?: string | null;
  onSelectLocation?: (
    locationId: string,
    fallbackLocation?: CampusLocation,
  ) => void;
  onAddCustomLocation?: (newLocation: CampusLocation) => void;
  onUpdateLocation?: (updatedLocation: CampusLocation) => void;
  onStartEditLocation?: (locationId: string) => void;
  onDeleteLocation?: (locationId: string) => void;
  onRequestOpenAddAreaModal?: {
    id?: string;
    name?: string;
    area?: number;
    coordinates?: number[][];
    center?: [number, number];
  } | null;
  onClearRequestAddArea?: () => void;
  showToolbar?: boolean;
  showLegend?: boolean;
  readOnlyPreview?: boolean;
  heightClass?: string;
  className?: string;
  flatCorners?: boolean;
  recenterTrigger?: number;
  userLocation?: [number, number] | null;
  routeResult?: RoutePlanResult | null;
  showRoutes?: boolean;
  onToggleShowRoutes?: (show: boolean) => void;
  isRoutesStale?: boolean;

  // Plan Dashboard Heatmap & Overlay Controls
  heatmapMode?: HeatmapMode;
  heatmapCategory?: WasteCategory;
  heatmapData?: HeatmapData | null;
  showBoundary?: boolean;
  showZones?: boolean;
  showLabels?: boolean;
  showBins?: boolean;
  binRecommendations?: BinRecommendationResult | null;
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string | null) => void;
  mapViewMode?: "map" | "satellite" | "terrain";
  showActivityIcons?: boolean;
}

export const CampusMap: React.FC<CampusMapProps> = ({
  campus,
  locations = [],
  selectedLocationId = null,
  onSelectLocation,
  onAddCustomLocation,
  onUpdateLocation,
  onStartEditLocation,
  onDeleteLocation,
  onRequestOpenAddAreaModal = null,
  onClearRequestAddArea,
  showToolbar = false,
  showLegend = true,
  readOnlyPreview = false,
  heightClass = "h-full min-h-[460px]",
  className = "",
  flatCorners = false,
  recenterTrigger,
  userLocation = null,
  routeResult = null,
  showRoutes = true,
  onToggleShowRoutes,
  isRoutesStale = false,
  heatmapMode = "none",
  heatmapCategory = "Food",
  heatmapData = null,
  showBoundary = true,
  showZones = true,
  showLabels = true,
  showBins = false,
  binRecommendations = null,
  selectedRouteId = null,
  onSelectRoute,
  mapViewMode = "map",
  showActivityIcons = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const draftMarkerRefs = useRef<maplibregl.Marker[]>([]);
  const userLocationMarkerRef = useRef<maplibregl.Marker[]>([]);
  const binMarkersRef = useRef<maplibregl.Marker[]>([]);

  const [currentMode, setCurrentMode] = useState<"select" | "addArea">(
    "select",
  );
  const currentModeRef = useRef<"select" | "addArea">(currentMode);
  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  const locationsRef = useRef<CampusLocation[]>(locations);
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  const onSelectLocationRef = useRef(onSelectLocation);
  useEffect(() => {
    onSelectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

  const onAddCustomLocationRef = useRef(onAddCustomLocation);
  useEffect(() => {
    onAddCustomLocationRef.current = onAddCustomLocation;
  }, [onAddCustomLocation]);

  const campusRef = useRef(campus);
  useEffect(() => {
    campusRef.current = campus;
  }, [campus]);

  const onSelectRouteRef = useRef(onSelectRoute);
  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  const getHeatmapColorForRatio = (ratio: number): string => {
    const r = Math.max(0, Math.min(1, ratio));
    if (r <= 0.2) return "#10B981";
    if (r <= 0.4) return "#34D399";
    if (r <= 0.6) return "#FBBF24";
    if (r <= 0.8) return "#F97316";
    return "#EF4444";
  };

  const getHeatmapValueForLoc = (
    locId: string,
    mode: HeatmapMode = "none",
    cat: WasteCategory = "Food",
    data: HeatmapData | null = null,
  ): number => {
    if (!data || mode === "none") return 0;
    if (mode === "total") return data.total_waste_kg?.[locId]?.central || 0;
    if (mode === "category")
      return data.category_waste_kg?.[locId]?.[cat]?.central || 0;
    if (mode === "recyclable") return data.recyclable_kg?.[locId]?.central || 0;
    if (mode === "disposable") return data.disposable_kg?.[locId]?.central || 0;
    return 0;
  };

  const buildZoneFeatures = (): Feature[] => {
    const isHeatmapActive = heatmapMode && heatmapMode !== "none";
    let maxHeatmap = 1;
    if (isHeatmapActive && heatmapData) {
      locations.forEach((l) => {
        const val = getHeatmapValueForLoc(
          l.id,
          heatmapMode,
          heatmapCategory,
          heatmapData,
        );
        if (val > maxHeatmap) maxHeatmap = val;
      });
    }

    return locations
      .filter((loc) => loc.geometry.type === "Polygon")
      .map((loc) => {
        const hasAct = loc.activities && loc.activities.length > 0;
        const mainActivity = hasAct ? loc.activities[0] : null;
        const defaultColor =
          mainActivity && ACTIVITIES[mainActivity]
            ? ACTIVITIES[mainActivity].color
            : "#64748B";
        const isSelected = loc.id === selectedLocationId;

        let heatmapColor = defaultColor;
        let heatVal = 0;
        let heatRatio = 0;

        if (isHeatmapActive) {
          heatVal = getHeatmapValueForLoc(
            loc.id,
            heatmapMode,
            heatmapCategory,
            heatmapData,
          );
          heatRatio = maxHeatmap > 0 ? heatVal / maxHeatmap : 0;
          heatmapColor = getHeatmapColorForRatio(heatRatio);
        }

        return {
          type: "Feature",
          id: loc.id,
          properties: {
            id: loc.id,
            name: loc.name,
            color: isHeatmapActive ? heatmapColor : defaultColor,
            defaultColor,
            heatmapColor,
            isSelected,
            isHeatmapActive,
            heatVal,
            heatRatio,
          },
          geometry: loc.geometry as any,
        };
      });
  };

  // Helper to directly select an existing location or add & select an unselected location
  const handleSelectOrAddLocation = (loc: CampusLocation) => {
    if (currentModeRef.current === "addArea") return;
    onSelectLocationRef.current?.(loc.id, loc);
  };

  const editingMarkerIdRef = useRef<string | null>(null);

  const [layerToggles, setLayerToggles] = useState({
    boundary: true,
    zones: true,
    labels: true,
  });

  // Polygon drawing state
  const [draftPoints, setDraftPoints] = useState<number[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // New Area Configuration Modal State
  const [pendingNewArea, setPendingNewArea] = useState<{
    id?: string;
    coordinates: number[][];
    area: number;
    center: [number, number];
  } | null>(null);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaActivities, setNewAreaActivities] = useState<ActivityType[]>(
    [],
  );

  const allActivityKeys = Object.keys(ACTIVITIES) as ActivityType[];

  // Open Add Area modal when requested externally
  useEffect(() => {
    if (onRequestOpenAddAreaModal) {
      const area =
        onRequestOpenAddAreaModal.area ||
        (onRequestOpenAddAreaModal.coordinates
          ? calculatePolygonAreaM2(onRequestOpenAddAreaModal.coordinates)
          : 0);
      setPendingNewArea({
        id: onRequestOpenAddAreaModal.id,
        coordinates: onRequestOpenAddAreaModal.coordinates || [],
        area,
        center:
          onRequestOpenAddAreaModal.center ||
          (campus ? campus.center : DEFAULT_MAP_CENTER),
      });
      setNewAreaName(onRequestOpenAddAreaModal.name || "");
      setNewAreaActivities([]);
      onClearRequestAddArea?.();
    }
  }, [onRequestOpenAddAreaModal]);

  const getTileUrlForMode = (mode: "map" | "satellite" | "terrain") => {
    if (mode === "satellite") {
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    }
    if (mode === "terrain") {
      return "https://tile.opentopomap.org/{z}/{x}/{y}.png";
    }
    return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  };

  // Standard clean map style specification
  const mapStyle: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
      "base-tiles": {
        type: "raster",
        tiles: [getTileUrlForMode(mapViewMode)],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "base-layer",
        type: "raster",
        source: "base-tiles",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter = campus ? campus.center : DEFAULT_MAP_CENTER;
    const initialZoom = campus ? campus.defaultZoom : DEFAULT_MAP_ZOOM;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("error", (err) => {
      console.warn("MapLibre event error handled:", err?.error?.message || err);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    map.on("load", () => {
      updateMapLayers(map);
      if (campus) {
        fitToCampus(map);
      }
    });

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((m) => m.remove());
      draftMarkerRefs.current.forEach((m) => m.remove());
      userLocationMarkerRef.current.forEach((m) => m.remove());
      binMarkersRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update user location pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    userLocationMarkerRef.current.forEach((m) => m.remove());
    userLocationMarkerRef.current = [];

    if (userLocation) {
      const el = document.createElement("div");
      el.className =
        "relative flex items-center justify-center cursor-pointer pointer-events-auto select-none";
      el.innerHTML = `
        <span class="absolute w-8 h-8 rounded-full bg-blue-500/25 animate-ping"></span>
        <span class="relative w-4.5 h-4.5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center ring-2 ring-blue-500/40">
          <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
        </span>
      `;
      el.title = "Your Current Detected Location";

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map);

      userLocationMarkerRef.current.push(marker);
    }
  }, [userLocation]);

  // Update map and layers whenever campus changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateMapLayers(map);
      if (campus) {
        fitToCampus(map);
      }
    } else {
      map.once("load", () => {
        updateMapLayers(map);
        if (campus) {
          fitToCampus(map);
        }
      });
    }
  }, [campus?.id]);

  // Robust bounds extraction for any GeoJSON geometry (Polygon, MultiPolygon, etc.)
  const getGeometryBounds = (geometry: any): maplibregl.LngLatBounds | null => {
    if (!geometry || !geometry.coordinates) return null;
    const bounds = new maplibregl.LngLatBounds();
    let count = 0;

    const traverse = (coords: any) => {
      if (
        Array.isArray(coords) &&
        coords.length >= 2 &&
        typeof coords[0] === "number" &&
        typeof coords[1] === "number" &&
        !isNaN(coords[0]) &&
        !isNaN(coords[1])
      ) {
        bounds.extend([coords[0], coords[1]]);
        count++;
      } else if (Array.isArray(coords)) {
        for (const item of coords) {
          traverse(item);
        }
      }
    };

    traverse(geometry.coordinates);
    return count > 0 ? bounds : null;
  };

  // Fit bounds to campus
  const fitToCampus = (map: maplibregl.Map) => {
    if (!campus) {
      map.flyTo({
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        duration: 1200,
      });
      return;
    }

    const bounds = getGeometryBounds(
      campus.geometry || campus.boundaryGeometry,
    );
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 30, bottom: 30, left: 35, right: 35 },
        maxZoom: 16.5,
        duration: 1200,
      });
    } else {
      map.flyTo({
        center: campus.center,
        zoom: campus.defaultZoom || 15.5,
        duration: 1200,
      });
    }
  };

  // Re-center and zoom into campus when recenterTrigger changes
  useEffect(() => {
    if (
      mapRef.current &&
      recenterTrigger !== undefined &&
      recenterTrigger > 0
    ) {
      fitToCampus(mapRef.current);
    }
  }, [recenterTrigger]);

  // Update GeoJSON Layers & Markers
  const updateMapLayers = (map: maplibregl.Map) => {
    if (!campus) {
      if (map.getSource("campus-boundary-src")) {
        (
          map.getSource("campus-boundary-src") as maplibregl.GeoJSONSource
        ).setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      if (map.getSource("location-zones-src")) {
        (
          map.getSource("location-zones-src") as maplibregl.GeoJSONSource
        ).setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      if (map.getSource("available-zones-src")) {
        (
          map.getSource("available-zones-src") as maplibregl.GeoJSONSource
        ).setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      renderMarkers(map);
      return;
    }

    // 1. Campus Boundary
    const geom = campus.geometry || campus.boundaryGeometry;
    if (geom && (geom.type === "Polygon" || geom.type === "MultiPolygon")) {
      const boundaryGeoJson: FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: campus.name },
            geometry: geom as any,
          },
        ],
      };

      if (map.getSource("campus-boundary-src")) {
        (
          map.getSource("campus-boundary-src") as maplibregl.GeoJSONSource
        ).setData(boundaryGeoJson);
      } else {
        map.addSource("campus-boundary-src", {
          type: "geojson",
          data: boundaryGeoJson,
        });

        map.addLayer({
          id: "campus-boundary-fill",
          type: "fill",
          source: "campus-boundary-src",
          layout: {
            visibility: layerToggles.boundary ? "visible" : "none",
          },
          paint: {
            "fill-color": "#70D000",
            "fill-opacity": 0.15,
          },
        });

        map.addLayer({
          id: "campus-boundary-stroke",
          type: "line",
          source: "campus-boundary-src",
          layout: {
            visibility: layerToggles.boundary ? "visible" : "none",
          },
          paint: {
            "line-color": "#004B20",
            "line-width": 2.5,
          },
        });
      }
    } else if (map.getSource("campus-boundary-src")) {
      (
        map.getSource("campus-boundary-src") as maplibregl.GeoJSONSource
      ).setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    // 2. Zone Polygons
    if (!readOnlyPreview) {
      const polygonFeatures = buildZoneFeatures();

      const zonesGeoJson: FeatureCollection = {
        type: "FeatureCollection",
        features: polygonFeatures,
      };

      if (map.getSource("location-zones-src")) {
        (
          map.getSource("location-zones-src") as maplibregl.GeoJSONSource
        ).setData(zonesGeoJson);
      } else {
        map.addSource("location-zones-src", {
          type: "geojson",
          data: zonesGeoJson,
        });

        // Spatial Heatmap Fill Layer
        map.addLayer({
          id: "location-heatmap-fill",
          type: "fill",
          source: "location-zones-src",
          layout: {
            visibility:
              heatmapMode && heatmapMode !== "none" ? "visible" : "none",
          },
          paint: {
            "fill-color": ["get", "heatmapColor"],
            "fill-opacity": 0.6,
          },
        });

        // Base Event Locations Fill Layer (activity stream colors)
        map.addLayer({
          id: "location-zones-fill",
          type: "fill",
          source: "location-zones-src",
          layout: {
            visibility:
              (showZones !== undefined ? showZones : layerToggles.zones) &&
              (!heatmapMode || heatmapMode === "none")
                ? "visible"
                : "none",
          },
          paint: {
            "fill-color": ["get", "defaultColor"],
            "fill-opacity": ["case", ["get", "isSelected"], 0.42, 0.24],
          },
        });

        // Event Locations Boundary Stroke Layer
        map.addLayer({
          id: "location-zones-stroke",
          type: "line",
          source: "location-zones-src",
          layout: {
            visibility: (
              showZones !== undefined ? showZones : layerToggles.zones
            )
              ? "visible"
              : "none",
          },
          paint: {
            "line-color": [
              "case",
              ["get", "isSelected"],
              "#70D000",
              ["get", "color"],
            ],
            "line-width": [
              "case",
              ["get", "isSelected"],
              4.0,
              ["case", ["get", "isHeatmapActive"], 3.2, 2.2],
            ],
          },
        });

        // Click on zone polygon (handles both base fill and heatmap fill)
        const handleZoneClick = (e: maplibregl.MapLayerMouseEvent) => {
          if (currentModeRef.current === "addArea") return;
          if (e.features && e.features[0]?.properties?.id) {
            onSelectLocationRef.current?.(e.features[0].properties.id);
          }
        };

        map.on("click", "location-zones-fill", handleZoneClick);
        map.on("click", "location-heatmap-fill", handleZoneClick);

        map.on("mouseenter", "location-zones-fill", () => {
          if (currentModeRef.current !== "addArea") {
            map.getCanvas().style.cursor = "pointer";
          }
        });
        map.on("mouseenter", "location-heatmap-fill", () => {
          if (currentModeRef.current !== "addArea") {
            map.getCanvas().style.cursor = "pointer";
          }
        });

        map.on("mouseleave", "location-zones-fill", () => {
          if (currentModeRef.current === "addArea") {
            map.getCanvas().style.cursor = "crosshair";
            map.getCanvasContainer().style.cursor = "crosshair";
          } else {
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          }
        });
        map.on("mouseleave", "location-heatmap-fill", () => {
          if (currentModeRef.current === "addArea") {
            map.getCanvas().style.cursor = "crosshair";
            map.getCanvasContainer().style.cursor = "crosshair";
          } else {
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          }
        });
      }

      // 2b. Available unselected campus locations
      const isBuilderMode = Boolean(
        onAddCustomLocation || onRequestOpenAddAreaModal,
      );
      const addedIds = new Set(locations.map((l) => l.id));
      const availableLocations = isBuilderMode
        ? (campus?.defaultLocations || []).filter((l) => !addedIds.has(l.id))
        : [];

      const availableFeatures: Feature[] = availableLocations
        .filter((loc) => loc.geometry.type === "Polygon")
        .map((loc) => ({
          type: "Feature",
          id: loc.id,
          properties: {
            id: loc.id,
            name: loc.name,
          },
          geometry: loc.geometry as any,
        }));

      const availableGeoJson: FeatureCollection = {
        type: "FeatureCollection",
        features: availableFeatures,
      };

      if (map.getSource("available-zones-src")) {
        (
          map.getSource("available-zones-src") as maplibregl.GeoJSONSource
        ).setData(availableGeoJson);
      } else {
        map.addSource("available-zones-src", {
          type: "geojson",
          data: availableGeoJson,
        });

        map.addLayer({
          id: "available-zones-fill",
          type: "fill",
          source: "available-zones-src",
          layout: {
            visibility: layerToggles.zones ? "visible" : "none",
          },
          paint: {
            "fill-color": "#004B20",
            "fill-opacity": 0.06,
          },
        });

        map.addLayer({
          id: "available-zones-stroke",
          type: "line",
          source: "available-zones-src",
          layout: {
            visibility: layerToggles.zones ? "visible" : "none",
          },
          paint: {
            "line-color": "#70D000",
            "line-width": 1.8,
            "line-dasharray": [3, 2],
          },
        });

        map.on("click", "available-zones-fill", (e) => {
          if (currentModeRef.current === "addArea") return;
          if (!onAddCustomLocationRef.current && !onRequestOpenAddAreaModal)
            return;
          if (e.features && e.features[0]?.properties?.id) {
            const locId = e.features[0].properties.id as string;
            const allCampusLocs = campusRef.current?.defaultLocations || [];
            const clicked = allCampusLocs.find((l) => l.id === locId);
            if (clicked) {
              handleSelectOrAddLocation(clicked);
            }
          }
        });

        map.on("mouseenter", "available-zones-fill", () => {
          if (currentModeRef.current !== "addArea") {
            map.getCanvas().style.cursor = "pointer";
          }
        });

        map.on("mouseleave", "available-zones-fill", () => {
          if (currentModeRef.current === "addArea") {
            map.getCanvas().style.cursor = "crosshair";
            map.getCanvasContainer().style.cursor = "crosshair";
          } else {
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          }
        });
      }
    }

    // 3. Update Pedestrian Route Layers
    updateRouteLayers(map);

    // 4. Render HTML Markers on map
    renderMarkers(map);
  };

  // Update Pedestrian Route Layers
  const updateRouteLayers = (map: maplibregl.Map) => {
    const emptyFC: FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    const pathsData =
      routeResult && showRoutes ? routeResult.paths_geojson : emptyFC;
    const connectorsData =
      routeResult && showRoutes ? routeResult.connectors_geojson : emptyFC;
    const intersectionsData =
      routeResult && showRoutes && routeResult.intersections_geojson
        ? routeResult.intersections_geojson
        : emptyFC;

    // 1. Paths Source & Layers
    if (map.getSource("route-paths-src")) {
      (map.getSource("route-paths-src") as maplibregl.GeoJSONSource).setData(
        pathsData as any,
      );
    } else {
      map.addSource("route-paths-src", {
        type: "geojson",
        data: pathsData as any,
      });

      map.addLayer({
        id: "route-paths-casing",
        type: "line",
        source: "route-paths-src",
        layout: {
          visibility: showRoutes ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0F172A",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            3.0,
            16,
            5.5,
            18,
            8.0,
          ],
          "line-opacity": 0.4,
        },
      });

      map.addLayer({
        id: "route-paths-line",
        type: "line",
        source: "route-paths-src",
        layout: {
          visibility: showRoutes ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["get", "normalized_score"],
            0.0,
            "#94A3B8",
            0.2,
            "#38BDF8",
            0.4,
            "#10B981",
            0.65,
            "#F59E0B",
            0.85,
            "#EA580C",
            1.0,
            "#DC2626",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            [
              "interpolate",
              ["linear"],
              ["get", "normalized_score"],
              0,
              1.8,
              1,
              3.5,
            ],
            16,
            [
              "interpolate",
              ["linear"],
              ["get", "normalized_score"],
              0,
              3.2,
              1,
              6.0,
            ],
            18,
            [
              "interpolate",
              ["linear"],
              ["get", "normalized_score"],
              0,
              4.8,
              1,
              9.0,
            ],
          ],
          "line-opacity": 0.95,
        },
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
      });

      map.on("mouseenter", "route-paths-line", (e) => {
        if (currentModeRef.current === "addArea") return;
        map.getCanvas().style.cursor = "pointer";
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties as any;
        const score = Number(props.normalized_score || 0).toFixed(2);
        const len = Math.round(props.length_m || 0);
        const hw = props.highway || "path";

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <div style="padding: 4px; font-family: sans-serif; font-size: 11px;">
              <div style="font-weight: bold; color: #202820; display: flex; justify-content: space-between; gap: 8px;">
                <span>Pedestrian Path</span>
                <span style="color: #004B20; background: #EAF5E6; padding: 1px 4px; border-radius: 4px;">Score: ${score}</span>
              </div>
              <div style="color: #667267; margin-top: 3px;">
                <div>Length: <strong>${len} m</strong></div>
                <div style="text-transform: capitalize;">Type: ${hw}</div>
              </div>
            </div>
          `,
          )
          .addTo(map);
      });

      map.on("mouseleave", "route-paths-line", () => {
        if (currentModeRef.current !== "addArea") {
          map.getCanvas().style.cursor = "";
        }
        popup.remove();
      });
    }

    // 2. Connectors Source & Layer
    if (map.getSource("route-connectors-src")) {
      (
        map.getSource("route-connectors-src") as maplibregl.GeoJSONSource
      ).setData(connectorsData as any);
    } else {
      map.addSource("route-connectors-src", {
        type: "geojson",
        data: connectorsData as any,
      });

      map.addLayer({
        id: "route-connectors-line",
        type: "line",
        source: "route-connectors-src",
        layout: {
          visibility: showRoutes ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "status"], "flagged"],
            "#D97706",
            "#8B5CF6",
          ],
          "line-width": 2.8,
          "line-dasharray": [3, 2],
          "line-opacity": 0.9,
        },
      });
    }

    // 3. Intersections Source & Layer
    if (map.getSource("route-intersections-src")) {
      (
        map.getSource("route-intersections-src") as maplibregl.GeoJSONSource
      ).setData(intersectionsData as any);
    } else {
      map.addSource("route-intersections-src", {
        type: "geojson",
        data: intersectionsData as any,
      });

      map.addLayer({
        id: "route-intersections-circle",
        type: "circle",
        source: "route-intersections-src",
        layout: {
          visibility: showRoutes ? "visible" : "none",
        },
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "traffic_score"],
            0,
            2.5,
            5,
            5.0,
            15,
            7.5,
          ],
          "circle-color": "#EF4444",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": 0.85,
        },
      });
    }

    // Toggle layer visibility
    if (map.getLayer("route-paths-casing")) {
      map.setLayoutProperty(
        "route-paths-casing",
        "visibility",
        showRoutes ? "visible" : "none",
      );
    }
    if (map.getLayer("route-paths-line")) {
      map.setLayoutProperty(
        "route-paths-line",
        "visibility",
        showRoutes ? "visible" : "none",
      );
    }
    if (map.getLayer("route-connectors-line")) {
      map.setLayoutProperty(
        "route-connectors-line",
        "visibility",
        showRoutes ? "visible" : "none",
      );
    }
    if (map.getLayer("route-intersections-circle")) {
      map.setLayoutProperty(
        "route-intersections-circle",
        "visibility",
        showRoutes ? "visible" : "none",
      );
    }
  };

  // Sync route layers when routeResult or showRoutes changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateRouteLayers(map);
    }
  }, [routeResult, showRoutes]);

  // Sync layers when locations or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      if (map.getSource("location-zones-src")) {
        const polygonFeatures = buildZoneFeatures();

        (
          map.getSource("location-zones-src") as maplibregl.GeoJSONSource
        ).setData({
          type: "FeatureCollection",
          features: polygonFeatures,
        });
      }

      if (map.getSource("available-zones-src")) {
        const isBuilderMode = Boolean(
          onAddCustomLocation || onRequestOpenAddAreaModal,
        );
        const addedIds = new Set(locations.map((l) => l.id));
        const availableLocations = isBuilderMode
          ? (campus?.defaultLocations || []).filter((l) => !addedIds.has(l.id))
          : [];

        const availableFeatures: Feature[] = availableLocations
          .filter((loc) => loc.geometry.type === "Polygon")
          .map((loc) => ({
            type: "Feature",
            id: loc.id,
            properties: {
              id: loc.id,
              name: loc.name,
            },
            geometry: loc.geometry as any,
          }));

        (
          map.getSource("available-zones-src") as maplibregl.GeoJSONSource
        ).setData({
          type: "FeatureCollection",
          features: availableFeatures,
        });
      }
    }

    renderMarkers(map);
  }, [
    campus,
    locations,
    selectedLocationId,
    layerToggles,
    heatmapMode,
    heatmapCategory,
    heatmapData,
    showActivityIcons,
    showLabels,
    showZones,
  ]);

  // Update GeoJSON layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const isBoundaryVisible =
      showBoundary !== undefined ? showBoundary : layerToggles.boundary;
    const isZonesVisible =
      showZones !== undefined ? showZones : layerToggles.zones;
    const isHeatmapVisible = Boolean(heatmapMode && heatmapMode !== "none");

    if (map.getLayer("campus-boundary-fill")) {
      map.setLayoutProperty(
        "campus-boundary-fill",
        "visibility",
        isBoundaryVisible ? "visible" : "none",
      );
      map.setLayoutProperty(
        "campus-boundary-stroke",
        "visibility",
        isBoundaryVisible ? "visible" : "none",
      );
    }
    if (map.getLayer("location-heatmap-fill")) {
      map.setLayoutProperty(
        "location-heatmap-fill",
        "visibility",
        isHeatmapVisible ? "visible" : "none",
      );
    }
    if (map.getLayer("location-zones-fill")) {
      map.setLayoutProperty(
        "location-zones-fill",
        "visibility",
        isZonesVisible && !isHeatmapVisible ? "visible" : "none",
      );
    }
    if (map.getLayer("location-zones-stroke")) {
      map.setLayoutProperty(
        "location-zones-stroke",
        "visibility",
        isZonesVisible ? "visible" : "none",
      );
    }
  }, [
    layerToggles.boundary,
    layerToggles.zones,
    showBoundary,
    showZones,
    heatmapMode,
  ]);

  // Update location markers visibility
  useEffect(() => {
    const isMarkersVisible =
      showActivityIcons !== false &&
      (showLabels !== undefined ? showLabels : layerToggles.labels);

    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = isMarkersVisible ? "" : "none";
    });
  }, [showActivityIcons, showLabels, layerToggles.labels]);

  // Render recommended bin markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    binMarkersRef.current.forEach((m) => m.remove());
    binMarkersRef.current = [];

    if (showBins && binRecommendations?.bins?.length) {
      binRecommendations.bins.forEach((bin) => {
        const el = document.createElement("div");
        el.className =
          "group flex items-center justify-center cursor-pointer select-none";
        let bg = "#004B20";
        let icon = "🗑️";
        let label = "Recommended Bin (100L)";
        if (bin.binType === "Recyclable") {
          bg = "#16A34A";
          icon = "♻️";
          label = "Recyclable Bin";
        } else if (bin.binType === "Disposable") {
          bg = "#2563EB";
          icon = "🗑️";
          label = "Disposable Bin";
        }
        el.innerHTML = `
          <div class="flex items-center justify-center w-6 h-6 rounded-md shadow-md border-1.5 border-white text-xs hover:scale-110 transition-transform" style="background-color: ${bg};" title="${label} (${bin.locationName || bin.locationId})">
            <span class="text-[11px] leading-none">${icon}</span>
          </div>
        `;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(bin.coordinates)
          .addTo(map);
        binMarkersRef.current.push(marker);
      });
    }
  }, [showBins, binRecommendations]);

  // Fit bounds when a route is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId || !routeResult?.paths_geojson) return;

    const found = routeResult.paths_geojson.features.find(
      (f) => f.id === selectedRouteId || f.properties?.id === selectedRouteId,
    );
    if (found && found.geometry?.coordinates?.length) {
      const bounds = new maplibregl.LngLatBounds();
      found.geometry.coordinates.forEach((coord: number[]) => {
        bounds.extend([coord[0], coord[1]]);
      });
      map.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 800 });
    }
  }, [selectedRouteId, routeResult]);

  // HTML Markers rendering
  const renderMarkers = (map: maplibregl.Map) => {
    // If an inline marker is currently being edited, preserve it so user typing isn't interrupted (only when editing is enabled)
    const preservedMarkers: maplibregl.Marker[] = [];
    markersRef.current.forEach((m) => {
      const el = m.getElement();
      if (
        onUpdateLocation &&
        editingMarkerIdRef.current &&
        el.getAttribute("data-loc-id") === editingMarkerIdRef.current
      ) {
        preservedMarkers.push(m);
      } else {
        m.remove();
      }
    });
    markersRef.current = preservedMarkers;

    // Preview mode: single campus badge in center
    if (readOnlyPreview) {
      if (!campus) return;
      const el = document.createElement("div");
      el.className = "group cursor-default";
      el.innerHTML = `
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-md shadow-lg border border-emerald-500/30 text-xs font-semibold text-emerald-800">
          <span class="w-2 h-2 rounded bg-emerald-600 animate-pulse"></span>
          <span>${campus.name}</span>
        </div>
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(campus.center)
        .addTo(map);
      markersRef.current.push(marker);
      return;
    }

    // Check if markers (both activity icon and location name) are enabled
    const isMarkersVisible =
      showActivityIcons !== false &&
      (showLabels !== undefined ? showLabels : layerToggles.labels);
    if (!isMarkersVisible) {
      return;
    }

    // Screen 2 & 3: Render marker for each location
    locations.forEach((loc) => {
      // If this marker is currently actively being edited by inline input, don't recreate it
      if (editingMarkerIdRef.current === loc.id) {
        return;
      }

      let coords: [number, number] | null = null;
      if (loc.center) {
        coords = loc.center;
      } else if (loc.geometry.type === "Point") {
        coords = loc.geometry.coordinates as [number, number];
      } else if (
        loc.geometry.type === "Polygon" &&
        loc.geometry.coordinates?.[0]
      ) {
        coords = getPolygonCenter(loc.geometry.coordinates[0]);
      }

      if (!coords) return;

      const isSelected = loc.id === selectedLocationId;
      const hasAct = loc.activities && loc.activities.length > 0;
      const mainAct = hasAct ? loc.activities[0] : null;
      const markerColor =
        mainAct && ACTIVITIES[mainAct]
          ? ACTIVITIES[mainAct].color
          : isSelected
            ? "#155734"
            : "#64748B";

      // Custom SVG icons matching assigned activity or neutral pin
      let iconSvg = "";
      if (mainAct === "Food Stalls") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8Z"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.9 6.4-6.4"/></svg>`;
      } else if (mainAct === "Music Concert") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M8 15V4l10-2v14"/><path d="M8 8l10-2"/></svg>`;
      } else if (mainAct === "Performing Arts") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11h.01"/><path d="M14 11h.01"/><path d="M10 15c.5.7 1.3 1 2 1s1.5-.3 2-1"/><path d="M18 2H6a3 3 0 0 0-3 3v11a6 6 0 0 0 6 6h6a6 6 0 0 0 6-6V5a3 3 0 0 0-3-3Z"/></svg>`;
      } else if (mainAct === "Literary & Fine Arts") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.4c3.2 0 5.8-2.6 5.8-5.8 0-5.5-4.9-10-11-10Z"/></svg>`;
      } else if (mainAct === "Sports") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
      } else if (mainAct === "Hackathon") {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55A1 1 0 0 1 20.38 20H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>`;
      } else {
        // Neutral unassigned pin icon
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
      }

      const isHeatmapActive = heatmapMode && heatmapMode !== "none";
      const heatVal = isHeatmapActive
        ? getHeatmapValueForLoc(
            loc.id,
            heatmapMode,
            heatmapCategory,
            heatmapData,
          )
        : 0;
      const markerText =
        isHeatmapActive && heatVal > 0
          ? `${loc.name} <span class="font-bold text-[10px] ml-1 opacity-90">• ${Math.round(heatVal).toLocaleString()} kg</span>`
          : loc.name;

      const el = document.createElement("div");
      el.setAttribute("data-loc-id", loc.id);
      el.className =
        "group flex flex-col items-center cursor-pointer select-none";

      el.innerHTML = `
        <div class="relative flex items-center justify-center w-7.5 h-7.5 rounded-md shadow-md ${
          isSelected
            ? "ring-4 ring-offset-2 ring-[#004B20]"
            : "ring-2 ring-white"
        }" style="background-color: ${markerColor};">
          ${iconSvg}
        </div>
        <div class="name-label mt-1 px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-tight shadow-sm whitespace-nowrap ${
          isSelected
            ? "bg-[#004B20] text-white ring-1 ring-[#003B19]"
            : "bg-white/95 text-neutral-800 border border-neutral-200/90"
        }">
          ${markerText}
        </div>
      `;

      // Single click: select location
      el.addEventListener("click", (e) => {
        if (currentModeRef.current === "addArea") return;
        e.stopPropagation();
        onSelectLocationRef.current?.(loc.id);
      });

      // Double click: edit location name directly on button (only when editing is enabled via onUpdateLocation)
      if (onUpdateLocation) {
        el.addEventListener("dblclick", (e) => {
          if (currentModeRef.current === "addArea") return;
          e.stopPropagation();
          e.preventDefault();

          // Updating name by double clicking does NOT trigger sidebar editing feature
          const nameLabel = el.querySelector(".name-label") as HTMLElement;
          if (!nameLabel) return;
          if (el.querySelector("input")) return;

          editingMarkerIdRef.current = loc.id;
          nameLabel.style.display = "none";

          const input = document.createElement("input");
          input.type = "text";
          input.value = loc.name;
          input.className =
            "mt-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-tight shadow-lg border-2 border-[#004B20] bg-white text-[#202820] outline-none ring-2 ring-[#70D000]/40 text-center z-50";
          input.style.minWidth = "100px";
          input.style.maxWidth = "180px";

          let finished = false;
          const finishEdit = () => {
            if (finished) return;
            finished = true;
            editingMarkerIdRef.current = null;
            const trimmed = input.value.trim();
            input.remove();
            nameLabel.style.display = "";
            if (trimmed) {
              nameLabel.textContent = trimmed;
              const currentLoc =
                locationsRef.current.find((l) => l.id === loc.id) || loc;
              if (trimmed !== currentLoc.name) {
                onUpdateLocation?.({ ...currentLoc, name: trimmed });
              }
            }
          };

          input.addEventListener("keydown", (ev) => {
            ev.stopPropagation();
            if (ev.key === "Enter") {
              finishEdit();
            } else if (ev.key === "Escape") {
              finished = true;
              editingMarkerIdRef.current = null;
              input.remove();
              nameLabel.style.display = "";
            }
          });

          input.addEventListener("blur", () => {
            finishEdit();
          });

          input.addEventListener("click", (ev) => {
            ev.stopPropagation();
          });
          input.addEventListener("dblclick", (ev) => {
            ev.stopPropagation();
          });

          el.appendChild(input);
          setTimeout(() => {
            input.focus();
            input.select();
          }, 10);
        });
      }

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Also render clickable indicators for available unselected campus areas (only in builder mode)
    if (onAddCustomLocation || onRequestOpenAddAreaModal) {
      const addedIds = new Set(locations.map((l) => l.id));
      const availableLocations = (campus?.defaultLocations || []).filter(
        (l) => !addedIds.has(l.id),
      );

      availableLocations.forEach((loc) => {
        const coords =
          loc.center ||
          (loc.geometry.coordinates?.[0]
            ? getPolygonCenter(loc.geometry.coordinates[0])
            : null);
        if (!coords) return;

        const el = document.createElement("div");
        el.className =
          "group flex flex-col items-center cursor-pointer select-none";
        el.innerHTML = `
          <div class="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-white/95 text-[#202820] hover:text-[#004B20] border border-[#E1E8DE] hover:border-[#004B20] shadow-xs hover:bg-[#EAF5E6] transition-all">
            <span class="text-[#004B20] font-extrabold text-xs leading-none">+</span>
            <span>${loc.name}</span>
          </div>
        `;

        el.addEventListener("click", (e) => {
          if (currentModeRef.current === "addArea") return;
          e.stopPropagation();
          handleSelectOrAddLocation(loc);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }
  };

  // Polygon Drawing for "Add area" mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (currentMode === "addArea") {
      setIsDrawing(true);

      // Ensure dragPan is enabled so user can navigate the campus while adding location
      map.dragPan.enable();
      map.doubleClickZoom.disable();

      const container = map.getContainer();
      const canvasContainer = map.getCanvasContainer();
      const canvas = map.getCanvas();

      container.classList.add("maplibregl-crosshair", "mode-add-location");
      canvasContainer.classList.add(
        "maplibregl-crosshair",
        "mode-add-location",
      );
      canvas.classList.add("mode-add-location");
      canvas.style.cursor = "crosshair";
      canvasContainer.style.cursor = "crosshair";

      const handleMapClick = (e: maplibregl.MapMouseEvent) => {
        const point = [
          Number(e.lngLat.lng.toFixed(6)),
          Number(e.lngLat.lat.toFixed(6)),
        ];
        setDraftPoints((prev) => [...prev, point]);
      };

      const handleMouseMove = () => {
        if (!container.classList.contains("is-panning")) {
          if (canvas.style.cursor !== "crosshair") {
            canvas.style.cursor = "crosshair";
          }
          if (canvasContainer.style.cursor !== "crosshair") {
            canvasContainer.style.cursor = "crosshair";
          }
        }
      };

      const handleDragStart = () => {
        container.classList.add("is-panning");
      };

      const handleDragEnd = () => {
        container.classList.remove("is-panning");
        canvas.style.cursor = "crosshair";
        canvasContainer.style.cursor = "crosshair";
      };

      const handleMouseUp = () => {
        container.classList.remove("is-panning");
        canvas.style.cursor = "crosshair";
        canvasContainer.style.cursor = "crosshair";
      };

      map.on("click", handleMapClick);
      map.on("mousemove", handleMouseMove);
      map.on("dragstart", handleDragStart);
      map.on("dragend", handleDragEnd);
      map.on("mouseup", handleMouseUp);

      return () => {
        map.off("click", handleMapClick);
        map.off("mousemove", handleMouseMove);
        map.off("dragstart", handleDragStart);
        map.off("dragend", handleDragEnd);
        map.off("mouseup", handleMouseUp);
        map.dragPan.enable();
        map.doubleClickZoom.enable();

        container.classList.remove(
          "maplibregl-crosshair",
          "mode-add-location",
          "is-panning",
        );
        canvasContainer.classList.remove(
          "maplibregl-crosshair",
          "mode-add-location",
        );
        canvas.classList.remove("mode-add-location");
        canvas.style.cursor = "";
        canvasContainer.style.cursor = "";
      };
    } else {
      setIsDrawing(false);
      setDraftPoints([]);
      draftMarkerRefs.current.forEach((m) => m.remove());
      draftMarkerRefs.current = [];
    }
  }, [currentMode]);

  // Update drawing layer preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Remove existing draft markers
    draftMarkerRefs.current.forEach((m) => m.remove());
    draftMarkerRefs.current = [];

    // Add small dot markers for draft vertices
    draftPoints.forEach((pt) => {
      const el = document.createElement("div");
      el.className =
        "w-3 h-3 rounded bg-emerald-600 border-2 border-white shadow-md cursor-pointer animate-pulse draft-vertex";
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(pt as [number, number])
        .addTo(map);
      draftMarkerRefs.current.push(marker);
    });

    // Update draft polygon GeoJSON
    if (draftPoints.length >= 2) {
      const draftGeoJson: FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: draftPoints,
            },
          },
        ],
      };

      if (map.getSource("draft-polygon-src")) {
        (
          map.getSource("draft-polygon-src") as maplibregl.GeoJSONSource
        ).setData(draftGeoJson);
      } else {
        map.addSource("draft-polygon-src", {
          type: "geojson",
          data: draftGeoJson,
        });

        map.addLayer({
          id: "draft-polygon-line",
          type: "line",
          source: "draft-polygon-src",
          paint: {
            "line-color": "#059669",
            "line-width": 2.5,
            "line-dasharray": [2, 2],
          },
        });
      }
    } else if (map.getLayer("draft-polygon-line")) {
      map.removeLayer("draft-polygon-line");
      map.removeSource("draft-polygon-src");
    }
  }, [draftPoints]);

  const handleFinishDrawing = () => {
    if (draftPoints.length < 3) {
      alert(
        "Please click at least 3 points on the map to define a valid location polygon.",
      );
      return;
    }

    // Close polygon
    const closedCoords = [...draftPoints, draftPoints[0]];
    const calculatedArea = calculatePolygonAreaM2(closedCoords);
    if (!calculatedArea || calculatedArea <= 0) {
      alert(
        "The drawn polygon does not enclose a valid positive area. Please redraw the location.",
      );
      return;
    }
    const center = getPolygonCenter(closedCoords);

    setPendingNewArea({
      coordinates: closedCoords,
      area: calculatedArea,
      center,
    });
    setNewAreaName("");
    setNewAreaActivities([]);
  };

  const handleConfirmNewArea = () => {
    if (
      !pendingNewArea ||
      pendingNewArea.coordinates.length < 4 ||
      pendingNewArea.area <= 0
    ) {
      alert(
        "A valid polygon with positive area is required to add an event location.",
      );
      return;
    }

    const newLocId = pendingNewArea.id || `loc-custom-${Date.now()}`;
    const newLocation: CampusLocation = {
      id: newLocId,
      name: newAreaName.trim() || `Event Area ${locations.length + 1}`,
      activities: newAreaActivities,
      area: pendingNewArea.area,
      description: "Event area on campus map",
      relativeIntensity: "Medium",
      tags: ["Custom Area"],
      center: pendingNewArea.center,
      geometry: {
        type: "Polygon",
        coordinates: [pendingNewArea.coordinates],
      },
    };

    onAddCustomLocation?.(newLocation);
    setPendingNewArea(null);
    setDraftPoints([]);
    setCurrentMode("select");
  };

  const handleCancelNewArea = () => {
    setPendingNewArea(null);
    setDraftPoints([]);
    setCurrentMode("select");
  };

  const handleCancelDrawing = () => {
    setDraftPoints([]);
    setCurrentMode("select");
  };

  return (
    <div
      className={`relative w-full overflow-hidden ${
        flatCorners
          ? "rounded-none border-0 shadow-none"
          : "rounded-md border border-neutral-200/90 shadow-sm"
      } bg-[#EFEFEA] ${heightClass} ${className}`}
    >
      {/* Top Map Toolbar (Clean toolbar without satellite/terrain) */}
      {showToolbar && (
        <div className="absolute top-3 left-3 z-10">
          <MapToolbar
            currentMode={currentMode}
            onModeChange={setCurrentMode}
            hasRoutes={Boolean(routeResult)}
            showRoutes={showRoutes}
            onToggleRoutes={onToggleShowRoutes}
            isRoutesStale={isRoutesStale}
          />
        </div>
      )}

      {/* Route Popularity Legend */}
      {showRoutes &&
        routeResult &&
        (routeResult.paths_geojson?.features?.length > 0 ||
          routeResult.connectors_geojson?.features?.length > 0) && (
          <div className="absolute top-14 left-3 z-10">
            <RouteLegend routeResult={routeResult} isStale={isRoutesStale} />
          </div>
        )}

      {/* Drawing Active Banner */}
      {currentMode === "addArea" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded shadow-lg border border-emerald-600/30 text-xs">
          <span className="font-semibold text-emerald-800">
            Click map to add boundary points ({draftPoints.length} added)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={draftPoints.length < 3}
              onClick={handleFinishDrawing}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition ${
                draftPoints.length >= 3
                  ? "bg-[#155734] text-white hover:bg-[#114328]"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Finish ({draftPoints.length}/3+)</span>
            </button>
            <button
              type="button"
              onClick={handleCancelDrawing}
              className="p-1 rounded text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              title="Cancel drawing"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Zoom & Recenter Controls (Matching Storyboard) */}
      <div className="absolute top-16 right-3.5 z-10 flex flex-col bg-white/95 backdrop-blur-md rounded shadow-md border border-neutral-200/90 overflow-hidden text-neutral-700">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="p-2 hover:bg-neutral-100 active:bg-neutral-200 transition cursor-pointer border-b border-neutral-100"
          title="Zoom In"
        >
          <Plus className="w-4 h-4 text-neutral-800" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="p-2 hover:bg-neutral-100 active:bg-neutral-200 transition cursor-pointer border-b border-neutral-100"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4 text-neutral-800" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current && fitToCampus(mapRef.current)}
          className="p-2 hover:bg-neutral-100 active:bg-neutral-200 transition cursor-pointer"
          title="Recenter & Fit Campus"
        >
          <Navigation className="w-4 h-4 text-neutral-800" />
        </button>
      </div>

      {/* Floating Bottom Left Activity Legend (Screens 2 & 3) */}
      {showLegend && !readOnlyPreview && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[240px]">
          <ActivityLegend />
        </div>
      )}

      {/* Scale bar indicator (matching 200m in storyboard) */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end text-[10px] font-semibold text-neutral-600 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded shadow-xs border border-neutral-200/60">
        <div className="flex items-center gap-1">
          <div className="w-14 h-1 border-b-2 border-l-2 border-r-2 border-neutral-800" />
          <span>200 m</span>
        </div>
      </div>

      {/* New Area Name & Activity Tags Configuration Modal */}
      {pendingNewArea && (
        <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-5 shadow-2xl border border-[#E1E8DE] w-full max-w-md space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E1E8DE]">
              <div>
                <h3 className="font-heading text-sm font-bold text-[#202820]">
                  Name Location & Assign Activities
                </h3>
                <p className="text-[11px] text-[#667267] font-medium">
                  Set a name and configure activities for this event location
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelNewArea}
                className="p-1.5 text-[#667267] hover:text-[#202820] hover:bg-[#F7F9F5] rounded cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Name Input */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-[#202820]">
                Location name
              </label>
              <input
                type="text"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="e.g. Open Air Theatre, North Lawn, Tech Expo..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleConfirmNewArea()}
                className="w-full px-3 py-2 bg-[#F7F9F5] focus:bg-white border border-[#E1E8DE] rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#70D000]/30 focus:border-[#004B20] transition-all text-[#202820]"
              />
            </div>

            {/* Activity Tags Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-[#202820]">
                  Assign activity tags
                </label>
                <span className="text-[10px] text-[#004B20] font-bold">
                  {newAreaActivities.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allActivityKeys.map((act) => {
                  const isTagged = newAreaActivities.includes(act);
                  const meta = ACTIVITIES[act];
                  return (
                    <button
                      key={act}
                      type="button"
                      onClick={() => {
                        if (isTagged) {
                          setNewAreaActivities(
                            newAreaActivities.filter((a) => a !== act),
                          );
                        } else {
                          setNewAreaActivities([...newAreaActivities, act]);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer font-sans ${
                        isTagged
                          ? "text-white shadow-xs ring-1 ring-black/10"
                          : "bg-[#F7F9F5] text-[#667267] hover:bg-[#EAF5E6] hover:text-[#004B20] border border-[#E1E8DE]"
                      }`}
                      style={
                        isTagged ? { backgroundColor: meta.color } : undefined
                      }
                    >
                      <ActivityIcon type={act} className="w-3 h-3 shrink-0" />
                      <span>{act}</span>
                      {isTagged && (
                        <Check className="w-2.5 h-2.5 stroke-[3] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-[#E1E8DE]">
              <button
                type="button"
                onClick={handleCancelNewArea}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#667267] hover:text-[#202820] rounded cursor-pointer hover:bg-[#F7F9F5] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNewArea}
                className="px-4 py-1.5 bg-[#004B20] hover:bg-[#003B19] text-white font-bold text-xs rounded flex items-center gap-1.5 shadow-xs transition cursor-pointer font-sans"
              >
                <span>Add Location to Event</span>
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MapLibre DOM Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full ${currentMode === "addArea" ? "mode-add-location" : ""}`}
      />
    </div>
  );
};
