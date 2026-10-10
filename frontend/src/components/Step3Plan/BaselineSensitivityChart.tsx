import React from 'react';
import { BaselineSensitivityPoint } from '../../types/bunbetsu';
import { Info, LineChart } from 'lucide-react';

interface BaselineSensitivityChartProps {
  currentBaselineRate: number;
  currentTotalWasteKg: number;
  sensitivitySeries?: BaselineSensitivityPoint[];
  loading?: boolean;
  embedded?: boolean;
}

export const BaselineSensitivityChart: React.FC<BaselineSensitivityChartProps> = ({
  currentBaselineRate = 0,
  currentTotalWasteKg = 0,
  sensitivitySeries,
  loading = false,
  embedded = false,
}) => {
  if (loading) {
    if (embedded) {
      return (
        <div className="space-y-2 animate-pulse my-auto py-2">
          <div className="h-24 bg-neutral-100 rounded-lg" />
          <div className="h-6 bg-neutral-100 rounded" />
        </div>
      );
    }
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4.5 shadow-2xs space-y-3 animate-pulse font-sans">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-32 bg-neutral-100 rounded-lg" />
      </div>
    );
  }

  // Check if a real multi-point sensitivity series is provided
  const hasSeries = sensitivitySeries && sensitivitySeries.length > 1;

  // Chart coordinate dimensions calibrated for 250px container
  const width = 320;
  const height = 115;
  const padding = { top: 16, right: 12, bottom: 22, left: 36 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Domain configuration supporting low CPCB baseline rates (e.g. 0.035 to 0.45)
  const minRate = 0.0;
  const maxRate = Math.max(0.5, currentBaselineRate > 0 ? Number((currentBaselineRate * 1.3).toFixed(2)) : 0.5);

  // X coordinate mapping
  const getX = (rate: number) => {
    const clamped = Math.max(minRate, Math.min(maxRate, rate));
    return padding.left + ((clamped - minRate) / (maxRate - minRate)) * plotWidth;
  };

  // If a series is available, derive yMin & yMax
  let yMax = 2500;
  let yMin = 0;

  if (hasSeries) {
    const wastes = sensitivitySeries!.map((p) => p.totalWasteKg);
    yMax = Math.max(...wastes, currentTotalWasteKg, 1000);
    yMin = Math.min(...wastes, 0);
  } else {
    yMax = Math.max(currentTotalWasteKg * 1.5, 2000);
    yMin = 0;
  }

  const getY = (kg: number) => {
    return padding.top + plotHeight - ((kg - yMin) / (yMax - yMin)) * plotHeight;
  };

  const currentX = getX(currentBaselineRate);
  const currentY = getY(currentTotalWasteKg);

  // Build SVG path for series if provided
  let pathD = '';
  if (hasSeries) {
    const sorted = [...sensitivitySeries!].sort((a, b) => a.baselineRate - b.baselineRate);
    pathD = sorted
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(pt.baselineRate)} ${getY(pt.totalWasteKg)}`)
      .join(' ');
  }

  const chartBody = (
    <>
      {/* SVG Line Chart */}
      <div className="w-full flex justify-center my-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[125px] overflow-visible"
        >
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((ratio) => {
            const yVal = padding.top + plotHeight * (1 - ratio);
            const labelVal = Math.round(yMin + (yMax - yMin) * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={yVal}
                  x2={width - padding.right}
                  y2={yVal}
                  stroke="#E1E8DE"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 5}
                  y={yVal + 3}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="#667267"
                  fontWeight="600"
                >
                  {labelVal.toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* X axis labels */}
          {[0.0, 0.1, 0.2, 0.3, 0.4, 0.5].map((rate) => {
            const xVal = getX(rate);
            return (
              <g key={rate}>
                <line
                  x1={xVal}
                  y1={height - padding.bottom}
                  x2={xVal}
                  y2={height - padding.bottom + 3}
                  stroke="#667267"
                />
                <text
                  x={xVal}
                  y={height - padding.bottom + 11}
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#667267"
                  fontWeight="600"
                >
                  {rate.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* X Axis title */}
          <text
            x={padding.left + plotWidth / 2}
            y={height - 1}
            textAnchor="middle"
            fontSize="7.5"
            fill="#667267"
            fontWeight="bold"
          >
            Baseline rate (kg/person/day)
          </text>

          {/* If multi-rate series exists, draw connecting line */}
          {hasSeries && pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#004B20"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* If multi-rate series exists, draw series point dots */}
          {hasSeries &&
            sensitivitySeries!.map((pt, i) => (
              <circle
                key={i}
                cx={getX(pt.baselineRate)}
                cy={getY(pt.totalWasteKg)}
                r="3"
                fill="#004B20"
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            ))}

          {/* Current Baseline Indicator (Vertical dashed line) */}
          <line
            x1={currentX}
            y1={padding.top}
            x2={currentX}
            y2={height - padding.bottom}
            stroke="#70D000"
            strokeWidth="1.6"
            strokeDasharray="3 3"
          />

          {/* Current Benchmark Point */}
          <circle
            cx={currentX}
            cy={currentY}
            r="4"
            fill="#004B20"
            stroke="#70D000"
            strokeWidth="2"
          />

          {/* Current baseline rate badge callout above point */}
          <g transform={`translate(${Math.max(35, Math.min(width - 65, currentX - 30))}, ${Math.max(1, currentY - 18)})`}>
            <rect
              width="60"
              height="14"
              rx="3"
              fill="#004B20"
              stroke="#70D000"
              strokeWidth="1"
            />
            <text
              x="30"
              y="10"
              textAnchor="middle"
              fontSize="7.5"
              fill="#FFFFFF"
              fontWeight="bold"
            >
              Current: {currentBaselineRate > 0 ? currentBaselineRate : '—'}
            </text>
          </g>
        </svg>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col justify-center flex-1 min-h-0 py-0.5 my-auto">
        {chartBody}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5">
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Effect of baseline rate
          </h3>
          <span
            className="text-[#667267] hover:text-[#202820] cursor-help"
            title="Sensitivity of total predicted waste relative to baseline per-person generation rate."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
      {chartBody}
    </div>
  );
};

