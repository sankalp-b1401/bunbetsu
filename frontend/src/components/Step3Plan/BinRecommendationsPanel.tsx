import React from 'react';
import { BinRecommendationResult, LocationWasteAllocation } from '../../types/bunbetsu';
import { Trash2, Recycle, Info, ArrowRight } from 'lucide-react';

interface BinRecommendationsPanelProps {
  binRecommendations?: BinRecommendationResult | null;
  locationAllocations?: LocationWasteAllocation[];
  onViewOnMap: () => void;
  showBins: boolean;
  loading?: boolean;
}

export const BinRecommendationsPanel: React.FC<BinRecommendationsPanelProps> = ({
  binRecommendations,
  locationAllocations = [],
  onViewOnMap,
  showBins,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs space-y-3 animate-pulse font-sans">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="grid grid-cols-2 gap-2.5 h-20 bg-neutral-100 rounded-lg" />
        <div className="h-8 bg-neutral-100 rounded-lg" />
      </div>
    );
  }

  // Derive counts for only 2 streams: Recyclable and Disposable
  const hasLiveBinModel = Boolean(binRecommendations && binRecommendations.bins && binRecommendations.bins.length > 0);

  let totalBins = 0;
  let disposableBins = 0;
  let recyclableBins = 0;

  if (hasLiveBinModel && binRecommendations) {
    totalBins = binRecommendations.totalBins;
    disposableBins = (binRecommendations.streamCounts.general || 0) + (binRecommendations.streamCounts.food || 0);
    recyclableBins = binRecommendations.streamCounts.recyclable || 0;
  } else if (locationAllocations.length > 0) {
    locationAllocations.forEach((alloc) => {
      if (alloc.binsRecommended) {
        recyclableBins += alloc.binsRecommended.recycling || 0;
        disposableBins += (alloc.binsRecommended.landfill || 0) + (alloc.binsRecommended.compost || 0);
      }
    });
    totalBins = disposableBins + recyclableBins;
  }

  const safeTotal = totalBins || 1;
  const recyclablePct = Math.round((recyclableBins / safeTotal) * 100);
  const disposablePct = Math.round((disposableBins / safeTotal) * 100);

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
            title="Estimated 240L bins for recyclable and disposable waste streams."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
        <span className="text-[10px] font-bold text-[#004B20] bg-[#EAF5E6] px-2 py-0.5 rounded border border-[#70D000]/30">
          Total: {totalBins}
        </span>
      </div>

      {/* 2 Bin Streams: Recyclable & Disposable */}
      <div className="flex flex-col gap-2 my-auto py-1">
        {/* Recyclable Waste (Uniform Green + Recycle icon) */}
        <div className="p-2 sm:p-2.5 bg-emerald-50/40 rounded-xl border border-emerald-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <Recycle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-bold">Recyclable bins</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
              {recyclablePct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {recyclableBins}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#667267] font-medium">
              240L bins
            </span>
          </div>
          <p className="text-[9.5px] text-[#667267] font-medium leading-tight">
            Plastic, paper, and glass streams
          </p>
        </div>

        {/* Disposable Waste (Uniform Blue + Trash2 icon) */}
        <div className="p-2 sm:p-2.5 bg-blue-50/40 rounded-xl border border-blue-200/70 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-700">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-bold">Disposable bins</span>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/50">
              {disposablePct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
              {disposableBins}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#667267] font-medium">
              240L bins
            </span>
          </div>
          <p className="text-[9.5px] text-[#667267] font-medium leading-tight">
            General waste & food streams
          </p>
        </div>
      </div>

      {/* Action Button: View on Map */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onViewOnMap}
          disabled={!hasLiveBinModel}
          className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            hasLiveBinModel
              ? 'bg-[#004B20] hover:bg-[#003B19] text-white cursor-pointer shadow-xs'
              : 'bg-[#F4F6F2] text-[#667267] border border-[#E1E8DE] cursor-not-allowed opacity-80'
          }`}
          title={hasLiveBinModel ? 'Highlight recommended bin coordinates on map' : 'Spatial bin distribution model service pending'}
        >
          <span>
            {hasLiveBinModel
              ? showBins
                ? 'Hide bin locations on map'
                : 'View bin locations on map'
              : 'Bin coordinates pending service'}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
