import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessions, fetchSignals } from "./api";

// Shared query hooks for the mobile app — parity with the web data-layer. Keys
// match conceptually so the same mutation→invalidate discipline applies. Wraps
// the existing lib/api fetchers (which already swallow errors → []), so callers
// keep their honest empty states.

export const qk = {
  sessions: ["sessions"] as const,
  signals: ["signals"] as const,
};

/** The signed-in user's logged sessions, from the shared cache. */
export function useSessionsQuery() {
  return useQuery({ queryKey: qk.sessions, queryFn: () => fetchSessions() });
}

/** The signed-in user's Signal ontology, from the shared cache. */
export function useSignalsQuery() {
  return useQuery({ queryKey: qk.signals, queryFn: () => fetchSignals() });
}

/** Mutation → cache invalidation, mirroring the web useRevalidate(). */
export function useRevalidate() {
  const qc = useQueryClient();
  return {
    sessions: () => qc.invalidateQueries({ queryKey: qk.sessions }),
    recovery: () => qc.invalidateQueries({ queryKey: qk.signals }),
  };
}
