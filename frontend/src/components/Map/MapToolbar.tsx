import React from 'react';
import { MousePointer, PlusCircle, Trash2, Route, Eye, EyeOff } from 'lucide-react';
import { MapMode } from '../../types/bunbetsu';

interface MapToolbarProps {
  currentMode: MapMode;
  onModeChange: (mode: MapMode) => void;
  hasRoutes?: boolean;
  showRoutes?: boolean;
  onToggleRoutes?: (show: boolean) => void;
  isRoutesStale?: boolean;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
  currentMode,
  onModeChange,
  hasRoutes = false,
  showRoutes = true,
  onToggleRoutes,
  isRoutesStale = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-2.5 w-full pointer-events-auto">
      {/* Tools: Select location, Add location, Delete area, Route overlay */}
      <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1 rounded-md shadow-sm border border-[#E1E8DE]">
        <button
          type="button"
          onClick={() => onModeChange('select')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer font-sans ${
            currentMode === 'select'
              ? 'bg-[#004B20] text-white shadow-xs'
              : 'text-[#667267] hover:bg-[#F7F9F5] hover:text-[#202820]'
          }`}
          title="Click to select locations on the map"
          aria-label="Select location"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Select location</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange('addArea')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer font-sans ${
            currentMode === 'addArea'
              ? 'bg-[#004B20] text-white shadow-xs ring-2 ring-[#70D000]/40'
              : 'text-[#667267] hover:bg-[#F7F9F5] hover:text-[#202820]'
          }`}
          title="Click to draw and add a new event location"
          aria-label="Add location"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Add location</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange('deleteArea')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer font-sans ${
            currentMode === 'deleteArea'
              ? 'bg-[#B42318] text-white shadow-xs ring-2 ring-red-400/40'
              : 'text-[#667267] hover:bg-red-50 hover:text-[#B42318]'
          }`}
          title="Delete area — Click a custom map area to delete it"
          aria-label="Delete area"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete area</span>
        </button>

        {hasRoutes && (
          <button
            type="button"
            onClick={() => onToggleRoutes?.(!showRoutes)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer font-sans border-l border-[#E1E8DE] ml-0.5 ${
              showRoutes
                ? 'bg-[#EAF5E6] text-[#004B20] hover:bg-[#DCEDD6]'
                : 'text-[#667267] hover:bg-[#F7F9F5] hover:text-[#202820]'
            }`}
            title={showRoutes ? 'Hide pedestrian routes layer' : 'Show pedestrian routes layer'}
          >
            <Route className="w-3.5 h-3.5 text-[#004B20]" />
            <span>Routes</span>
            {isRoutesStale && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Routes are out of date (layout modified)" />
            )}
            {showRoutes ? (
              <Eye className="w-3 h-3 text-[#004B20]" />
            ) : (
              <EyeOff className="w-3 h-3 text-[#667267]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
