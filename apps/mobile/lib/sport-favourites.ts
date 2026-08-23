import {
  SPORT_FAVOURITES_KEY,
  normalizeSportFavourites,
  toggleSportFavourite as toggle,
} from "@hybrid/core";
import { getPref, setPref, useSyncedPref } from "./synced-prefs";

// The sports pinned to Today's Sports board — the exercise-favourites store's
// twin, one file per pin list so neither can grow bespoke behaviour.
//
// SYNCED, NOT PER-DEVICE, since Aug 2026 (lib/synced-prefs.ts → /api/prefs).
// The device keeps a cache for first paint and for offline; the account is the
// record. Key, cap and normalizer stay in @hybrid/core.

/** Pin / unpin a sport (by SportPage key). Returns its NEW pinned state so the
 *  caller can speak the result (a haptic) without re-reading the store. */
export function toggleSportFavourite(id: string): boolean {
  const next = toggle(getSportFavourites(), id);
  setPref(SPORT_FAVOURITES_KEY, next);
  return next.some((f) => f.toLowerCase() === id.trim().toLowerCase());
}

/** The pinned sports, in pin order (empty until hydrated). */
export function useSportFavourites(): string[] {
  return useSyncedPref(SPORT_FAVOURITES_KEY, normalizeSportFavourites);
}

/** The pinned sports outside React, for imperative call sites. */
export function getSportFavourites(): string[] {
  return normalizeSportFavourites(getPref<unknown>(SPORT_FAVOURITES_KEY, []));
}
