import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SEARCH_MISSES_KEY,
  normalizeSearchMisses,
  recordSearchMiss as record,
  type SearchMiss,
  type SearchMissReason,
  SEARCH,
} from "@hybrid/core";
import { track } from "./track";

// The words this athlete searched for that the app did not know, per device
// (AsyncStorage) — the nickname backlog, written by the person using it. Shares
// the key, the cap and the reducer with @hybrid/core so a miss means the same
// thing wherever it is read. Read by the mobile admin console; aggregating it
// across devices is the `search-vocabulary-sync` capability.

let misses: SearchMiss[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(SEARCH_MISSES_KEY)
  .then((v) => {
    if (!v) return;
    try {
      misses = normalizeSearchMisses(JSON.parse(v));
      emit();
    } catch {
      /* keep the empty backlog */
    }
  })
  .catch(() => {});

/**
 * Record a query the vocabulary failed. Fire-and-forget: a search field must
 * never wait on this, and a storage failure must never cost the athlete a
 * result. Also emitted through `track()`, which no-ops until a provider is
 * wired (capability: funnel-analytics) — the local backlog is what makes this
 * useful today.
 */
export function noteSearchMiss(query: string, reason: SearchMissReason): void {
  const next = record(misses, query, reason);
  if (next.length === misses.length && next.every((m, i) => m === misses[i])) return; // below the length floor
  misses = next;
  AsyncStorage.setItem(SEARCH_MISSES_KEY, JSON.stringify(misses)).catch(() => {});
  emit();
  track(reason === "custom" ? SEARCH.customAdd : SEARCH.miss, { query: query.trim().slice(0, 48), client: "mobile" });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The backlog, strongest first (empty until hydrated). */
export function useSearchMisses(): SearchMiss[] {
  return useSyncExternalStore(
    subscribe,
    () => misses,
    () => misses,
  );
}

/** Forget the backlog — for the admin console, once the gaps have been added. */
export function clearSearchMisses(): void {
  misses = [];
  AsyncStorage.removeItem(SEARCH_MISSES_KEY).catch(() => {});
  emit();
}
