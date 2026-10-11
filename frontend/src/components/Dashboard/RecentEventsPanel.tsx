import React from 'react';
import { DashboardEventItem } from '../../types/bunbetsu';

interface RecentEventsPanelProps {
  events: DashboardEventItem[];
  onViewAll: () => void;
  onStartPlanning: () => void;
  onSelectEvent?: (event: DashboardEventItem) => void;
  maxVisible?: number;
  isLoading?: boolean;
  error?: string | null;
}

export const RecentEventsPanel: React.FC<RecentEventsPanelProps> = ({
  events,
  onViewAll,
  onStartPlanning,
  onSelectEvent,
  maxVisible = 6,
  isLoading = false,
  error = null,
}) => {
  const visibleEvents = events.slice(0, maxVisible);

  return (
    <div className="bg-white rounded-2xl border border-[#E1E8DE] p-4 sm:p-5 shadow-2xs flex flex-col justify-between overflow-hidden">
      <div>
        {/* Header with Title and View all button */}
        <div className="flex items-start justify-between gap-4 pb-2.5 sm:pb-3 border-b border-[#F0F4EE]">
          <div>
            <h3 className="font-heading font-bold text-base sm:text-lg text-[#103822] tracking-tight">
              Recent events
            </h3>
            <p className="text-[11px] text-[#667267] mt-0.5 font-medium">
              Your latest event plans.
            </p>
          </div>
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer transition select-none pt-0.5"
          >
            View all
          </button>
        </div>

        {/* Event List (5-10 max fitting without scroll) or Empty State */}
        <div className="mt-1.5 overflow-hidden">
          {isLoading ? (
            <div className="py-7 sm:py-9 text-center space-y-1">
              <p className="text-xs text-[#183E28] font-semibold">
                Loading recent events...
              </p>
            </div>
          ) : error ? (
            <div className="py-7 sm:py-9 text-center space-y-1">
              <p className="text-xs text-red-600 font-semibold">
                {error}
              </p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="py-7 sm:py-9 text-center space-y-2">
              <p className="text-xs text-[#667267] font-medium leading-relaxed">
                No events yet. Start planning your first event.
              </p>
              <div>
                <button
                  type="button"
                  onClick={onStartPlanning}
                  className="text-xs font-bold text-[#0B4222] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Start planning</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F4EE]">
              {visibleEvents.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent?.(evt)}
                  className="py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold text-[#1F2937] hover:text-[#0B4222] hover:bg-[#F9FAF7] transition cursor-pointer flex items-center justify-between"
                  title={evt.name}
                >
                  <span className="truncate">{evt.name}</span>
                  {evt.campus_name && (
                    <span className="text-[10px] text-[#8A9C8F] font-normal ml-2 shrink-0 truncate max-w-[120px]">
                      {evt.campus_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
