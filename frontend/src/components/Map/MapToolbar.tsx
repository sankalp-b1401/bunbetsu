import React from 'react';
import { MousePointer, PlusCircle } from 'lucide-react';

interface MapToolbarProps {
  currentMode: 'select' | 'addArea';
  onModeChange: (mode: 'select' | 'addArea') => void;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="flex items-center justify-between gap-2.5 w-full pointer-events-auto">
      {/* Tools: Select location, Add location */}
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
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Add location</span>
        </button>
      </div>
    </div>
  );
};

