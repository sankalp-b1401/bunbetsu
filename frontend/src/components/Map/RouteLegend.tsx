import React from 'react';
import { Route, AlertTriangle, Info } from 'lucide-react';
import { RoutePlanResult } from '../../types/bunbetsu';

interface RouteLegendProps {
  routeResult: RoutePlanResult;
  isStale?: boolean;
}

export const RouteLegend: React.FC<RouteLegendProps> = ({
  routeResult,
  isStale = false,
}) => {
  const { diagnostics, warnings } = routeResult;
  const { scoring, graph } = diagnostics;

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-md border border-[#E1E8DE] p-3 text-xs space-y-2.5 max-w-[270px] pointer-events-auto select-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#E1E8DE] pb-1.5">
        <div className="flex items-center gap-1.5">
          <Route className="w-3.5 h-3.5 text-[#004B20]" />
          <span className="font-heading font-bold text-[#202820] text-[11px] uppercase tracking-wider">
            Pedestrian Routes
          </span>
        </div>
        {isStale && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" />
            Stale
          </span>
        )}
      </div>

      {/* Importance Color Ramp */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-bold text-[#667267]">
          <span>Low Demand</span>
          <span>High Demand</span>
        </div>
        <div className="h-2 rounded-full w-full bg-gradient-to-r from-[#94A3B8] via-[#10B981] via-[#F59E0B] via-[#EA580C] to-[#DC2626] shadow-2xs" />
        <div className="flex items-center justify-between text-[9px] text-[#667267] font-semibold">
          <span>0.0</span>
          <span>0.5</span>
          <span>1.0</span>
        </div>
      </div>

      {/* Legend Items */}
      <div className="space-y-1.5 pt-1 border-t border-[#E1E8DE] text-[10px]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#8B5CF6] shrink-0" />
          <span className="text-[#202820] font-medium">Inferred access connector</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#D97706] shrink-0" />
          <span className="text-[#202820] font-medium">Flagged connector (obstacle)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] border border-white shadow-2xs shrink-0" />
          <span className="text-[#202820] font-medium">High-traffic junction</span>
        </div>
      </div>

      {/* Key Stats */}
      <div className="pt-1.5 border-t border-[#E1E8DE] grid grid-cols-2 gap-1.5 text-[10px] text-[#667267]">
        <div>
          <span className="block font-normal">Paths length:</span>
          <span className="font-bold text-[#202820]">
            {(graph.total_length_m / 1000).toFixed(2)} km
          </span>
        </div>
        <div>
          <span className="block font-normal">Connected pairs:</span>
          <span className="font-bold text-[#202820]">
            {scoring.connected_pairs} / {scoring.evaluated_pairs}
          </span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="pt-1 border-t border-[#E1E8DE] flex items-start gap-1 text-[9px] text-[#667267] leading-tight font-normal">
        <Info className="w-3 h-3 text-[#667267] shrink-0 mt-0.5" />
        <span>Relative modelled route importance; not measured footfall.</span>
      </div>
    </div>
  );
};

