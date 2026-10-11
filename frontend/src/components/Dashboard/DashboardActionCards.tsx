import React from 'react';

interface DashboardActionCardsProps {
  onStartPlanning: () => void;
  onViewTemplates: () => void;
  onViewHistory: () => void;
}

export const DashboardActionCards: React.FC<DashboardActionCardsProps> = ({
  onStartPlanning,
  onViewTemplates,
  onViewHistory,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4.5">
      {/* Card 1 — Plan a new event (Pale Green) */}
      <div className="bg-[#EDF6EB] border border-[#DCEBD8] rounded-2xl p-4 sm:p-4.5 relative overflow-hidden flex flex-col justify-between shadow-2xs transition-all hover:shadow-xs">
        {/* Subtle pale-green abstract corner wave */}
        <div className="absolute -bottom-2 -right-2 w-28 h-28 pointer-events-none select-none opacity-45 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 120 120" fill="none">
            <path d="M35 120 C 45 70, 75 45, 120 30 L 120 120 Z" fill="#CDE5C9" />
            <path d="M65 120 C 75 80, 95 65, 120 55 L 120 120 Z" fill="#BFE0BB" />
          </svg>
        </div>

        <div className="z-10">
          <h3 className="font-heading font-bold text-base sm:text-lg text-[#103822] tracking-tight">
            Plan a new event
          </h3>
          <p className="text-xs text-[#526857] mt-1 mb-3.5 leading-relaxed max-w-[220px]">
            Start from scratch and create a new event plan.
          </p>
        </div>

        <div className="z-10">
          <button
            type="button"
            onClick={onStartPlanning}
            className="bg-[#0B4222] hover:bg-[#073419] active:bg-[#052712] text-white px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition shadow-2xs hover:shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Start planning</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Card 2 — Browse templates (Pale Blue) */}
      <div className="bg-[#EEF5FB] border border-[#DCE8F5] rounded-2xl p-4 sm:p-4.5 relative overflow-hidden flex flex-col justify-between shadow-2xs transition-all hover:shadow-xs">
        {/* Subtle pale-blue abstract corner wave */}
        <div className="absolute -bottom-2 -right-2 w-28 h-28 pointer-events-none select-none opacity-45 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 120 120" fill="none">
            <path d="M35 120 C 45 70, 75 45, 120 30 L 120 120 Z" fill="#D3E5F5" />
            <path d="M65 120 C 75 80, 95 65, 120 55 L 120 120 Z" fill="#C2DCF2" />
          </svg>
        </div>

        <div className="z-10">
          <h3 className="font-heading font-bold text-base sm:text-lg text-[#103822] tracking-tight">
            Browse templates
          </h3>
          <p className="text-xs text-[#526857] mt-1 mb-3.5 leading-relaxed max-w-[220px]">
            Use ready-made templates to plan faster.
          </p>
        </div>

        <div className="z-10">
          <button
            type="button"
            onClick={onViewTemplates}
            className="bg-[#0B4222] hover:bg-[#073419] active:bg-[#052712] text-white px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition shadow-2xs hover:shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>View templates</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Card 3 — View event history (Pale Cream / Amber) */}
      <div className="bg-[#FDF7EC] border border-[#F8EBD0] rounded-2xl p-4 sm:p-4.5 relative overflow-hidden flex flex-col justify-between shadow-2xs transition-all hover:shadow-xs">
        {/* Subtle pale-cream abstract corner wave */}
        <div className="absolute -bottom-2 -right-2 w-28 h-28 pointer-events-none select-none opacity-45 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 120 120" fill="none">
            <path d="M35 120 C 45 70, 75 45, 120 30 L 120 120 Z" fill="#F8EAD0" />
            <path d="M65 120 C 75 80, 95 65, 120 55 L 120 120 Z" fill="#F4DEC0" />
          </svg>
        </div>

        <div className="z-10">
          <h3 className="font-heading font-bold text-base sm:text-lg text-[#103822] tracking-tight">
            View event history
          </h3>
          <p className="text-xs text-[#526857] mt-1 mb-3.5 leading-relaxed max-w-[220px]">
            Check and manage your previous event plans.
          </p>
        </div>

        <div className="z-10">
          <button
            type="button"
            onClick={onViewHistory}
            className="bg-[#0B4222] hover:bg-[#073419] active:bg-[#052712] text-white px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition shadow-2xs hover:shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>View history</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

