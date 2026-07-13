"use client";

import { useSyncExternalStore, useCallback } from "react";
import type { PlanOverride, PlanOverrides } from "@hybrid/core";

// Per-day plan overrides the athlete sets by hand — today just "skipped" — keyed
// by the day's local date (yyyy-mm-dd), scoped per plan. Persisted client-side
// (localStorage) as the immediate source of truth; the shared engine consumes
// this map, so swapping in a server table later is a drop-in with no UI change.
//
// A tiny subscribe/notify wiring lets React re-render the rail the moment an
// override changes — in this tab (custom event) and across tabs (storage event).

const KEY = (planId: string) => `hybrid.plan-overrides.${planId}`;
const EVENT = "hybrid:plan-overrides";

const EMPTY: PlanOverrides = {};
const cache = new Map<string, PlanOverrides>();

function read(planId: string): PlanOverrides {
  if (typeof window === "undefined") return EMPTY;
  if (cache.has(planId)) return cache.get(planId)!;
  let parsed: PlanOverrides = EMPTY;
  try {
    const raw = localStorage.getItem(KEY(planId));
    if (raw) {
      const obj = JSON.parse(raw) as unknown;
      if (obj && typeof obj === "object") parsed = obj as PlanOverrides;
    }
  } catch {
    /* leave EMPTY */
  }
  cache.set(planId, parsed);
  return parsed;
}

function write(planId: string, next: PlanOverrides) {
  cache.set(planId, next);
  try {
    localStorage.setItem(KEY(planId), JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode failures */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: planId }));
}

/** Set (or clear, when `override` is null) one day's override, then notify. */
export function setPlanOverride(planId: string, dateKey: string, override: PlanOverride | null) {
  const cur = read(planId);
  const next: PlanOverrides = { ...cur };
  if (override) next[dateKey] = override;
  else delete next[dateKey];
  write(planId, next);
}

function subscribe(cb: () => void) {
  const onEvent = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("hybrid.plan-overrides.")) {
      // a foreign tab changed it — drop our cache so the next read re-parses
      cache.clear();
      cb();
    }
  };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive read of a plan's overrides + a setter. Re-renders on any change. */
export function usePlanOverrides(planId: string | null | undefined): {
  overrides: PlanOverrides;
  setOverride: (dateKey: string, override: PlanOverride | null) => void;
} {
  const getSnapshot = useCallback(() => (planId ? read(planId) : EMPTY), [planId]);
  const overrides = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const setOverride = useCallback(
    (dateKey: string, override: PlanOverride | null) => {
      if (planId) setPlanOverride(planId, dateKey, override);
    },
    [planId],
  );
  return { overrides, setOverride };
}
