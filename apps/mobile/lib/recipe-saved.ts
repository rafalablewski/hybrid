import { RECIPE_SAVED_STORAGE_KEY, normalizeSavedRecipes, toggleSavedRecipe } from "@hybrid/core";
import { getPref, prefsHydrated, setPref, useSyncedPref } from "./synced-prefs";

/**
 * SAVED LIBRARY RECIPES (mobile) — the athlete's own shelf of the curated ones.
 *
 * The shape, the storage key and the pruning rule are @hybrid/core's
 * (recipes.ts), so what a "saved recipe" IS is answered once. This file only
 * binds that to the store.
 *
 * IT FOLLOWS THE ACCOUNT NOW. This file used to argue the opposite — that a
 * device-held id list was the whole feature, since a saved library recipe
 * points at editorial content shipped inside the binary, with no row to own it
 * and nothing to resolve — and it named the cost honestly: it did not follow
 * you to a second device, traded against a migration nobody wanted to run for
 * a list of ids. Aug 2026 made that trade obsolete: the shelf rides the shared
 * synced-prefs path (lib/synced-prefs.ts → /api/prefs) with every other
 * per-account setting, so the migration is written once rather than per store.
 *
 * It still differs from saved POSTS (lib/feed-actions.ts), and the distinction
 * is worth keeping straight: a post is a ROW with an author and privacy to
 * re-check, so it owns a table and a reconcile policy. A library recipe is an
 * id pointing at content that ships in the app, so a synced key is enough.
 *
 * A corrupt blob degrades to "nothing saved" rather than to a broken screen,
 * and an id from an older build is pruned by core on read — a recipe that no
 * longer exists must leave a SHORTER shelf, never a blank row on it.
 */

/** The saved ids, newest first. Empty until the cache answers (one frame). */
export function useSavedRecipeIds(): string[] {
  return useSyncedPref(RECIPE_SAVED_STORAGE_KEY, normalizeSavedRecipes);
}

/** Save or unsave one recipe. Returns the NEW saved state, so the caller can
 *  report which way it went without re-reading the store a frame later. */
export function toggleSavedRecipeId(id: string): boolean {
  const next = toggleSavedRecipe(normalizeSavedRecipes(getPref<unknown>(RECIPE_SAVED_STORAGE_KEY, [])), id);
  setPref(RECIPE_SAVED_STORAGE_KEY, next);
  return next.includes(id);
}

/** Whether the store has answered yet — so a shelf can stay absent for the
 *  first frame instead of flashing "nothing saved" at someone who has. */
export const savedRecipesLoaded = (): boolean => prefsHydrated();
