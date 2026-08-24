// SYNCED PREFERENCES — the per-user settings that follow the account rather
// than the phone.
//
// Everything here used to live ONLY in localStorage / AsyncStorage, which meant
// a reinstall or a second device started blank: your pinned lifts, your units,
// your rest days, the sports you watch. The training data was always on the
// server; the choices about how to READ it were not. This module is the single
// registry of which keys sync, and the sanitiser both ends run.
//
// WHAT DOES **NOT** BELONG HERE, and the list is as load-bearing as the one
// below, because a key added here by mistake breaks something that only works
// per-device:
//   • the auth session (`sb-*`) and the guest device id — the device IS the
//     identity before there is an account to sync to;
//   • the language choice — it renders the login screen, before any user;
//   • the minimised workout draft — a live session must survive a crash and a
//     gym with no signal, which a network round-trip cannot promise;
//   • push permission state and the HealthKit cursors — both describe THIS
//     device's relationship to the OS, and are meaningless on another one;
//   • hand-off flags between two screens of one flow (`pendingTour`,
//     `pendingPlanSession`) — transient, not preferences;
//   • the recovery reminder's stored id — it names a notification scheduled
//     with THIS device's OS, and another phone could not cancel it;
//   • saved posts. They look like they belong here and they do not: they
//     already sync through a table of their own (SavedPost, /api/social/saved/
//     sync) with a reconcile policy core feed-actions.ts owns. Adding them
//     would create a SECOND server-side answer for one question, which is the
//     parallel-implementation fault this codebase keeps having to undo. The
//     nutrition onboarding flag is out for the same reason: it already mirrors
//     `onboardedAt` from /api/nutrition/prefs.
//
// THE STORE IS A JSONB COLUMN, MERGED PER KEY (reference/sql-user-prefs.sql).
// A whole-blob write would let two devices clobber each other: the phone
// changing units and the iPad changing the Today range would each write the map
// they loaded, and the later write would silently drop the other's change. The
// server merges with jsonb `||` so a patch only ever touches the keys it names.

/** The storage key each client uses for its local CACHE of the synced map. */
export const SYNCED_PREFS_CACHE_KEY = "hybrid.syncedPrefs.v1";

/**
 * Every key that syncs, with the reason it qualifies. An ALLOWLIST rather than
 * "anything the client sends", so a stray write cannot bloat the row, and so
 * this file stays the one place that answers "does this follow me?".
 *
 * Adding a key here is the whole migration: the client store reads and writes
 * through it, and the server accepts it.
 */
export const SYNCED_PREF_KEYS = [
  // ── the choices an athlete makes about their own screens ──────────────
  "hybrid.exerciseFavourites",      // Records watchlist pins
  "hybrid.sportFavourites",         // Sports watchlist pins
  "hybrid.loggerPrefs",             // units + logger behaviour
  "hybrid.today.range",             // the Progress cluster's period
  "hybrid.restDays.v1",             // which days are rest days
  "hybrid.dayBand.rejected.v1",     // day-band cards dismissed for good
  "hybrid.nutrition.savedRecipes.v1",
  "hybrid.searchMisses",            // what search failed to find — feeds the catalog
  // ── where a screen was left ───────────────────────────────────────────
  "hybrid.sport",                   // the sport last opened
  "hybrid.nutrition.favorites",
  "hybrid.nutrition.recent",
  // ── one-shot flags: seen once, seen everywhere ────────────────────────
  // These sync deliberately. A tour you have taken and a hint you have read
  // are facts about YOU, not about a handset, and re-teaching the app to
  // someone on their second device is the whole complaint this fixes.
  "hybrid.tourSeen",
  "hybrid.today.actHinted",
  "hybrid.workoutTipSeen",
  "hybrid.announce.dismissed",
] as const;

export type SyncedPrefKey = (typeof SYNCED_PREF_KEYS)[number];

const KEY_SET: ReadonlySet<string> = new Set(SYNCED_PREF_KEYS);

/** Is this a key the account is willing to carry? */
export const isSyncedPrefKey = (key: string): key is SyncedPrefKey => KEY_SET.has(key);

/** Ceiling on ONE value's serialised size. Generous for a pin list or a prefs
 *  object, far under anything that would bloat the row. */
export const SYNCED_PREF_MAX_VALUE_BYTES = 8 * 1024;

/**
 * Keep only recognised keys carrying storable values, and drop anything past
 * the size ceiling. Runs on the SERVER (never trust a client) and again on the
 * client when reading its cache back, so a corrupt local blob can no more break
 * the app than a bad payload can bloat the row — the same contract
 * `normalizeExerciseFavourites` has for one list, applied to the whole map.
 *
 * `null` is preserved rather than dropped: it is how a client says "forget
 * this key", and the server turns it into a removal.
 */
export function sanitizeSyncedPrefs(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSyncedPrefKey(key)) continue;
    if (value === undefined) continue;
    if (value === null) { out[key] = null; continue; }
    let size = 0;
    try {
      size = JSON.stringify(value).length;
    } catch {
      continue; // circular or otherwise unserialisable
    }
    if (size > SYNCED_PREF_MAX_VALUE_BYTES) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Fold the server's map over the local cache for the FIRST read after sign-in.
 *
 * THE SERVER WINS WHERE IT HAS SPOKEN; local survives where it has not. That
 * asymmetry is what makes an upgrade lossless: an athlete who has been using
 * the app for months has pins and units on the device and nothing on the
 * server, and those must travel UP rather than be erased by an empty account.
 * `pending` names exactly the keys that need pushing back.
 */
export function reconcileSyncedPrefs(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): { merged: Record<string, unknown>; pending: Record<string, unknown> } {
  const merged: Record<string, unknown> = { ...sanitizeSyncedPrefs(local) };
  const pending: Record<string, unknown> = {};
  const clean = sanitizeSyncedPrefs(server);
  for (const key of Object.keys(merged)) {
    if (!(key in clean)) pending[key] = merged[key];
  }
  for (const [key, value] of Object.entries(clean)) {
    if (value === null) continue;
    merged[key] = value;
  }
  return { merged, pending };
}
