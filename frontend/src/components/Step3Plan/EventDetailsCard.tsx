import React from 'react';
import { Calendar, Users, Clock, MapPin, Scale, ChevronRight } from 'lucide-react';
import { Campus, EventDetails } from '../../types/bunbetsu';

interface EventDetailsCardProps {
  campus: Campus;
  eventDetails: EventDetails;
  locationsCount: number;
  onEditClick?: () => void;
}

export const EventDetailsCard: React.FC<EventDetailsCardProps> = ({
  campus,
  eventDetails,
  locationsCount,
  onEditClick,
}) => {
  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#E1E8DE]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider truncate">
            Event details
          </h3>
          <span className="text-[11px] text-[#667267] font-medium truncate hidden md:inline">
            • {eventDetails.festName || 'Campus Event'}
          </span>
        </div>

        {onEditClick && (
          <button
            type="button"
            onClick={onEditClick}
            className="text-[10px] font-bold text-[#004B20] hover:text-[#003B19] bg-[#EAF5E6] hover:bg-[#D8ECCF] px-2 py-0.5 rounded border border-[#70D000]/30 transition cursor-pointer flex items-center gap-0.5 shrink-0"
            title="Return to Configure to modify event parameters"
          >
            <span>Edit</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Grid of Key Event Parameters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-auto pt-1">
        {/* 1. Daily Footfall */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE]/70">
          <div className="w-6 h-6 rounded-md bg-[#EAF5E6] text-[#004B20] flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9.5px] font-semibold text-[#667267] block leading-none">
              Daily footfall
            </span>
            <span className="text-xs font-bold text-[#202820] truncate block mt-0.5">
              {eventDetails.expectedFootfall?.toLocaleString() || 0}
            </span>
          </div>
        </div>

        {/* 2. Duration */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE]/70">
          <div className="w-6 h-6 rounded-md bg-[#EAF5E6] text-[#004B20] flex items-center justify-center shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9.5px] font-semibold text-[#667267] block leading-none">
              Duration
            </span>
            <span className="text-xs font-bold text-[#202820] truncate block mt-0.5">
              {eventDetails.durationDays} {eventDetails.durationDays === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>

        {/* 3. Configured Zones */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE]/70">
          <div className="w-6 h-6 rounded-md bg-[#EAF5E6] text-[#004B20] flex items-center justify-center shrink-0">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9.5px] font-semibold text-[#667267] block leading-none">
              Event zones
            </span>
            <span className="text-xs font-bold text-[#202820] truncate block mt-0.5">
              {locationsCount} {locationsCount === 1 ? 'location' : 'locations'}
            </span>
          </div>
        </div>

        {/* 4. Baseline Rate */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE]/70">
          <div className="w-6 h-6 rounded-md bg-[#EAF5E6] text-[#004B20] flex items-center justify-center shrink-0">
            <Scale className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9.5px] font-semibold text-[#667267] block leading-none">
              Baseline rate
            </span>
            <span className="text-xs font-bold text-[#202820] truncate block mt-0.5">
              {eventDetails.baselineRateKgPerPersonDay} kg/p/d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

