import React, { useState, useRef } from 'react';
import {
  Search,
  ArrowRight,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Globe2,
  Compass,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Campus } from '../../types/bunbetsu';
import { fetchCampusByCollege } from '../../services/campusApi';
import { CampusMap } from '../Map/CampusMap';

interface CampusFinderProps {
  selectedCampus: Campus | null;
  onSelectCampus: (campus: Campus) => void;
  onConfirmCampus: () => void;
}

export const CampusFinder: React.FC<CampusFinderProps> = ({
  selectedCampus,
  onSelectCampus,
  onConfirmCampus,
}) => {
  const [searchQuery, setSearchQuery] = useState(selectedCampus ? selectedCampus.name : '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recenterCount, setRecenterCount] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(Boolean(selectedCampus));

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Execute actual campus search via FastAPI Nominatim endpoint
  const performSearch = async (query: string) => {
    if (isLoading) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a college or university name to search.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const campus = await fetchCampusByCollege(trimmed);
      onSelectCampus(campus);
      setSearchQuery(campus.name);
      setHasSearched(true);
      setRecenterCount((prev) => prev + 1);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve campus data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    if (isLoading) return;
    performSearch(searchQuery);
  };

  // Quick select popular campus badges
  const handleSelectSuggested = (campusName: string) => {
    if (isLoading) return;
    setSearchQuery(campusName);
    performSearch(campusName);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F7F9F5] rounded-none border-0">
      {/* 1. Fullscreen Map Canvas: Flat corners, uses 100% of the screen space */}
      <div className="absolute inset-0 w-full h-full rounded-none">
        <CampusMap
          campus={selectedCampus}
          locations={selectedCampus ? selectedCampus.defaultLocations : []}
          readOnlyPreview={true}
          showToolbar={false}
          showLegend={false}
          heightClass="h-full w-full"
          flatCorners={true}
          className="rounded-none border-0 shadow-none"
          recenterTrigger={recenterCount}
        />
      </div>

      {/* 2. Floating Map Overlay: Header, Search & Campus Card */}
      <div className="absolute top-4 left-4 sm:top-5 sm:left-6 z-20 w-[calc(100%-2rem)] sm:w-[480px] max-w-[calc(100%-2rem)] flex flex-col gap-3 pointer-events-none">
        {/* Main Floating Search & Header Card */}
        <div
          ref={searchContainerRef}
          className="relative z-30 pointer-events-auto bg-white/95 backdrop-blur-md rounded-xl p-4.5 sm:p-5 border border-[#E1E8DE] shadow-xl space-y-3.5 transition-all"
        >
          {/* Heading & Description */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/30">
              <Compass className="w-3 h-3 text-[#004B20]" />
              <span>Campus Venue</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[#202820] leading-tight">
              Start with your campus.
            </h1>
            <p className="text-xs text-[#667267] font-normal leading-relaxed">
              Find and map your event venue to retrieve real boundaries from OpenStreetMap.
            </p>
          </div>

          {/* Search Form with Separate Input and Button */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchSubmit();
            }}
            className="relative z-40 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5"
          >
            {/* Input Wrapper */}
            <div className="relative flex-1 min-w-0 flex items-center h-10 sm:h-10.5 rounded-lg bg-white border border-[#E1E8DE] shadow-2xs focus-within:border-[#004B20] focus-within:ring-2 focus-within:ring-[#70D000]/25 transition-all">
              <Search className="w-4 h-4 text-[#667267] absolute left-3 pointer-events-none shrink-0" />
              <input
                type="text"
                value={searchQuery}
                disabled={isLoading}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                placeholder="Search college or campus name"
                className="w-full h-full min-w-0 pl-9 pr-3.5 bg-transparent rounded-lg text-[#202820] placeholder:text-[#667267] text-xs sm:text-sm font-medium focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {/* "Find My Campus" Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto sm:min-w-[150px] h-10 sm:h-10.5 px-4 bg-[#004B20] hover:bg-[#003B19] active:bg-[#002B12] disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs hover:shadow-sm shrink-0 flex-shrink-0 whitespace-nowrap font-sans"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Find My Campus</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </>
              )}
            </button>
          </form>

          {/* Quick Popular Suggestions Chips */}
          <div className="flex items-center gap-1.5 text-xs text-[#667267] flex-wrap pt-0.5">
            <span className="font-semibold text-[#202820] text-[11px]">Popular:</span>
            {['MNNIT Allahabad', 'NIT Trichy', 'IIT Delhi', 'IIT Bombay'].map(
              (suggested) => (
                <button
                  key={suggested}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSelectSuggested(suggested)}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50 ${
                    selectedCampus?.name === suggested
                      ? 'bg-[#004B20] font-bold text-white shadow-xs'
                      : 'bg-[#F7F9F5] hover:bg-[#EAF5E6] border border-[#E1E8DE] text-[#202820]'
                  }`}
                >
                  {suggested}
                </button>
              )
            )}
          </div>
        </div>

        {/* Error Alert Card */}
        {errorMessage && (
          <div className="relative z-20 pointer-events-auto bg-red-50/95 backdrop-blur-md rounded-xl p-4 border border-red-200 shadow-lg text-xs text-red-900 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-bold font-heading text-red-950">Campus Search Error</div>
              <p className="mt-0.5 text-red-800 leading-relaxed font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Loading Card State */}
        {isLoading && !errorMessage && (
          <div className="relative z-20 pointer-events-auto bg-white/95 backdrop-blur-md rounded-xl p-5 border border-[#E1E8DE] shadow-lg text-xs text-[#202820] flex items-center gap-3 animate-in fade-in duration-200">
            <Loader2 className="w-5 h-5 text-[#004B20] animate-spin shrink-0" />
            <div>
              <div className="font-bold font-heading text-[#202820]">Querying OpenStreetMap...</div>
              <div className="text-[11px] text-[#667267]">
                Retrieving educational boundaries and campus geography
              </div>
            </div>
          </div>
        )}

        {/* Campus Card: Revealed with campus name and address, plus "Configure Event" action */}
        {hasSearched && selectedCampus && !isLoading && !errorMessage && (
          <div className="relative z-10 pointer-events-auto bg-white/95 backdrop-blur-md rounded-xl p-4 sm:p-4.5 border border-[#E1E8DE] shadow-xl space-y-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3.5">
              {/* Photo Thumbnail */}
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-neutral-100 shrink-0 border border-[#E1E8DE] shadow-2xs">
                <img
                  src={
                    selectedCampus.imageUrl ||
                    'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=80'
                  }
                  alt={selectedCampus.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info text: Name & Address */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="font-heading text-sm sm:text-base font-bold text-[#202820] truncate">
                    {selectedCampus.name}
                  </h2>
                  {selectedCampus.hasBoundary ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md text-[10px] font-bold bg-[#EAF5E6] text-[#004B20] border border-[#70D000]/40 shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 text-[#004B20]" />
                      <span>Boundary detected</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 shrink-0">
                      <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                      <span>Point only</span>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-[#667267] truncate mt-0.5 font-medium">
                  {selectedCampus.fullName}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-[#667267] mt-1 truncate">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[#004B20]" />
                  <span className="truncate">{selectedCampus.address}</span>
                </div>
              </div>
            </div>

            {/* Boundary Notification when Point-only */}
            {!selectedCampus.hasBoundary && (
              <div className="p-2.5 bg-amber-50/80 rounded-lg border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  Nominatim returned coordinates for this location, but no polygon boundary is mapped in OpenStreetMap. You can still navigate the campus map and define event locations.
                </p>
              </div>
            )}

            {/* Metadata Row */}
            <div className="grid grid-cols-2 gap-2 p-2 bg-[#F7F9F5] rounded-lg border border-[#E1E8DE] text-[11px]">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[#667267] font-medium">Area (approx.):</span>
                <span className="font-bold text-[#202820] truncate">
                  {selectedCampus.hasBoundary && selectedCampus.approxAreaHectares > 0
                    ? `${selectedCampus.approxAreaHectares} hectares`
                    : 'Point coordinates'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 justify-end text-[#667267] truncate">
                <Globe2 className="w-3.5 h-3.5 text-[#667267] shrink-0" />
                <span className="truncate">Source:</span>
                <span className="font-semibold text-[#202820] truncate">
                  {selectedCampus.boundarySource}
                </span>
              </div>
            </div>

            {/* Primary Action Button: "Configure Event" */}
            <div className="w-full pt-0.5">
              <button
                type="button"
                onClick={onConfirmCampus}
                className="w-full py-2.5 sm:py-3 bg-[#004B20] hover:bg-[#003B19] active:bg-[#002B12] text-white font-bold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all cursor-pointer font-sans"
              >
                <span>Configure Event</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
