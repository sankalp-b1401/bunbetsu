import React from 'react';
import { LocationWasteAllocation } from '../../types/bunbetsu';
import { ACTIVITIES, ActivityIcon } from '../../constants/activities';
import { MapPin } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

interface LocationWasteTableProps {
  locationAllocations: LocationWasteAllocation[];
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string) => void;
  loading?: boolean;
}

export const LocationWasteTable: React.FC<LocationWasteTableProps> = ({
  locationAllocations,
  selectedLocationId,
  onSelectLocation,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-4.5 shadow-2xs space-y-3 animate-pulse font-sans">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-28 bg-neutral-100 rounded-lg" />
      </div>
    );
  }

  if (!locationAllocations || locationAllocations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-5 shadow-2xs text-center space-y-2 font-sans">
        <p className="text-xs font-bold text-[#202820]">No location allocations available</p>
        <p className="text-[11px] text-[#667267]">Configured location waste data will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-4.5 shadow-2xs space-y-3 select-none font-sans flex flex-col h-full">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#E1E8DE] shrink-0">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-[#004B20]" />
          <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
            Location-wise waste estimates
          </h3>
          <InfoTooltip content="Compare predicted waste allocation across configured event locations." />
        </div>
        <span className="text-[10px] text-[#667267] font-semibold">
          {locationAllocations.length} zone{locationAllocations.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Responsive Table */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E1E8DE] text-[#667267] text-[11px] font-bold">
              <th className="py-2 px-2.5">Location</th>
              <th className="py-2 px-2.5">Area (m²)</th>
              <th className="py-2 px-2.5">Activities</th>
              <th className="py-2 px-2.5 text-right">Estimated waste (kg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E1E8DE]/60">
            {locationAllocations.map((alloc) => {
              const locId = alloc.id || alloc.location_id;
              const isSelected = locId === selectedLocationId;

              const primaryAct = alloc.activities?.[0];
              const actMeta = primaryAct ? ACTIVITIES[primaryAct] : null;

              const centralKg = Math.round(alloc.total_waste_kg?.central || alloc.estimatedWasteKg || 0);
              const lowKg = Math.round(alloc.total_waste_kg?.low || 0);
              const highKg = Math.round(alloc.total_waste_kg?.high || 0);

              return (
                <tr
                  key={locId}
                  onClick={() => onSelectLocation(locId)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#EAF5E6] text-[#004B20] font-bold'
                      : 'hover:bg-[#F7F9F5] text-[#202820]'
                  }`}
                  title="Click to highlight on map"
                >
                  {/* Location Icon + Name */}
                  <td className="py-2.5 px-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 shadow-2xs"
                        style={{
                          backgroundColor: actMeta ? actMeta.color : '#004B20',
                          color: '#FFFFFF',
                        }}
                      >
                        {primaryAct ? (
                          <ActivityIcon type={primaryAct} className="w-3.5 h-3.5" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className="font-heading font-bold text-xs truncate max-w-[130px]">
                        {alloc.location_name}
                      </span>
                    </div>
                  </td>

                  {/* Area */}
                  <td className="py-2.5 px-2.5 text-xs font-semibold text-[#667267]">
                    {Math.round(alloc.area).toLocaleString()}
                  </td>

                  {/* Activities Tags */}
                  <td className="py-2.5 px-2.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {alloc.activities && alloc.activities.length > 0 ? (
                        alloc.activities.map((act) => (
                          <span
                            key={act}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#F4F6F2] text-[#202820] border border-[#E1E8DE]"
                          >
                            {act}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-[#667267] italic">None</span>
                      )}
                    </div>
                  </td>

                  {/* Estimated Waste Range */}
                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                    <span className="font-heading font-bold text-xs text-[#202820]">
                      {centralKg.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#667267] font-medium ml-1.5">
                      ({lowKg.toLocaleString()} – {highKg.toLocaleString()})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

