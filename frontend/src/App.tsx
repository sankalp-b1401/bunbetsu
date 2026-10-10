/**
 * BUNBETSU — Streamlined Campus Event Planning & Waste Prediction UI
 * Three-step workflow: Campus Selection -> Event Configuration -> Plan Dashboard.
 */

import React, { useState, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { CampusFinder } from './components/Step1CampusFinder/CampusFinder';
import { EventConfiguration } from './components/Step2EventConfiguration/EventConfiguration';
import { PlanDashboard } from './components/Step3Plan/PlanDashboard';
import { Campus, CampusLocation, EventDetails, PredictionResult, ActivityType, RoutePlanResult } from './types/bunbetsu';
import { requestWastePrediction } from './services/predictionApi';
import { planCampusRoutes } from './services/routesApi';

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

  // Final prediction result & loading states
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [predictionStale, setPredictionStale] = useState<boolean>(false);

  // Pedestrian routes pipeline state
  const [routeResult, setRouteResult] = useState<RoutePlanResult | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState<boolean>(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isRoutesStale, setIsRoutesStale] = useState<boolean>(false);

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
    setPredictionStale(false);
    setRouteResult(null);
    setRoutesError(null);
    setIsRoutesStale(false);
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
    if (predictionResult) setPredictionStale(true);
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
    if (predictionResult) setPredictionStale(true);
    if (routeResult) setIsRoutesStale(true);
  };

  // Unselect location: removes from active event plan, while preserving the created location on campus map
  const handleDeleteLocation = (locationId: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? { ...loc, activities: [] } : loc))
    );
    if (selectedLocationId === locationId) {
      setSelectedLocationId(null);
    }
    if (predictionError) setPredictionError(null);
    if (predictionResult) setPredictionStale(true);
    if (routeResult) setIsRoutesStale(true);
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
    if (predictionError) setPredictionError(null);
    if (predictionResult) setPredictionStale(true);
    if (routeResult) setIsRoutesStale(true);
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

  // Execute waste prediction model
  const executePrediction = async () => {
    if (!selectedCampus) {
      setPredictionError('A campus must be selected.');
      return;
    }
    if (!selectedCampus.state || !selectedCampus.state.trim()) {
      setPredictionError(
        'The selected campus does not have a determinable state/UT. Please select a campus with a known state to calculate predictions.'
      );
      return;
    }

    setIsPredicting(true);
    setPredictionError(null);

    try {
      const result = await requestWastePrediction({
        totalFootfall: eventDetails.expectedFootfall,
        durationDays: eventDetails.durationDays,
        campusState: selectedCampus.state,
        locations,
      });
      setPredictionResult(result);
      setPredictionStale(false);
    } catch (err: any) {
      setPredictionError(err.message || 'Failed to execute waste prediction model.');
    } finally {
      setIsPredicting(false);
    }
  };

  // Transition from Step 2 (Configure) to Step 3 (Plan)
  const handleTriggerPlan = () => {
    if (!selectedCampus) {
      setPredictionError('Please select a campus first.');
      return;
    }
    if (!selectedCampus.state || !selectedCampus.state.trim()) {
      setPredictionError(
        'The selected campus does not have a determinable state/UT required for waste prediction baseline. Please select a campus with a valid state.'
      );
      return;
    }
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

    // Switch to step 3 and execute prediction
    setCurrentStep(3);
    executePrediction();
  };

  // Trigger pedestrian routes calculation on Plan Dashboard
  const handleCalculateRoutes = async () => {
    if (!selectedCampus) return;
    if (locations.length === 0) {
      setRoutesError('At least one configured location is required to calculate pedestrian routes.');
      return;
    }

    setIsCalculatingRoutes(true);
    setRoutesError(null);

    try {
      const result = await planCampusRoutes({
        campus: activeCampusWithLocations || selectedCampus,
        locations,
        maxSnapDistanceM: 50.0,
      });
      setRouteResult(result);
      setIsRoutesStale(false);
    } catch (err: any) {
      setRoutesError(err.message || 'Failed to calculate pedestrian routes.');
    } finally {
      setIsCalculatingRoutes(false);
    }
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
          setPredictionError(null);
          setPredictionStale(false);
          setRouteResult(null);
          setRoutesError(null);
          setIsRoutesStale(false);
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

        {currentStep === 3 && selectedCampus && (
          <PlanDashboard
            campus={activeCampusWithLocations || selectedCampus}
            eventDetails={eventDetails}
            locations={locations}
            prediction={predictionResult}
            predictionLoading={isPredicting}
            predictionError={predictionError}
            predictionStale={predictionStale}
            routeResult={routeResult}
            routesLoading={isCalculatingRoutes}
            routesError={routesError}
            routesStale={isRoutesStale}
            onBackToConfigure={() => setCurrentStep(2)}
            onRecalculatePrediction={executePrediction}
            onCalculateRoutes={handleCalculateRoutes}
          />
        )}
      </main>
    </div>
  );
}
