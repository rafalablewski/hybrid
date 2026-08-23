import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SPORT_FAVOURITES_KEY,
  normalizeSportFavourites,
  toggleSportFavourite as toggle,
} from "@hybrid/core";

// The sports pinned to Today's Sports board, per device (AsyncStorage) — the
// exercise-favourites store's twin, one file per pin list so neither can grow
// bespoke behaviour. Key, cap and normalizer live in @hybrid/core; cross-device
// sync rides prefs-cross-device-sync with the rest of the per-device
// preferences.

let favourites: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(SPORT_FAVOURITES_KEY)
  .then((v) => {
    if (!v) return;
    try {
      favourites = normalizeSportFavourites(JSON.parse(v));
      emit();
    } catch {
      /* keep the empty list */
    }
  })
  .catch(() => {});

/** Pin / unpin a sport (by SportPage key). Returns its NEW pinned state so the
 *  caller can speak the result (a haptic) without re-reading the store. */
export function toggleSportFavourite(id: string): boolean {
  favourites = toggle(favourites, id);
  AsyncStorage.setItem(SPORT_FAVOURITES_KEY, JSON.stringify(favourites)).catch(() => {});
  emit();
  return favourites.some((f) => f.toLowerCase() === id.trim().toLowerCase());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The pinned sports, in pin order (empty until hydrated). */
export function useSportFavourites(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => favourites,
    () => favourites,
  );
}

/** The pinned sports outside React, for imperative call sites. */
export function getSportFavourites(): string[] {
  return favourites;
}
