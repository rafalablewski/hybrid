import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EXERCISE_FAVOURITES_KEY,
  normalizeExerciseFavourites,
  toggleExerciseFavourite as toggle,
} from "@hybrid/core";

// The movements pinned to the Exercises rail, per device (AsyncStorage). Shares
// the key, the cap and the normalizer with the web twin
// (apps/web/lib/exercise-favourites.ts) via @hybrid/core, so a pin means the
// same thing on both clients. Cross-device sync rides prefs-cross-device-sync
// with the rest of the per-device preferences.

let favourites: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(EXERCISE_FAVOURITES_KEY)
  .then((v) => {
    if (!v) return;
    try {
      favourites = normalizeExerciseFavourites(JSON.parse(v));
      emit();
    } catch {
      /* keep the empty list */
    }
  })
  .catch(() => {});

/** Pin / unpin a movement. Returns its NEW pinned state so the caller can
 *  speak the result (a haptic, a toast) without re-reading the store. */
export function toggleExerciseFavourite(name: string): boolean {
  favourites = toggle(favourites, name);
  AsyncStorage.setItem(EXERCISE_FAVOURITES_KEY, JSON.stringify(favourites)).catch(() => {});
  emit();
  return favourites.some((f) => f.toLowerCase() === name.trim().toLowerCase());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The pinned movements, in pin order (empty until hydrated). */
export function useExerciseFavourites(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => favourites,
    () => favourites,
  );
}

/** The pinned movements outside React, for imperative call sites. */
export function getExerciseFavourites(): string[] {
  return favourites;
}
