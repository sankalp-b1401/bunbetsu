/**
 * BUNBETSU — Streamlined Campus Event Planning & Waste Prediction UI
 * Two-step workflow: Campus Selection -> Configuration with Direct Location Activity Tags & Planning.
 */

import React, { useState, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { CampusFinder } from './components/Step1CampusFinder/CampusFinder';
import { EventConfiguration } from './components/Step2EventConfiguration/EventConfiguration';
import { PredictionPlanModal } from './components/PredictionPlanModal';
import { SAMPLE_CAMPUSES } from './constants/activities';
import { Campus, CampusLocation, EventDetails, PredictionResult, ActivityType } from './types/bunbetsu';
import { requestWastePrediction } from './services/predictionApi';

export default function App() {
  // 2-Step navigation: 1 = Campus Finder, 2 = Event Configuration & Plan
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Completed, setStep1Completed] = useState<boolean>(false);

  // Selected campus state: null by default (no auto-selected campus)
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);

  // Master pool of all locations for this campus (both preset campus zones and user-created custom areas)
  const [allCampusLocations, setAllCampusLocations] = useState<CampusLocation[]>([]);

  // Selected active event locations: locations currently included in the event plan
  const [locations, setLocations] = useState<CampusLocation[]>([]);

  // Active highlighted location on the map: null by default (no auto-selected location)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Event details state
  const [eventDetails, setEventDetails] = useState<EventDetails>({
    festName: 'Techfest 2025',
    durationDays: 3,
    expectedFootfall: 10000,
    baselineRateKgPerPersonDay: 0.45, // Calibrated standard benchmark
  });

  // Final prediction result modal & loading states
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  // Campus selection change handler
  const handleSelectCampus = (newCampus: Campus) => {
    setSelectedCampus(newCampus);
    // Initialize master pool with fresh, unselected activity profiles
    const initialPool: CampusLocation[] = (newCampus.defaultLocations || []).map((loc) => ({
      ...loc,
      activities: [] as ActivityType[],
    }));
    setAllCampusLocations(initialPool);
    setLocations([]);
    setSelectedLocationId(null);
    setPredictionError(null);
    setPredictionResult(null);
    setStep1Completed(false);
  };

  // Step 1 completion: User confirms campus
  const handleConfirmCampus = () => {
    if (!selectedCampus) return;
    setStep1Completed(true);
    setCurrentStep(2);
  };

  const handleUpdateEventDetails = (partial: Partial<EventDetails>) => {
    setEventDetails((prev) => ({ ...prev, ...partial }));
    if (predictionError) setPredictionError(null);
  };

  // Update an active location (e.g. assigning/toggling activity tags or renaming)
  const handleUpdateLocation = (updatedLocation: CampusLocation) => {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === updatedLocation.id ? updatedLocation : loc))
    );
    // Also sync changes (name, coordinates, etc.) to the master pool
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === updatedLocation.id ? { ...loc, ...updatedLocation } : loc))
    );
    if (predictionError) setPredictionError(null);
  };

  // Unselect location: removes from active event plan, while preserving the created location on campus map
  // with a fresh, un-preselected activity profile
  const handleDeleteLocation = (locationId: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    // Reset activity profile to empty in master pool so reselecting starts fresh with NO preselected activities
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? { ...loc, activities: [] } : loc))
    );
    if (selectedLocationId === locationId) {
      setSelectedLocationId(null);
    }
    if (predictionError) setPredictionError(null);
  };

  // Add a newly created custom location from drawing / map modal
  const handleAddCustomLocation = (newLocation: CampusLocation) => {
    // 1. Add to master pool of campus locations
    setAllCampusLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== newLocation.id);
      return [...filtered, newLocation];
    });
    // 2. Add to active event locations
    setLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== newLocation.id);
      return [...filtered, newLocation];
    });
    setSelectedLocationId(newLocation.id);
    if (predictionError) setPredictionError(null);
  };

  // Select / reselect a location (either already in active event or previously unselected)
  const handleSelectLocation = (locationId: string, fallbackLocation?: CampusLocation) => {
    setLocations((prev) => {
      const isAlreadyActive = prev.some((l) => l.id === locationId);
      if (isAlreadyActive) {
        return prev;
      }

      // Location was unselected or available: reselect it with a FRESH, un-preselected activity profile
      const foundInPool = allCampusLocations.find((l) => l.id === locationId) || fallbackLocation;
      if (foundInPool) {
        const freshReselectedLocation: CampusLocation = {
          ...foundInPool,
          activities: [], // Fresh unselected activities; only name and geometry persist!
        };
        return [...prev.filter((l) => l.id !== locationId), freshReselectedLocation];
      }
      return prev;
    });
    setSelectedLocationId(locationId);
    if (predictionError) setPredictionError(null);
  };

  // Active campus merged with all available locations (preset + user-created)
  const activeCampusWithLocations = useMemo(() => {
    if (!selectedCampus) return null;
    return {
      ...selectedCampus,
      defaultLocations: allCampusLocations,
    };
  }, [selectedCampus, allCampusLocations]);

  // Trigger Plan Action (Validation & Execution of Backend Python Model)
  const handleTriggerPlan = async () => {
    if (!eventDetails.festName.trim()) {
      setPredictionError('Fest name is required.');
      return;
    }
    if (eventDetails.durationDays <= 0) {
      setPredictionError('Duration in days must be a positive number.');
      return;
    }
    if (eventDetails.expectedFootfall <= 0) {
      setPredictionError('Expected footfall must be a positive integer.');
      return;
    }
    if (locations.length === 0) {
      setPredictionError('At least one event location must be configured on the map.');
      return;
    }

    for (const loc of locations) {
      if (!loc.activities || loc.activities.length === 0) {
        setPredictionError(`Location "${loc.name}" must have at least one activity tag.`);
        setSelectedLocationId(loc.id);
        return;
      }
      if (!loc.area || loc.area <= 0) {
        setPredictionError(`Location "${loc.name}" has invalid area (${loc.area} m²). Must be greater than 0.`);
        setSelectedLocationId(loc.id);
        return;
      }
    }

    setIsPredicting(true);
    setPredictionError(null);

    try {
      const result = await requestWastePrediction({
        totalFootfall: eventDetails.expectedFootfall,
        durationDays: eventDetails.durationDays,
        baselineRateKgPerPersonDay: eventDetails.baselineRateKgPerPersonDay || 0.45,
        locations,
      });
      setPredictionResult(result);
    } catch (err: any) {
      setPredictionError(err.message || 'Failed to execute waste prediction model.');
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F7F9F5] text-[#202820] select-none font-sans">
      {/* Top Persistent Navbar with Step Indicator */}
      <Navbar
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        step1Completed={step1Completed}
        onResetPlan={() => {
          setLocations([]);
          setSelectedLocationId(null);
        }}
      />

      {/* Main Workspace: Fills 100% of remaining screen height */}
      <main className="flex-1 min-h-0 w-full overflow-hidden">
        {currentStep === 1 && (
          <CampusFinder
            selectedCampus={selectedCampus}
            onSelectCampus={handleSelectCampus}
            onConfirmCampus={handleConfirmCampus}
          />
        )}

        {currentStep === 2 && selectedCampus && (
          <EventConfiguration
            campus={activeCampusWithLocations || selectedCampus}
            eventDetails={eventDetails}
            onUpdateEventDetails={handleUpdateEventDetails}
            locations={locations}
            selectedLocationId={selectedLocationId}
            onSelectLocation={handleSelectLocation}
            onAddCustomLocation={handleAddCustomLocation}
            onUpdateLocation={handleUpdateLocation}
            onDeleteLocation={handleDeleteLocation}
            onTriggerPlan={handleTriggerPlan}
            isPredicting={isPredicting}
            predictionError={predictionError}
          />
        )}
      </main>

      {/* Final Plan Prediction Modal */}
      {predictionResult && (
        <PredictionPlanModal
          result={predictionResult}
          onClose={() => setPredictionResult(null)}
        />
      )}
    </div>
  );
}
