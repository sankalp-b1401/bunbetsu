import { createClient, type User } from "@supabase/supabase-js";
import type { AuthUser } from "../types/bunbetsu";

// Read public credentials from environment variables (safe across Vite and Node test runners)
const metaEnv = (import.meta as any).env || (typeof process !== "undefined" ? process.env : {});
const supabaseUrl = (metaEnv?.VITE_SUPABASE_URL || "").trim();
const supabasePublishableKey = (
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv?.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

// Check if credentials are properly configured (non-empty and not placeholders)
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.includes("your-project") &&
  !supabasePublishableKey.includes("your-supabase-publishable-key"),
);

// Fallback safe values for offline/test environments to prevent runtime crashes upon import
const safeUrl = isSupabaseConfigured
  ? supabaseUrl
  : "https://placeholder-project.supabase.co";
const safeKey = isSupabaseConfigured
  ? supabasePublishableKey
  : "placeholder-anon-key";

/**
 * Shared Supabase Client
 * Uses publishable/anon key only. NEVER expose service-role key in frontend code.
 */
export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface UserProfileRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Retrieves the matching row from the `profiles` table for a given user ID.
 * Returns null if the profile does not exist, table has not been applied, or if an error occurs.
 * Note: Role is intentionally not queried from profiles.
 */
export async function fetchUserProfile(
  userId: string,
): Promise<UserProfileRow | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[Bunbetsu Auth] Could not fetch profile row:",
        error.message,
      );
      return null;
    }

    return (data as UserProfileRow) || null;
  } catch (err) {
    console.warn("[Bunbetsu Auth] Unexpected error fetching profile:", err);
    return null;
  }
}

/**
 * Constructs the user display name from first_name and last_name.
 * If names are absent, gracefully falls back without inventing an identity.
 */
export function constructDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  metadataFullName?: string | null,
  email?: string | null,
): string {
  const nameParts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  if (metadataFullName && metadataFullName.trim()) {
    return metadataFullName.trim();
  }

  if (email && email.trim()) {
    const localPart = email.split("@")[0];
    if (localPart) {
      return localPart
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
  }

  return "User";
}

/**
 * Maps a Supabase user and their database profile row to the frontend AuthUser contract.
 * Does not add a role column or invent user identities.
 */
export async function buildAuthUserFromSession(
  user:
    | (
        | User
        | {
            id: string;
            email?: string | null;
            user_metadata?: Record<string, any>;
          }
      )
    | null
    | undefined,
): Promise<AuthUser | null> {
  if (!user) return null;

  // Retrieve matching profiles row
  const profile = await fetchUserProfile(user.id);

  const firstName =
    profile?.first_name ??
    user.user_metadata?.first_name ??
    user.user_metadata?.given_name ??
    null;
  const lastName =
    profile?.last_name ??
    user.user_metadata?.last_name ??
    user.user_metadata?.family_name ??
    null;
  const metaFullName =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

  const displayName = constructDisplayName(
    firstName,
    lastName,
    metaFullName,
    user.email,
  );

  return {
    id: user.id,
    name: displayName,
    email: user.email || "",
    isGuest: false,
  };
}
