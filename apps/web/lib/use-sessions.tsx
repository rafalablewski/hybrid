"use client";

import { useQuery } from "@tanstack/react-query";
import type { LoggedSession } from "@hybrid/core";
import { ensureExerciseCatalog } from "./exercise-catalog";
import { toRead } from "./read";

/** Query key for the signed-in user's (non-archived) sessions. Mutations that
 *  change sessions should invalidate this key to revalidate every consumer. */
export const sessionsKey = ["sessions"] as const;

async function fetchSessions(): Promise<LoggedSession[]> {
  // Publish the exercise library to the engines BEFORE the sessions land, so
  // every muscle-attribution engine (fatigue, injury risk, volume, landmarks,
  // records) can resolve a lift logged under a library name. Awaited here rather
  // than fired-and-forgotten: it makes the ordering a guarantee, not a race.
  await ensureExerciseCatalog();
  const res = await fetch("/api/sessions");
  if (res.ok) {
    const data = (await res.json()) as { sessions?: LoggedSession[] };
    return data.sessions ?? [];
  }
  // In demo mode (no auth) the API returns 401 → resolve to an empty list so
  // callers render honest empty states (no sample data).
  if (res.status === 401) return [];
  throw new Error(`HTTP ${res.status}`);
}

/** Fetches the signed-in user's sessions, backed by the shared query cache so
 *  every consumer dedupes one request and a mutation can revalidate them all.
 *  Return shape preserved (sessions/loading/error/refresh) so call sites are
 *  unchanged. */
export function useSessions() {
  const q = useQuery({ queryKey: sessionsKey, queryFn: fetchSessions });
  const read = toRead(q);
  return {
    sessions: q.data ?? [],
    // `loading` now means UNKNOWN — no server answer yet — not "a fetch is in
    // flight". It used to be `isPending || isFetching`, which made every
    // background revalidate drop already-rendered content back to a skeleton:
    // the same lie as the empty state, in reverse. Consumers gate CLAIMS on
    // this; anything that just wants the spinner reads `refreshing`.
    loading: !read.ready,
    refreshing: read.refreshing,
    ready: read.ready,
    error: q.isError ? (q.error instanceof Error ? q.error.message : "network") : null,
    refresh: () => q.refetch(),
  };
}
