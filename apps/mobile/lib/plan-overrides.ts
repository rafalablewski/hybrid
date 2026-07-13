import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlanOverride, PlanOverrides } from "@hybrid/core";
import { fetchPlanOverrides, savePlanOverride } from "./api";

// Per-day plan overrides the athlete sets by hand (skip / postpone) — keyed by
// the day's local date (yyyy-mm-dd), scoped per plan. The mobile twin of web
// lib/plan-overrides.ts, server-backed exactly like it. Two tiers:
//   1. AsyncStorage — the immediate, offline-first cache (no flash, no network).
//   2. /api/plan-days — the source of truth that syncs across devices.
// The shared engine (planSchedule) consumes this map, so the two clients stay in
// lockstep.
//
// On mount (per planId) we load the AsyncStorage cache AND fetch the server's
// overrides, merging the server result in (server wins). On setOverride we write
// to AsyncStorage AND update local state at once (optimistic) so the rail
// re-renders immediately, then POST to the server fire-and-forget.

const KEY = (planId: string) => `hybrid.plan-overrides.${planId}`;
const EMPTY: PlanOverrides = {};

/** Reactive read of a plan's overrides + a setter. Re-renders on any change. */
export function usePlanOverrides(planId: string | null | undefined): {
  overrides: PlanOverrides;
  setOverride: (dateKey: string, override: PlanOverride | null) => void;
} {
  const [overrides, setOverrides] = useState<PlanOverrides>(EMPTY);

  // Load this plan's overrides on mount / whenever the plan changes. A late
  // resolve landing after the plan flipped is ignored (alive guard) so a stale
  // read can't clobber the current plan's map.
  useEffect(() => {
    let alive = true;
    if (!planId) {
      setOverrides(EMPTY);
      return;
    }
    AsyncStorage.getItem(KEY(planId))
      .then((raw) => {
        if (!alive) return;
        let parsed: PlanOverrides = EMPTY;
        try {
          if (raw) {
            const obj = JSON.parse(raw) as unknown;
            if (obj && typeof obj === "object") parsed = obj as PlanOverrides;
          }
        } catch {
          /* leave EMPTY */
        }
        setOverrides(parsed);
      })
      .catch(() => {
        if (alive) setOverrides(EMPTY);
      });
    // Then reconcile with the server (source of truth). A late resolve landing
    // after the plan flipped is ignored (alive guard); the server map wins and is
    // written back into the AsyncStorage cache.
    fetchPlanOverrides(planId)
      .then((server) => {
        if (!alive || !server || typeof server !== "object") return;
        setOverrides(server);
        AsyncStorage.setItem(KEY(planId), JSON.stringify(server)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [planId]);

  const setOverride = useCallback(
    (dateKey: string, override: PlanOverride | null) => {
      if (!planId) return;
      setOverrides((cur) => {
        const next: PlanOverrides = { ...cur };
        if (override) next[dateKey] = override;
        else delete next[dateKey];
        // Persist (fire-and-forget) — local state is already updated so the rail
        // re-renders at once; a failed write (quota / private mode) is a no-op.
        AsyncStorage.setItem(KEY(planId), JSON.stringify(next)).catch(() => {});
        // Write through to the server (fire-and-forget; the cache keeps it if
        // that fails, and a later successful write re-syncs).
        void savePlanOverride(planId, dateKey, override);
        return next;
      });
    },
    [planId],
  );

  return { overrides, setOverride };
}
