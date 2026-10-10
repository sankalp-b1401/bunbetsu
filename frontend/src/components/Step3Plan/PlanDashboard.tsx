import React, { useState } from 'react';
import {
  Campus,
  CampusLocation,
  EventDetails,
  PredictionResult,
  RoutePlanResult,
  HeatmapMode,
  WasteCategory,
  BinRecommendationResult,
  BaselineSensitivityPoint,
  PlanDashboardProps,
} from '../../types/bunbetsu';
import { PlanLayerControls } from './PlanLayerControls';
import { PlanMapPanel } from './PlanMapPanel';
import { WasteOverviewCards } from './WasteOverviewCards';
import { EventDetailsCard } from './EventDetailsCard';
import { BinRecommendationsPanel } from './BinRecommendationsPanel';
import { BaselineSensitivityChart } from './BaselineSensitivityChart';
// Temporarily hidden per wireframe specification:
// import { RouteInsightsPanel } from './RouteInsightsPanel';
import {
  AlertCircle,
  RotateCcw,
  Loader2,
} from 'lucide-react';

export const PlanDashboard: React.FC<PlanDashboardProps> = ({
  campus,
  eventDetails,
  locations,
  prediction,
  predictionLoading,
  predictionError,
  predictionStale = false,
  routeResult,
  routesLoading,
  routesError,
  routesStale,
  binRecommendations = null,
  sensitivitySeries,
  onBackToConfigure,
  onRecalculatePrediction,
  onCalculateRoutes,
}) => {
  // Presentation state for map layer visibility
  const [showBoundary, setShowBoundary] = useState<boolean>(true);
  const [showActivityIcons, setShowActivityIcons] = useState<boolean>(true);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('total');
  const [heatmapCategory, setHeatmapCategory] = useState<WasteCategory>('Food');
  const [showBins, setShowBins] = useState<boolean>(false);
  const [showRoutes, setShowRoutes] = useState<boolean>(true);

  // Selected features on map
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const binsAvailable = Boolean(binRecommendations && binRecommendations.bins && binRecommendations.bins.length > 0);
  const routesAvailable = Boolean(routeResult && routeResult.success);

  const handleSelectLocation = (locId: string) => {
    setSelectedLocationId((prev) => (prev === locId ? null : locId));
  };

  const handleSelectRoute = (routeId: string | null) => {
    setSelectedRouteId(routeId);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F7F9F5] text-[#202820] overflow-y-auto lg:overflow-hidden select-none font-sans p-2 sm:p-2.5 lg:p-3 space-y-2">

      {/* STALE PREDICTION WARNING BANNER */}
      {predictionStale && (
        <div className="p-2 sm:p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-semibold">
              Event configuration or locations were modified. Planning results may be out of date.
            </span>
          </div>
          <button
            type="button"
            onClick={onRecalculatePrediction}
            disabled={predictionLoading}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#004B20] hover:bg-[#003B19] text-white rounded-md text-xs font-bold transition cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Recalculate plan</span>
          </button>
        </div>
      )}

      {/* ROUTING FAILURE WARNING (NON-BLOCKING) */}
      {routesError && !predictionError && (
        <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium text-[11px]">
              Pedestrian routing notice: {routesError}. Waste estimates and bin placements remain active.
            </span>
          </div>
        </div>
      )}

      {/* PREDICTION ERROR STATE */}
      {predictionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-xs text-red-900 shadow-2xs shrink-0">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Planning Pipeline Error</strong>
              <p className="text-[11px] text-red-800 leading-snug">{predictionError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRecalculatePrediction}
              className="px-3 py-1.5 bg-[#004B20] hover:bg-[#003B19] text-white rounded-md text-xs font-bold transition cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onBackToConfigure}
              className="px-3 py-1.5 bg-white border border-[#E1E8DE] rounded-md text-xs font-bold text-[#202820] hover:bg-[#F4F6F2] transition cursor-pointer"
            >
              Back to Configure
            </button>
          </div>
        </div>
      )}

      {/* PLANNING PIPELINE LOADING FULLSCREEN OVERLAY */}
      {predictionLoading && (
        <div className="py-12 bg-white rounded-xl border border-[#E1E8DE] flex flex-col items-center justify-center gap-3 text-center shadow-xs flex-1">
          <Loader2 className="w-8 h-8 text-[#004B20] animate-spin" />
          <div className="space-y-1">
            <h3 className="font-heading text-sm font-bold text-[#202820]">
              Executing Bunbetsu Planning Pipeline...
            </h3>
            <p className="text-xs text-[#667267] max-w-sm">
              Calculating waste predictions, spatial bin placement coordinates, and pedestrian route network corridors.
            </p>
          </div>
        </div>
      )}

      {/* MAIN DASHBOARD CONTENT (FIT TO VIEWPORT 3-COLUMN GRID) */}
      {!predictionLoading && (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
          {/* Column 1: Map Layers & Baseline Graph (Left, 3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-2.5 h-full min-h-0">
            <div className="min-h-0" style={{ flex: '3 1 0%' }}>
              <PlanLayerControls
                showBoundary={showBoundary}
                onToggleBoundary={setShowBoundary}
                showActivityIcons={showActivityIcons}
                onToggleActivityIcons={setShowActivityIcons}
                heatmapMode={heatmapMode}
                onSetHeatmapMode={setHeatmapMode}
                heatmapCategory={heatmapCategory}
                onSetHeatmapCategory={setHeatmapCategory}
                showBins={showBins}
                onToggleBins={setShowBins}
                binsAvailable={binsAvailable}
                showRoutes={showRoutes}
                onToggleRoutes={setShowRoutes}
                routesAvailable={routesAvailable}
                isRoutesStale={routesStale}
              />
            </div>

            <div className="min-h-0" style={{ flex: '2 1 0%' }}>
              <BaselineSensitivityChart
                currentBaselineRate={prediction ? prediction.baseline_rate_kg_per_person_day : 0}
                currentTotalWasteKg={prediction ? Math.round(prediction.total_waste_kg.central) : 0}
                sensitivitySeries={sensitivitySeries}
                loading={predictionLoading}
              />
            </div>
          </div>

          {/* Column 2: Campus Map & Event Details (Center, 6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-2.5 h-full min-h-0">
            <div className="min-h-0" style={{ flex: '4 1 0%' }}>
              <PlanMapPanel
                campus={campus}
                locations={locations}
                selectedLocationId={selectedLocationId}
                onSelectLocation={handleSelectLocation}
                heatmapMode={heatmapMode}
                heatmapCategory={heatmapCategory}
                heatmapData={prediction?.heatmap_data || null}
                showBoundary={showBoundary}
                showLocations={true}
                showActivityIcons={showActivityIcons}
                showBins={showBins}
                binRecommendations={binRecommendations}
                routeResult={routeResult}
                showRoutes={showRoutes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={handleSelectRoute}
                isRoutesStale={routesStale}
              />
            </div>

            <div className="min-h-0" style={{ flex: '1 1 0%' }}>
              <EventDetailsCard
                campus={campus}
                eventDetails={eventDetails}
                locationsCount={locations.length}
                prediction={prediction}
                onEditClick={onBackToConfigure}
              />
            </div>
          </div>

          {/* Column 3: Key Waste Estimates & Recommended Bins (Right, 3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-2.5 h-full min-h-0">
            <div className="min-h-0" style={{ flex: '2 1 0%' }}>
              <WasteOverviewCards
                prediction={prediction}
                loading={predictionLoading}
              />
            </div>

            <div className="min-h-0" style={{ flex: '3 1 0%' }}>
              <BinRecommendationsPanel
                binRecommendations={binRecommendations}
                locationAllocations={prediction?.location_allocations || []}
                onViewOnMap={() => setShowBins((prev) => !prev)}
                showBins={showBins}
                loading={predictionLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


