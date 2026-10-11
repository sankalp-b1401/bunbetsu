import React, { useState } from 'react';
import {
  BinRecommendationResult,
  CampusLocation,
  LocationWasteAllocation,
  RoadBinRecommendationResult,
} from '../../types/bunbetsu';
import {
  Trash2,
  Recycle,
  ShieldAlert,
  RotateCw,
  AlertTriangle,
  MapPin,
  X,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

export interface BinRecommendationsPanelProps {
  binRecommendations?: BinRecommendationResult | null;
  roadBinRecommendations?: RoadBinRecommendationResult | null;
  locationAllocations?: LocationWasteAllocation[];
  locations?: CampusLocation[];
  selectedLocationId?: string | null;
  onDeselectLocation?: () => void;
  loading?: boolean;
}

export const BinRecommendationsPanel: React.FC<BinRecommendationsPanelProps> = ({
  binRecommendations,
  roadBinRecommendations,
  locations = [],
  selectedLocationId = null,
  onDeselectLocation,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'on-location' | 'road-bins'>('on-location');

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs space-y-2.5 animate-pulse font-sans h-full flex flex-col justify-between">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="grid grid-cols-2 gap-2 my-auto">
          <div className="h-14 bg-neutral-100 rounded-xl" />
          <div className="h-14 bg-neutral-100 rounded-xl" />
          <div className="h-14 bg-neutral-100 rounded-xl" />
          <div className="h-14 bg-neutral-100 rounded-xl" />
        </div>
      </div>
    );
  }

  // Check if recommendations exist
  const hasOnLocationResult = Boolean(binRecommendations);
  const isOnLocationFailed = binRecommendations?.status === 'failed';

  // Resolve selected location when selectedLocationId is provided
  const selectedLocation = selectedLocationId
    ? binRecommendations?.locations?.find((l) => l.id === selectedLocationId)
    : null;

  const selectedLocationMeta = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)
    : null;

  const selectedLocationName =
    selectedLocation?.location_name ||
    selectedLocationMeta?.name ||
    selectedLocationId ||
    'Selected Location';

  // Render Card Header
  const renderHeader = () => (
    <div className="flex items-center justify-between pb-1.5 border-b border-[#E1E8DE]">
      <div className="flex items-center gap-1.5">
        <Trash2 className="w-4 h-4 text-[#004B20]" />
        <h3 className="font-heading text-xs font-bold text-[#202820] uppercase tracking-wider">
          Bin recommendations
        </h3>
        <InfoTooltip content="View on-location event bins, roadside stream placement stations, or select a location on the map." />
      </div>

      <div className="flex items-center gap-1">
        {!selectedLocationId && (
          <div className="flex items-center bg-[#F4F6F0] p-0.5 rounded-lg border border-[#E1E8DE]">
            <button
              type="button"
              onClick={() => setActiveTab('on-location')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                activeTab === 'on-location'
                  ? 'bg-white text-[#004B20] shadow-2xs'
                  : 'text-[#667267] hover:text-[#202820]'
              }`}
            >
              On-location
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('road-bins')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'road-bins'
                  ? 'bg-white text-[#004B20] shadow-2xs'
                  : 'text-[#667267] hover:text-[#202820]'
              }`}
            >
              <span>Road Bins</span>
              {roadBinRecommendations && roadBinRecommendations.total_road_bins > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
              )}
            </button>
          </div>
        )}

        {selectedLocationId && onDeselectLocation && (
          <button
            type="button"
            onClick={onDeselectLocation}
            className="text-[10px] font-bold text-[#004B20] hover:text-[#003B19] bg-[#EAF5E6] hover:bg-[#D8ECCF] px-1.5 py-0.5 rounded border border-[#70D000]/30 transition cursor-pointer flex items-center gap-0.5"
            title="Return to event-level bin summary"
          >
            <span>All bins</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );

  // If planning model failed or returned no result at event-level
  if (!hasOnLocationResult || isOnLocationFailed) {
    const failureWarning = binRecommendations?.warnings?.[0];
    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
        {renderHeader()}
        <div className="my-auto py-3 text-center space-y-1.5">
          <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto" />
          <p className="text-xs font-bold text-[#202820]">
            {isOnLocationFailed ? 'Bin placement unsuccessful' : 'Bin model results unavailable'}
          </p>
          <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
            {failureWarning ||
              'The spatial bin distribution model did not return recommendations for this configuration.'}
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // LOCATION-SPECIFIC VIEW (when a location is selected)
  // -------------------------------------------------------------------------
  if (selectedLocationId) {
    // If location is selected but has no matching recommendation entry
    if (!selectedLocation) {
      return (
        <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
          {renderHeader()}
          <div className="my-auto py-3 text-center space-y-2">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[10.5px] font-bold mx-auto">
              <MapPin className="w-3 h-3 text-amber-700" />
              <span className="truncate max-w-[180px]">{selectedLocationName}</span>
            </div>
            <div className="space-y-1">
              <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto" />
              <p className="text-xs font-bold text-[#202820]">No recommendations for this location</p>
              <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
                No spatial bin placement data was generated for this specific zone.
              </p>
            </div>
            {onDeselectLocation && (
              <button
                type="button"
                onClick={onDeselectLocation}
                className="text-[10.5px] font-bold text-[#004B20] hover:underline cursor-pointer inline-flex items-center gap-1 pt-1"
              >
                <span>Return to event summary</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    // Location has placement failure or unsupported geometry
    if (
      selectedLocation.placement_status === 'unsupported_geometry' ||
      selectedLocation.placement_status === 'failed'
    ) {
      return (
        <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
          {renderHeader()}
          <div className="my-auto py-2 text-center space-y-2">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-200 text-[10.5px] font-bold mx-auto">
              <MapPin className="w-3 h-3 text-rose-700" />
              <span className="truncate max-w-[180px]">{selectedLocationName}</span>
            </div>
            <div className="space-y-1">
              <AlertTriangle className="w-5 h-5 text-rose-600 mx-auto" />
              <p className="text-xs font-bold text-[#202820]">
                {selectedLocation.placement_status === 'unsupported_geometry'
                  ? 'Unsupported polygon geometry'
                  : 'Placement failed for location'}
              </p>
              <p className="text-[10.5px] text-[#667267] leading-relaxed max-w-[240px] mx-auto">
                {selectedLocation.placement_warnings?.[0] ||
                  'The geometry cannot accommodate physical bin spacing requirements.'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Normal Location-Specific Details
    const locPhysicalBins =
      selectedLocation.total_physical_bins ?? selectedLocation.recommended_bins?.central ?? 0;
    const locRecyclableBins = selectedLocation.recyclable?.physical_bins;
    const locDisposableBins = selectedLocation.disposable?.physical_bins;
    const locEmptyingTurns = selectedLocation.required_emptying_turns?.central;
    const locTurnsLow = selectedLocation.required_emptying_turns?.low;
    const locTurnsHigh = selectedLocation.required_emptying_turns?.high;
    const hasStreamBreakdown =
      locRecyclableBins !== undefined || locDisposableBins !== undefined;

    return (
      <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
        {renderHeader()}

        {/* Selected Location Pill */}
        <div className="flex items-center justify-between p-1 px-2 bg-[#EAF5E6] rounded-lg border border-[#70D000]/30 text-xs mt-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
            <span className="font-bold text-[#004B20] truncate">{selectedLocationName}</span>
          </div>
          <span className="text-[10px] text-[#667267] font-medium shrink-0">Zone inspection</span>
        </div>

        <div className="flex flex-col gap-1.5 my-auto py-1">
          {/* 2x2 Grid matching the wireframe */}
          <div className="grid grid-cols-2 gap-2">
            {/* Tile 1: Total Bins */}
            <div className="p-2 sm:p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-800">
                  <Trash2 className="w-3.5 h-3.5 shrink-0 text-[#004B20]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Total Bins
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  25 m perimeter spacing
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {locPhysicalBins}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  bins
                </span>
              </div>
            </div>

            {/* Tile 2: Required Emptying Turns (Location Specific Only) */}
            <div className="p-2 sm:p-2.5 bg-blue-50/50 rounded-xl border border-blue-200/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-blue-800">
                  <RotateCw className="w-3.5 h-3.5 shrink-0 text-blue-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Emptying Turns
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  {locTurnsLow !== undefined && locTurnsHigh !== undefined && locTurnsLow !== locTurnsHigh
                    ? `Range: ${locTurnsLow}–${locTurnsHigh}×/day`
                    : 'Required turns'}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {locEmptyingTurns !== undefined ? `${locEmptyingTurns}×` : '—'}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  turns / day
                </span>
              </div>
            </div>

            {/* Tile 3: Recyclable */}
            <div className="p-2 sm:p-2.5 bg-[#F0FDF4] rounded-xl border border-emerald-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-900">
                  <Recycle className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Recyclable
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  {selectedLocation.recyclable?.required_turns
                    ? `${selectedLocation.recyclable.required_turns}× turns/day`
                    : 'Recyclable stream'}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {locRecyclableBins !== undefined ? locRecyclableBins : '—'}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  bins
                </span>
              </div>
            </div>

            {/* Tile 4: Disposable */}
            <div className="p-2 sm:p-2.5 bg-[#EFF6FF] rounded-xl border border-blue-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-blue-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Disposable
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  {selectedLocation.disposable?.required_turns
                    ? `${selectedLocation.disposable.required_turns}× turns/day`
                    : 'Disposable stream'}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {locDisposableBins !== undefined ? locDisposableBins : '—'}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  bins
                </span>
              </div>
            </div>
          </div>

          {/* Shortfall or Capacity Warnings */}
          {selectedLocation.capacity_shortfall_litres > 0 && (
            <div className="flex items-start gap-1.5 p-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[9.5px] leading-tight">
              <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Rounding leaves ~{Math.round(selectedLocation.capacity_shortfall_litres)} L daily capacity shortfall.
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // EVENT-LEVEL VIEW (default when no location is selected)
  // -------------------------------------------------------------------------
  const totalOnSiteBins = binRecommendations?.totalBins ?? 0;
  const totalRoadBins =
    roadBinRecommendations !== null && roadBinRecommendations !== undefined
      ? roadBinRecommendations.total_road_bins
      : '—';

  const recyclableBins =
    binRecommendations?.streamBreakdownAvailable &&
    binRecommendations?.streamCounts?.recyclable !== undefined
      ? binRecommendations.streamCounts.recyclable
      : '—';

  const disposableBins =
    binRecommendations?.streamBreakdownAvailable &&
    binRecommendations?.streamCounts?.disposable !== undefined
      ? binRecommendations.streamCounts.disposable
      : '—';

  // Road Bins variables
  const roadPhysicalBins = roadBinRecommendations?.total_road_bins ?? 0;
  const roadStations =
    roadBinRecommendations?.total_stations ??
    roadBinRecommendations?.placements?.length ??
    0;
  const roadDisposableBins =
    roadBinRecommendations?.total_disposable_physical_bins ??
    roadBinRecommendations?.placements?.filter(
      (p) => p.stream_types?.includes('Disposable') || p.stream_type?.includes('Disposable')
    ).length ??
    0;
  const roadRecyclableBins =
    roadBinRecommendations?.total_recyclable_physical_bins ??
    roadBinRecommendations?.placements?.filter(
      (p) => p.stream_types?.includes('Recyclable') || p.stream_type?.includes('Recyclable')
    ).length ??
    0;
  const coveredLocCount = roadBinRecommendations?.covered_location_ids?.length ?? 0;
  const totalLocRequired = roadBinRecommendations?.total_locations_requiring_coverage ?? 0;
  const uncoveredDis = roadBinRecommendations?.uncovered_disposable_location_ids?.length ?? 0;
  const uncoveredRec = roadBinRecommendations?.uncovered_recyclable_location_ids?.length ?? 0;
  const spacingPassed = roadBinRecommendations?.spacing_validation_passed ?? true;
  const solverName = roadBinRecommendations?.solver_name ?? 'highs';
  const isOptimal = roadBinRecommendations?.optimality_proven ?? false;

  return (
    <div className="bg-white rounded-xl border border-[#E1E8DE] p-2.5 sm:p-3 shadow-2xs select-none font-sans flex flex-col justify-between h-full overflow-hidden">
      {renderHeader()}

      {activeTab === 'on-location' ? (
        /* 2x2 Event-Level Grid matching wireframe */
        <div className="grid grid-cols-2 gap-2 my-auto py-1">
          {/* Tile 1: Total Bins */}
          <div className="p-2 sm:p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-emerald-800">
                <Trash2 className="w-3.5 h-3.5 shrink-0 text-[#004B20]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                  Total Bins
                </span>
              </div>
              <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                25 m perimeter spacing
              </p>
            </div>
            <div className="flex items-baseline gap-1.5 pt-1.5">
              <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                {totalOnSiteBins}
              </span>
              <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                configured zones
              </span>
            </div>
          </div>

          {/* Tile 2: Road bins */}
          <div
            onClick={() => setActiveTab('road-bins')}
            className="p-2 sm:p-2.5 bg-amber-50/60 hover:bg-amber-100/60 rounded-xl border border-amber-200/80 flex flex-col justify-between cursor-pointer transition"
            title="Click to view detailed Road Bins breakdown"
          >
            <div>
              <div className="flex items-center justify-between text-amber-900">
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center -space-x-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[8px] font-bold shadow-2xs"
                      title="Disposable"
                    >
                      🗑️
                    </span>
                    <span
                      className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px] font-bold shadow-2xs"
                      title="Recyclable"
                    >
                      ♻️
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Road bins
                  </span>
                </div>
                <span className="text-[9px] text-[#004B20] font-bold underline">Details →</span>
              </div>
              <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                Dual-stream placement
              </p>
            </div>
            <div className="flex items-baseline gap-1.5 pt-1.5">
              <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                {totalRoadBins}
              </span>
              <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                {roadBinRecommendations?.total_stations !== undefined
                  ? `bins (${roadBinRecommendations.total_stations} stn)`
                  : 'road stations'}
              </span>
            </div>
          </div>

          {/* Tile 3: Recyclable bins */}
          <div className="p-2 sm:p-2.5 bg-[#F0FDF4] rounded-xl border border-emerald-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-emerald-900">
                <Recycle className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                  Recyclable
                </span>
              </div>
              <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                On-site recyclable stream
              </p>
            </div>
            <div className="flex items-baseline gap-1.5 pt-1.5">
              <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                {recyclableBins}
              </span>
              <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                on-site bins
              </span>
            </div>
          </div>

          {/* Tile 4: Disposable bins */}
          <div className="p-2 sm:p-2.5 bg-[#EFF6FF] rounded-xl border border-blue-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-blue-900">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                  Disposable
                </span>
              </div>
              <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                On-site disposable stream
              </p>
            </div>
            <div className="flex items-baseline gap-1.5 pt-1.5">
              <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                {disposableBins}
              </span>
              <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                on-site bins
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* ROAD BINS TAB VIEW */
        <div className="flex flex-col gap-2 my-auto py-1">
          {/* 2x2 Grid for Road Bins */}
          <div className="grid grid-cols-2 gap-2">
            {/* Tile 1: Total Physical Road Bins */}
            <div className="p-2 sm:p-2.5 bg-blue-50/50 rounded-xl border border-blue-200/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-blue-900">
                  <Trash2 className="w-3.5 h-3.5 shrink-0 text-blue-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Road Bins
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  Total physical units
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {roadPhysicalBins}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  physical units
                </span>
              </div>
            </div>

            {/* Tile 2: Stations */}
            <div className="p-2 sm:p-2.5 bg-amber-50/60 rounded-xl border border-amber-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-900">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Stations
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  25 m corridor separation
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {roadStations}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  stations
                </span>
              </div>
            </div>

            {/* Tile 3: Recyclable Road Bins */}
            <div className="p-2 sm:p-2.5 bg-[#F0FDF4] rounded-xl border border-emerald-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-900">
                  <Recycle className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Recyclable
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  100–150 m radius
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {roadRecyclableBins}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  bins
                </span>
              </div>
            </div>

            {/* Tile 4: Disposable Road Bins */}
            <div className="p-2 sm:p-2.5 bg-[#EFF6FF] rounded-xl border border-blue-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-blue-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202820]">
                    Disposable
                  </span>
                </div>
                <p className="text-[10px] text-[#667267] font-medium mt-0.5">
                  100–125 m radius
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 pt-1.5">
                <span className="font-heading text-xl sm:text-2xl font-black text-[#202820]">
                  {roadDisposableBins}
                </span>
                <span className="text-[10px] sm:text-[10.5px] text-[#667267] font-medium">
                  bins
                </span>
              </div>
            </div>
          </div>

          {/* Diagnostics & Coverage Status Card */}
          <div className="p-2 bg-[#F4F6F0] rounded-xl border border-[#E1E8DE] space-y-1.5 text-[10px]">
            {/* Coverage & Spacing Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[#202820] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {totalLocRequired > 0
                    ? `Coverage: ${coveredLocCount}/${totalLocRequired} zones`
                    : 'Coverage satisfied'}
                </span>
              </div>
              <span className="text-[9.5px] text-[#667267]">
                {spacingPassed ? '✓ 25m spacing verified' : '⚠️ Spacing warning'}
              </span>
            </div>

            {/* Stream influence badges */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-semibold">
                🗑️ Disp: 100–125m
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-semibold">
                ♻️ Recyc: 100–150m
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 text-[9px] font-semibold ml-auto">
                {isOptimal ? 'Optimal' : `Solver: ${solverName}`}
              </span>
            </div>

            {/* Uncovered warnings if any */}
            {(uncoveredDis > 0 || uncoveredRec > 0) && (
              <div className="flex items-center gap-1 text-amber-800 bg-amber-50 p-1 rounded border border-amber-200">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>
                  Uncovered: {uncoveredDis > 0 ? `${uncoveredDis} Disposable` : ''}{' '}
                  {uncoveredRec > 0 ? `${uncoveredRec} Recyclable` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discovery Prompt Footer */}
      <div className="pt-1.5 border-t border-[#E1E8DE] flex items-center justify-between text-[10px] text-[#667267]">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-[#004B20] shrink-0" />
          <span className="truncate">
            {activeTab === 'road-bins'
              ? 'Roadside corridor placements with 25 m separation and stream radii.'
              : 'Click a map location to inspect its bin allocation & emptying turns.'}
          </span>
        </div>
      </div>
    </div>
  );
};
