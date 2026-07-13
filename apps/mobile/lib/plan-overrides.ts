import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlanOverride, PlanOverrides } from "@hybrid/core";

// Per-day plan overrides the athlete sets by hand — today just "skipped" — keyed
// by the day's local date (yyyy-mm-dd), scoped per plan. The mobile twin of web
// lib/plan-overrides.ts, backed by AsyncStorage instead of localStorage. The
// shared engine (planSchedule) consumes this map, so the two clients stay in
// lockstep; swapping in a server table later is a drop-in with no UI change.
//
// AsyncStorage is async, so overrides live in React state: load on mount (per
// planId) and, on setOverride, write to AsyncStorage AND update local state at
// once (optimistic) so the rail re-renders immediately.

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
        return next;
      });
    },
    [planId],
  );

  return { overrides, setOverride };
}
