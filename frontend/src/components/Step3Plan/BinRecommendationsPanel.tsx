import React from 'react';
import { BinRecommendationResult, LocationWasteAllocation } from '../../types/bunbetsu';
import { Trash2, Recycle, Info, ShieldAlert } from 'lucide-react';

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

  const hasBreakdown = Boolean(
    binRecommendations?.streamBreakdownAvailable && binRecommendations?.streamCounts
  );

  const recyclableBins = hasBreakdown ? (binRecommendations?.streamCounts?.recyclable ?? null) : null;
  const disposableBins = hasBreakdown
    ? ((binRecommendations?.streamCounts?.general ?? 0) + (binRecommendations?.streamCounts?.food ?? 0))
    : null;

  const safeTotal =
    (recyclableBins !== null && disposableBins !== null ? recyclableBins + disposableBins : null) ||
    totalBins ||
    1;
  const recyclablePct = recyclableBins !== null ? Math.round((recyclableBins / safeTotal) * 100) : null;
  const disposablePct = disposableBins !== null ? Math.round((disposableBins / safeTotal) * 100) : null;

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

      {/* Main Body: 2 compact visual tiles */}
      <div className="flex flex-col gap-2 my-auto py-1">
        {/* Recyclable Bins Tile (Bunbetsu Green + Recycle icon) */}
        <div className="p-2 sm:p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <Recycle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-bold">Recyclable</span>
            </div>
            {hasBreakdown && recyclablePct !== null ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
                {recyclablePct}%
              </span>
            ) : (
              <span className="text-[9px] font-medium text-[#667267] bg-[#F4F6F2] px-1.5 py-0.5 rounded border border-[#E1E8DE]">
                Unavailable
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {hasBreakdown && recyclableBins !== null ? recyclableBins : '—'}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#667267] font-medium">
              bins
            </span>
          </div>
        </div>

        {/* Disposable Bins Tile (Bunbetsu Blue + Trash2 icon) */}
        <div className="p-2 sm:p-2.5 bg-blue-50/50 rounded-xl border border-blue-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-700">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-bold">Disposable</span>
            </div>
            {hasBreakdown && disposablePct !== null ? (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/50">
                {disposablePct}%
              </span>
            ) : (
              <span className="text-[9px] font-medium text-[#667267] bg-[#F4F6F2] px-1.5 py-0.5 rounded border border-[#E1E8DE]">
                Unavailable
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {hasBreakdown && disposableBins !== null ? disposableBins : '—'}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#667267] font-medium">
              bins
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
