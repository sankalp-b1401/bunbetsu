import React from 'react';
import { RoutePlanResult } from '../../types/bunbetsu';
import { Route, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

interface RouteInsightsPanelProps {
  routeResult: RoutePlanResult | null;
  routesLoading: boolean;
  routesError: string | null;
  routesStale: boolean;
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string | null) => void;
  onCalculateRoutes: () => void;
  locationCount: number;
}

export const RouteInsightsPanel: React.FC<RouteInsightsPanelProps> = ({
  routeResult,
  routesLoading,
  routesError,
  routesStale,
  selectedRouteId,
  onSelectRoute,
  onCalculateRoutes,
  locationCount,
}) => {
  // Sort path segments by normalized score
  const segments = React.useMemo(() => {
    if (!routeResult?.paths_geojson?.features) return [];
    return [...routeResult.paths_geojson.features]
      .map((f) => ({
        id: f.id || f.properties.id,
        highway: f.properties.highway || 'path',
        lengthM: Math.round(f.properties.length_m || 0),
        score: f.properties.normalized_score,
        rawScore: f.properties.raw_score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4); // Display top 4 ranked corridors
  }, [routeResult]);

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs space-y-3 select-none font-sans flex flex-col justify-between h-full">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <Route className="w-4 h-4 text-[#004B20]" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            High-traffic routes
          </h3>
          <InfoTooltip content="Inspect the highest-scoring pedestrian route segments and their diagnostics." />
        </div>

        {/* Status Badge */}
        {routeResult ? (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              routesStale
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/30'
            }`}
          >
            {routesStale ? 'Stale' : `${routeResult.paths_geojson?.features?.length || 0} routes`}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F4F6F2] text-[#667267] border border-[#E1E8DE]">
            Pending
          </span>
        )}
      </div>

      {/* Main Body */}
      <div className="space-y-2 flex-1 min-h-0 flex flex-col justify-center">
        {/* Error Notification */}
        {routesError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
            <p className="leading-snug text-[11px] font-medium">{routesError}</p>
          </div>
        )}

        {/* Warnings or partial connectivity note */}
        {routeResult?.warnings && routeResult.warnings.length > 0 && (
          <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-[10px] text-amber-800 space-y-0.5">
            {routeResult.warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                <span className="font-medium truncate">{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Not yet calculated state */}
        {!routeResult && !routesLoading && !routesError && (
          <div className="p-3 bg-[#F7F9F5] rounded-xl border border-dashed border-[#E1E8DE] text-center space-y-1">
            <p className="text-xs font-bold text-[#202820]">Routes not yet calculated</p>
            <p className="text-[10px] text-[#667267] leading-tight">
              Analyze pedestrian foot traffic between {locationCount} campus zone{locationCount === 1 ? '' : 's'}.
            </p>
          </div>
        )}

        {/* Loading in progress */}
        {routesLoading && (
          <div className="py-5 flex flex-col items-center justify-center gap-1.5 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE]">
            <Loader2 className="w-5 h-5 text-[#004B20] animate-spin" />
            <span className="text-xs font-bold text-[#202820]">
              Scoring pedestrian routes...
            </span>
          </div>
        )}

        {/* Ranked Route Segments List */}
        {routeResult && !routesLoading && (
          <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-0.5">
            {segments.map((seg, idx) => {
              const isSelected = selectedRouteId === seg.id;

              let tagLabel = 'Low';
              let tagStyle = 'bg-[#EAF5E6] text-[#004B20] border-[#70D000]/30';
              if (seg.score >= 0.65) {
                tagLabel = 'High';
                tagStyle = 'bg-red-50 text-red-700 border-red-200';
              } else if (seg.score >= 0.35) {
                tagLabel = 'Medium';
                tagStyle = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div
                  key={seg.id}
                  onClick={() => onSelectRoute?.(isSelected ? null : seg.id)}
                  className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                    isSelected
                      ? 'bg-[#EAF5E6] border-[#004B20] shadow-2xs font-bold'
                      : 'bg-[#F7F9F5] hover:bg-white border-[#E1E8DE]'
                  }`}
                  title="Click to highlight route segment on map"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded-full bg-white text-[#667267] border border-[#E1E8DE] flex items-center justify-center text-[9px] font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-semibold text-[#202820] text-[11px] capitalize truncate block">
                        Corridor #{seg.id.slice(-5)} ({seg.highway})
                      </span>
                      <span className="text-[9px] text-[#667267] block">
                        {seg.lengthM} m length
                      </span>
                    </div>
                  </div>

                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${tagStyle}`}>
                    {tagLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Route Action Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onCalculateRoutes}
          disabled={routesLoading || locationCount === 0}
          className="w-full py-2 px-3 bg-[#004B20] hover:bg-[#003B19] active:bg-[#002B12] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
        >
          {routesLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Calculating routes...</span>
            </>
          ) : (
            <>
              <Route className="w-3.5 h-3.5" />
              <span>
                {routeResult
                  ? routesStale
                    ? 'Recalculate routes (Stale)'
                    : 'Recalculate pedestrian routes'
                  : 'Calculate pedestrian routes'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
