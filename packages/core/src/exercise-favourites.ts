// Exercise-rail FAVOURITES — the movements an athlete has pinned to the
// Exercises rail (Today on both clients). The rail auto-fills one card per
// purpose from the log, which is a good guess and nothing more: the lift you
// are actually chasing this block is a choice, not a frequency count. Pinning
// makes that choice, and the pinned names lead the rail in pin order.
//
// Pure data + a normalizer, like logger-prefs: each client persists the list
// per-device (localStorage / AsyncStorage) and reads it through a small store,
// so web and mobile can never disagree about what a favourite is. Cross-device
// sync rides the `prefs-cross-device-sync` capability with the rest of them.

/** Storage key — the same on both clients. */
export const EXERCISE_FAVOURITES_KEY = "hybrid.exerciseFavourites";

/**
 * How many movements may be pinned. A rail is a SELECTION; past a handful the
 * pins stop being a choice and become a second copy of the exercises list —
 * which is what "See all" is for.
 */
export const MAX_EXERCISE_FAVOURITES = 8;

/** Case-insensitive identity — "Back Squat" and "back squat" are one pin. */
const key = (name: string): string => name.trim().toLowerCase();

/**
 * Merge an untrusted stored value into a clean pin list: strings only, trimmed,
 * blanks dropped, de-duplicated case-insensitively (first spelling wins) and
 * capped. A corrupt or older persisted value can never break the rail.
 */
export function normalizeExerciseFavourites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const name = v.trim();
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    out.push(name);
    if (out.length >= MAX_EXERCISE_FAVOURITES) break;
  }
  return out;
}

/** Is this movement pinned? */
export function isExerciseFavourite(list: readonly string[], name: string): boolean {
  return list.some((f) => key(f) === key(name));
}

/** The pin list is full — further pins are refused until one is removed. */
export function exerciseFavouritesFull(list: readonly string[]): boolean {
  return list.length >= MAX_EXERCISE_FAVOURITES;
}

/**
 * Pin / unpin, returning a NEW list. A new pin appends, so the rail's order is
 * the order they were chosen. At the cap the list comes back unchanged — a tap
 * must never silently unpin something the athlete chose earlier; the UI says
 * the cap is reached instead.
 */
export function toggleExerciseFavourite(list: readonly string[], name: string): string[] {
  const clean = name.trim();
  if (!clean) return [...list];
  if (isExerciseFavourite(list, clean)) return list.filter((f) => key(f) !== key(clean));
  if (exerciseFavouritesFull(list)) return [...list];
  return normalizeExerciseFavourites([...list, clean]);
}
