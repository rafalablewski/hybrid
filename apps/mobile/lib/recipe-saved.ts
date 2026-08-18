import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RECIPE_SAVED_STORAGE_KEY, normalizeSavedRecipes, toggleSavedRecipe } from "@hybrid/core";

/**
 * SAVED LIBRARY RECIPES (mobile) — the athlete's own shelf of the curated ones.
 *
 * The shape, the storage key and the pruning rule are @hybrid/core's
 * (recipes.ts), so what a "saved recipe" IS is answered once. This file is the
 * device copy and nothing else.
 *
 * THE DEVICE COPY IS THE COPY, and that is the difference from saved POSTS
 * (lib/feed-actions.ts), which reconcile against a server table. A saved
 * library recipe points at editorial content that ships inside the binary —
 * there is no row to own it, no privacy to re-check at read time, and nothing
 * to resolve — so a device-held id list is the whole feature. Following the
 * athlete to a second device is the only thing it costs, and that is a
 * deliberate trade against a migration this sandbox cannot even run: see
 * `nutrition-recipe-save` in capabilities.ts.
 *
 * A corrupt blob degrades to "nothing saved" rather than to a broken screen,
 * and an id from an older build is pruned by core on read — a recipe that no
 * longer exists must leave a SHORTER shelf, never a blank row on it.
 */

let ids: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(RECIPE_SAVED_STORAGE_KEY)
  .then((v) => {
    loaded = true;
    if (!v) return;
    try {
      ids = normalizeSavedRecipes(JSON.parse(v));
      emit();
    } catch {
      /* a corrupt blob is an empty shelf, never a crash */
    }
  })
  .catch(() => { loaded = true; });

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => ids;

/** The saved ids, newest first. Empty until AsyncStorage answers (one frame). */
export function useSavedRecipeIds(): string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Save or unsave one recipe. Returns the NEW saved state, so the caller can
 *  report which way it went without re-reading the store a frame later. */
export function toggleSavedRecipeId(id: string): boolean {
  const next = toggleSavedRecipe(ids, id);
  ids = next;
  AsyncStorage.setItem(RECIPE_SAVED_STORAGE_KEY, JSON.stringify(ids)).catch(() => {
    /* a lost write costs this one toggle, never the UI's answer to the press */
  });
  emit();
  return next.includes(id);
}

/** Whether the store has answered yet — so a shelf can stay absent for the
 *  first frame instead of flashing "nothing saved" at someone who has. */
export const savedRecipesLoaded = (): boolean => loaded;
