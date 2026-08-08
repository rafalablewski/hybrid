"use client";

import { useSyncExternalStore } from "react";
import {
  EXERCISE_FAVOURITES_KEY,
  normalizeExerciseFavourites,
  toggleExerciseFavourite as toggle,
} from "@hybrid/core";

// The movements pinned to the Exercises rail, per device (localStorage). Shares
// the key, the cap and the normalizer with mobile's twin
// (apps/mobile/lib/exercise-favourites.ts) via @hybrid/core, so a pin means the
// same thing on both clients. Cross-device sync rides prefs-cross-device-sync
// with the rest of the per-device preferences.

const EMPTY: string[] = [];

let favourites: string[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(EXERCISE_FAVOURITES_KEY);
    if (raw) favourites = normalizeExerciseFavourites(JSON.parse(raw));
  } catch {
    /* keep the empty list */
  }
}

/** Pin / unpin a movement. Returns its NEW pinned state so the caller can
 *  speak the result (a toast, a haptic) without re-reading the store. */
export function toggleExerciseFavourite(name: string): boolean {
  hydrate();
  favourites = toggle(favourites, name);
  try {
    window.localStorage.setItem(EXERCISE_FAVOURITES_KEY, JSON.stringify(favourites));
  } catch {
    /* ignore */
  }
  emit();
  return favourites.some((f) => f.toLowerCase() === name.trim().toLowerCase());
}

function subscribe(l: () => void): () => void {
  hydrate();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The pinned movements, in pin order. Server render sees none; the client
 *  hydrates (the same identity is returned every time, so React can bail out). */
export function useExerciseFavourites(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => favourites,
    () => EMPTY,
  );
}

/** The pinned movements outside React, for imperative call sites. */
export function getExerciseFavourites(): string[] {
  hydrate();
  return favourites;
}
