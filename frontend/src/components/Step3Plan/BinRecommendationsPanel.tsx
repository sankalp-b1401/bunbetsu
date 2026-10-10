import React from 'react';
import { BinRecommendationResult, LocationWasteAllocation } from '../../types/bunbetsu';
import { Trash2, Recycle, Info, ShieldAlert, RotateCw, AlertTriangle } from 'lucide-react';

export interface BinRecommendationsPanelProps {
  binRecommendations?: BinRecommendationResult | null;
  locationAllocations?: LocationWasteAllocation[];
  onViewOnMap?: () => void;
  showBins?: boolean;
  loading?: boolean;
}

export const BinRecommendationsPanel: React.FC<BinRecommendationsPanelProps> = ({
  binRecommendations,
  loading = false,
}) => {
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
  const hasModelResult = Boolean(binRecommendations);
  const isFailed = binRecommendations?.status === 'failed';
  const isPartial = binRecommendations?.status === 'partial';
  const totalBins = binRecommendations?.totalBins ?? 0;

  if (!hasModelResult || isFailed) {
    const failureWarning = binRecommendations?.warnings?.[0];
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
          <div className="flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-[#667267]" />
            <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
              Recommended bins
            </h3>
          </div>
          <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            {isFailed ? 'Failed' : 'Unavailable'}
          </span>
        </div>

        <div className="my-auto py-3 text-center space-y-1.5">
          <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-[#202820]">
            {isFailed ? 'Bin placement unsuccessful' : 'Bin model results unavailable'}
          </p>
          <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
            {failureWarning ||
              'The spatial bin distribution model did not return recommendations for this configuration.'}
          </p>
        </div>
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
    ? (binRecommendations?.streamCounts?.general ?? 0) + (binRecommendations?.streamCounts?.food ?? 0)
    : null;

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <Trash2 className="w-4 h-4 text-[#004B20]" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Recommended bins
          </h3>
          <span
            className="text-[#667267] hover:text-[#202820] cursor-help"
            title="Physical bin count is limited by a 25 m perimeter spacing policy. When waste demand exceeds the available bin capacity, the model estimates the required emptying turns. Actual placement and capacity coverage may vary by location."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            isPartial
              ? 'text-amber-800 bg-amber-50 border-amber-300'
              : 'text-[#004B20] bg-[#EAF5E6] border-[#70D000]/30'
          }`}
        >
          {isPartial ? `Partial: ${totalBins}` : `Total: ${totalBins}`}
        </span>
      </div>

      {/* Main Body: Physical Bins & Variable Emptying Turns Tiles */}
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
              {totalBins}
            </span>
            <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
              {capacityDemand > totalBins ? `${capacityDemand} capacity demand` : 'placement bins'}
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
              turn{peakTurns === 1 ? '' : 's'} / bin / day
            </span>
          </div>
        </div>

        {/* Stream Breakdown Status Note */}
        <div className="flex items-center justify-between px-2 py-1 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE] text-[10px] text-[#667267]">
          <span className="flex items-center gap-1">
            <Recycle className="w-3 h-3 text-[#667267]" />
            Stream breakdown
          </span>
          <span className="font-medium">
            {hasBreakdown && recyclableBins !== null ? `${recyclableBins}R / ${disposableBins}D` : 'Unavailable'}
          </span>
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
    </div>
  );
};
