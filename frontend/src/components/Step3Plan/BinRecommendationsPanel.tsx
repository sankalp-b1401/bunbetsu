import React, { useState } from 'react';
import {
  BinRecommendationResult,
  LocationWasteAllocation,
  RoadBinRecommendationResult,
} from '../../types/bunbetsu';
import {
  Trash2,
  Recycle,
  Info,
  ShieldAlert,
  RotateCw,
  AlertTriangle,
  Route,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

export interface BinRecommendationsPanelProps {
  binRecommendations?: BinRecommendationResult | null;
  roadBinRecommendations?: RoadBinRecommendationResult | null;
  locationAllocations?: LocationWasteAllocation[];
  onViewOnMap?: () => void;
  showBins?: boolean;
  loading?: boolean;
}

export const BinRecommendationsPanel: React.FC<BinRecommendationsPanelProps> = ({
  binRecommendations,
  roadBinRecommendations,
  onViewOnMap,
  showBins = false,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'on-location' | 'road-bins'>('on-location');

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs space-y-2.5 animate-pulse font-sans h-full flex flex-col justify-between">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="space-y-2 my-auto">
          <div className="h-14 bg-neutral-100 rounded-xl" />
          <div className="h-14 bg-neutral-100 rounded-xl" />
        </div>
      </div>
    );
  }

  // Model validation: Do not invent fake counts or fall back to client-side approximations
  const hasOnLocationResult = Boolean(binRecommendations);
  const isOnLocationFailed = binRecommendations?.status === 'failed';
  const isOnLocationPartial = binRecommendations?.status === 'partial';
  const totalOnLocationBins = binRecommendations?.totalBins ?? 0;

  const hasRoadBins = Boolean(roadBinRecommendations);
  const roadBinsCount = roadBinRecommendations?.total_road_bins ?? 0;
  const roadUncoveredCount = roadBinRecommendations?.uncovered_location_ids?.length ?? 0;

  // Render Road Bins Tab Content
  const renderRoadBinsContent = () => {
    if (!roadBinRecommendations) {
      return (
        <div className="my-auto py-4 text-center space-y-1.5">
          <Route className="w-6 h-6 text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-[#202820]">Road bin recommendations unavailable</p>
          <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
            Pedestrian route scoring must be active to calculate influence-based road bin placements.
          </p>
        </div>
      );
    }

    const {
      total_road_bins,
      total_locations_requiring_coverage,
      covered_location_ids,
      uncovered_location_ids,
      location_influence_radii_m,
      location_dominant_waste_types,
      road_bin_spacing_m,
      solver_name,
      optimality_proven,
      total_popularity_score,
      placements,
      warnings = [],
    } = roadBinRecommendations;

    return (
      <div className="flex flex-col gap-2 my-auto py-1 overflow-y-auto max-h-[380px] pr-0.5 custom-scrollbar">
        {/* Tile 1: Physical Road Bins */}
        <div className="p-2 sm:p-2.5 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-900">
              <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">
                🚏
              </span>
              <span className="text-xs font-bold">Road Bins</span>
            </div>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                optimality_proven
                  ? 'text-emerald-800 bg-emerald-100/70 border-emerald-300/60'
                  : 'text-amber-800 bg-amber-100/70 border-amber-300/60'
              }`}
              title={`Solver: ${solver_name} (${optimality_proven ? 'Mathematically proven optimal' : 'Heuristic fallback'})`}
            >
              {optimality_proven ? 'MILP Optimal' : 'Heuristic'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {total_road_bins}
            </span>
            <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
              {road_bin_spacing_m}m min spacing · dual-stream
            </span>
          </div>
        </div>

        {/* Tile 2: Spatial Influence Coverage */}
        <div className="p-2 sm:p-2.5 bg-sky-50/50 rounded-xl border border-sky-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sky-900">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-700" />
              <span className="text-xs font-bold">Influence Coverage</span>
            </div>
            <span className="text-[9px] font-bold text-sky-800 bg-sky-100/70 px-1.5 py-0.5 rounded border border-sky-300/60">
              {covered_location_ids.length}/{total_locations_requiring_coverage} zones
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {total_locations_requiring_coverage > 0
                ? Math.round((covered_location_ids.length / total_locations_requiring_coverage) * 100)
                : 100}
              %
            </span>
            <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
              ★ {(total_popularity_score * 100).toFixed(0)}% popularity score
            </span>
          </div>
        </div>

        {/* Placements Cards */}
        {placements.length > 0 ? (
          <div className="p-2 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE] space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-[#202820] font-bold border-b border-[#E1E8DE] pb-1">
              <span>Selected road stations ({placements.length})</span>
              <span className="text-[10px] text-[#667267] font-normal">Pedestrian paths</span>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 custom-scrollbar">
              {placements.map((p) => {
                const names = p.served_location_names?.length
                  ? p.served_location_names.join(', ')
                  : p.served_location_ids.join(', ');
                return (
                  <div
                    key={p.id}
                    className="p-1.5 bg-white rounded-lg border border-[#E1E8DE] flex items-center justify-between gap-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 font-bold text-[#202820]">
                        <span className="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-900 rounded font-mono">
                          {p.id}
                        </span>
                        <span className="truncate text-[10.5px]">{names}</span>
                      </div>
                      <div className="text-[9.5px] text-[#667267] truncate">
                        Road: {p.source_segment_id || 'Path segment'}
                        {p.coordinates && p.coordinates.length >= 2 && (
                          <span> · [{p.coordinates[0].toFixed(4)}, {p.coordinates[1].toFixed(4)}]</span>
                        )}
                        {p.served_location_distances_m &&
                          Object.entries(p.served_location_distances_m).length > 0 && (
                            <span> · {Math.round(Object.values(p.served_location_distances_m)[0])}m from edge</span>
                          )}
                      </div>
                    </div>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 shrink-0">
                      ★ {(p.normalized_popularity_score * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE] text-center space-y-1 my-1">
            <Info className="w-5 h-5 text-amber-600 mx-auto" />
            <p className="text-xs font-bold text-[#202820]">No road bins placed</p>
            <p className="text-[10.5px] text-[#667267] leading-relaxed">
              No pedestrian road segments qualified within activity influence zones or zero additional bins were required.
            </p>
          </div>
        )}

        {/* Location Influence Radii Summary */}
        {Object.keys(location_dominant_waste_types).length > 0 && (
          <div className="p-1.5 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE] text-[10px] space-y-1">
            <span className="font-bold text-[#202820] block">Dominant waste & influence radii:</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(location_dominant_waste_types).map(([lid, domType]) => {
                const rad = location_influence_radii_m[lid] || 25;
                const isUncov = uncovered_location_ids.includes(lid);
                return (
                  <span
                    key={lid}
                    className={`px-1.5 py-0.5 rounded border text-[9.5px] font-medium ${
                      isUncov
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-white text-[#202820] border-[#E1E8DE]'
                    }`}
                  >
                    {lid}: {domType} ({rad}m)
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Uncovered Warning Alert */}
        {uncovered_location_ids.length > 0 && (
          <div className="flex items-start gap-1.5 p-1.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-[10px] leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />
            <span>
              {uncovered_location_ids.length} location(s) uncovered: {uncovered_location_ids.join(', ')}. No eligible road within influence radius or spacing conflict.
            </span>
          </div>
        )}

        {/* General Warnings */}
        {warnings.length > 0 && uncovered_location_ids.length === 0 && (
          <div className="flex items-start gap-1.5 p-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[10px] leading-tight">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
            <span className="truncate">{warnings[0]}</span>
          </div>
        )}
      </div>
    );
  };

  // Render On-Location Bins Tab Content
  const renderOnLocationContent = () => {
    if (!hasOnLocationResult || isOnLocationFailed) {
      const failureWarning = binRecommendations?.warnings?.[0];
      return (
        <div className="my-auto py-3 text-center space-y-1.5">
          <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-[#202820]">
            {isOnLocationFailed ? 'Bin placement unsuccessful' : 'Bin model results unavailable'}
          </p>
          <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
            {failureWarning ||
              'The spatial bin distribution model did not return recommendations for this configuration.'}
          </p>
        </div>
      );
    }

    const locations = binRecommendations?.locations || [];
    const peakTurns =
      binRecommendations?.requiredEmptyingTurns?.central ??
      (locations.length > 0
        ? Math.max(...locations.map((l) => l.required_emptying_turns?.central ?? 1))
        : 1);

    const capacityDemand =
      binRecommendations?.capacityBins?.central ??
      locations.reduce((sum, l) => sum + (l.capacity_bins?.central ?? 0), 0);

    const totalShortfall = Math.round(
      locations.reduce((sum, l) => sum + (l.capacity_shortfall_litres ?? 0), 0)
    );

    const zeroCapacityCount = locations.filter(
      (l) =>
        (l.perimeter_spacing_max_bins === 0 || l.recommended_bins?.central === 0) &&
        (l.capacity_bins?.central ?? 0) > 0
    ).length;

    const hasBreakdown = Boolean(
      binRecommendations?.streamBreakdownAvailable && binRecommendations?.streamCounts
    );
    const recyclableBins = hasBreakdown ? (binRecommendations?.streamCounts?.recyclable ?? null) : null;
    const disposableBins = hasBreakdown
      ? (binRecommendations?.streamCounts?.disposable ??
          ((binRecommendations?.streamCounts?.general ?? 0) +
            (binRecommendations?.streamCounts?.food ?? 0)))
      : null;

    const dispTurns =
      locations.length > 0
        ? Math.max(...locations.map((l) => l.disposable?.required_turns ?? 0))
        : peakTurns || 1;
    const recTurns =
      locations.length > 0
        ? Math.max(...locations.map((l) => l.recyclable?.required_turns ?? 0))
        : peakTurns || 1;

    return (
      <div className="flex flex-col gap-2 my-auto py-1">
        {/* Tile 1: Physical Recommended Bins (25m spacing policy) */}
        <div className="p-2 sm:p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-800">
              <Trash2 className="w-3.5 h-3.5 shrink-0 text-[#004B20]" />
              <span className="text-xs font-bold">Physical Bins</span>
            </div>
            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-300/60">
              25 m spacing
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {totalOnLocationBins}
            </span>
            <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
              {hasBreakdown && recyclableBins !== null && disposableBins !== null
                ? `${disposableBins} Disp · ${recyclableBins} Rec`
                : capacityDemand > totalOnLocationBins
                ? `${capacityDemand} capacity demand`
                : 'placement bins'}
            </span>
          </div>
        </div>

        {/* Tile 2: Variable Emptying Turns Required */}
        <div className="p-2 sm:p-2.5 bg-blue-50/50 rounded-xl border border-blue-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-800">
              <RotateCw className="w-3.5 h-3.5 shrink-0 text-blue-700" />
              <span className="text-xs font-bold">Emptying Turns</span>
            </div>
            <span className="text-[9px] font-bold text-blue-800 bg-blue-100/70 px-1.5 py-0.5 rounded border border-blue-300/60">
              Dynamic
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {peakTurns}×
            </span>
            <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
              peak turns / bin / day
            </span>
          </div>
        </div>

        {/* Stream Breakdown 2-Column Card */}
        <div className="grid grid-cols-2 gap-1.5 p-2 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE]">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[11px] font-bold text-blue-900">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
              <span>Disposable</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-sm font-black text-[#202820]">
                {disposableBins !== null ? `${disposableBins} bins` : '—'}
              </span>
              <span className="text-[10px] text-[#667267] font-medium">
                {dispTurns > 0 ? `${dispTurns}×/day` : '0/day'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 border-l border-[#E1E8DE] pl-2">
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-900">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              <span>Recyclable</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-sm font-black text-[#202820]">
                {recyclableBins !== null ? `${recyclableBins} bins` : '—'}
              </span>
              <span className="text-[10px] text-[#667267] font-medium">
                {recTurns > 0 ? `${recTurns}×/day` : '0/day'}
              </span>
            </div>
          </div>
        </div>

        {/* Diagnostic Warnings */}
        {totalShortfall > 0 && (
          <div className="flex items-start gap-1.5 p-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[10px] leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Turn rounding leaves ~{totalShortfall} L daily capacity shortfall. Consider additional collection rounds.
            </span>
          </div>
        )}

        {zeroCapacityCount > 0 && (
          <div className="flex items-start gap-1.5 p-1.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-[10px] leading-tight">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />
            <span>
              {zeroCapacityCount} zone{zeroCapacityCount === 1 ? '' : 's'} cannot fit bins under 25 m perimeter spacing.
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <Trash2 className="w-4 h-4 text-[#004B20]" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Bin recommendations
          </h3>
          <span
            className="text-[#667267] hover:text-[#202820] cursor-help"
            title="Bunbetsu separates on-location activity perimeter bins from pedestrian road bins placed in influence zones."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>

        {onViewOnMap && (
          <button
            type="button"
            onClick={onViewOnMap}
            className={`text-[10px] font-bold px-2 py-0.5 rounded border transition cursor-pointer flex items-center gap-1 ${
              showBins
                ? 'bg-[#004B20] text-white border-[#004B20]'
                : 'text-[#004B20] bg-[#EAF5E6] border-[#70D000]/30 hover:bg-[#EAF5E6]/80'
            }`}
          >
            <MapPin className="w-3 h-3" />
            <span>{showBins ? 'Hide map markers' : 'Show on map'}</span>
          </button>
        )}
      </div>

      {/* Segmented Switch: On-Location vs Road Bins */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#F0F4ED] rounded-lg text-xs font-bold mt-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('on-location')}
          className={`py-1 rounded-md transition text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'on-location'
              ? 'bg-white text-[#202820] shadow-2xs'
              : 'text-[#667267] hover:text-[#202820]'
          }`}
        >
          <span>On-location</span>
          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-neutral-100">
            {totalOnLocationBins}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('road-bins')}
          className={`py-1 rounded-md transition text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'road-bins'
              ? 'bg-white text-[#202820] shadow-2xs'
              : 'text-[#667267] hover:text-[#202820]'
          }`}
        >
          <span>Road bins</span>
          <span
            className={`text-[10px] font-mono px-1 py-0.2 rounded ${
              roadUncoveredCount > 0
                ? 'bg-rose-100 text-rose-800'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {roadBinsCount}
          </span>
        </button>
      </div>

      {/* Active Tab Body */}
      {activeTab === 'on-location' ? renderOnLocationContent() : renderRoadBinsContent()}
    </div>
  );
};
