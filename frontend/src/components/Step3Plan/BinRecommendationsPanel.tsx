import React from 'react';
import { BinRecommendationResult, LocationWasteAllocation } from '../../types/bunbetsu';
import { Trash2, Info, ArrowRight, AlertTriangle, ShieldAlert } from 'lucide-react';

interface BinRecommendationsPanelProps {
  binRecommendations?: BinRecommendationResult | null;
  locationAllocations?: LocationWasteAllocation[];
  onViewOnMap: () => void;
  showBins: boolean;
  loading?: boolean;
}

export const BinRecommendationsPanel: React.FC<BinRecommendationsPanelProps> = ({
  binRecommendations,
  onViewOnMap,
  showBins,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs space-y-3 animate-pulse font-sans h-full flex flex-col justify-between">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="space-y-2 my-auto">
          <div className="h-16 bg-neutral-100 rounded-lg" />
          <div className="h-12 bg-neutral-100 rounded-lg" />
        </div>
        <div className="h-8 bg-neutral-100 rounded-lg" />
      </div>
    );
  }

  // Model validation: Do not invent fake counts or fall back to client-side approximations
  const hasModelResult = Boolean(binRecommendations);
  const totalBins = binRecommendations?.totalBins ?? 0;
  const placedCount = binRecommendations?.bins?.length ?? 0;
  const hasPlacements = placedCount > 0;

  if (!hasModelResult) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-3 sm:p-3.5 shadow-2xs select-none font-sans flex flex-col justify-between h-full">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
          <div className="flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-[#667267]" />
            <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
              Recommended bins
            </h3>
          </div>
          <span className="text-[10px] font-medium text-[#667267] bg-[#F4F6F2] px-2 py-0.5 rounded border border-[#E1E8DE]">
            Unavailable
          </span>
        </div>

        <div className="my-auto py-3 text-center space-y-1.5">
          <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-[#202820]">Bin model results unavailable</p>
          <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
            The spatial bin distribution model did not return recommendations for this configuration.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-[#F4F6F2] text-[#667267] border border-[#E1E8DE] cursor-not-allowed opacity-80 flex items-center justify-center gap-1.5"
        >
          <span>Bin placement unavailable</span>
        </button>
      </div>
    );
  }

  const capacityCentral = binRecommendations?.capacityBins?.central ?? 0;
  const recRange = binRecommendations?.recommendedBins;
  const hasWarnings = Boolean(binRecommendations?.warnings && binRecommendations.warnings.length > 0);

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
            title="Sized using 100L bins (80L usable capacity, 2 emptying cycles/day = 160 L/day effective capacity) and 30m perimeter spacing guideline."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
        <span className="text-[10px] font-bold text-[#004B20] bg-[#EAF5E6] px-2 py-0.5 rounded border border-[#70D000]/30">
          Total: {totalBins}
        </span>
      </div>

      {/* Main Body */}
      <div className="flex flex-col gap-2 my-auto py-1">
        {/* Primary Recommended Count Card */}
        <div className="p-2 sm:p-2.5 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#004B20] uppercase tracking-wide">
              Central recommendation
            </span>
            {recRange && (
              <span className="text-[10px] font-semibold text-[#667267]">
                Range: {recRange.low} – {recRange.high} bins
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {totalBins}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#667267] font-medium">
              100L bins
            </span>
          </div>
          <p className="text-[9.5px] text-[#667267] font-medium leading-tight">
            160 L/day effective capacity (2 empties/day) • 30m perimeter target
          </p>
        </div>

        {/* Capacity vs Spacing Metrics */}
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <div className="p-1.5 sm:p-2 bg-emerald-50/50 rounded-lg border border-emerald-200/60 space-y-0.5">
            <span className="text-[9.5px] font-bold text-emerald-800 block truncate">
              Capacity demand
            </span>
            <span className="font-heading text-xs sm:text-sm font-bold text-[#202820]">
              {capacityCentral} bins
            </span>
            <span className="text-[9px] text-[#667267] block">Volume requirement</span>
          </div>

          <div className="p-1.5 sm:p-2 bg-blue-50/50 rounded-lg border border-blue-200/60 space-y-0.5">
            <span className="text-[9.5px] font-bold text-blue-800 block truncate">
              Spatial markers
            </span>
            <span className="font-heading text-xs sm:text-sm font-bold text-[#202820]">
              {placedCount} placed
            </span>
            <span className="text-[9px] text-[#667267] block">Boundary sampled</span>
          </div>
        </div>

        {/* Honest Stream Breakdown Notice */}
        <div className="p-1.5 bg-[#F4F6F2] rounded-lg border border-[#E1E8DE] text-[9.5px] text-[#667267] space-y-0.5">
          <div className="flex items-center justify-between text-[#202820] font-semibold">
            <span>Stream segregation</span>
            <span className="text-[9px] text-[#667267] font-normal italic">
              {binRecommendations?.streamBreakdownAvailable ? 'Modelled' : 'Unallocated'}
            </span>
          </div>
          <p className="leading-snug">
            {binRecommendations?.streamBreakdownAvailable
              ? 'Categorized by material stream fractions.'
              : 'Spatial model sizes total bin requirements. Deploy multi-stream stations at marked coordinates.'}
          </p>
        </div>

        {/* Model Warnings Banner */}
        {hasWarnings && (
          <div className="p-1.5 bg-amber-50/80 rounded-lg border border-amber-200/80 flex items-start gap-1 text-[9.5px] text-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
            <span className="truncate">
              {binRecommendations?.warnings?.[0] || 'Check placement spacing manually.'}
            </span>
          </div>
        )}
      </div>

      {/* Action Button: View on Map */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onViewOnMap}
          disabled={!hasPlacements}
          className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            hasPlacements
              ? 'bg-[#004B20] hover:bg-[#003B19] text-white cursor-pointer shadow-xs'
              : 'bg-[#F4F6F2] text-[#667267] border border-[#E1E8DE] cursor-not-allowed opacity-80'
          }`}
          title={
            hasPlacements
              ? 'Toggle recommended bin placement markers on map'
              : 'No boundary placement coordinates available'
          }
        >
          <span>
            {hasPlacements
              ? showBins
                ? 'Hide bin locations on map'
                : `View ${placedCount} bin locations on map`
              : 'Bin coordinates unavailable'}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
