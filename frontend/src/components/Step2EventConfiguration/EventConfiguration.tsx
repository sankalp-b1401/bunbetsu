import React, { useState } from 'react';
import {
  Clock,
  Users,
  Trash2,
  Check,
  Edit2,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Campus, CampusLocation, EventDetails, ActivityType } from '../../types/bunbetsu';
import { ACTIVITIES, ActivityIcon } from '../../constants/activities';
import { CampusMap } from '../Map/CampusMap';

interface EventConfigurationProps {
  campus: Campus;
  eventDetails: EventDetails;
  onUpdateEventDetails: (details: Partial<EventDetails>) => void;
  locations: CampusLocation[];
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string, fallbackLocation?: CampusLocation) => void;
  onAddCustomLocation: (newLocation: CampusLocation) => void;
  onUpdateLocation: (updatedLocation: CampusLocation) => void;
  onDeleteLocation: (locationId: string) => void;
  onTriggerPlan: () => void;
  isPredicting?: boolean;
  predictionError?: string | null;
}

export const EventConfiguration: React.FC<EventConfigurationProps> = ({
  campus,
  eventDetails,
  onUpdateEventDetails,
  locations,
  selectedLocationId,
  onSelectLocation,
  onAddCustomLocation,
  onUpdateLocation,
  onDeleteLocation,
  onTriggerPlan,
  isPredicting = false,
  predictionError = null,
}) => {
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editingLocName, setEditingLocName] = useState('');
  const [requestAddArea, setRequestAddArea] = useState<{
    name?: string;
    area?: number;
    coordinates?: number[][];
    center?: [number, number];
  } | null>(null);

  const allActivityKeys = Object.keys(ACTIVITIES) as ActivityType[];

  const handleToggleLocationActivity = (loc: CampusLocation, act: ActivityType) => {
    let newActivities: ActivityType[];
    if (loc.activities.includes(act)) {
      newActivities = loc.activities.filter((a) => a !== act);
    } else {
      newActivities = [...loc.activities, act];
    }
    onUpdateLocation({
      ...loc,
      activities: newActivities,
    });
  };

  const handleValidateAndPlan = () => {
    const errors: Record<string, string> = {};

    if (!eventDetails.festName.trim()) {
      errors.festName = 'Event name is required';
    }
    if (!eventDetails.durationDays || eventDetails.durationDays <= 0) {
      errors.durationDays = 'Duration must be at least 1 day';
    }
    if (!eventDetails.expectedFootfall || eventDetails.expectedFootfall <= 0) {
      errors.expectedFootfall = 'Expected footfall must be a positive number';
    }
    if (locations.length === 0) {
      errors.locations = 'Please select or add at least one location on the map';
    }

    for (const loc of locations) {
      if (!loc.activities || loc.activities.length === 0) {
        errors.locations = `Location "${loc.name}" must have at least one activity tag`;
        break;
      }
      if (!loc.area || loc.area <= 0) {
        errors.locations = `Location "${loc.name}" has invalid area (${loc.area} m²). Must be greater than 0.`;
        break;
      }
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      onTriggerPlan();
    }
  };

  return (
    <div className="w-full h-full flex flex-col px-5 sm:px-8 lg:px-10 py-3.5 overflow-hidden bg-[#F7F9F5]">
      {/* Top Header */}
      <div className="mb-2.5 flex items-baseline justify-between shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[#202820]">
            Shape your event space.
          </h1>
          <p className="text-xs sm:text-sm text-[#667267] hidden md:inline font-normal">
            Configure event details, select campus zones, and assign activity tags to plan waste resources.
          </p>
        </div>
      </div>

      {/* Main Grid: Left Map + Right Configuration Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* Left: Map fills available height */}
        <div className="lg:col-span-7 xl:col-span-8 h-full rounded-xl overflow-hidden shadow-xs border border-[#E1E8DE] bg-[#F7F9F5]">
          <CampusMap
            campus={campus}
            locations={locations}
            selectedLocationId={selectedLocationId}
            onSelectLocation={onSelectLocation}
            onAddCustomLocation={onAddCustomLocation}
            onUpdateLocation={onUpdateLocation}
            onDeleteLocation={onDeleteLocation}
            onRequestOpenAddAreaModal={requestAddArea}
            onClearRequestAddArea={() => setRequestAddArea(null)}
            showToolbar={true}
            showLegend={true}
            heightClass="h-full w-full"
          />
        </div>

        {/* Right: Sidebar with refined box styling */}
        <div className="lg:col-span-5 xl:col-span-4 h-full bg-white rounded-xl border border-[#E1E8DE] p-4.5 shadow-sm flex flex-col justify-between overflow-hidden">
          {/* Scrollable Form Content */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 mb-2.5 space-y-4">
            {/* Section 1: Event Details */}
            <div className="space-y-3.5 pb-4 border-b border-[#E1E8DE]">
              <div>
                <span className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
                  Event Details
                </span>
              </div>

              {/* Fest Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#202820]">
                  Event name
                </label>
                <input
                  type="text"
                  value={eventDetails.festName}
                  onChange={(e) => onUpdateEventDetails({ festName: e.target.value })}
                  placeholder="e.g. Techfest 2025"
                  className="w-full px-3.5 py-2.5 bg-[#F7F9F5] hover:bg-white focus:bg-white border border-[#E1E8DE] rounded-lg text-[#202820] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#70D000]/25 focus:border-[#004B20] transition-all"
                />
                {validationErrors.festName && (
                  <p className="text-xs text-[#B42318] font-medium">{validationErrors.festName}</p>
                )}
              </div>

              {/* Duration & Footfall in 2 balanced columns */}
              <div className="grid grid-cols-2 gap-3">
                {/* Duration Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#202820] truncate">
                    Duration (days)
                  </label>
                  <div className="relative flex items-center">
                    <Clock className="w-4 h-4 text-[#667267] absolute left-3 pointer-events-none" />
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={eventDetails.durationDays}
                      onChange={(e) =>
                        onUpdateEventDetails({
                          durationDays: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full pl-9 pr-3 py-2.5 bg-[#F7F9F5] hover:bg-white focus:bg-white border border-[#E1E8DE] rounded-lg text-[#202820] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#70D000]/25 focus:border-[#004B20] transition-all"
                    />
                  </div>
                  {validationErrors.durationDays && (
                    <p className="text-xs text-[#B42318] font-medium">{validationErrors.durationDays}</p>
                  )}
                </div>

                {/* Expected Footfall input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#202820] truncate">
                    Footfall / day
                  </label>
                  <div className="relative flex items-center">
                    <Users className="w-4 h-4 text-[#667267] absolute left-3 pointer-events-none" />
                    <input
                      type="number"
                      min="1"
                      value={eventDetails.expectedFootfall}
                      onChange={(e) =>
                        onUpdateEventDetails({
                          expectedFootfall: Math.max(1, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full pl-9 pr-3 py-2.5 bg-[#F7F9F5] hover:bg-white focus:bg-white border border-[#E1E8DE] rounded-lg text-[#202820] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#70D000]/25 focus:border-[#004B20] transition-all"
                    />
                  </div>
                  {validationErrors.expectedFootfall && (
                    <p className="text-xs text-[#B42318] font-medium">{validationErrors.expectedFootfall}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Selected Locations & Direct Activity Tags Assignment */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
                    Locations
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/30">
                    {locations.length}
                  </span>
                </div>
              </div>

              {validationErrors.locations && (
                <div className="p-2.5 bg-red-50 border border-[#B42318]/30 rounded-lg text-xs text-[#B42318] font-medium">
                  {validationErrors.locations}
                </div>
              )}

              {/* Empty state when 0 locations selected */}
              {locations.length === 0 && (
                <div className="py-8 px-4 bg-[#F7F9F5] rounded-xl border border-dashed border-[#E1E8DE] text-center space-y-2">
                  <p className="font-heading text-sm font-bold text-[#202820]">
                    No event locations selected yet
                  </p>
                  <p className="text-xs text-[#667267] font-medium max-w-[260px] mx-auto leading-relaxed">
                    Click any campus zone on the map or use the drawing tool to configure locations.
                  </p>
                </div>
              )}

              {/* Location Cards */}
              <div className="space-y-2">
                {locations.map((loc) => {
                  const isSelected = loc.id === selectedLocationId;

                  return (
                    <div
                      key={loc.id}
                      onClick={() => onSelectLocation(loc.id)}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#004B20] bg-[#EAF5E6] ring-1 ring-[#004B20]/40 shadow-2xs'
                          : 'border-[#E1E8DE] hover:border-[#004B20]/30 bg-white shadow-2xs'
                      }`}
                    >
                      {/* Top: Name + Rename + Delete */}
                      <div className="flex items-center justify-between gap-2">
                        {editingLocId === loc.id ? (
                          <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingLocName}
                              onChange={(e) => setEditingLocName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const trimmed = editingLocName.trim();
                                  onUpdateLocation({ ...loc, name: trimmed || loc.name });
                                  setEditingLocId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingLocId(null);
                                }
                              }}
                              onBlur={() => {
                                const trimmed = editingLocName.trim();
                                if (trimmed && trimmed !== loc.name) {
                                  onUpdateLocation({ ...loc, name: trimmed });
                                }
                                setEditingLocId(null);
                              }}
                              autoFocus
                              className="px-2 py-0.5 text-xs font-bold text-[#202820] border border-[#E1E8DE] rounded-md focus:outline-none focus:ring-1 focus:ring-[#004B20] flex-1 bg-white"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const trimmed = editingLocName.trim();
                                onUpdateLocation({ ...loc, name: trimmed || loc.name });
                                setEditingLocId(null);
                              }}
                              className="p-1 text-[#004B20] hover:bg-[#EAF5E6] rounded-md cursor-pointer"
                              title="Save name"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="font-heading text-xs sm:text-sm font-bold text-[#202820] truncate">
                              {loc.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLocId(loc.id);
                                setEditingLocName(loc.name);
                              }}
                              className="p-0.5 text-[#667267] hover:text-[#202820] rounded-md transition cursor-pointer"
                              title="Rename location"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLocation(loc.id);
                          }}
                          className="p-1 text-[#667267] hover:text-[#B42318] hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                          title="Remove location"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Bottom: Activity Icons */}
                      <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                        {loc.activities.length === 0 && (
                          <span className="text-[10px] text-amber-700 font-medium mr-0.5">
                            Tags:
                          </span>
                        )}
                        {allActivityKeys.map((act) => {
                          const isTagged = loc.activities.includes(act);
                          const meta = ACTIVITIES[act];

                          return (
                            <button
                              key={act}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleLocationActivity(loc, act);
                              }}
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                isTagged
                                  ? 'text-white shadow-2xs ring-1 ring-black/10'
                                  : 'bg-[#F7F9F5] text-[#667267] hover:bg-[#EAF5E6] hover:text-[#004B20] border border-[#E1E8DE]'
                              }`}
                              style={isTagged ? { backgroundColor: meta.color } : undefined}
                              title={isTagged ? `${act} (Assigned — click to remove)` : `${act} (Click to assign)`}
                              aria-label={act}
                            >
                              <ActivityIcon type={act} className="w-3.5 h-3.5 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sticky Bottom Action: Plan Button & Error Display */}
          <div className="pt-3 border-t border-[#E1E8DE] shrink-0 space-y-2">
            {predictionError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="leading-snug font-medium">{predictionError}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleValidateAndPlan}
              disabled={isPredicting}
              className="w-full py-3.5 bg-[#004B20] hover:bg-[#003B19] active:bg-[#002B12] disabled:opacity-60 text-white font-bold text-sm sm:text-base rounded-lg flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all cursor-pointer font-sans"
            >
              {isPredicting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Executing Waste Model...</span>
                </>
              ) : (
                <span>Plan</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
