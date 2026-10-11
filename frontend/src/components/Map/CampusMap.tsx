import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { Plus, Minus, Navigation, ShieldCheck, Check, X, Trash2, RotateCcw } from "lucide-react";
import {
  Campus,
  CampusLocation,
  ActivityType,
  RoutePlanResult,
  HeatmapMode,
  WasteCategory,
  HeatmapData,
  BinRecommendationResult,
  RoadBinRecommendationResult,
  MapMode,
} from "../../types/bunbetsu";
import { ACTIVITIES, ActivityIcon } from "../../constants/activities";
import {
  calculatePolygonAreaM2,
  getPolygonCenter,
  closePolygonRing,
  isRingClosed,
  validatePolygonRing,
} from "../../utils/geoUtils";
import { ActivityLegend } from "./ActivityLegend";
import { MapToolbar } from "./MapToolbar";
import {
  getHeatmapColorForRatio,
  getHeatmapValueForLoc,
  MISSING_HEATMAP_COLOR,
} from "../../utils/heatmapPalettes";

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
const SNAP_TOLERANCE_PX = 16; // Screen-space distance tolerance (pixels) for closing polygon

interface CampusMapProps {
  campus: Campus | null;
  locations?: CampusLocation[];
  selectedLocationId?: string | null;
  onSelectLocation?: (
    locationId: string,
    fallbackLocation?: CampusLocation,
  ) => void;
  onClearLocationSelection?: () => void;
  onAddCustomLocation?: (newLocation: CampusLocation) => void;
  onUpdateLocation?: (updatedLocation: CampusLocation) => void;
  onStartEditLocation?: (locationId: string) => void;
  onDeleteLocation?: (locationId: string) => void;
  onDeleteArea?: (areaId: string) => void;
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
  roadBinRecommendations?: RoadBinRecommendationResult | null;
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
  onClearLocationSelection,
  onAddCustomLocation,
  onUpdateLocation,
  onStartEditLocation,
  onDeleteLocation,
  onDeleteArea,
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
  roadBinRecommendations = null,
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

  const [currentMode, setCurrentMode] = useState<MapMode>("select");
  const currentModeRef = useRef<MapMode>(currentMode);
  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  const onDeleteAreaRef = useRef(onDeleteArea);
  useEffect(() => {
    onDeleteAreaRef.current = onDeleteArea;
  }, [onDeleteArea]);

  const locationsRef = useRef<CampusLocation[]>(locations);
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  const onSelectLocationRef = useRef(onSelectLocation);
  useEffect(() => {
    onSelectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

  const onClearLocationSelectionRef = useRef(onClearLocationSelection);
  useEffect(() => {
    onClearLocationSelectionRef.current = onClearLocationSelection;
  }, [onClearLocationSelection]);

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

  const buildZoneFeatures = (): Feature[] => {
    const isHeatmapActive = Boolean(heatmapMode && heatmapMode !== "none");

    // Collect all valid numeric estimates for active heatmap layer across candidate locations
    const validNumericValues: number[] = [];
    if (isHeatmapActive && heatmapData) {
      locations.forEach((l) => {
        const val = getHeatmapValueForLoc(
          l.id,
          heatmapMode,
          heatmapCategory,
          heatmapData,
        );
        if (val !== null && typeof val === "number" && Number.isFinite(val)) {
          validNumericValues.push(val);
        }
      });
    }

    const maxHeatmap =
      validNumericValues.length > 0 ? Math.max(...validNumericValues) : 0;
    const minHeatmap =
      validNumericValues.length > 0 ? Math.min(...validNumericValues) : 0;

    return locations
      .filter(
        (loc) =>
          loc.geometry.type === "Polygon" ||
          loc.geometry.type === "MultiPolygon",
      )
      .map((loc) => {
        const hasAct = loc.activities && loc.activities.length > 0;
        const mainActivity = hasAct ? loc.activities[0] : null;
        const defaultColor =
          mainActivity && ACTIVITIES[mainActivity]
            ? ACTIVITIES[mainActivity].color
            : "#64748B";
        const isSelected = loc.id === selectedLocationId;

        let heatmapColor = defaultColor;
        let heatVal: number | null = null;
        let heatRatio: number | null = null;
        let isMissingData = false;
        let hasHeatmapValue = false;

        if (isHeatmapActive) {
          heatVal = getHeatmapValueForLoc(
            loc.id,
            heatmapMode,
            heatmapCategory,
            heatmapData,
          );

          if (heatVal === null) {
            isMissingData = true;
            hasHeatmapValue = false;
            heatmapColor = MISSING_HEATMAP_COLOR;
            heatRatio = null;
          } else {
            isMissingData = false;
            hasHeatmapValue = true;
            if (maxHeatmap > 0) {
              heatRatio = Math.max(0, Math.min(1, heatVal / maxHeatmap));
            } else {
              // All valid values are zero -> avoid division by zero; display 0 intensity
              heatRatio = 0;
            }
            heatmapColor = getHeatmapColorForRatio(
              heatRatio,
              heatmapMode,
              heatmapCategory,
            );
          }
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
            isMissingData,
            hasHeatmapValue,
            heatmapMode,
            heatmapCategory,
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
  const draftPointsRef = useRef<number[][]>([]);
  useEffect(() => {
    draftPointsRef.current = draftPoints;
  }, [draftPoints]);

  const [isDraftClosed, setIsDraftClosed] = useState(false);
  const isDraftClosedRef = useRef(false);
  useEffect(() => {
    isDraftClosedRef.current = isDraftClosed;
  }, [isDraftClosed]);

  const [isDrawing, setIsDrawing] = useState(false);

  // Delete Area Tool State
  const [pendingDeleteArea, setPendingDeleteArea] = useState<{
    id: string;
    name: string;
    isConfiguredLocation: boolean;
  } | null>(null);
  const [presetDeleteWarning, setPresetDeleteWarning] = useState<string | null>(null);

  const setHoveredDeleteFeature = useCallback((geom: any | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("delete-hover-src") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (geom) {
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: geom,
          },
        ],
      });
    } else {
      src.setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, []);

  const handleInitiateDeleteArea = useCallback((locId: string) => {
    const allCampusLocs = campusRef.current?.defaultLocations || [];
    const loc =
      allCampusLocs.find((l) => l.id === locId) ||
      locationsRef.current.find((l) => l.id === locId);
    if (!loc) return;

    const isUserDrawn =
      loc.source === "user_drawn" || loc.tags?.includes("Custom Area");
    if (!isUserDrawn) {
      setPresetDeleteWarning(
        "Preset campus zones cannot be deleted. Only user-created map areas can be removed.",
      );
      return;
    }

    const isConfiguredLocation = locationsRef.current.some(
      (l) => l.id === locId,
    );
    setPendingDeleteArea({
      id: loc.id,
      name: loc.name,
      isConfiguredLocation,
    });
  }, []);

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

    const handleMapBackgroundClick = (e: maplibregl.MapMouseEvent) => {
      if (currentModeRef.current === "addArea" || currentModeRef.current === "deleteArea") {
        return;
      }
      if (!onClearLocationSelectionRef.current) {
        return;
      }
      if ((e.originalEvent as any)?._bunbetsuLocationHandled) {
        return;
      }
      const targetEl = e.originalEvent?.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.closest(".maplibregl-ctrl") ||
          targetEl.closest(".maplibregl-marker") ||
          targetEl.closest(".maplibregl-popup") ||
          targetEl.closest("[role='tooltip']") ||
          !map.getCanvas().contains(targetEl))
      ) {
        return;
      }

      const queryLayers = ["location-zones-fill", "location-heatmap-fill"].filter((id) =>
        map.getLayer(id)
      );
      if (queryLayers.length > 0) {
        const hits = map.queryRenderedFeatures(e.point, { layers: queryLayers });
        if (hits.length > 0 && hits[0]?.properties?.id) {
          return;
        }
      }

      onClearLocationSelectionRef.current();
    };

    map.on("click", handleMapBackgroundClick);

    map.on("load", () => {
      updateMapLayers(map);
      if (campus) {
        fitToCampus(map);
      }
    });

    // Cleanup
    return () => {
      map.off("click", handleMapBackgroundClick);
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
            "fill-opacity": [
              "case",
              ["get", "isMissingData"],
              0.35,
              0.65,
            ],
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
          if (currentModeRef.current === "deleteArea") {
            const locId = e.features?.[0]?.properties?.id;
            if (locId) {
              handleInitiateDeleteArea(locId);
            }
            return;
          }
          if (e.originalEvent) {
            (e.originalEvent as any)._bunbetsuLocationHandled = true;
          }
          if (e.features && e.features[0]?.properties?.id) {
            onSelectLocationRef.current?.(e.features[0].properties.id);
          }
        };

        const handleZoneHover = (e: maplibregl.MapLayerMouseEvent) => {
          if (currentModeRef.current === "addArea") return;
          if (currentModeRef.current === "deleteArea") {
            const locId = e.features?.[0]?.properties?.id;
            const allCampusLocs = campusRef.current?.defaultLocations || [];
            const loc =
              allCampusLocs.find((l) => l.id === locId) ||
              locationsRef.current.find((l) => l.id === locId);
            const isUserDrawn =
              loc?.source === "user_drawn" || loc?.tags?.includes("Custom Area");
            if (isUserDrawn && e.features?.[0]?.geometry) {
              setHoveredDeleteFeature(e.features[0].geometry);
              map.getCanvas().style.cursor = "pointer";
            } else {
              setHoveredDeleteFeature(null);
              map.getCanvas().style.cursor = "not-allowed";
            }
            return;
          }
          map.getCanvas().style.cursor = "pointer";
        };

        const handleZoneLeave = () => {
          if (currentModeRef.current === "addArea") {
            map.getCanvas().style.cursor = "crosshair";
            map.getCanvasContainer().style.cursor = "crosshair";
          } else if (currentModeRef.current === "deleteArea") {
            setHoveredDeleteFeature(null);
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          } else {
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          }
        };

        map.on("click", "location-zones-fill", handleZoneClick);
        map.on("click", "location-heatmap-fill", handleZoneClick);

        map.on("mouseenter", "location-zones-fill", handleZoneHover);
        map.on("mouseenter", "location-heatmap-fill", handleZoneHover);

        map.on("mouseleave", "location-zones-fill", handleZoneLeave);
        map.on("mouseleave", "location-heatmap-fill", handleZoneLeave);
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
          if (currentModeRef.current === "deleteArea") {
            const locId = e.features?.[0]?.properties?.id;
            if (locId) {
              handleInitiateDeleteArea(locId);
            }
            return;
          }
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

        map.on("mouseenter", "available-zones-fill", (e) => {
          if (currentModeRef.current === "addArea") return;
          if (currentModeRef.current === "deleteArea") {
            const locId = e.features?.[0]?.properties?.id;
            const allCampusLocs = campusRef.current?.defaultLocations || [];
            const loc = allCampusLocs.find((l) => l.id === locId);
            const isUserDrawn =
              loc?.source === "user_drawn" || loc?.tags?.includes("Custom Area");
            if (isUserDrawn && e.features?.[0]?.geometry) {
              setHoveredDeleteFeature(e.features[0].geometry);
              map.getCanvas().style.cursor = "pointer";
            } else {
              setHoveredDeleteFeature(null);
              map.getCanvas().style.cursor = "not-allowed";
            }
            return;
          }
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "available-zones-fill", () => {
          if (currentModeRef.current === "addArea") {
            map.getCanvas().style.cursor = "crosshair";
            map.getCanvasContainer().style.cursor = "crosshair";
          } else if (currentModeRef.current === "deleteArea") {
            setHoveredDeleteFeature(null);
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          } else {
            map.getCanvas().style.cursor = "";
            map.getCanvasContainer().style.cursor = "";
          }
        });
      }

      // 2c. Delete Hover highlight layer
      if (!map.getSource("delete-hover-src")) {
        map.addSource("delete-hover-src", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "delete-hover-fill",
          type: "fill",
          source: "delete-hover-src",
          paint: {
            "fill-color": "#EF4444",
            "fill-opacity": 0.35,
          },
        });

        map.addLayer({
          id: "delete-hover-stroke",
          type: "line",
          source: "delete-hover-src",
          paint: {
            "line-color": "#B42318",
            "line-width": 3.0,
          },
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

    const locZonesSrc = map.getSource("location-zones-src") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (locZonesSrc) {
      const polygonFeatures = buildZoneFeatures();
      locZonesSrc.setData({
        type: "FeatureCollection",
        features: polygonFeatures,
      });
    }

    const availZonesSrc = map.getSource("available-zones-src") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (availZonesSrc) {
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

      availZonesSrc.setData({
        type: "FeatureCollection",
        features: availableFeatures,
      });
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
        if (
          !bin.coordinates ||
          bin.coordinates.length < 2 ||
          isNaN(bin.coordinates[0]) ||
          isNaN(bin.coordinates[1]) ||
          (bin.coordinates[0] === 0 && bin.coordinates[1] === 0)
        ) {
          console.warn(`[CampusMap] Skipping on-location bin marker ${bin.id} with invalid coordinates:`, bin.coordinates);
          return;
        }

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
        el.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(bin.coordinates)
          .addTo(map);
        binMarkersRef.current.push(marker);
      });
    }

    // Road-bin placement markers using stream-aware icon conventions
    if (showBins && roadBinRecommendations?.placements?.length) {
      roadBinRecommendations.placements.forEach((rbin) => {
        if (
          !rbin.coordinates ||
          rbin.coordinates.length < 2 ||
          isNaN(rbin.coordinates[0]) ||
          isNaN(rbin.coordinates[1]) ||
          (rbin.coordinates[0] === 0 && rbin.coordinates[1] === 0)
        ) {
          console.warn(`[CampusMap] Skipping road bin marker ${rbin.id} with invalid coordinates:`, rbin.coordinates);
          return;
        }

        const streams = Array.isArray(rbin.stream_types) && rbin.stream_types.length > 0
          ? rbin.stream_types
          : (rbin.stream_type === "Disposable"
              ? ["Disposable"]
              : rbin.stream_type === "Recyclable"
              ? ["Recyclable"]
              : ["Disposable", "Recyclable"]);

        const isDisp = streams.includes("Disposable");
        const isRec = streams.includes("Recyclable");
        const isBoth = isDisp && isRec;

        const el = document.createElement("div");
        el.className =
          "group flex items-center justify-center cursor-pointer select-none";
        const servNames = (rbin.served_location_names || []).join(", ");
        const streamLabel = isBoth
          ? "Disposable & Recyclable"
          : isRec
          ? "Recyclable"
          : "Disposable";
        const title = `Road Bin (${rbin.id}): ${streamLabel} · Serves: ${servNames} · Popularity: ${(rbin.normalized_popularity_score * 100).toFixed(0)}%`;

        if (isBoth) {
          // Grouped compact side-by-side treatment at the same geographic station
          el.innerHTML = `
            <div class="flex items-center gap-0.5 p-0.5 bg-white/95 backdrop-blur-xs rounded-md shadow-md border border-neutral-300 hover:scale-110 transition-transform" title="${title}">
              <div class="flex items-center justify-center w-5 h-5 rounded shadow-xs text-xs" style="background-color: #2563EB;">
                <span class="text-[10px] leading-none">🗑️</span>
              </div>
              <div class="flex items-center justify-center w-5 h-5 rounded shadow-xs text-xs" style="background-color: #16A34A;">
                <span class="text-[10px] leading-none">♻️</span>
              </div>
            </div>
          `;
        } else if (isRec) {
          // Recyclable only: same icon as on-location
          el.innerHTML = `
            <div class="flex items-center justify-center w-6 h-6 rounded-md shadow-md border-1.5 border-white text-xs hover:scale-110 transition-transform" style="background-color: #16A34A;" title="${title}">
              <span class="text-[11px] leading-none">♻️</span>
            </div>
          `;
        } else {
          // Disposable only: same icon as on-location
          el.innerHTML = `
            <div class="flex items-center justify-center w-6 h-6 rounded-md shadow-md border-1.5 border-white text-xs hover:scale-110 transition-transform" style="background-color: #2563EB;" title="${title}">
              <span class="text-[11px] leading-none">🗑️</span>
            </div>
          `;
        }

        el.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(rbin.coordinates)
          .addTo(map);
        binMarkersRef.current.push(marker);
      });
    }
  }, [showBins, binRecommendations, roadBinRecommendations]);

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

      const isHeatmapActive = Boolean(heatmapMode && heatmapMode !== "none");
      const heatVal = isHeatmapActive
        ? getHeatmapValueForLoc(
            loc.id,
            heatmapMode,
            heatmapCategory,
            heatmapData,
          )
        : null;
      const markerText =
        isHeatmapActive && heatVal !== null && heatVal > 0
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

      // Single click: select location OR initiate delete in deleteArea mode
      el.addEventListener("click", (e) => {
        if (currentModeRef.current === "addArea") return;
        if (currentModeRef.current === "deleteArea") {
          e.stopPropagation();
          handleInitiateDeleteArea(loc.id);
          return;
        }
        e.stopPropagation();
        (e as any)._bunbetsuLocationHandled = true;
        onSelectLocationRef.current?.(loc.id);
      });

      // Double click: edit location name directly on button (only in select mode)
      if (onUpdateLocation) {
        el.addEventListener("dblclick", (e) => {
          if (currentModeRef.current !== "select") return;
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
          if (currentModeRef.current === "deleteArea") {
            e.stopPropagation();
            handleInitiateDeleteArea(loc.id);
            return;
          }
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

      if (!isDraftClosed) {
        container.classList.add("maplibregl-crosshair", "mode-add-location");
        canvasContainer.classList.add(
          "maplibregl-crosshair",
          "mode-add-location",
        );
        canvas.classList.add("mode-add-location");
        canvas.style.cursor = "crosshair";
        canvasContainer.style.cursor = "crosshair";
      } else {
        container.classList.remove("maplibregl-crosshair");
        canvasContainer.classList.remove("maplibregl-crosshair");
        canvas.classList.remove("mode-add-location");
        canvas.style.cursor = "default";
        canvasContainer.style.cursor = "default";
      }

      const handleMapClick = (e: maplibregl.MapMouseEvent) => {
        if (currentModeRef.current !== "addArea") return;
        // Do not allow further drawing clicks to add vertices after closure
        if (isDraftClosedRef.current) return;

        const currentPoints = draftPointsRef.current;
        const point = [
          Number(e.lngLat.lng.toFixed(6)),
          Number(e.lngLat.lat.toFixed(6)),
        ];

        // 1. If fewer than 3 distinct vertices have been added, add normally
        if (currentPoints.length < 3) {
          if (currentPoints.length > 0) {
            const prev = currentPoints[currentPoints.length - 1];
            if (prev[0] === point[0] && prev[1] === point[1]) {
              return;
            }
          }
          setDraftPoints((prev) => [...prev, point]);
          return;
        }

        // 2. Once at least 3 distinct vertices exist, check screen-space tolerance to first vertex
        const firstCoord = currentPoints[0];
        const firstPointScreen = map.project(firstCoord as [number, number]);
        const clickScreen = e.point;
        const distPx = Math.hypot(
          firstPointScreen.x - clickScreen.x,
          firstPointScreen.y - clickScreen.y,
        );

        if (distPx <= SNAP_TOLERANCE_PX) {
          // Snap exact first coordinate and mark draft closed
          const closed = closePolygonRing(currentPoints);
          setDraftPoints(closed);
          setIsDraftClosed(true);
          return;
        }

        // 3. Click is outside snap tolerance, add vertex normally
        const prev = currentPoints[currentPoints.length - 1];
        if (prev[0] === point[0] && prev[1] === point[1]) {
          return;
        }
        setDraftPoints((prev) => [...prev, point]);
      };

      const handleMouseMove = () => {
        if (!container.classList.contains("is-panning")) {
          const targetCursor = isDraftClosedRef.current ? "default" : "crosshair";
          if (canvas.style.cursor !== targetCursor) {
            canvas.style.cursor = targetCursor;
          }
          if (canvasContainer.style.cursor !== targetCursor) {
            canvasContainer.style.cursor = targetCursor;
          }
        }
      };

      const handleDragStart = () => {
        container.classList.add("is-panning");
      };

      const handleDragEnd = () => {
        container.classList.remove("is-panning");
        const targetCursor = isDraftClosedRef.current ? "default" : "crosshair";
        canvas.style.cursor = targetCursor;
        canvasContainer.style.cursor = targetCursor;
      };

      const handleMouseUp = () => {
        container.classList.remove("is-panning");
        const targetCursor = isDraftClosedRef.current ? "default" : "crosshair";
        canvas.style.cursor = targetCursor;
        canvasContainer.style.cursor = targetCursor;
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
      setIsDraftClosed(false);
      draftMarkerRefs.current.forEach((m) => m.remove());
      draftMarkerRefs.current = [];
    }
  }, [currentMode, isDraftClosed]);

  // Update drawing layer preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Remove existing draft markers
    draftMarkerRefs.current.forEach((m) => m.remove());
    draftMarkerRefs.current = [];

    // Add markers for vertices
    if (draftPoints.length > 0) {
      const firstCoord = draftPoints[0];
      const startMarkerEl = document.createElement("div");
      startMarkerEl.className =
        "group relative flex items-center justify-center select-none";

      if (isDraftClosed) {
        // Closed state indicator: solid forest green with lime ring and check icon
        startMarkerEl.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="w-5 h-5 rounded-full bg-[#004B20] border-2 border-white shadow-lg flex items-center justify-center ring-2 ring-[#70D000]">
              <svg class="w-3 h-3 text-[#70D000]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span class="absolute -bottom-5 whitespace-nowrap bg-[#004B20] text-[#70D000] text-[9px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none">
              Closed
            </span>
          </div>
        `;
      } else {
        // Open state indicator: distinct green/lime treatment with pulsing ring
        const canClose = draftPoints.length >= 3;
        startMarkerEl.className += canClose ? " cursor-pointer" : "";
        startMarkerEl.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="absolute -inset-1 rounded-full bg-[#70D000]/50 animate-ping"></span>
            <span class="relative w-4.5 h-4.5 rounded-full bg-[#70D000] border-2 border-white shadow-md flex items-center justify-center ring-2 ring-[#004B20]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#004B20]"></span>
            </span>
            <span class="absolute -bottom-5 whitespace-nowrap bg-[#004B20] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none">
              ${canClose ? "Click to close" : "Start"}
            </span>
          </div>
        `;

        if (canClose) {
          startMarkerEl.title = "Click to close polygon";
          startMarkerEl.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (
              draftPointsRef.current.length >= 3 &&
              !isDraftClosedRef.current
            ) {
              const closed = closePolygonRing(draftPointsRef.current);
              setDraftPoints(closed);
              setIsDraftClosed(true);
            }
          });
        }
      }

      const startMarker = new maplibregl.Marker({ element: startMarkerEl })
        .setLngLat(firstCoord as [number, number])
        .addTo(map);
      draftMarkerRefs.current.push(startMarker);

      // Intermediate vertices (excluding first, and if closed, excluding duplicated last)
      const intermediateCount = isDraftClosed
        ? draftPoints.length - 1
        : draftPoints.length;
      for (let i = 1; i < intermediateCount; i++) {
        const pt = draftPoints[i];
        const el = document.createElement("div");
        el.className =
          "w-3 h-3 rounded-full bg-emerald-600 border-2 border-white shadow-md cursor-default pointer-events-none";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(pt as [number, number])
          .addTo(map);
        draftMarkerRefs.current.push(marker);
      }
    }

    // Ensure Draft Preview Source and Layers exist
    if (!map.getSource("draft-polygon-src")) {
      map.addSource("draft-polygon-src", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    // Fill layer (added first so stroke renders above it)
    if (!map.getLayer("draft-polygon-fill")) {
      map.addLayer({
        id: "draft-polygon-fill",
        type: "fill",
        source: "draft-polygon-src",
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": "#70D000",
          "fill-opacity": 0.28,
        },
      });
    }

    // Stroke layer (added after fill)
    if (!map.getLayer("draft-polygon-stroke")) {
      map.addLayer({
        id: "draft-polygon-stroke",
        type: "line",
        source: "draft-polygon-src",
        layout: {
          visibility: "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#059669",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
        },
      });
    }

    const src = map.getSource("draft-polygon-src") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;

    if (isDraftClosed && draftPoints.length >= 4) {
      // Closed Polygon preview: Polygon geometry, visible fill, solid forest green stroke
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { isClosed: true },
            geometry: {
              type: "Polygon",
              coordinates: [draftPoints],
            },
          },
        ],
      });

      map.setLayoutProperty("draft-polygon-fill", "visibility", "visible");
      map.setLayoutProperty("draft-polygon-stroke", "visibility", "visible");
      map.setPaintProperty("draft-polygon-stroke", "line-color", "#004B20");
      map.setPaintProperty("draft-polygon-stroke", "line-width", 3.5);
      map.setPaintProperty("draft-polygon-stroke", "line-dasharray", [1, 0]);
    } else if (!isDraftClosed && draftPoints.length >= 2) {
      // Open LineString preview: LineString geometry, hidden fill, dashed stroke
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { isClosed: false },
            geometry: {
              type: "LineString",
              coordinates: draftPoints,
            },
          },
        ],
      });

      map.setLayoutProperty("draft-polygon-fill", "visibility", "none");
      map.setLayoutProperty("draft-polygon-stroke", "visibility", "visible");
      map.setPaintProperty("draft-polygon-stroke", "line-color", "#059669");
      map.setPaintProperty("draft-polygon-stroke", "line-width", 2.5);
      map.setPaintProperty("draft-polygon-stroke", "line-dasharray", [2, 2]);
    } else {
      // Cleared / less than 2 points
      src.setData({
        type: "FeatureCollection",
        features: [],
      });
      map.setLayoutProperty("draft-polygon-fill", "visibility", "none");
      map.setLayoutProperty("draft-polygon-stroke", "visibility", "none");
    }
  }, [draftPoints, isDraftClosed]);

  const handleFinishDrawing = () => {
    let closedCoords: number[][];
    if (isDraftClosed) {
      closedCoords = draftPoints;
    } else {
      if (draftPoints.length < 3) {
        alert(
          "Please click at least 3 points on the map to define a valid location polygon.",
        );
        return;
      }
      closedCoords = closePolygonRing(draftPoints);
    }

    const validation = validatePolygonRing(closedCoords);
    if (!validation.isValid) {
      alert(
        validation.error ||
          "The drawn polygon is invalid. Please redraw the location.",
      );
      return;
    }

    setPendingNewArea({
      coordinates: closedCoords,
      area: validation.area!,
      center: validation.center!,
    });
    setNewAreaName("");
    setNewAreaActivities([]);
  };


  const handleCancelDrawing = () => {
    setDraftPoints([]);
    setIsDraftClosed(false);
    setCurrentMode("select");
  };

  const handleConfirmNewArea = () => {
    if (!pendingNewArea) return;
    const validation = validatePolygonRing(pendingNewArea.coordinates);
    if (!validation.isValid) {
      alert(
        validation.error ||
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
      source: "user_drawn",
      center: pendingNewArea.center,
      geometry: {
        type: "Polygon",
        coordinates: [pendingNewArea.coordinates],
      },
    };

    onAddCustomLocation?.(newLocation);
    setPendingNewArea(null);
    setDraftPoints([]);
    setIsDraftClosed(false);
    setCurrentMode("select");
  };

  const handleCancelNewArea = () => {
    setPendingNewArea(null);
    setDraftPoints([]);
    setIsDraftClosed(false);
    setCurrentMode("select");
  };

  const handleConfirmDeleteArea = () => {
    if (!pendingDeleteArea) return;
    const areaId = pendingDeleteArea.id;

    // Immediately remove area geometry and markers from MapLibre synchronously
    const map = mapRef.current;
    if (map) {
      // Clear delete hover highlight immediately
      const hoverSrc = map.getSource("delete-hover-src") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (hoverSrc) {
        hoverSrc.setData({ type: "FeatureCollection", features: [] });
      }

      // Remove from location-zones-src immediately
      const locZonesSrc = map.getSource("location-zones-src") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (locZonesSrc) {
        const remainingZoneFeatures = buildZoneFeatures().filter(
          (f) => f.properties?.id !== areaId && f.id !== areaId,
        );
        locZonesSrc.setData({
          type: "FeatureCollection",
          features: remainingZoneFeatures,
        });
      }

      // Remove from available-zones-src immediately
      const availZonesSrc = map.getSource("available-zones-src") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (availZonesSrc) {
        const isBuilderMode = Boolean(
          onAddCustomLocation || onRequestOpenAddAreaModal,
        );
        const addedIds = new Set(
          locations.filter((l) => l.id !== areaId).map((l) => l.id),
        );
        const availableLocations = isBuilderMode
          ? (campus?.defaultLocations || []).filter(
              (l) => l.id !== areaId && !addedIds.has(l.id),
            )
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

        availZonesSrc.setData({
          type: "FeatureCollection",
          features: availableFeatures,
        });
      }

      // Remove any HTML marker for this area immediately
      markersRef.current = markersRef.current.filter((m) => {
        const el = m.getElement();
        if (el.getAttribute("data-loc-id") === areaId) {
          m.remove();
          return false;
        }
        return true;
      });
    }

    onDeleteAreaRef.current?.(areaId);
    setHoveredDeleteFeature(null);
    setPendingDeleteArea(null);
    setCurrentMode("select");
  };

  const handleCancelDeleteArea = () => {
    setPendingDeleteArea(null);
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



      {/* Drawing Active Banner */}
      {currentMode === "addArea" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-lg shadow-lg border border-[#004B20]/40 text-xs font-sans">
          {isDraftClosed ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#004B20] ring-2 ring-[#70D000]" />
                <span className="font-bold text-[#004B20]">
                  Polygon Complete
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-[#E1E8DE] pl-2.5">
                <button
                  type="button"
                  onClick={handleFinishDrawing}
                  className="flex items-center gap-1 px-3 py-1 bg-[#004B20] hover:bg-[#003B19] text-white font-bold rounded shadow-xs cursor-pointer transition"
                  title="Confirm and configure location details"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Finish</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="font-semibold text-emerald-800">
                {draftPoints.length >= 3
                  ? `Click starting point to close polygon (${draftPoints.length} vertices added)`
                  : draftPoints.length > 0
                    ? `Click map to add boundary points (${draftPoints.length} added)`
                    : "Click map to place the first boundary point"}
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
            </>
          )}
        </div>
      )}

      {/* Delete Area Mode Active Banner */}
      {currentMode === "deleteArea" && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border border-red-500/30 text-xs font-sans">
          <div className="flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span className="font-bold text-red-800">
              Delete Area Tool — Click any user-created area on the map to delete it
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentMode("select")}
            className="px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer transition border border-neutral-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Preset Zone Delete Warning Toast */}
      {presetDeleteWarning && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-lg shadow-md text-xs font-sans">
          <span>{presetDeleteWarning}</span>
          <button
            type="button"
            onClick={() => setPresetDeleteWarning(null)}
            className="p-0.5 text-amber-700 hover:text-amber-900 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
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

      {/* Delete Area Confirmation Modal */}
      {pendingDeleteArea && (
        <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-5 shadow-2xl border border-red-200 w-full max-w-md space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-full bg-red-100 text-red-600 shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5 stroke-[2]" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-heading text-sm font-bold text-[#202820]">
                  Permanently Delete Map Area?
                </h3>
                {pendingDeleteArea.isConfiguredLocation ? (
                  <p className="text-xs text-[#667267] leading-relaxed">
                    Map area <strong className="text-[#202820]">"{pendingDeleteArea.name}"</strong> is currently configured as an active event location. Deleting this area will permanently remove both the area from the map and its location from your event configuration.
                  </p>
                ) : (
                  <p className="text-xs text-[#667267] leading-relaxed">
                    Are you sure you want to permanently delete map area <strong className="text-[#202820]">"{pendingDeleteArea.name}"</strong>? This will remove the drawn area from the map. This action cannot be undone.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E1E8DE]">
              <button
                type="button"
                onClick={handleCancelDeleteArea}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#667267] hover:text-[#202820] rounded hover:bg-[#F7F9F5] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteArea}
                className="px-4 py-1.5 bg-[#B42318] hover:bg-[#911c13] text-white font-bold text-xs rounded shadow-xs cursor-pointer transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {pendingDeleteArea.isConfiguredLocation
                    ? "Delete Area & Location"
                    : "Delete Area"}
                </span>
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
