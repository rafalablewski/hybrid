import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server code ONLY (never expose the
 * key to the browser). Used to write auth `user_metadata` — e.g. mirroring the
 * billing entitlement so both clients read it straight from their session.
 *
 * Returns null when the service-role key isn't configured, so callers degrade
 * gracefully instead of throwing (the DB stays the source of truth regardless).
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Merge a patch into a user's auth `user_metadata` (Supabase replaces the whole
 * object on update, so we read-merge-write to avoid clobbering role/name/etc.).
 * No-op when the admin client or authId is unavailable.
 */
export async function patchUserMetadata(
  authId: string | null | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !authId) return;
  try {
    const { data, error } = await admin.auth.admin.getUserById(authId);
    // Bail if we couldn't read the user — updating with an empty `current`
    // would clobber existing metadata (name/role/provider/…).
    if (error || !data?.user) {
      console.error("[supabase] patchUserMetadata: could not read user", error);
      return;
    }
    const current = data.user.user_metadata ?? {};
    const { error: updateError } = await admin.auth.admin.updateUserById(authId, {
      user_metadata: { ...current, ...patch },
    });
    if (updateError) console.error("[supabase] patchUserMetadata: update failed", updateError);
  } catch (e) {
    console.error("[supabase] patchUserMetadata: exception", e);
  }
}

/**
 * Merge a patch into a user's auth `app_metadata` — the SERVER-CONTROLLED claim
 * bag. Unlike `user_metadata` (which the end user can rewrite via
 * `supabase.auth.updateUser({ data })`), `app_metadata` can only be written with
 * the service-role key, so it is safe to mirror trust-bearing values like the
 * billing entitlement here. Read-merge-write to avoid clobbering `provider` etc.
 * No-op when the admin client or authId is unavailable.
 */
export async function patchUserAppMetadata(
  authId: string | null | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin || !authId) return;
  try {
    const { data, error } = await admin.auth.admin.getUserById(authId);
    if (error || !data?.user) {
      console.error("[supabase] patchUserAppMetadata: could not read user", error);
      return;
    }
    const current = data.user.app_metadata ?? {};
    const { error: updateError } = await admin.auth.admin.updateUserById(authId, {
      app_metadata: { ...current, ...patch },
    });
    if (updateError) console.error("[supabase] patchUserAppMetadata: update failed", updateError);
  } catch (e) {
    console.error("[supabase] patchUserAppMetadata: exception", e);
  }
}
