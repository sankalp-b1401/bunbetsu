import React from 'react';
import { Trash2, Recycle } from 'lucide-react';
import { HeatmapMode } from '../../types/bunbetsu';

interface PlanLegendProps {
  heatmapMode: HeatmapMode;
}

export const PlanLegend: React.FC<PlanLegendProps> = ({ heatmapMode: _heatmapMode }) => {
  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs space-y-3 select-none font-sans flex flex-col justify-between h-full">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Legend
          </h3>
          <span className="text-[10px] text-[#667267] font-medium">Map symbols</span>
        </div>

        {/* Waste Intensity Gradient (Always displayed) */}
        <div className="space-y-1.5 pb-2 border-b border-[#E1E8DE]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#202820]">
            <span>Waste intensity (kg)</span>
          </div>
          <div className="h-2 rounded-full w-full bg-gradient-to-r from-[#10B981] via-[#FBBF24] via-[#F97316] to-[#EF4444] shadow-2xs" />
          <div className="flex items-center justify-between text-[10px] text-[#667267] font-semibold">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Recommended Bins Legend (Recyclable & Disposable) */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-[#16A34A] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
              <Recycle className="w-3 h-3 text-white" />
            </div>
            <span className="text-[11px] font-medium text-[#202820]">Recommended bin (Recyclable)</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-[#2563EB] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
              <Trash2 className="w-3 h-3 text-white" />
            </div>
            <span className="text-[11px] font-medium text-[#202820]">Recommended bin (Disposable)</span>
          </div>
        </div>

        {/* Zone Lines */}
        <div className="space-y-2 pt-2 border-t border-[#E1E8DE] text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-3 rounded-xs border-2 border-dashed border-[#70D000] bg-[#EAF5E6]/60 shrink-0" />
            <span className="text-[11px] font-medium text-[#202820]">Event location zone</span>
          </div>
        </div>
      </div>
    </div>
  );
};

