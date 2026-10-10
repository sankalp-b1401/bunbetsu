import React, { useState, useRef, useEffect } from 'react';
import {
  Campus,
  CampusLocation,
  HeatmapData,
  HeatmapMode,
  WasteCategory,
  BinRecommendationResult,
  RoutePlanResult,
} from '../../types/bunbetsu';
import { CampusMap } from '../Map/CampusMap';
import { ChevronDown, Trash2, Recycle } from 'lucide-react';

interface PlanMapPanelProps {
  campus: Campus;
  locations: CampusLocation[];
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string) => void;

  heatmapMode: HeatmapMode;
  heatmapCategory: WasteCategory;
  heatmapData: HeatmapData | null;

  showBoundary: boolean;
  showLocations: boolean;
  showActivityIcons?: boolean;
  showBins: boolean;
  binRecommendations?: BinRecommendationResult | null;

  routeResult: RoutePlanResult | null;
  showRoutes: boolean;
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string | null) => void;
  isRoutesStale?: boolean;
}

export const PlanMapPanel: React.FC<PlanMapPanelProps> = ({
  campus,
  locations,
  selectedLocationId,
  onSelectLocation,
  heatmapMode,
  heatmapCategory,
  heatmapData,
  showBoundary,
  showLocations,
  showActivityIcons = true,
  showBins,
  binRecommendations,
  routeResult,
  showRoutes,
  selectedRouteId,
  onSelectRoute,
  isRoutesStale = false,
}) => {
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);
  const legendDropdownRef = useRef<HTMLDivElement>(null);

  // Close legend dropdown when clicking anywhere on the screen or pressing Escape
  useEffect(() => {
    if (!isLegendOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (legendDropdownRef.current && !legendDropdownRef.current.contains(e.target as Node)) {
        setIsLegendOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLegendOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLegendOpen]);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-xl border border-[#E1E8DE] shadow-2xs overflow-hidden font-sans relative">
      {/* MAP HEADER */}
      <div className="px-3.5 py-2 bg-white border-b border-[#E1E8DE] flex items-center justify-between shrink-0 z-20 relative">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-xs sm:text-sm font-bold text-[#202820]">Campus map</h2>
          <span className="text-xs text-[#667267] font-medium hidden sm:inline">
            • {campus.name}
          </span>
        </div>

        {/* Legend Dropdown Trigger Button */}
        <div className="relative" ref={legendDropdownRef}>
          <button
            type="button"
            onClick={() => setIsLegendOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#202820] hover:text-[#004B20] bg-[#F7F9F5] hover:bg-[#EAF5E6]/40 border border-[#E1E8DE] hover:border-[#004B20]/40 rounded-lg transition cursor-pointer shadow-2xs"
            title="Toggle map legend"
            aria-expanded={isLegendOpen}
          >
            <span>Legend</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#667267] transition-transform duration-200 ${
                isLegendOpen ? 'rotate-180 text-[#004B20]' : ''
              }`}
            />
          </button>

          {/* Floating Legend Dropdown Card */}
          {isLegendOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-white rounded-xl border border-[#E1E8DE] shadow-xl p-3.5 font-sans space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
                <h4 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
                  Map legend
                </h4>
                <span className="text-[10px] text-[#667267] font-medium">Symbols</span>
              </div>

              {/* Waste Intensity Gradient (Always displayed) */}
              <div className="space-y-1 pb-1.5 border-b border-[#E1E8DE]">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#202820]">
                  <span>Waste intensity (kg)</span>
                </div>
                <div className="h-2 rounded-full w-full bg-gradient-to-r from-[#10B981] via-[#FBBF24] via-[#F97316] to-[#EF4444] shadow-2xs" />
                <div className="flex items-center justify-between text-[10px] text-[#667267] font-semibold">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              {/* Recommended Bins Legend */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[#2563EB] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
                    <Trash2 className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-[#202820]">
                    Disposable bin (100L)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[#16A34A] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
                    <Recycle className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-[#202820]">
                    Recyclable bin (100L)
                  </span>
                </div>
              </div>

              {/* Event location zone */}
              <div className="pt-1.5 border-t border-[#E1E8DE] text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-3 rounded-xs border-2 border-dashed border-[#70D000] bg-[#EAF5E6]/60 shrink-0" />
                  <span className="text-[11px] font-medium text-[#202820]">
                    Event location zone
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAP CANVAS CONTAINER */}
      <div className="flex-1 min-h-0 w-full relative">
        <CampusMap
          campus={campus}
          locations={locations}
          selectedLocationId={selectedLocationId}
          onSelectLocation={onSelectLocation}
          showToolbar={false}
          showLegend={false}
          heightClass="h-full w-full"
          recenterTrigger={recenterTrigger}
          routeResult={routeResult}
          showRoutes={showRoutes}
          isRoutesStale={isRoutesStale}
          heatmapMode={heatmapMode}
          heatmapCategory={heatmapCategory}
          heatmapData={heatmapData}
          showBoundary={showBoundary}
          showZones={showLocations}
          showLabels={showActivityIcons}
          showBins={showBins}
          binRecommendations={binRecommendations}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
          mapViewMode="map"
          showActivityIcons={showActivityIcons}
        />

        {/* Map Scale Indicator (Mocked per standard visual design) */}
        <div className="absolute bottom-3 left-3 pointer-events-none z-10 bg-white/90 backdrop-blur-xs px-2 py-1 rounded border border-[#E1E8DE] shadow-2xs flex items-center gap-1.5 text-[10px] font-bold text-[#667267]">
          <div className="w-10 h-0.5 bg-[#202820] relative">
            <span className="absolute -top-1 left-0 w-0.5 h-2 bg-[#202820]" />
            <span className="absolute -top-1 right-0 w-0.5 h-2 bg-[#202820]" />
          </div>
          <span>200 m</span>
        </div>
      </div>
    </div>
  );
};

