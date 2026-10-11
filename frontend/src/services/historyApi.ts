import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  EventHistorySnapshot,
  EventHistoryRecord,
  Campus,
  CampusLocation,
  EventDetails,
  EntryGate,
  PredictionResult,
  BinRecommendationResult,
  RoadBinRecommendationResult,
  RoutePlanResult,
  CampusPlanDiagnostics,
} from '../types/bunbetsu';

export interface SaveEventHistoryParams {
  eventName: string;
  campusName: string;
  templateName?: string | null;
  snapshot: EventHistorySnapshot;
}

/**
 * Validates that an arbitrary JSON object conforms to the EventHistorySnapshot structure.
 * Protects against malformed snapshots, missing fields, or corrupted historical data.
 */
export function validateEventSnapshot(raw: any): {
  valid: boolean;
  error?: string;
  data?: EventHistorySnapshot;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Event snapshot is not a valid object.' };
  }

  // 1. Validate Campus
  if (!raw.campus || typeof raw.campus !== 'object') {
    return { valid: false, error: 'Snapshot is missing campus details.' };
  }
  if (!raw.campus.id || typeof raw.campus.name !== 'string') {
    return { valid: false, error: 'Snapshot campus data has invalid id or name.' };
  }
  if (!Array.isArray(raw.campus.center) || raw.campus.center.length < 2) {
    return { valid: false, error: 'Snapshot campus data has invalid center coordinates.' };
  }

  // 2. Validate Event Details
  if (!raw.eventDetails || typeof raw.eventDetails !== 'object') {
    return { valid: false, error: 'Snapshot is missing event details.' };
  }
  const eventDetails: EventDetails = {
    festName: typeof raw.eventDetails.festName === 'string' ? raw.eventDetails.festName : '',
    durationDays:
      typeof raw.eventDetails.durationDays === 'number' && raw.eventDetails.durationDays > 0
        ? raw.eventDetails.durationDays
        : 1,
    expectedFootfall:
      typeof raw.eventDetails.expectedFootfall === 'number' && raw.eventDetails.expectedFootfall >= 0
        ? raw.eventDetails.expectedFootfall
        : 0,
    startDate: raw.eventDetails.startDate,
    endDate: raw.eventDetails.endDate,
  };

  // 3. Validate Locations
  if (!Array.isArray(raw.locations)) {
    return { valid: false, error: 'Snapshot locations must be an array.' };
  }
  for (const loc of raw.locations) {
    if (!loc || typeof loc !== 'object' || !loc.id || !loc.name) {
      return { valid: false, error: 'Snapshot contains an invalid location entry.' };
    }
    if (!Array.isArray(loc.activities)) {
      return { valid: false, error: `Location "${loc.name}" has invalid activities.` };
    }
    if (!loc.geometry || typeof loc.geometry !== 'object') {
      return { valid: false, error: `Location "${loc.name}" is missing geometry.` };
    }
  }

  // 4. Validate Location Pool (fallback if absent)
  const allCampusLocations: CampusLocation[] = Array.isArray(raw.allCampusLocations)
    ? raw.allCampusLocations
    : Array.isArray(raw.campus.defaultLocations)
    ? raw.campus.defaultLocations
    : raw.locations;

  // 5. Validate Entry Gate (nullable)
  let entryGate: EntryGate | null = null;
  if (raw.entryGate && typeof raw.entryGate === 'object') {
    if (
      raw.entryGate.id &&
      Array.isArray(raw.entryGate.coordinates) &&
      raw.entryGate.coordinates.length === 2
    ) {
      entryGate = {
        id: String(raw.entryGate.id),
        name: String(raw.entryGate.name || 'Campus Gate'),
        coordinates: [
          Number(raw.entryGate.coordinates[0]),
          Number(raw.entryGate.coordinates[1]),
        ],
      };
    }
  }

  // 6. Validate Prediction Result (nullable/optional)
  const prediction: PredictionResult | null =
    raw.prediction && typeof raw.prediction === 'object' ? (raw.prediction as PredictionResult) : null;

  // 7. Validate Bin Recommendations (nullable/optional)
  const binRecommendations: BinRecommendationResult | null =
    raw.binRecommendations && typeof raw.binRecommendations === 'object'
      ? (raw.binRecommendations as BinRecommendationResult)
      : null;

  // 8. Validate Road Bin Recommendations (nullable/optional)
  const roadBinRecommendations: RoadBinRecommendationResult | null =
    raw.roadBinRecommendations && typeof raw.roadBinRecommendations === 'object'
      ? (raw.roadBinRecommendations as RoadBinRecommendationResult)
      : null;

  // 9. Validate Route Plan Result (nullable/optional)
  const routeResult: RoutePlanResult | null =
    raw.routeResult && typeof raw.routeResult === 'object'
      ? (raw.routeResult as RoutePlanResult)
      : null;

  // 10. Validate Diagnostics (nullable/optional)
  const diagnostics: CampusPlanDiagnostics | null =
    raw.diagnostics && typeof raw.diagnostics === 'object'
      ? (raw.diagnostics as CampusPlanDiagnostics)
      : null;

  const validSnapshot: EventHistorySnapshot = {
    schema_version: typeof raw.schema_version === 'number' ? raw.schema_version : 1,
    campus: raw.campus as Campus,
    allCampusLocations,
    locations: raw.locations as CampusLocation[],
    eventDetails,
    entryGate,
    prediction,
    binRecommendations,
    roadBinRecommendations,
    routeResult,
    diagnostics,
    templateName: typeof raw.templateName === 'string' ? raw.templateName : null,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
  };

  return { valid: true, data: validSnapshot };
}

/**
 * Saves a new completed event plan into public.event_history.
 * Enforces authenticated Supabase session directly; rejects guests.
 * Note: Table RLS permits read and insert only. No updates or deletes.
 */
export async function saveEventHistory(params: SaveEventHistoryParams): Promise<EventHistoryRecord> {
  const trimmedName = params.eventName.trim();
  if (!trimmedName) {
    throw new Error('Event name cannot be empty.');
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Please set your Supabase credentials in .env.');
  }

  // Obtain authenticated user from the active Supabase session (security boundary)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Authentication required: please log in to save event history.');
  }

  const validation = validateEventSnapshot(params.snapshot);
  if (!validation.valid || !validation.data) {
    throw new Error(`Invalid event snapshot: ${validation.error}`);
  }

  const campusName = (params.campusName || validation.data.campus.name || '').trim();

  const { data, error } = await supabase
    .from('event_history')
    .insert({
      user_id: user.id,
      event_name: trimmedName,
      campus_name: campusName,
      template_name: params.templateName ? params.templateName.trim() : null,
      event_snapshot: validation.data,
    })
    .select('id, user_id, event_name, campus_name, template_name, event_snapshot, created_at')
    .single();

  if (error) {
    console.error('[Bunbetsu] Error inserting event_history:', error);
    throw new Error(error.message || 'Failed to save event history to database.');
  }

  return data as EventHistoryRecord;
}

/**
 * Fetches all event history records belonging to the authenticated user, ordered by created_at descending.
 * Returns empty array if unauthenticated or Supabase is unconfigured.
 */
export async function listEventHistory(): Promise<EventHistoryRecord[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from('event_history')
    .select('id, user_id, event_name, campus_name, template_name, event_snapshot, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Bunbetsu] Error querying event_history:', error);
    throw new Error(error.message || 'Failed to retrieve event history.');
  }

  return (data as EventHistoryRecord[]) || [];
}

