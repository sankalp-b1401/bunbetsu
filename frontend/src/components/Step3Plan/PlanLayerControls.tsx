import React from 'react';
import {
  Layers,
  Flame,
  PieChart,
  Recycle,
  Trash2,
  Route,
  ChevronDown,
  Info,
  Shield,
  Apple,
  Tag,
} from 'lucide-react';
import { HeatmapMode, WasteCategory } from '../../types/bunbetsu';
import { InfoTooltip } from './InfoTooltip';

interface PlanLayerControlsProps {
  showBoundary: boolean;
  onToggleBoundary: (show: boolean) => void;
  showLocations?: boolean;
  onToggleLocations?: (show: boolean) => void;
  showActivityIcons: boolean;
  onToggleActivityIcons: (show: boolean) => void;
  heatmapMode: HeatmapMode;
  onSetHeatmapMode: (mode: HeatmapMode) => void;
  heatmapCategory: WasteCategory;
  onSetHeatmapCategory: (cat: WasteCategory) => void;
  showBins: boolean;
  onToggleBins: (show: boolean) => void;
  binsAvailable: boolean;
  showRoutes: boolean;
  onToggleRoutes: (show: boolean) => void;
  routesAvailable: boolean;
  isRoutesStale?: boolean;
}

const CATEGORY_OPTIONS: Array<{ value: WasteCategory; label: string; color: string }> = [
  { value: 'Food', label: 'Food waste', color: '#EA580C' },
  { value: 'Plastic', label: 'Plastic', color: '#0284C7' },
  { value: 'Paper', label: 'Paper', color: '#8B5CF6' },
  { value: 'Glass', label: 'Glass', color: '#0D9488' },
  { value: 'Others', label: 'Others', color: '#64748B' },
];

export const PlanLayerControls: React.FC<PlanLayerControlsProps> = ({
  showBoundary,
  onToggleBoundary,
  showLocations,
  onToggleLocations,
  showActivityIcons,
  onToggleActivityIcons,
  heatmapMode,
  onSetHeatmapMode,
  heatmapCategory,
  onSetHeatmapCategory,
  showBins,
  onToggleBins,
  binsAvailable,
  showRoutes,
  onToggleRoutes,
  routesAvailable,
  isRoutesStale = false,
}) => {
  const isHeatmapActive = heatmapMode !== 'none';

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-3 sm:p-3.5 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-y-auto">
      <div className="space-y-1.5 sm:space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#004B20]" />
            <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
              Map layers
            </h3>
            <InfoTooltip content="Toggle campus boundaries, waste heatmaps, bin markers and route overlays." />
          </div>
        </div>

        <div className="space-y-1">
          {/* 1. Campus Boundary */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#004B20]" />
              <span className="text-xs font-semibold text-[#202820]">Campus boundary</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showBoundary}
              onClick={() => onToggleBoundary(!showBoundary)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
                showBoundary ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  showBoundary ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Icons Toggle */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#004B20]" />
              <span className="text-xs font-semibold text-[#202820]">Icons</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showActivityIcons}
              onClick={() => onToggleActivityIcons(!showActivityIcons)}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${
                showActivityIcons ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
              }`}
              title={showActivityIcons ? 'Disable location icons and names' : 'Enable location icons and names'}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  showActivityIcons ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 3. Recommended Bins */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#004B20]" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-[#202820]">Recommended bins</span>
                {!binsAvailable && (
                  <span className="text-[10px] text-[#667267] font-medium leading-none">
                    Distribution pending
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showBins}
              disabled={!binsAvailable}
              onClick={() => onToggleBins(!showBins)}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                !binsAvailable
                  ? 'bg-[#E1E8DE]/60 opacity-60 cursor-not-allowed'
                  : showBins
                  ? 'bg-[#004B20] cursor-pointer'
                  : 'bg-[#E1E8DE] cursor-pointer'
              }`}
              title={!binsAvailable ? 'Bin placement coordinates pending model service' : 'Toggle bin locations'}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  showBins && binsAvailable ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="h-px bg-[#E1E8DE]/80 my-1" />

          {/* 4. Total Waste Heatmap */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  heatmapMode === 'total' ? 'bg-[#EAF5E6] text-[#004B20]' : 'text-[#667267]'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-[#202820]">Total waste heatmap</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={heatmapMode === 'total'}
              onClick={() => onSetHeatmapMode(heatmapMode === 'total' ? 'none' : 'total')}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
                heatmapMode === 'total' ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  heatmapMode === 'total' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 5. Category-specific Heatmap */}
          <div className="space-y-1.5 py-0.5">
            <div className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center ${
                    heatmapMode === 'category' ? 'bg-[#EAF5E6] text-[#004B20]' : 'text-[#667267]'
                  }`}
                >
                  <PieChart className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-semibold text-[#202820]">Category heatmap</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={heatmapMode === 'category'}
                onClick={() => onSetHeatmapMode(heatmapMode === 'category' ? 'none' : 'category')}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
                  heatmapMode === 'category' ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                    heatmapMode === 'category' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Dropdown for category when active */}
            {heatmapMode === 'category' && (
              <div className="pl-6 pt-0.5">
                <div className="relative">
                  <select
                    value={heatmapCategory}
                    onChange={(e) => onSetHeatmapCategory(e.target.value as WasteCategory)}
                    className="w-full pl-7 pr-8 py-1.5 bg-[#F7F9F5] hover:bg-white focus:bg-white text-xs font-bold text-[#202820] border border-[#E1E8DE] rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#004B20]"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {/* Category color indicator */}
                  <span
                    className="w-2.5 h-2.5 rounded-full absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      backgroundColor:
                        CATEGORY_OPTIONS.find((o) => o.value === heatmapCategory)?.color || '#EA580C',
                    }}
                  />
                  <ChevronDown className="w-3.5 h-3.5 text-[#667267] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* 6. Recyclable Waste Heatmap */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Recycle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-[#202820]">Recyclable heatmap</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={heatmapMode === 'recyclable'}
              onClick={() => onSetHeatmapMode(heatmapMode === 'recyclable' ? 'none' : 'recyclable')}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
                heatmapMode === 'recyclable' ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  heatmapMode === 'recyclable' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 7. Disposable Waste Heatmap */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-[#202820]">Disposable heatmap</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={heatmapMode === 'disposable'}
              onClick={() => onSetHeatmapMode(heatmapMode === 'disposable' ? 'none' : 'disposable')}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
                heatmapMode === 'disposable' ? 'bg-[#004B20]' : 'bg-[#E1E8DE]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  heatmapMode === 'disposable' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>


          {/* 8. High-traffic Routes (commented out per wireframe) */}
          {/*
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-[#004B20]" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-[#202820]">High-traffic routes</span>
                {isRoutesStale && (
                  <span className="text-[10px] text-amber-700 font-bold leading-none">Out of date</span>
                )}
                {!routesAvailable && !isRoutesStale && (
                  <span className="text-[10px] text-[#667267] font-medium leading-none">
                    Not calculated
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showRoutes}
              disabled={!routesAvailable}
              onClick={() => onToggleRoutes(!showRoutes)}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                !routesAvailable
                  ? 'bg-[#E1E8DE]/60 opacity-60 cursor-not-allowed'
                  : showRoutes
                  ? 'bg-[#004B20] cursor-pointer'
                  : 'bg-[#E1E8DE] cursor-pointer'
              }`}
              title={!routesAvailable ? 'Calculate routes below first' : 'Toggle routes layer'}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                  showRoutes && routesAvailable ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          */}
        </div>
      </div>
    </div>
  );
};

