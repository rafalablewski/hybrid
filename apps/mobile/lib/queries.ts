import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { MOVEMENTS, mergeMovements, catalogNames, aliasNames, categoriesByName, exerciseNameAliasMap, setExerciseCatalog } from "@hybrid/core";
import { querySessions, querySignals, queryMacrocycle, queryCheckins, fetchCustomExercises, fetchFoodLogs, fetchHeatSignals, fetchRecoverySignals } from "./api";

// Shared query hooks for the mobile app — parity with the web data-layer. Keys
// match conceptually so the same mutation→invalidate discipline applies. These
// use the THROWING query* fetchers so useQuery's isError/retry fire and screens
// can show a real "couldn't load — retry" state instead of a fake empty one.
// (The exercise overlay stays soft — it degrades to the built-in catalog.)

export const qk = {
  sessions: ["sessions"] as const,
  signals: ["signals"] as const,
  macrocycle: ["macrocycle"] as const,
  checkins: ["checkins"] as const,
  exercises: ["exercises"] as const,
  foodLogs: ["foodLogs"] as const,
  heatSignals: ["signals", "heat"] as const,
  recoverySignals: ["signals", "recovery"] as const,
};

/**
 * THE SAFE-CACHE CONTRACT — the three-state read every data-driven screen uses.
 *
 * The bug this exists to make unrepresentable: a screen that holds `[]` before
 * its first fetch answers cannot distinguish "the user has no training history"
 * from "we haven't asked yet", so it renders the zero-state as fact — "log a
 * session", "No season yet" — at an athlete with years of data, then swaps it
 * for the truth a second later. That is not slowness; it is the app asserting
 * something it does not know.
 *
 * So a read is one of three things, never a bare value:
 *   • `ready: false`  — UNKNOWN. Nothing has ever resolved. Render a skeleton.
 *     NEVER a zero-state, an empty list, or a computed number: every one of
 *     those is a claim we cannot support yet.
 *   • `ready: true`   — we have a real value that the server actually returned.
 *     Render it, even while `refreshing` — that is the whole point of the
 *     cache, and it is safe because the value was true when it was fetched and
 *     any change WE made has already invalidated it.
 *   • `failed: true`  — we asked and could not get an answer. Render the error,
 *     never emptiness. (Still `ready` when a previous value is cached: the last
 *     known truth beats a blank screen, and the retry sits on top of it.)
 *
 * `refreshing` drives the pull-to-refresh spinner and NOTHING else. It must
 * never gate content — flipping back to a skeleton on a background revalidate
 * is the same lie in reverse.
 */
export type Read<T> = {
  data: T | undefined;
  /** A real, server-returned value is in hand. False = unknown, show a skeleton. */
  ready: boolean;
  /** A fetch is in flight. Drives the spinner only — never gates content. */
  refreshing: boolean;
  /** The last attempt failed. Show an error, never an empty state. */
  failed: boolean;
  /** We have STOPPED WAITING — either an answer arrived or the attempt failed.
   *  Gate anything that must not hang on this rather than on `ready`: a read
   *  that errors is never `ready`, so a skeleton gated on `ready` alone would
   *  stay up forever. `settled && !ready` is precisely the error case. */
  settled: boolean;
  retry: () => void;
};

/** Wraps a useQuery result in the Read contract above. */
function toRead<T>(q: UseQueryResult<T>): Read<T> {
  return {
    data: q.data,
    // isSuccess (not `!isPending`) is the honest test: it means a fetch
    // RESOLVED. A query that is merely no longer pending because it errored has
    // no value to show, and `data !== undefined` keeps a cached value readable
    // through a later failed refetch.
    ready: q.isSuccess || q.data !== undefined,
    refreshing: q.isFetching,
    failed: q.isError,
    settled: q.isSuccess || q.isError || q.data !== undefined,
    retry: () => { void q.refetch(); },
  };
}

/** Combine several reads into one screen-level gate. A screen is only `ready`
 *  when EVERY read it renders from is — otherwise half the page states facts
 *  while the other half invents them. */
export function combineReads(...reads: { ready: boolean; refreshing: boolean; failed: boolean; settled: boolean }[]) {
  return {
    ready: reads.every((r) => r.ready),
    refreshing: reads.some((r) => r.refreshing),
    failed: reads.some((r) => r.failed),
    settled: reads.every((r) => r.settled),
  };
}

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

/** The athlete's logged food/meal entries (FoodLog rows plus the Signal-derived
 *  ones) — the same payload the Nutrition Diary lists. Today's Fuel widget reads
 *  it to show WHAT was eaten alongside the macros. Soft: the fetcher returns []
 *  rather than throwing, since a missing plate must never fail the Today screen.
 *  Mirrors web's useFoodLogs(). */
export function useFoodLogsQuery() {
  return useQuery({ queryKey: qk.foodLogs, queryFn: fetchFoodLogs });
}

/** The enrolled macrocycle (season), from the shared cache. A null result means
 *  genuinely NOT enrolled — which is only a meaningful reading once `ready`. */
export function useMacrocycleQuery() {
  return useQuery({ queryKey: qk.macrocycle, queryFn: () => queryMacrocycle() });
}

/**
 * The athlete's sauna rows, on their OWN cache entry.
 *
 * Deliberately not a slice of `useSignalsQuery`: that one reads the newest 500
 * rows of ANY kind, and one logged food writes up to eight of them, so on a
 * diligent nutrition logger the window can cover barely a fortnight. A recovery
 * input must not be evictable by an unrelated one, so this fetches by kind.
 */
/**
 * The recovery stream (HRV / resting HR / sleep / body mass), by kind.
 *
 * Everything that resolves `toBiometrics` reads THIS rather than the unfiltered
 * `useSignalsQuery`, which returns the newest rows of any kind and can have a
 * week of wearable readings evicted by a few days of logged meals.
 */
export function useRecoverySignalsQuery() {
  return useQuery({ queryKey: qk.recoverySignals, queryFn: fetchRecoverySignals });
}

export function useHeatSignalsQuery() {
  return useQuery({ queryKey: qk.heatSignals, queryFn: fetchHeatSignals });
}

/** The athlete's readiness check-ins, from the shared cache. */
export function useCheckinsQuery() {
  return useQuery({ queryKey: qk.checkins, queryFn: () => queryCheckins() });
}

// The Read-contract views of the shared queries — what data-driven screens
// should consume. Same cache entries as the hooks above (React Query dedupes by
// key), so a screen can mix the two freely at no cost.
export const useSessionsRead = (opts?: { archived?: boolean }) => toRead(useSessionsQuery(opts));
export const useSignalsRead = () => toRead(useSignalsQuery());
export const useRecoverySignalsRead = () => toRead(useRecoverySignalsQuery());
export const useMacrocycleRead = () => toRead(useMacrocycleQuery());
export const useCheckinsRead = () => toRead(useCheckinsQuery());

// Folds the admin-managed exercise library over the built-in MOVEMENTS — the
// mobile twin of web's useExercises() (SAME core helpers), so an authored
// exercise is pickable on the phone too. `movements` keeps alias keys for engine
// resolution; `catalog` is the pickable set (aliases removed); `aliases` hides a
// superseded lift; `aliasMap` points each of those names at what it BECAME (the
// picker's search index reads it, so a hidden name still finds its lift);
// `categoryByName` groups the picker by muscle group. Degrades to the built-ins
// alone when signed-out / the API/table is unavailable.
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
  // alias name → its CURRENT canonical name. The picker feeds this to the search
  // index so an old or superseded spelling still finds the lift it became —
  // hiding those names from the catalog without making them searchable is what
  // turned typing one into a dead end (no row, and the custom add suppressed).
  const aliasMap = useMemo(() => exerciseNameAliasMap(custom ?? []), [custom]);
  const categoryByName = useMemo(() => categoriesByName(custom ?? []), [custom]);
  // Keep the ENGINE catalog in step with the picker's — mirrors web's
  // useExercises(). The engines' first load is guaranteed by the session fetchers
  // (they await ensureExerciseCatalog); this tops it up on a later refetch.
  useEffect(() => { if (custom) setExerciseCatalog(custom); }, [custom]);
  return { movements, catalog, aliases, aliasMap, categoryByName };
}

/**
 * A STABLE "revalidate everything athlete-scoped" callback, for pull-to-refresh
 * and focus effects.
 *
 * Identity matters here, not just behaviour: `useFocusEffect` /
 * `useRefreshOnFocus` re-fire whenever their callback changes, so a refresher
 * rebuilt on every render re-fires while the screen is focused → refetch →
 * re-render → refetch (the "refreshes every second" bug documented in
 * lib/query.tsx). The query client from context is referentially stable, so a
 * callback closed over it alone is too.
 */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.sessions });
    void qc.invalidateQueries({ queryKey: qk.signals });
    void qc.invalidateQueries({ queryKey: qk.foodLogs });
    void qc.invalidateQueries({ queryKey: qk.macrocycle });
    void qc.invalidateQueries({ queryKey: qk.checkins });
  }, [qc]);
}

/**
 * Mutation → cache invalidation, mirroring the web useRevalidate().
 *
 * This map is what makes the cache SAFE rather than merely fast: a cached value
 * is only trustworthy if every write that could falsify it drops it. So the map
 * must stay TOTAL — a write path with no matching entry here is a real
 * staleness bug, not a missing optimisation. When you add an endpoint that
 * mutates athlete data, add its key to `qk` and its invalidator here in the
 * same change.
 */
export function useRevalidate() {
  const qc = useQueryClient();
  return {
    /** A logged / edited / archived workout changed the session list. */
    sessions: () => qc.invalidateQueries({ queryKey: qk.sessions }),
    /** A check-in / weigh-in / nutrition log wrote recovery + body-mass signals.
     *  A nutrition log also changed the diary ENTRIES Today's Fuel plate reads. */
    recovery: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.signals }),
      qc.invalidateQueries({ queryKey: qk.recoverySignals }),
      qc.invalidateQueries({ queryKey: qk.foodLogs }),
    ]),
    /**
     * A logged (or deleted) sauna sitting.
     *
     * It has its own entry because it has its own cache key, and because the
     * things it falsifies are not the nutrition ones: today's readiness ring
     * and prescription both read the heat prior, and the volume model reads the
     * four-week frequency. Without this the athlete would save a sitting, watch
     * the row update, and see a readiness figure that still predates it.
     */
    heat: () => qc.invalidateQueries({ queryKey: qk.heatSignals }),
    /** Enrolling in or leaving a plan changed the season. */
    macrocycle: () => qc.invalidateQueries({ queryKey: qk.macrocycle }),
    /** A readiness face was saved — today's feeling drives the prescription. */
    checkins: () => qc.invalidateQueries({ queryKey: qk.checkins }),
    /** Everything athlete-scoped. For coarse events (sign-in, restore, a
     *  cross-device sync) where naming the affected keys would be guesswork. */
    all: () => {
      qc.invalidateQueries({ queryKey: qk.sessions });
      qc.invalidateQueries({ queryKey: qk.signals });
      qc.invalidateQueries({ queryKey: qk.foodLogs });
      qc.invalidateQueries({ queryKey: qk.macrocycle });
      qc.invalidateQueries({ queryKey: qk.checkins });
    },
  };
}
