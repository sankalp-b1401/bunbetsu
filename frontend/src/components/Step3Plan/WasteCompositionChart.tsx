import React, { useState } from 'react';
import { PredictionResult } from '../../types/bunbetsu';
import { PieChart as PieChartIcon } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

interface WasteCompositionChartProps {
  prediction: PredictionResult | null;
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

export const WasteCompositionChart: React.FC<WasteCompositionChartProps> = ({
  prediction,
  loading = false,
}) => {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs space-y-3 animate-pulse font-sans h-full flex flex-col justify-between">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-32 bg-neutral-100 rounded-lg" />
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4 shadow-2xs text-center space-y-2 font-sans h-full flex flex-col items-center justify-center">
        <p className="text-xs font-bold text-[#202820]">No composition data</p>
        <p className="text-[11px] text-[#667267]">Waste categories will appear once prediction runs.</p>
      </div>
    );
  }

  const { composition_percent, composition_kg, total_waste_kg } = prediction;
  const totalKg = Math.round(total_waste_kg.central);

  // Extract ordered categories
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

  // Calculate SVG Donut Arcs (calibrated for 250px container)
  const size = 126;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let accumulatedPercent = 0;

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Waste by category
          </h3>
          <InfoTooltip content="See the predicted mass and percentage share of each waste category." />
        </div>
        <span className="text-[10px] text-[#667267] font-medium">Model streams</span>
      </div>

      {/* Main Content: Left Donut + Right Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 my-auto">
        {/* SVG Donut Chart */}
        <div className="relative w-[126px] h-[126px] shrink-0 flex items-center justify-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90"
          >
            {/* Background track circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#F4F6F2"
              strokeWidth={strokeWidth}
            />

            {/* Slices */}
            {slices.map((slice) => {
              const strokeDasharray = `${(slice.percent / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
              accumulatedPercent += slice.percent;
              const isHovered = hoveredCategory === slice.name;

              return (
                <circle
                  key={slice.name}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredCategory(slice.name)}
                  onMouseLeave={() => setHoveredCategory(null)}
                />
              );
            })}
          </svg>

          {/* Center Donut Hole Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            {hoveredCategory ? (
              <>
                <span className="font-heading text-sm font-extrabold text-[#202820] leading-none">
                  {slices.find((s) => s.name === hoveredCategory)?.kg.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-[#667267] mt-0.5">
                  {hoveredCategory}
                </span>
              </>
            ) : (
              <>
                <span className="font-heading text-base font-black text-[#202820] leading-none">
                  {totalKg.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-[#667267] mt-0.5">kg</span>
              </>
            )}
          </div>
        </div>

        {/* Legend Table on Right */}
        <div className="flex-1 w-full space-y-1 min-w-[140px]">
          {slices.map((slice) => {
            const isHovered = hoveredCategory === slice.name;

            return (
              <div
                key={slice.name}
                onMouseEnter={() => setHoveredCategory(slice.name)}
                onMouseLeave={() => setHoveredCategory(null)}
                className={`flex items-center justify-between text-xs py-0.5 sm:py-1 px-1.5 rounded transition-all cursor-pointer ${
                  isHovered ? 'bg-[#F7F9F5] font-bold' : 'hover:bg-[#F7F9F5]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-xs text-[#202820] truncate font-medium">
                    {slice.name}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 text-right">
                  <span className="text-xs font-bold text-[#202820] w-8">
                    {slice.percent}%
                  </span>
                  <span className="text-[11px] font-semibold text-[#667267] w-14">
                    {slice.kg.toLocaleString()} kg
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

