import {
  SEARCH_MISSES_KEY,
  normalizeSearchMisses,
  recordSearchMiss as record,
  type SearchMiss,
  type SearchMissReason,
  SEARCH,
} from "@hybrid/core";
import { getPref, setPref, useSyncedPref } from "./synced-prefs";
import { track } from "./track";

// The words this athlete searched for that the app did not know — the nickname
// backlog, written by the person using it. Shares the key, the cap and the
// reducer with @hybrid/core so a miss means the same thing wherever it is read.
//
// SYNCED, NOT PER-DEVICE, since Aug 2026 (lib/synced-prefs.ts → /api/prefs), so
// the backlog is one list per athlete rather than one per handset — a gap found
// on the phone is visible to the admin console reading the same account. That
// is the per-USER half of `search-vocabulary-sync`; aggregating ACROSS athletes
// into a catalog backlog is still the unbuilt half of that capability.

const current = (): SearchMiss[] => normalizeSearchMisses(getPref<unknown>(SEARCH_MISSES_KEY, []));

/**
 * Record a query the vocabulary failed. Fire-and-forget: a search field must
 * never wait on this, and a storage failure must never cost the athlete a
 * result. Also emitted through `track()`, which no-ops until a provider is
 * wired (capability: funnel-analytics) — the backlog is what makes this useful
 * today.
 */
export function noteSearchMiss(query: string, reason: SearchMissReason): void {
  const misses = current();
  const next = record(misses, query, reason);
  if (next.length === misses.length && next.every((m, i) => m === misses[i])) return; // below the length floor
  setPref(SEARCH_MISSES_KEY, next);
  track(reason === "custom" ? SEARCH.customAdd : SEARCH.miss, { query: query.trim().slice(0, 48), client: "mobile" });
}

/** The backlog, strongest first (empty until hydrated). */
export function useSearchMisses(): SearchMiss[] {
  return useSyncedPref(SEARCH_MISSES_KEY, normalizeSearchMisses);
}

/** Forget the backlog — for the admin console, once the gaps have been added. */
export function clearSearchMisses(): void {
  setPref(SEARCH_MISSES_KEY, null);
}
