import {
  EXERCISE_FAVOURITES_KEY,
  normalizeExerciseFavourites,
  toggleExerciseFavourite as toggle,
} from "@hybrid/core";
import { getPref, setPref, useSyncedPref } from "./synced-prefs";

// The movements pinned to the Records watchlist and the Exercises rail.
//
// SYNCED, NOT PER-DEVICE, since Aug 2026: these travel with the ACCOUNT
// (lib/synced-prefs.ts → /api/prefs), so a reinstall or a second phone arrives
// with your pins already set. The device keeps a cache, so this still paints
// instantly and works offline; it is simply no longer the only copy.
//
// The key, the cap and the normalizer still live in @hybrid/core, so a pin
// means the same thing wherever it is read.

/** Pin / unpin a movement. Returns its NEW pinned state so the caller can
 *  speak the result (a haptic, a toast) without re-reading the store. */
export function toggleExerciseFavourite(name: string): boolean {
  const next = toggle(getExerciseFavourites(), name);
  setPref(EXERCISE_FAVOURITES_KEY, next);
  return next.some((f) => f.toLowerCase() === name.trim().toLowerCase());
}

/** The pinned movements, in pin order (empty until hydrated). */
export function useExerciseFavourites(): string[] {
  return useSyncedPref(EXERCISE_FAVOURITES_KEY, normalizeExerciseFavourites);
}

/** The pinned movements outside React, for imperative call sites. */
export function getExerciseFavourites(): string[] {
  return normalizeExerciseFavourites(getPref<unknown>(EXERCISE_FAVOURITES_KEY, []));
}
