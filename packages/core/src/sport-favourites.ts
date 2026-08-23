// Sport FAVOURITES — the sports an athlete has pinned to the Sports board
// (Today's Progress cluster, mobile). The board is a WATCHLIST: it renders
// pinned sports and nothing else — no auto-fill, because the retired
// retrospective (today-retrospective-reduced) established that a guessed
// selection on Today grows until the page stops being about today. A pin is
// the athlete saying "this one I'm watching".
//
// Same shape as exercise-favourites.ts on purpose: pure data + a normalizer;
// each client persists per-device (AsyncStorage on mobile) and reads through a
// small store. Cross-device sync rides `prefs-cross-device-sync` with the rest
// of the per-device preferences.
//
// A favourite is a SportPage KEY (`d:running` for an endurance discipline,
// `s:Tennis` for a named sport) — the same identity sport-pages.ts already
// keys its pager on, so the board and the pager can never disagree about what
// a sport IS. Identity is case-insensitive (a named sport is typed by hand at
// log time), first spelling wins.

/** Storage key — the same on both clients. */
export const SPORT_FAVOURITES_KEY = "hybrid.sportFavourites";

/**
 * How many sports may be pinned. Lower than the exercise cap (8): a sport row
 * is a whole 8-week read, and past a handful the board stops being a watchlist
 * and becomes the Endurance hub — which already exists, one door away.
 */
export const MAX_SPORT_FAVOURITES = 6;

/** Case-insensitive identity — "s:tennis" and "s:Tennis" are one pin. */
const key = (id: string): string => id.trim().toLowerCase();

/** Is this a well-formed favourite id — a discipline key or a named sport key? */
const wellFormed = (id: string): boolean => /^(d:.+|s:.+)$/.test(id);

/**
 * Merge an untrusted stored value into a clean pin list: strings only, trimmed,
 * malformed ids dropped, de-duplicated case-insensitively (first spelling
 * wins) and capped. A corrupt or older persisted value can never break the
 * board.
 */
export function normalizeSportFavourites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || !wellFormed(id) || seen.has(key(id))) continue;
    seen.add(key(id));
    out.push(id);
    if (out.length >= MAX_SPORT_FAVOURITES) break;
  }
  return out;
}

/** Is this sport pinned? */
export function isSportFavourite(list: readonly string[], id: string): boolean {
  return list.some((f) => key(f) === key(id));
}

/** The pin list is full — further pins are refused until one is removed. */
export function sportFavouritesFull(list: readonly string[]): boolean {
  return list.length >= MAX_SPORT_FAVOURITES;
}

/**
 * Pin / unpin, returning a NEW list. A new pin appends, so the board's order is
 * the order they were chosen. At the cap the list comes back unchanged — a tap
 * must never silently unpin something the athlete chose earlier; the UI says
 * the cap is reached instead.
 */
export function toggleSportFavourite(list: readonly string[], id: string): string[] {
  const clean = id.trim();
  if (!clean || !wellFormed(clean)) return [...list];
  if (isSportFavourite(list, clean)) return list.filter((f) => key(f) !== key(clean));
  if (sportFavouritesFull(list)) return [...list];
  return normalizeSportFavourites([...list, clean]);
}
