import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ACTIVITIES, ActivityIcon } from '../../constants/activities';
import { ActivityType } from '../../types/bunbetsu';

interface ActivityLegendProps {
  className?: string;
  onFilterActivity?: (activityName: string | null) => void;
  activeFilter?: string | null;
}

export const ActivityLegend: React.FC<ActivityLegendProps> = ({
  className = '',
  onFilterActivity,
  activeFilter,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const activityEntries = Object.entries(ACTIVITIES) as [
    ActivityType,
    (typeof ACTIVITIES)[ActivityType],
  ][];

  return (
    <div
      className={`bg-white/95 backdrop-blur-md rounded-md shadow-md border border-[#E1E8DE] text-xs transition-all ${className}`}
    >
      <div className="p-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE] mb-1.5">
          <span className="font-heading text-[10px] font-bold uppercase tracking-wider text-[#667267]">
            Activity Legend
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-0.5 text-[#667267] hover:text-[#202820] rounded transition cursor-pointer"
            title={collapsed ? 'Expand legend' : 'Collapse legend'}
          >
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {!collapsed && (
          <div className="space-y-1 font-medium text-[#202820]">
            {activityEntries.map(([key, meta]) => {
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onFilterActivity?.(isActive ? null : key)}
                  className={`w-full flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer transition text-left ${
                    isActive ? 'bg-[#EAF5E6] font-bold text-[#004B20]' : 'hover:bg-[#F7F9F5]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded shrink-0 ring-2"
                    style={{
                      backgroundColor: meta.color,
                    }}
                  />
                  <ActivityIcon type={key} className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  <span className="font-semibold text-[11px] truncate">
                    {key}
                  </span>
                </button>
              );
            })}

            <div className="flex items-center gap-2 px-1.5 py-0.5 text-left">
              <span className="w-2.5 h-2.5 rounded bg-slate-400 ring-2 ring-slate-200 shrink-0" />
              <span className="text-[#667267] font-semibold text-[11px]">Untagged Area</span>
            </div>

            <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-[#E1E8DE] text-[#667267] px-1.5">
              <span className="w-4 h-0.5 bg-[#004B20] rounded shrink-0" />
              <span className="text-[#667267] font-medium text-[11px]">Campus boundary</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
