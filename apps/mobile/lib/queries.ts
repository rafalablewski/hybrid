import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MOVEMENTS, mergeMovements, catalogNames, aliasNames, categoriesByName } from "@hybrid/core";
import { querySessions, querySignals, fetchCustomExercises } from "./api";

// Shared query hooks for the mobile app — parity with the web data-layer. Keys
// match conceptually so the same mutation→invalidate discipline applies. These
// use the THROWING query* fetchers so useQuery's isError/retry fire and screens
// can show a real "couldn't load — retry" state instead of a fake empty one.
// (The exercise overlay stays soft — it degrades to the built-in catalog.)

export const qk = {
  sessions: ["sessions"] as const,
  signals: ["signals"] as const,
  exercises: ["exercises"] as const,
};

/** The signed-in user's logged sessions, from the shared cache. Pass
 *  { archived: true } for the archived view — it's a separate cache entry under
 *  ['sessions','archived'], but invalidating ['sessions'] (prefix match) still
 *  revalidates both, so a workout save / archive toggle refreshes either view. */
export function useSessionsQuery(opts?: { archived?: boolean }) {
  const archived = opts?.archived ?? false;
  return useQuery({
    queryKey: archived ? (["sessions", "archived"] as const) : qk.sessions,
    queryFn: () => querySessions(archived ? { archived: true } : undefined),
  });
}

/** The signed-in user's Signal ontology, from the shared cache. */
export function useSignalsQuery() {
  return useQuery({ queryKey: qk.signals, queryFn: () => querySignals() });
}

// Folds the admin-managed exercise library over the built-in MOVEMENTS — the
// mobile twin of web's useExercises() (SAME core helpers), so an authored
// exercise is pickable on the phone too. `movements` keeps alias keys for engine
// resolution; `catalog` is the pickable set (aliases removed); `aliases` hides a
// superseded lift; `categoryByName` groups the picker by muscle group. Degrades
// to the built-ins alone when signed-out / the API/table is unavailable.
export function useExercises() {
  const { data: custom } = useQuery({
    queryKey: qk.exercises,
    queryFn: fetchCustomExercises,
    staleTime: 10 * 60_000, // the catalog rarely changes within a session
  });
  const movements = useMemo(
    () => (custom && custom.length ? mergeMovements(MOVEMENTS, custom) : MOVEMENTS),
    [custom],
  );
  const catalog = useMemo(
    () => [...new Set(catalogNames(MOVEMENTS, custom ?? []))].sort((a, b) => a.localeCompare(b)),
    [custom],
  );
  const aliases = useMemo(() => aliasNames(custom ?? []), [custom]);
  const categoryByName = useMemo(() => categoriesByName(custom ?? []), [custom]);
  return { movements, catalog, aliases, categoryByName };
}

/** Mutation → cache invalidation, mirroring the web useRevalidate(). */
export function useRevalidate() {
  const qc = useQueryClient();
  return {
    sessions: () => qc.invalidateQueries({ queryKey: qk.sessions }),
    recovery: () => qc.invalidateQueries({ queryKey: qk.signals }),
  };
}
