import React from 'react';
import { Trash2, Recycle } from 'lucide-react';
import { CampusLocation, HeatmapData, HeatmapMode, WasteCategory } from '../../types/bunbetsu';
import {
  computeHeatmapSummary,
  getGradientCss,
  getHeatmapPalette,
} from '../../utils/heatmapPalettes';

export interface PlanLegendProps {
  heatmapMode: HeatmapMode;
  heatmapCategory?: WasteCategory;
  heatmapData?: HeatmapData | null;
  locations?: CampusLocation[];
  minValue?: number | null;
  maxValue?: number | null;
  className?: string;
  showHeader?: boolean;
}

export const PlanLegend: React.FC<PlanLegendProps> = ({
  heatmapMode,
  heatmapCategory = 'Food',
  heatmapData = null,
  locations = [],
  minValue = null,
  maxValue = null,
  className = '',
  showHeader = true,
}) => {
  const isHeatmapActive = Boolean(heatmapMode && heatmapMode !== 'none');
  const palette = getHeatmapPalette(heatmapMode, heatmapCategory);
  const gradientCss = getGradientCss(palette.stops);

  const summary =
    minValue !== null && maxValue !== null
      ? {
          minValue,
          maxValue,
          hasValidData: true,
          isAllZero: minValue === 0 && maxValue === 0,
        }
      : computeHeatmapSummary(locations, heatmapMode, heatmapCategory, heatmapData);

  let layerTitle = 'Waste intensity';
  if (heatmapMode === 'total') {
    layerTitle = 'Total waste intensity';
  } else if (heatmapMode === 'category') {
    layerTitle = `${heatmapCategory} waste intensity`;
  } else if (heatmapMode === 'recyclable') {
    layerTitle = 'Recyclable waste intensity';
  } else if (heatmapMode === 'disposable') {
    layerTitle = 'Disposable waste intensity';
  }

  return (
    <div
      className={`bg-white rounded-xl border border-[#E1E8DE] p-3.5 shadow-2xs space-y-2.5 select-none font-sans text-xs ${className}`}
      data-testid="plan-legend"
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
          <h4 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Map legend
          </h4>
          <span className="text-[10px] text-[#667267] font-medium">Symbols</span>
        </div>
      )}

      {/* Heatmap Layer Section */}
      <div className="space-y-1.5 pb-2 border-b border-[#E1E8DE]" data-testid="legend-heatmap-section">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#202820]">
          <span>{isHeatmapActive ? layerTitle : 'Location coloring'}</span>
          {isHeatmapActive && summary.hasValidData && (
            <span className="text-[10px] font-normal text-[#667267]">kg</span>
          )}
        </div>

        {isHeatmapActive ? (
          summary.hasValidData ? (
            <div className="space-y-1" data-testid="legend-gradient-container">
              <div
                className="h-2 rounded-full w-full shadow-2xs transition-all duration-300"
                style={{ background: gradientCss }}
                data-testid="legend-color-bar"
                data-mode={heatmapMode}
                data-category={heatmapCategory}
              />
              <div className="flex items-center justify-between text-[10px] text-[#667267] font-semibold">
                <span>
                  Low ({Math.round(summary.minValue ?? 0)} kg)
                </span>
                <span>
                  High ({Math.round(summary.maxValue ?? 0)} kg)
                </span>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 p-2 rounded-lg bg-[#F7F9F5] border border-[#E1E8DE] text-[11px] text-[#667267]"
              data-testid="legend-no-data"
            >
              <div className="w-3.5 h-3.5 rounded bg-[#CBD5E1] shrink-0" />
              <span>No waste prediction data available</span>
            </div>
          )
        ) : (
          <div className="text-[11px] text-[#667267] py-0.5">
            Base event locations (colored by primary activity tag)
          </div>
        )}
      </div>

      {/* Recommended Bins Legend (Disposable & Recyclable) */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#2563EB] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
            <Trash2 className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] font-medium text-[#202820]">
            Disposable bin (100L)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#16A34A] text-white flex items-center justify-center text-[10px] shrink-0 shadow-2xs">
            <Recycle className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] font-medium text-[#202820]">
            Recyclable bin (100L)
          </span>
        </div>
      </div>

      {/* Zone Lines */}
      <div className="pt-1.5 border-t border-[#E1E8DE] text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-3 rounded-xs border-2 border-dashed border-[#70D000] bg-[#EAF5E6]/60 shrink-0" />
          <span className="text-[11px] font-medium text-[#202820]">
            Event location zone
          </span>
        </div>
      </div>
    </div>
  );
};
