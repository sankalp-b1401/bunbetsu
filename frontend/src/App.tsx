/**
 * BUNBETSU — Streamlined Campus Event Planning & Waste Prediction UI
 * Three-step workflow: Campus Selection -> Event Configuration -> Plan Dashboard.
 * Integrates waste prediction, polygon-constrained bin distribution, and pedestrian routing.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
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
  RoadBinRecommendationResult,
  EntryGate,
  AuthUser,
  DashboardTemplateItem,
  SavedTemplateData,
  DashboardEventItem,
  EventHistorySnapshot,
} from './types/bunbetsu';
import { requestCampusPlan } from './services/planningApi';
import { AuthPage } from './components/Auth/AuthPage';
import { DashboardPage } from './components/Dashboard/DashboardPage';
import {
  supabase,
  isSupabaseConfigured,
  buildAuthUserFromSession,
} from './lib/supabase';
import {
  saveTemplate,
  listSavedTemplates,
  deleteSavedTemplate,
  validateTemplateData,
} from './services/templateApi';
import {
  saveEventHistory,
  listEventHistory,
  validateEventSnapshot,
} from './services/historyApi';
import { SaveTemplateModal } from './components/Step2EventConfiguration/SaveTemplateModal';
import { SavePlanModal } from './components/Step3Plan/SavePlanModal';

export default function App() {
  // Top-level navigation: 'auth' | 'dashboard' | 'planner'
  const [currentView, setCurrentView] = useState<'auth' | 'dashboard' | 'planner'>('auth');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);

  // Saved templates state
  const [savedTemplates, setSavedTemplates] = useState<DashboardTemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Event history state
  const [recentEvents, setRecentEvents] = useState<DashboardEventItem[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [showSaveHistoryModal, setShowSaveHistoryModal] = useState<boolean>(false);
  const [isHistoricalView, setIsHistoricalView] = useState<boolean>(false);
  const [historicalEventName, setHistoricalEventName] = useState<string | undefined>(undefined);
  const [historicalCreatedAt, setHistoricalCreatedAt] = useState<string | undefined>(undefined);
  const [hasSavedHistory, setHasSavedHistory] = useState<boolean>(false);

  // 3-Step navigation: 1 = Campus Finder, 2 = Event Configuration, 3 = Plan Dashboard
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [step1Completed, setStep1Completed] = useState<boolean>(false);

  // Selected campus state: null by default (no auto-selected campus)
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);

  // Dedicated entry gate state: null by default; required before proceeding to Step 3
  const [entryGate, setEntryGate] = useState<EntryGate | null>(null);

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
  const [roadBinRecommendations, setRoadBinRecommendations] = useState<RoadBinRecommendationResult | null>(null);
  const [routeResult, setRouteResult] = useState<RoutePlanResult | null>(null);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [isPlanStale, setIsPlanStale] = useState<boolean>(false);

  // Restore existing Supabase session and subscribe to auth state changes
  useEffect(() => {
    let isMounted = true;
    let initialResolutionHandled = false;

    // Helper to safely schedule profile resolution outside callback event loop to prevent deadlocks
    const scheduleProfileResolution = (sessionUser: any) => {
      setTimeout(async () => {
        if (!isMounted) return;
        try {
          const authUser = await buildAuthUserFromSession(sessionUser);
          if (!isMounted) return;
          if (authUser) {
            setUser(authUser);
            setCurrentView((prev) => (prev === 'auth' ? 'dashboard' : prev));
          }
        } catch (err) {
          console.error('[Bunbetsu Auth] Profile resolution error:', err);
        } finally {
          if (isMounted) {
            setIsAuthInitializing(false);
          }
        }
      }, 0);
    };

    if (!isSupabaseConfigured) {
      setIsAuthInitializing(false);
      return;
    }

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setUser((currentUser) => (currentUser?.isGuest ? currentUser : null));
        setCurrentView((prev) => (prev === 'dashboard' ? 'auth' : prev));
        setIsAuthInitializing(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          scheduleProfileResolution(session.user);
        }
      } else if (event === 'INITIAL_SESSION') {
        initialResolutionHandled = true;
        if (session?.user) {
          scheduleProfileResolution(session.user);
        } else {
          setIsAuthInitializing(false);
        }
      }
    });

    // Fallback getSession() to avoid race conditions if INITIAL_SESSION is not emitted
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        if (!initialResolutionHandled) {
          if (session?.user) {
            scheduleProfileResolution(session.user);
          } else {
            setIsAuthInitializing(false);
          }
        }
      })
      .catch((err) => {
        console.warn('[Bunbetsu Auth] Session retrieval error:', err);
        if (isMounted) {
          setIsAuthInitializing(false);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Campus selection change handler: clears prior planning outputs and entry gate
  const handleSelectCampus = (newCampus: Campus) => {
    setSelectedCampus(newCampus);
    const initialPool: CampusLocation[] = (newCampus.defaultLocations || []).map((loc) => ({
      ...loc,
      activities: [] as ActivityType[],
      source: 'preset' as const,
    }));
    setAllCampusLocations(initialPool);
    setLocations([]);
    setEntryGate(null);
    setSelectedLocationId(null);
    setPredictionResult(null);
    setBinRecommendations(null);
    setRoadBinRecommendations(null);
    setRouteResult(null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);
    setStep1Completed(false);
    setIsHistoricalView(false);
    setHistoricalEventName(undefined);
    setHistoricalCreatedAt(undefined);
    setHasSavedHistory(false);
  };

  const handleSetEntryGate = (gate: EntryGate) => {
    setEntryGate(gate);
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || roadBinRecommendations || routeResult) {
      setIsPlanStale(true);
    }
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
    if (predictionResult || binRecommendations || roadBinRecommendations || routeResult) {
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
    if (predictionResult || binRecommendations || roadBinRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Unselect location: removes from active event plan (map area remains available)
  const handleDeleteLocation = (locationId: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    setAllCampusLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? { ...loc, activities: [] } : loc))
    );
    if (selectedLocationId === locationId) {
      setSelectedLocationId(null);
    }
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || roadBinRecommendations || routeResult) {
      setIsPlanStale(true);
    }
  };

  // Delete map area: permanently erases a user-drawn map area from campus pool and event plan
  const handleDeleteArea = (areaId: string) => {
    const target =
      allCampusLocations.find((l) => l.id === areaId) ||
      locations.find((l) => l.id === areaId);
    if (!target) return;

    // Guard: preset campus zones cannot be deleted
    if (target.source === 'preset') return;

    // Permanently remove from master map area pool
    setAllCampusLocations((prev) => prev.filter((l) => l.id !== areaId));

    // Remove from configured event locations if present and mark plan stale
    const wasConfigured = locations.some((l) => l.id === areaId);
    setLocations((prev) => prev.filter((l) => l.id !== areaId));
    if (wasConfigured && (predictionResult || binRecommendations || roadBinRecommendations || routeResult)) {
      setIsPlanStale(true);
    }

    if (selectedLocationId === areaId) {
      setSelectedLocationId(null);
    }
    if (planningError) setPlanningError(null);
  };

  // Add a newly created custom location from drawing / map modal
  const handleAddCustomLocation = (newLocation: CampusLocation) => {
    const customLoc: CampusLocation = {
      ...newLocation,
      source: 'user_drawn',
      tags: newLocation.tags?.includes('Custom Area')
        ? newLocation.tags
        : [...(newLocation.tags || []), 'Custom Area'],
    };
    setAllCampusLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== customLoc.id);
      return [...filtered, customLoc];
    });
    setLocations((prev) => {
      const filtered = prev.filter((l) => l.id !== customLoc.id);
      return [...filtered, customLoc];
    });
    setSelectedLocationId(customLoc.id);
    if (planningError) setPlanningError(null);
    if (predictionResult || binRecommendations || roadBinRecommendations || routeResult) {
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
    if (!entryGate) {
      setPlanningError('Please place the entry gate inside the campus before generating the plan.');
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
        entryGate,
        maxSnapDistanceM: 50.0,
      });

      setPredictionResult(result.prediction);
      setBinRecommendations(result.binRecommendations);
      setRoadBinRecommendations(result.roadBinRecommendations ?? null);
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
      // Handle planning failures without displaying road-bin or bin results from a previous campus or previous plan
      setPredictionResult(null);
      setBinRecommendations(null);
      setRoadBinRecommendations(null);
      setRouteResult(null);
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
    if (!entryGate) {
      setPlanningError('Please place the entry gate inside the campus before generating the plan.');
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
    Boolean(entryGate) &&
    locations.length > 0 &&
    Boolean(eventDetails.festName.trim()) &&
    eventDetails.durationDays > 0 &&
    eventDetails.expectedFootfall > 0;

  const handleStepClick = (step: 1 | 2 | 3) => {
    if (step === 3 && !canGoToPlan) {
      if (!entryGate) {
        setPlanningError('Please place the entry gate inside the campus before generating the plan.');
      }
      return;
    }
    if (step === 2 && !step1Completed) {
      return;
    }
    setCurrentStep(step);
  };

  const handleLoginSuccess = (userData: AuthUser) => {
    const authedUser: AuthUser = { ...userData, isGuest: false };
    setUser(authedUser);
    setCurrentView('dashboard');
  };

  const handleContinueAsGuest = () => {
    const guestUser: AuthUser = {
      name: 'Guest User',
      email: 'guest@bunbetsu.app',
      role: 'Guest Planner',
      isGuest: true,
    };
    setUser(guestUser);
    setCurrentStep(1);
    setSelectedCampus(null);
    setLocations([]);
    setEntryGate(null);
    setSelectedLocationId(null);
    setPredictionResult(null);
    setBinRecommendations(null);
    setRoadBinRecommendations(null);
    setRouteResult(null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);
    setStep1Completed(false);
    setIsHistoricalView(false);
    setHistoricalEventName(undefined);
    setHistoricalCreatedAt(undefined);
    setHasSavedHistory(false);
    setCurrentView('planner');
  };

  const handleStartPlanning = () => {
    setCurrentStep(1);
    setSelectedCampus(null);
    setLocations([]);
    setEntryGate(null);
    setSelectedLocationId(null);
    setPredictionResult(null);
    setBinRecommendations(null);
    setRoadBinRecommendations(null);
    setRouteResult(null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);
    setStep1Completed(false);
    setIsHistoricalView(false);
    setHistoricalEventName(undefined);
    setHistoricalCreatedAt(undefined);
    setHasSavedHistory(false);
    setCurrentView('planner');
  };

  // Re-fetch saved templates from Supabase
  const refreshTemplates = useCallback(async () => {
    if (!user || user.isGuest || !isSupabaseConfigured) {
      setSavedTemplates([]);
      return;
    }
    setIsLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const templates = await listSavedTemplates();
      setSavedTemplates(templates);
    } catch (err: any) {
      console.warn('[Bunbetsu] Failed to query saved templates:', err);
      setTemplatesError(err?.message || 'Failed to retrieve saved templates.');
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [user]);

  // Load templates on user change or login
  useEffect(() => {
    if (user && !user.isGuest) {
      refreshTemplates();
    } else {
      setSavedTemplates([]);
    }
  }, [user, refreshTemplates]);

  // Handle saving current configuration as a reusable template
  const handleSaveTemplate = async (templateName: string) => {
    if (!selectedCampus) {
      throw new Error('Please select a campus before saving a template.');
    }

    const snapshot: SavedTemplateData = {
      schema_version: 1,
      campus: selectedCampus,
      allCampusLocations: allCampusLocations,
      locations: locations,
      eventDetails: eventDetails,
      entryGate: entryGate,
    };

    await saveTemplate({
      name: templateName,
      templateData: snapshot,
    });

    await refreshTemplates();

    setToastMessage(`Template "${templateName}" saved successfully.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handle restoring a saved template into the planner
  const handleSelectTemplate = (templateItem: DashboardTemplateItem) => {
    if (!templateItem.template_data) {
      setToastMessage(`Template "${templateItem.name}" has no configuration data.`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    const validation = validateTemplateData(templateItem.template_data);
    if (!validation.valid || !validation.data) {
      setToastMessage(`Failed to restore template: ${validation.error || 'Invalid configuration.'}`);
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }

    const data = validation.data;

    // 1. Restore campus and complete pool
    setSelectedCampus(data.campus);
    setAllCampusLocations(
      data.allCampusLocations && data.allCampusLocations.length > 0
        ? data.allCampusLocations
        : data.campus.defaultLocations || data.locations
    );

    // 2. Restore active event locations
    setLocations(data.locations || []);

    // 3. Restore event details
    setEventDetails({
      festName: data.eventDetails.festName || '',
      durationDays: data.eventDetails.durationDays || 1,
      expectedFootfall: data.eventDetails.expectedFootfall || 0,
      startDate: data.eventDetails.startDate,
      endDate: data.eventDetails.endDate,
    });

    // 4. Restore entry gate
    setEntryGate(data.entryGate || null);

    // 5. Clear stale derived calculation results
    setSelectedLocationId(null);
    setPredictionResult(null);
    setBinRecommendations(null);
    setRoadBinRecommendations(null);
    setRouteResult(null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);

    // 6. Navigate to Step 2: Event Configuration in Planner
    setStep1Completed(true);
    setCurrentStep(2);
    setCurrentView('planner');
    setIsHistoricalView(false);
    setHistoricalEventName(undefined);
    setHistoricalCreatedAt(undefined);
    setHasSavedHistory(false);

    setToastMessage(`Template "${templateItem.name}" restored.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle deleting a template
  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await deleteSavedTemplate(templateId);
      setSavedTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setToastMessage('Template deleted.');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('[Bunbetsu] Failed to delete template:', err);
      setToastMessage(`Could not delete template: ${err?.message || 'Unknown error'}`);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Re-fetch event history from Supabase
  const refreshEvents = useCallback(async () => {
    if (!user || user.isGuest || !isSupabaseConfigured) {
      setRecentEvents([]);
      return;
    }
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const records = await listEventHistory();
      setRecentEvents(
        records.map((r) => ({
          id: r.id,
          name: r.event_name,
          campus_name: r.campus_name,
          template_name: r.template_name,
          created_at: r.created_at,
          event_snapshot: r.event_snapshot,
        }))
      );
    } catch (err: any) {
      console.warn('[Bunbetsu] Failed to query event history:', err);
      setEventsError(err?.message || 'Failed to retrieve event history.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [user]);

  // Load event history on user change or login
  useEffect(() => {
    if (user && !user.isGuest) {
      refreshEvents();
    } else {
      setRecentEvents([]);
    }
  }, [user, refreshEvents]);

  // Handle saving current plan to event history
  const handleSaveHistory = async (eventName: string, templateName?: string) => {
    if (!selectedCampus) {
      throw new Error('Please select a campus before saving event history.');
    }

    const snapshot: EventHistorySnapshot = {
      schema_version: 1,
      campus: selectedCampus,
      allCampusLocations: allCampusLocations,
      locations: locations,
      eventDetails: eventDetails,
      entryGate: entryGate,
      prediction: predictionResult,
      binRecommendations: binRecommendations,
      roadBinRecommendations: roadBinRecommendations,
      routeResult: routeResult,
      diagnostics: null,
      templateName: templateName || null,
      savedAt: new Date().toISOString(),
    };

    await saveEventHistory({
      eventName,
      campusName: selectedCampus.name,
      templateName,
      snapshot,
    });

    setHasSavedHistory(true);
    await refreshEvents();

    setToastMessage(`Plan "${eventName}" saved to event history.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handle opening an event plan from history in read-only mode
  const handleSelectEvent = (eventItem: DashboardEventItem) => {
    if (!eventItem.event_snapshot) {
      setToastMessage(`Event "${eventItem.name}" has no plan snapshot data.`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    const validation = validateEventSnapshot(eventItem.event_snapshot);
    if (!validation.valid || !validation.data) {
      setToastMessage(`Failed to open plan: ${validation.error || 'Invalid snapshot data.'}`);
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }

    const data = validation.data;

    // 1. Restore campus and complete location pool
    setSelectedCampus(data.campus);
    setAllCampusLocations(
      data.allCampusLocations && data.allCampusLocations.length > 0
        ? data.allCampusLocations
        : data.campus.defaultLocations || data.locations
    );

    // 2. Restore active event locations
    setLocations(data.locations || []);

    // 3. Restore event details
    setEventDetails({
      festName: data.eventDetails.festName || eventItem.name,
      durationDays: data.eventDetails.durationDays || 1,
      expectedFootfall: data.eventDetails.expectedFootfall || 0,
      startDate: data.eventDetails.startDate,
      endDate: data.eventDetails.endDate,
    });

    // 4. Restore entry gate
    setEntryGate(data.entryGate || null);

    // 5. Restore frozen planning results (waste prediction, bin allocations, road bins, pedestrian routes)
    // Live planning pipeline is deliberately bypassed; historical frozen results are used directly.
    setSelectedLocationId(null);
    setPredictionResult(data.prediction || null);
    setBinRecommendations(data.binRecommendations || null);
    setRoadBinRecommendations(data.roadBinRecommendations || null);
    setRouteResult(data.routeResult || null);
    setPlanningError(null);
    setRoutesError(null);
    setIsPlanStale(false);

    // 6. Set historical read-only mode state
    setIsHistoricalView(true);
    setHistoricalEventName(eventItem.name);
    setHistoricalCreatedAt(eventItem.created_at || data.savedAt);
    setHasSavedHistory(true);

    // 7. Navigate directly to Step 3: Plan Dashboard
    setStep1Completed(true);
    setCurrentStep(3);
    setCurrentView('planner');

    setToastMessage(`Loaded historical plan: "${eventItem.name}"`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleExitHistoricalView = () => {
    setIsHistoricalView(false);
    setCurrentView('dashboard');
  };

  const handleLogout = async () => {
    try {
      if (!user?.isGuest && isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('[Bunbetsu Auth] Logout error:', err);
    } finally {
      setUser(null);
      setSavedTemplates([]);
      setRecentEvents([]);
      setCurrentView('auth');
      setCurrentStep(1);
      setSelectedCampus(null);
      setLocations([]);
      setEntryGate(null);
      setSelectedLocationId(null);
      setPredictionResult(null);
      setBinRecommendations(null);
      setRoadBinRecommendations(null);
      setRouteResult(null);
      setPlanningError(null);
      setRoutesError(null);
      setIsPlanStale(false);
      setStep1Completed(false);
      setIsHistoricalView(false);
      setHistoricalEventName(undefined);
      setHistoricalCreatedAt(undefined);
      setHasSavedHistory(false);
    }
  };

  if (isAuthInitializing) {
    return (
      <div className="h-screen w-screen bg-[#F4F7F4] flex flex-col justify-center items-center font-sans select-none">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/bunbetsu-logo.png"
            alt="Bünbetsu"
            className="h-10 w-auto object-contain select-none drop-shadow-xs"
          />
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5A6E62]">
            <div className="w-3.5 h-3.5 border-2 border-[#094120]/30 border-t-[#094120] rounded-full animate-spin" />
            <span>Restoring session...</span>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'auth' || !user) {
    return (
      <AuthPage
        onLoginSuccess={handleLoginSuccess}
        onContinueAsGuest={handleContinueAsGuest}
      />
    );
  }

  if (currentView === 'dashboard') {
    return (
      <DashboardPage
        user={user}
        onStartPlanning={handleStartPlanning}
        onLogout={handleLogout}
        recentEvents={recentEvents}
        savedTemplates={savedTemplates}
        onSelectEvent={handleSelectEvent}
        onSelectTemplate={handleSelectTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        isLoadingTemplates={isLoadingTemplates}
        templatesError={templatesError}
        isLoadingEvents={isLoadingEvents}
        eventsError={eventsError}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F7F9F5] text-[#202820] select-none font-sans relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-[#0D3820] text-white px-3.5 py-2 rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-[#70D000] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Persistent Navbar with Step Indicator */}
      <Navbar
        currentStep={currentStep}
        onStepClick={handleStepClick}
        step1Completed={step1Completed}
        canGoToPlan={canGoToPlan}
        user={user}
        onLogout={handleLogout}
        onGoToDashboard={user?.isGuest ? undefined : () => setCurrentView('dashboard')}
        onResetPlan={() => {
          setLocations([]);
          setSelectedLocationId(null);
          setPredictionResult(null);
          setBinRecommendations(null);
          setRoadBinRecommendations(null);
          setRouteResult(null);
          setPlanningError(null);
          setRoutesError(null);
          setIsPlanStale(false);
          setIsHistoricalView(false);
          setHistoricalEventName(undefined);
          setHistoricalCreatedAt(undefined);
          setHasSavedHistory(false);
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
            onDeleteArea={handleDeleteArea}
            onTriggerPlan={handleTriggerPlan}
            isPredicting={isPlanning}
            predictionError={planningError}
            entryGate={entryGate}
            onSetEntryGate={handleSetEntryGate}
            onSaveTemplate={() => setShowSaveTemplateModal(true)}
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
            roadBinRecommendations={roadBinRecommendations}
            entryGate={entryGate}
            onBackToConfigure={() => setCurrentStep(2)}
            onRecalculatePrediction={executePlan}
            isHistoricalView={isHistoricalView}
            historicalCreatedAt={historicalCreatedAt}
            historicalEventName={historicalEventName}
            onExitHistoricalView={handleExitHistoricalView}
            onSaveHistory={() => setShowSaveHistoryModal(true)}
            hasSavedHistory={hasSavedHistory}
            isGuest={Boolean(user?.isGuest)}
          />
        )}
      </main>

      {/* Save Template Modal */}
      {showSaveTemplateModal && selectedCampus && (
        <SaveTemplateModal
          isOpen={showSaveTemplateModal}
          onClose={() => setShowSaveTemplateModal(false)}
          onSave={handleSaveTemplate}
          campus={selectedCampus}
          locations={locations}
          eventDetails={eventDetails}
          entryGate={entryGate}
          isGuest={Boolean(user?.isGuest)}
        />
      )}

      {/* Save Event History Modal */}
      {showSaveHistoryModal && selectedCampus && (
        <SavePlanModal
          isOpen={showSaveHistoryModal}
          onClose={() => setShowSaveHistoryModal(false)}
          onSave={handleSaveHistory}
          campus={selectedCampus}
          eventDetails={eventDetails}
          locationsCount={locations.length}
          prediction={predictionResult}
          isGuest={Boolean(user?.isGuest)}
        />
      )}
    </div>
  );
}
