import React, { useState } from 'react';
import {
  Sparkles,
  Recycle,
  Trash2,
  BarChart2,
  Info,
  ChevronLeft,
  ChevronRight,
  PieChart as PieChartIcon,
  LineChart,
} from 'lucide-react';
import { PredictionResult, BaselineSensitivityPoint } from '../../types/bunbetsu';
import { BaselineSensitivityChart } from './BaselineSensitivityChart';
import { InfoTooltip } from './InfoTooltip';

interface WasteOverviewCardsProps {
  prediction: PredictionResult | null;
  sensitivitySeries?: BaselineSensitivityPoint[];
  loading?: boolean;
}

interface CategorySlice {
  name: string;
  percent: number;
  kg: number;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#EA580C',
  Plastic: '#0284C7',
  Paper: '#8B5CF6',
  Glass: '#0D9488',
  Others: '#64748B',
};

export const WasteOverviewCards: React.FC<WasteOverviewCardsProps> = ({
  prediction,
  sensitivitySeries,
  loading = false,
}) => {
  const [activeCard, setActiveCard] = useState<0 | 1 | 2>(0);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs space-y-2.5 animate-pulse font-sans h-full flex flex-col justify-between overflow-hidden">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-14 bg-neutral-100 rounded-lg" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 bg-neutral-100 rounded-lg" />
          <div className="h-12 bg-neutral-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs text-center space-y-2 font-sans h-full flex flex-col items-center justify-center overflow-hidden">
        <div className="w-8 h-8 rounded-full bg-[#F7F9F5] text-[#667267] flex items-center justify-center mx-auto">
          <Info className="w-4 h-4" />
        </div>
        <p className="text-xs font-bold text-[#202820]">No waste estimates available</p>
        <p className="text-[11px] text-[#667267]">Run the waste prediction to display key estimates.</p>
      </div>
    );
  }

  const {
    total_waste_kg,
    recyclable_kg,
    disposable_kg,
    composition_percent = {},
    composition_kg = {},
  } = prediction;

  const totalLowKg = Math.round(total_waste_kg.low);
  const totalHighKg = Math.round(total_waste_kg.high);

  const recyclableMeanKg = Math.round(recyclable_kg.central);
  const disposableMeanKg = Math.round(disposable_kg.central);

  const totalSum = recyclableMeanKg + disposableMeanKg || Math.round(total_waste_kg.central) || 1;
  const recyclablePercent = Math.round((recyclableMeanKg / totalSum) * 100);
  const disposablePercent = 100 - recyclablePercent;

  // Extract ordered categories for the pie chart
  const categories: string[] = ['Food', 'Plastic', 'Paper', 'Glass', 'Others'];
  const slices: CategorySlice[] = categories.map((cat) => {
    const rawPercent = composition_percent[cat] || 0;
    const kgVal = Math.round(composition_kg[cat]?.central || 0);
    return {
      name: cat,
      percent: Math.round(rawPercent * 100),
      kg: kgVal,
      color: CATEGORY_COLORS[cat] || '#64748B',
    };
  });

  let accumulatedPercent = 0;
  const activeHoveredSlice = hoveredCategory ? slices.find((s) => s.name === hoveredCategory) : null;

  const cardTitles = [
    'Key waste estimate',
    'Waste composition',
    'Effect of baseline',
  ];

  const cardTooltips = [
    'View predicted total waste and compare the estimate with the baseline rate.',
    'See the predicted mass and percentage share of each waste category.',
    'Compare total predicted waste across baseline waste-generation rates.',
  ];

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
      {/* Top Header with Card Navigation */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5 min-w-0">
          {activeCard === 0 && (
            <Sparkles className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
          )}
          {activeCard === 1 && (
            <PieChartIcon className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
          )}
          {activeCard === 2 && (
            <LineChart className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
          )}
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider truncate">
            {cardTitles[activeCard]}
          </h3>
          <InfoTooltip content={cardTooltips[activeCard]} />
        </div>

        {/* Carousel / Navigation buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Dot Indicators */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveCard(0)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                activeCard === 0 ? 'bg-[#004B20] w-3.5' : 'bg-[#E1E8DE] hover:bg-[#667267] w-1.5'
              }`}
              title="Key waste estimate"
              aria-label="View key waste estimate"
            />
            <button
              type="button"
              onClick={() => setActiveCard(1)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                activeCard === 1 ? 'bg-[#004B20] w-3.5' : 'bg-[#E1E8DE] hover:bg-[#667267] w-1.5'
              }`}
              title="Waste composition"
              aria-label="View waste composition"
            />
            <button
              type="button"
              onClick={() => setActiveCard(2)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                activeCard === 2 ? 'bg-[#004B20] w-3.5' : 'bg-[#E1E8DE] hover:bg-[#667267] w-1.5'
              }`}
              title="Effect of baseline"
              aria-label="View effect of baseline"
            />
          </div>

          {/* Arrow Switcher Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setActiveCard((prev) => (prev === 0 ? 2 : ((prev - 1) as 0 | 1 | 2)))}
              className="p-1 rounded-md text-[#667267] hover:text-[#004B20] hover:bg-[#EAF5E6]/60 border border-[#E1E8DE] transition cursor-pointer flex items-center justify-center"
              title="Previous card"
              aria-label="Previous card"
            >
              <ChevronLeft className="w-3 h-3 text-[#202820]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveCard((prev) => ((prev + 1) % 3 as 0 | 1 | 2))}
              className="p-1 rounded-md text-[#667267] hover:text-[#004B20] hover:bg-[#EAF5E6]/60 border border-[#E1E8DE] transition cursor-pointer flex items-center justify-center"
              title="Next card"
              aria-label="Next card"
            >
              <ChevronRight className="w-3 h-3 text-[#202820]" />
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 0: KEY WASTE ESTIMATE */}
      {activeCard === 0 && (
        <div className="flex flex-col gap-2 flex-1 min-h-0 justify-center pt-1 animate-in fade-in duration-150">
          {/* Highlight Range as Hero Metric */}
          <div className="p-2 sm:p-2.5 bg-[#F7F9F5] rounded-xl border border-[#E1E8DE] flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#70D000] text-[#004B20] flex items-center justify-center font-black text-xs shadow-xs shrink-0">
                <span className="font-heading text-xs font-extrabold tracking-tighter">RG</span>
              </div>

              <div className="min-w-0">
                <span className="text-[9.5px] font-semibold text-[#667267] block leading-none">
                  Predicted waste range
                </span>
                <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
                  <span className="font-heading text-sm sm:text-base font-black text-[#202820] tracking-tight leading-tight">
                    {totalLowKg.toLocaleString()} – {totalHighKg.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-bold text-[#667267]">kg</span>
                </div>
              </div>
            </div>

            <div className="text-[#004B20] opacity-80 shrink-0">
              <BarChart2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
            </div>
          </div>

          {/* Recyclable & Disposable Split Cards */}
          <div className="grid grid-cols-2 gap-2">
            {/* Recyclable Waste */}
            <div className="p-1.5 sm:p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-0.5">
              <div className="flex items-center gap-1 text-emerald-700">
                <Recycle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[9.5px] font-bold truncate">Recyclable</span>
              </div>
              <div className="font-heading text-xs sm:text-sm font-bold text-emerald-950 truncate">
                {recyclableMeanKg.toLocaleString()} kg
              </div>
              <span className="text-[9.5px] font-bold text-emerald-700 block">
                ({recyclablePercent}%)
              </span>
            </div>

            {/* Disposable Waste */}
            <div className="p-1.5 sm:p-2 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-0.5">
              <div className="flex items-center gap-1 text-blue-700">
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[9.5px] font-bold truncate">Disposable</span>
              </div>
              <div className="font-heading text-xs sm:text-sm font-bold text-blue-950 truncate">
                {disposableMeanKg.toLocaleString()} kg
              </div>
              <span className="text-[9.5px] font-bold text-blue-700 block">
                ({disposablePercent}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: WASTE COMPOSITION */}
      {activeCard === 1 && (
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 relative py-0.5 my-auto animate-in fade-in duration-150">
          {/* Centered Donut Pie Chart */}
          <div className="relative w-[98px] h-[98px] shrink-0 flex items-center justify-center">
            <svg
              width={98}
              height={98}
              viewBox="0 0 98 98"
              className="transform -rotate-90 overflow-visible"
            >
              {/* Background track circle */}
              <circle
                cx={49}
                cy={49}
                r={37}
                fill="transparent"
                stroke="#F4F6F2"
                strokeWidth={16}
              />

              {/* Slices */}
              {slices.map((slice) => {
                const sliceCircumference = 2 * Math.PI * 37;
                const strokeDasharray = `${(slice.percent / 100) * sliceCircumference} ${sliceCircumference}`;
                const strokeDashoffset = -((accumulatedPercent / 100) * sliceCircumference);
                accumulatedPercent += slice.percent;
                const isHovered = hoveredCategory === slice.name;

                return (
                  <circle
                    key={slice.name}
                    cx={49}
                    cy={49}
                    r={37}
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth={isHovered ? 20 : 16}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredCategory(slice.name)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  />
                );
              })}
            </svg>

            {/* Center Donut Hole: ONLY shows waste type & percentage on hover */}
            {activeHoveredSlice && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1 animate-in fade-in duration-100">
                <span
                  className="font-heading text-[10px] font-bold leading-tight truncate max-w-[65px]"
                  style={{ color: activeHoveredSlice.color }}
                >
                  {activeHoveredSlice.name}
                </span>
                <span className="font-heading text-xs sm:text-sm font-black text-[#202820] leading-none mt-0.5">
                  {activeHoveredSlice.percent}%
                </span>
                <span className="text-[8px] font-semibold text-[#667267] mt-0.5">
                  {activeHoveredSlice.kg.toLocaleString()} kg
                </span>
              </div>
            )}
          </div>

          {/* Small Category Legend (Single Row with compact spacing & kerning) */}
          <div className="flex items-center justify-center gap-1.5 pt-1.5 px-0.5 shrink-0 whitespace-nowrap">
            {slices.map((slice) => {
              const isHovered = hoveredCategory === slice.name;
              return (
                <div
                  key={slice.name}
                  onMouseEnter={() => setHoveredCategory(slice.name)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  className={`flex items-center gap-0.5 py-0.5 px-1 rounded cursor-pointer transition-all ${
                    isHovered ? 'bg-[#F4F6F2] font-bold' : 'hover:bg-[#F4F6F2]'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span
                    className={`text-[9px] tracking-tight leading-none ${
                      isHovered ? 'text-[#202820] font-bold' : 'text-[#667267] font-medium'
                    }`}
                  >
                    {slice.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: EFFECT OF BASELINE */}
      {activeCard === 2 && (
        <div className="flex flex-col flex-1 min-h-0 pt-0.5 animate-in fade-in duration-150">
          <BaselineSensitivityChart
            currentBaselineRate={prediction.baseline_rate_kg_per_person_day || 0}
            currentTotalWasteKg={Math.round(prediction.total_waste_kg.central) || 0}
            sensitivitySeries={sensitivitySeries}
            loading={loading}
            embedded={true}
          />
        </div>
      )}
    </div>
  );
};
