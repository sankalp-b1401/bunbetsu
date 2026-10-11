import React from 'react';
import { Route, AlertTriangle } from 'lucide-react';
import { RoutePlanResult } from '../../types/bunbetsu';
import { InfoTooltip } from './InfoTooltip';

export interface PedestrianRoutesCardProps {
  routeResult: RoutePlanResult | null;
  routesLoading?: boolean;
  routesError?: string | null;
  isStale?: boolean;
}

export const PedestrianRoutesCard: React.FC<PedestrianRoutesCardProps> = ({
  routeResult,
  routesLoading = false,
  routesError = null,
  isStale = false,
}) => {
  if (routesLoading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs animate-pulse font-sans h-full flex flex-col justify-between">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="space-y-2 my-auto">
          <div className="h-3 bg-neutral-100 rounded w-full" />
          <div className="h-8 bg-neutral-100 rounded-lg" />
          <div className="h-6 bg-neutral-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!routeResult) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs text-center space-y-1.5 font-sans h-full flex flex-col items-center justify-center select-none">
        <div className="w-7 h-7 rounded-full bg-[#F7F9F5] text-[#667267] flex items-center justify-center mx-auto">
          <Route className="w-3.5 h-3.5 text-[#667267]" />
        </div>
        <p className="text-xs font-bold text-[#202820]">Pedestrian Routes</p>
        <p className="text-[10px] text-[#667267] max-w-[200px]">
          {routesError ? routesError : 'Route calculations pending.'}
        </p>
      </div>
    );
  }

  const { diagnostics } = routeResult;
  const graph = diagnostics?.graph;
  const scoring = diagnostics?.scoring;

  // Real total path length in metres from backend graph diagnostics,
  // falling back to summing backend paths_geojson feature lengths if graph summary is absent
  const totalLengthM: number | null = (() => {
    if (typeof graph?.total_length_m === 'number' && !Number.isNaN(graph.total_length_m)) {
      return graph.total_length_m;
    }
    if (routeResult.paths_geojson?.features?.length) {
      const sum = routeResult.paths_geojson.features.reduce(
        (acc, f) => acc + (f.properties?.length_m || 0),
        0
      );
      if (sum > 0) return sum;
    }
    return null;
  })();

  const totalLengthFormatted =
    totalLengthM !== null
      ? `${(totalLengthM / 1000).toFixed(2)} km`
      : '—';
  const connectedPairsFormatted =
    scoring && typeof scoring.connected_pairs === 'number' && typeof scoring.evaluated_pairs === 'number'
      ? `${scoring.connected_pairs} / ${scoring.evaluated_pairs}`
      : '—';

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <Route className="w-3.5 h-3.5 text-[#004B20]" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Pedestrian Routes
          </h3>
          <InfoTooltip content="View scored pedestrian corridors, route demand, connectivity and routing diagnostics." />
        </div>
        {isStale && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" />
            Stale
          </span>
        )}
      </div>

      {/* Main Content Area: Evenly distributed sections */}
      <div className="flex-1 flex flex-col justify-between pt-2">
        {/* Importance Color Ramp */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#667267]">
            <span>Low Demand</span>
            <span>High Demand</span>
          </div>
          <div className="h-1.5 sm:h-2 rounded-full w-full bg-gradient-to-r from-[#94A3B8] via-[#10B981] via-[#F59E0B] via-[#EA580C] to-[#DC2626] shadow-2xs" />
          <div className="flex items-center justify-between text-[9px] text-[#667267] font-semibold">
            <span>0.0</span>
            <span>0.5</span>
            <span>1.0</span>
          </div>
        </div>

        {/* Legend Items */}
        <div className="space-y-1.5 pt-2 border-t border-[#E1E8DE] text-[10px]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-[#8B5CF6] shrink-0" />
            <span className="text-[#202820] font-medium leading-none">Inferred access connector</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-[#D97706] shrink-0" />
            <span className="text-[#202820] font-medium leading-none">Flagged connector (obstacle)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#EF4444] border border-white shadow-2xs shrink-0" />
            <span className="text-[#202820] font-medium leading-none">High-traffic junction</span>
          </div>
        </div>

        {/* Key Stats (Two columns) */}
        <div className="pt-2 border-t border-[#E1E8DE] grid grid-cols-2 gap-2 text-[10px] text-[#667267]">
          <div>
            <span className="block font-normal leading-tight">Total path length:</span>
            <span className="font-bold text-[#202820] text-[11px] leading-tight">
              {totalLengthFormatted}
            </span>
          </div>
          <div>
            <span className="block font-normal leading-tight">Connected pairs:</span>
            <span className="font-bold text-[#202820] text-[11px] leading-tight">
              {connectedPairsFormatted}
            </span>
          </div>
          {typeof scoring?.total_paths_evaluated === 'number' && scoring.total_paths_evaluated > 0 && (
            <div className="col-span-2 pt-1 border-t border-dashed border-[#E1E8DE] flex items-center justify-between text-[9px] text-[#667267]">
              <span>Alternative routes:</span>
              <span className="font-semibold text-[#202820]">
                {scoring.total_paths_evaluated} paths ({scoring.pairs_with_multiple_paths ?? 0} multi-path)
                {scoring.pairs_reaching_path_limit ? ` · limit reached (${scoring.pairs_reaching_path_limit})` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

