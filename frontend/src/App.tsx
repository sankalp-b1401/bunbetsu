/**
 * BUNBETSU — Streamlined Campus Event Planning & Waste Prediction UI
 * Three-step workflow: Campus Selection -> Event Configuration -> Plan Dashboard.
 * Integrates waste prediction, polygon-constrained bin distribution, and pedestrian routing.
 */

import React, { useState, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { CampusFinder } from './components/Step1CampusFinder/CampusFinder';
import { EventConfiguration } from './components/Step2EventConfiguration/EventConfiguration';
import { PlanDashboard } from './components/Step3Plan/PlanDashboard';
import {
  Campus,
  CampusLocation,
  EventDetails,
  PredictionResult,
  ActivityType,
  RoutePlanResult,
  BinRecommendationResult,
} from './types/bunbetsu';
import { requestCampusPlan } from './services/planningApi';

export default function App() {
  // 3-Step navigation: 1 = Campus Finder, 2 = Event Configuration, 3 = Plan Dashboard
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
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
    festName: '',
    durationDays: 0,
    expectedFootfall: 0,
  });

  // Unified planning pipeline state
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [binRecommendations, setBinRecommendations] = useState<BinRecommendationResult | null>(null);
  const [routeResult, setRouteResult] = useState<RoutePlanResult | null>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isPlanStale, setIsPlanStale] = useState<boolean>(false);

  // Campus selection change handler: clears prior planning outputs
  const handleSelectCampus = (newCampus: Campus) => {
    setSelectedCampus(newCampus);
    const initialPool: CampusLocation[] = (newCampus.defaultLocations || []).map((loc) => ({
      ...loc,
      activities: [] as ActivityType[],
    }));
    setAllCampusLocations(initialPool);
    setLocations([]);
    setSelectedLocationId(null);
    setPredictionResult(null);
    setBinRecommendations(null);
    setRouteResult(null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);
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
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Update an active location (e.g. assigning/toggling activity tags or renaming)
  const handleUpdateLocation = (updatedLocation: CampusLocation) => {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === updatedLocation.id ? updatedLocation : loc))
    );
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === updatedLocation.id ? { ...loc, ...updatedLocation } : loc))
    );
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Unselect location: removes from active event plan
  const handleDeleteLocation = (locationId: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? { ...loc, activities: [] } : loc))
    );
    if (selectedLocationId === locationId) {
      setSelectedLocationId(null);
    }
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Add a newly created custom location from drawing / map modal
  const handleAddCustomLocation = (newLocation: CampusLocation) => {
    setAllCampusLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== newLocation.id);
      return [...filtered, newLocation];
    });
    setLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== newLocation.id);
      return [...filtered, newLocation];
    });
    setSelectedLocationId(newLocation.id);
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Select / reselect a location
  const handleSelectLocation = (locationId: string, fallbackLocation?: CampusLocation) => {
    setLocations((prev) => {
      const isAlreadyActive = prev.some((l) => l.id === locationId);
      if (isAlreadyActive) {
        return prev;
      }
      const foundInPool = allCampusLocations.find((l) => l.id === locationId) || fallbackLocation;
      if (foundInPool) {
        const freshReselectedLocation: CampusLocation = {
          ...foundInPool,
          activities: [],
        };
        return [...prev.filter((l) => l.id !== locationId), freshReselectedLocation];
      }
      return prev;
    });
    setSelectedLocationId(locationId);
    if (planningError) setPlanningError(null);
  };

  // Active campus merged with all available locations (preset + user-created)
  const activeCampusWithLocations = useMemo(() => {
    if (!selectedCampus) return null;
    return {
      ...selectedCampus,
      defaultLocations: allCampusLocations,
    };
  }, [selectedCampus, allCampusLocations]);

  // Execute unified planning pipeline (waste prediction + bin distribution + routes)
  const executePlan = async () => {
    if (isPlanning) return; // Prevent duplicate in-flight dispatch
    if (!selectedCampus) {
      setPlanningError('A campus must be selected.');
      return;
    }
    if (!selectedCampus.state || !selectedCampus.state.trim()) {
      setPlanningError(
        'The selected campus does not have a determinable state/UT. Please select a campus with a known state to calculate predictions.'
      );
      return;
    }

    setIsPlanning(true);
    setPlanningError(null);
    setRoutesError(null);

    try {
      const result = await requestCampusPlan({
        eventDetails,
        campus: activeCampusWithLocations || selectedCampus,
        locations,
        maxSnapDistanceM: 50.0,
      });

      setPredictionResult(result.prediction);
      setBinRecommendations(result.binRecommendations);
      setRouteResult(result.routeResult);
      setIsPlanStale(false);

      // Handle partial stage status for routing without breaking waste/bins
      if (result.diagnostics.stage_status.routes === 'failed') {
        const routeWarn =
          result.diagnostics.warnings.find(
            (w) =>
              w.toLowerCase().includes('route') ||
              w.toLowerCase().includes('routing') ||
              w.toLowerCase().includes('pedestrian')
          ) || 'Pedestrian routing was unavailable for this campus boundary.';
        setRoutesError(routeWarn);
      }
    } catch (err: any) {
      setPlanningError(err.message || 'Failed to execute event planning pipeline.');
    } finally {
      setIsPlanning(false);
    }
  };

  // Transition from Step 2 (Configure) to Step 3 (Plan)
  const handleTriggerPlan = () => {
    if (!selectedCampus) {
      setPlanningError('Please select a campus first.');
      return;
    }
    if (!selectedCampus.state || !selectedCampus.state.trim()) {
      setPlanningError(
        'The selected campus does not have a determinable state/UT required for waste prediction baseline. Please select a campus with a valid state.'
      );
      return;
    }
    if (!eventDetails.festName.trim()) {
      setPlanningError('Fest name is required.');
      return;
    }
    if (eventDetails.durationDays <= 0) {
      setPlanningError('Duration in days must be a positive number.');
      return;
    }
    if (eventDetails.expectedFootfall <= 0) {
      setPlanningError('Expected footfall must be a positive integer.');
      return;
    }
    if (locations.length === 0) {
      setPlanningError('At least one event location must be configured on the map.');
      return;
    }

    // Check unique location names client-side before starting planning
    const locNames = locations.map((l) => l.name.trim());
    const uniqueNames = new Set(locNames);
    if (uniqueNames.size !== locNames.length) {
      setPlanningError('Each location must have a unique name for spatial bin distribution modeling.');
      return;
    }

    for (const loc of locations) {
      if (!loc.activities || loc.activities.length === 0) {
        setPlanningError(`Location "${loc.name}" must have at least one activity tag.`);
        setSelectedLocationId(loc.id);
        return;
      }
      if (!loc.area || loc.area <= 0) {
        setPlanningError(`Location "${loc.name}" has invalid area (${loc.area} m²). Must be greater than 0.`);
        setSelectedLocationId(loc.id);
        return;
      }
    }

    // Switch to step 3 and execute unified plan
    setCurrentStep(3);
    executePlan();
  };

  const canGoToPlan =
    step1Completed &&
    locations.length > 0 &&
    Boolean(eventDetails.festName.trim()) &&
    eventDetails.durationDays > 0 &&
    eventDetails.expectedFootfall > 0;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F7F9F5] text-[#202820] select-none font-sans">
      {/* Top Persistent Navbar with Step Indicator */}
      <Navbar
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        step1Completed={step1Completed}
        canGoToPlan={canGoToPlan}
        onResetPlan={() => {
          setLocations([]);
          setSelectedLocationId(null);
          setPredictionResult(null);
          setBinRecommendations(null);
          setRouteResult(null);
          setPlanningError(null);
          setRoutesError(null);
          setIsPlanStale(false);
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
            isPredicting={isPlanning}
            predictionError={planningError}
          />
        )}

        {currentStep === 3 && selectedCampus && (
          <PlanDashboard
            campus={activeCampusWithLocations || selectedCampus}
            eventDetails={eventDetails}
            locations={locations}
            prediction={predictionResult}
            predictionLoading={isPlanning}
            predictionError={planningError}
            predictionStale={isPlanStale}
            routeResult={routeResult}
            routesLoading={false}
            routesError={routesError}
            routesStale={isPlanStale}
            binRecommendations={binRecommendations}
            onBackToConfigure={() => setCurrentStep(2)}
            onRecalculatePrediction={executePlan}
          />
        )}
      </main>
    </div>
  );
}
