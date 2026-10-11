import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  SavedTemplateData,
  SavedTemplateRecord,
  Campus,
  CampusLocation,
  EventDetails,
  EntryGate,
} from '../types/bunbetsu';

export interface SaveTemplateParams {
  name: string;
  templateData: SavedTemplateData;
}

/**
 * Validates that an arbitrary JSON object conforms to the SavedTemplateData structure.
 * Protects against malformed snapshots or corrupt data.
 */
export function validateTemplateData(raw: any): {
  valid: boolean;
  error?: string;
  data?: SavedTemplateData;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Template data is not a valid object.' };
  }

  // 1. Validate Campus
  if (!raw.campus || typeof raw.campus !== 'object') {
    return { valid: false, error: 'Template is missing campus details.' };
  }
  if (!raw.campus.id || typeof raw.campus.name !== 'string') {
    return { valid: false, error: 'Template campus data has invalid id or name.' };
  }
  if (!Array.isArray(raw.campus.center) || raw.campus.center.length < 2) {
    return { valid: false, error: 'Template campus data has invalid center coordinates.' };
  }

  // 2. Validate Event Details
  if (!raw.eventDetails || typeof raw.eventDetails !== 'object') {
    return { valid: false, error: 'Template is missing event details.' };
  }
  const eventDetails: EventDetails = {
    festName: typeof raw.eventDetails.festName === 'string' ? raw.eventDetails.festName : '',
    durationDays: typeof raw.eventDetails.durationDays === 'number' && raw.eventDetails.durationDays > 0
      ? raw.eventDetails.durationDays
      : 1,
    expectedFootfall: typeof raw.eventDetails.expectedFootfall === 'number' && raw.eventDetails.expectedFootfall >= 0
      ? raw.eventDetails.expectedFootfall
      : 0,
    startDate: raw.eventDetails.startDate,
    endDate: raw.eventDetails.endDate,
  };

  // 3. Validate Active Locations
  if (!Array.isArray(raw.locations)) {
    return { valid: false, error: 'Template locations must be an array.' };
  }

  for (const loc of raw.locations) {
    if (!loc || typeof loc !== 'object' || !loc.id || !loc.name) {
      return { valid: false, error: 'Template contains an invalid location entry.' };
    }
    if (!Array.isArray(loc.activities)) {
      return { valid: false, error: `Location "${loc.name}" has invalid activities.` };
    }
    if (!loc.geometry || typeof loc.geometry !== 'object') {
      return { valid: false, error: `Location "${loc.name}" is missing geometry.` };
    }
  }

  // 4. Validate Location Pool (fallback to defaultLocations or active locations if missing in legacy snapshot)
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

  const validData: SavedTemplateData = {
    schema_version: typeof raw.schema_version === 'number' ? raw.schema_version : 1,
    campus: raw.campus as Campus,
    allCampusLocations,
    locations: raw.locations as CampusLocation[],
    eventDetails,
    entryGate,
  };

  return { valid: true, data: validData };
}

/**
 * Saves a new template to public.saved_templates.
 * Verifies authenticated session directly from Supabase; rejects guest users.
 */
export async function saveTemplate(params: SaveTemplateParams): Promise<SavedTemplateRecord> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('Template name cannot be empty.');
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Please set your Supabase credentials in .env.');
  }

  // Obtain the authenticated user from the active Supabase session (security boundary)
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required: please log in to save templates.');
  }

  const validation = validateTemplateData(params.templateData);
  if (!validation.valid || !validation.data) {
    throw new Error(`Invalid template configuration: ${validation.error}`);
  }

  const { data, error } = await supabase
    .from('saved_templates')
    .insert({
      user_id: user.id,
      name: trimmedName,
      template_data: validation.data,
      updated_at: new Date().toISOString(),
    })
    .select('id, user_id, name, template_data, created_at, updated_at')
    .single();

  if (error) {
    console.error('[Bunbetsu] Error inserting saved_template:', error);
    throw new Error(error.message || 'Failed to save template to database.');
  }

  return data as SavedTemplateRecord;
}

/**
 * Fetches all saved templates belonging to the authenticated user, ordered by updated_at descending.
 * Returns empty array if unauthenticated or Supabase is unconfigured.
 */
export async function listSavedTemplates(): Promise<SavedTemplateRecord[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from('saved_templates')
    .select('id, user_id, name, template_data, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[Bunbetsu] Error querying saved_templates:', error);
    throw new Error(error.message || 'Failed to retrieve saved templates.');
  }

  return (data as SavedTemplateRecord[]) || [];
}

/**
 * Deletes a template record by ID.
 * Database RLS ensures users can only delete their own templates.
 */
export async function deleteSavedTemplate(templateId: string): Promise<void> {
  if (!templateId) return;

  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required: please log in.');
  }

  const { error } = await supabase
    .from('saved_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    console.error('[Bunbetsu] Error deleting saved_template:', error);
    throw new Error(error.message || 'Failed to delete template.');
  }
}

/**
 * Renames an existing template.
 */
export async function renameSavedTemplate(
  templateId: string,
  newName: string
): Promise<SavedTemplateRecord> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Template name cannot be empty.');
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required: please log in.');
  }

  const { data, error } = await supabase
    .from('saved_templates')
    .update({
      name: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .select('id, user_id, name, template_data, created_at, updated_at')
    .single();

  if (error) {
    console.error('[Bunbetsu] Error updating saved_template:', error);
    throw new Error(error.message || 'Failed to rename template.');
  }

  return data as SavedTemplateRecord;
}

