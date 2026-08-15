import { normalizeSearchText } from "./ranked-search";

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MISSES — the words athletes use that the app doesn't know yet.
//
// The exercise search ships with ~50 hand-curated nicknames ("rdl", "ohp",
// "t2b", "farmers walk"). Every one of them is a GUESS about how people talk
// about lifting. Some of those guesses are wrong and, worse, the gaps are
// invisible: a query that finds nothing looks exactly like a query for
// something that doesn't exist, and the athlete quietly types a custom name
// instead — which splits their own history under a spelling nobody chose.
//
// So record the two moments where the vocabulary demonstrably failed:
//
//   "empty"  — a real query (not a half-typed prefix) that matched nothing.
//   "custom" — a movement created by hand rather than picked. The strongest
//              signal of the two: the athlete did not merely fail to find it,
//              they went ahead and named it themselves.
//
// The result is a nickname backlog written by the people who use the app rather
// than by whoever last edited EXERCISE_NICKNAMES. Pure data + a reducer, like
// logger-prefs and exercise-favourites: each client persists it per device and
// reads it through a small store, so the two can never disagree about what a
// miss is. Aggregating it across devices is a server job — tracked separately
// as `search-vocabulary-sync`.
// ─────────────────────────────────────────────────────────────────────────────

/** Storage key — the same on both clients. */
export const SEARCH_MISSES_KEY = "hybrid.searchMisses";

/**
 * How many distinct misses are kept. This is a BACKLOG, not a log: past a
 * screenful the tail is single sightings of typos nobody will ever act on, and
 * the ones worth adding are the ones that keep coming back.
 */
export const MAX_SEARCH_MISSES = 50;

/** Shorter than this is a half-typed prefix, not a word the app failed to know. */
export const MIN_MISS_LENGTH = 3;
/** Longer than this is a paste, not a search. */
const MAX_MISS_LENGTH = 48;

/** Why the query counted as a miss. */
export type SearchMissReason = "empty" | "custom";

export interface SearchMiss {
  /** Normalized query text — the identity, and what gets displayed. */
  query: string;
  /** Times this query found nothing. */
  empty: number;
  /** Times a custom movement was created from it. */
  custom: number;
  /** Day of the most recent sighting, `YYYY-MM-DD`. */
  last: string;
}

const day = (at: Date | number = Date.now()): string => new Date(at).toISOString().slice(0, 10);

/** A miss's weight in the backlog. A hand-created movement counts for more than
 *  an empty result: someone did not just fail to find it, they went and made it. */
export const searchMissWeight = (m: SearchMiss): number => m.empty + m.custom * 3;

/** Sort strongest-first, then most recent, then alphabetically for stability. */
const byWeight = (a: SearchMiss, b: SearchMiss) =>
  searchMissWeight(b) - searchMissWeight(a) || b.last.localeCompare(a.last) || a.query.localeCompare(b.query);

/**
 * Merge an untrusted stored value into a clean backlog: well-formed rows only,
 * counts coerced to non-negative integers, deduplicated by query, sorted and
 * capped. A corrupt or older persisted value can never break the picker.
 */
export function normalizeSearchMisses(raw: unknown): SearchMiss[] {
  if (!Array.isArray(raw)) return [];
  const byQuery = new Map<string, SearchMiss>();
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const row = v as Partial<SearchMiss>;
    const query = normalizeSearchText(String(row.query ?? ""));
    if (query.length < MIN_MISS_LENGTH || query.length > MAX_MISS_LENGTH) continue;
    const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
    const last = typeof row.last === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.last) ? row.last : day(0);
    const prev = byQuery.get(query);
    byQuery.set(query, {
      query,
      empty: int(row.empty) + (prev?.empty ?? 0),
      custom: int(row.custom) + (prev?.custom ?? 0),
      last: prev && prev.last > last ? prev.last : last,
    });
  }
  return [...byQuery.values()].filter((m) => m.empty + m.custom > 0).sort(byWeight).slice(0, MAX_SEARCH_MISSES);
}

/**
 * Record one miss, returning a NEW backlog. A query too short to be a word, or
 * one that normalizes to nothing, is dropped — the picker records on close and
 * on custom-add rather than per keystroke, but a stray "d" must never reach the
 * list even so.
 */
export function recordSearchMiss(
  list: readonly SearchMiss[],
  query: string,
  reason: SearchMissReason,
  at: Date | number = Date.now(),
): SearchMiss[] {
  const q = normalizeSearchText(query);
  if (q.length < MIN_MISS_LENGTH || q.length > MAX_MISS_LENGTH) return [...list];
  const today = day(at);
  const rest = list.filter((m) => m.query !== q);
  const prev = list.find((m) => m.query === q);
  const next: SearchMiss = {
    query: q,
    empty: (prev?.empty ?? 0) + (reason === "empty" ? 1 : 0),
    custom: (prev?.custom ?? 0) + (reason === "custom" ? 1 : 0),
    last: today,
  };
  return [...rest, next].sort(byWeight).slice(0, MAX_SEARCH_MISSES);
}

/** The backlog worth acting on — strongest first. */
export function topSearchMisses(list: readonly SearchMiss[], limit = 12): SearchMiss[] {
  return [...list].sort(byWeight).slice(0, limit);
}

/**
 * One line describing what a miss is asking for, for the admin list:
 * "3 empty, 1 created" — so an operator can tell a recurring gap from a typo.
 */
export function searchMissSummary(m: SearchMiss): string {
  const parts: string[] = [];
  if (m.empty) parts.push(`${m.empty} empty`);
  if (m.custom) parts.push(`${m.custom} created`);
  return parts.join(", ");
}
