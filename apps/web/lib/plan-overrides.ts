"use client";

import { useSyncExternalStore, useCallback, useEffect } from "react";
import type { PlanOverride, PlanOverrides } from "@hybrid/core";

// Per-day plan overrides (skip / postpone) for the enrolled-plan week rail, keyed
// by the day's local date (yyyy-mm-dd), scoped per plan. Two tiers:
//   1. localStorage — the immediate, offline-first cache the engine reads
//      synchronously (no flash, works with no network).
//   2. /api/plan-days — the source of truth that syncs across devices.
// On mount we hydrate the cache from the server; writes update the cache
// optimistically AND POST to the server. If the table isn't migrated yet the
// server degrades to a no-op and the cache alone keeps the rail working.
//
// A tiny subscribe/notify wiring re-renders the rail the moment the map changes,
// in this tab (custom event) and across tabs (storage event).

const KEY = (planId: string) => `hybrid.plan-overrides.${planId}`;
const EVENT = "hybrid:plan-overrides";

const EMPTY: PlanOverrides = {};
const cache = new Map<string, PlanOverrides>();
const hydrated = new Set<string>();

function readLocal(planId: string): PlanOverrides {
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

function commit(planId: string, next: PlanOverrides) {
  cache.set(planId, next);
  try {
    localStorage.setItem(KEY(planId), JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: planId }));
}

/** Pull the server's overrides for a plan and merge them in (server wins), once
 *  per plan per session. Silently no-ops offline or before the table exists. */
async function hydrate(planId: string) {
  if (hydrated.has(planId)) return;
  hydrated.add(planId);
  try {
    const r = await fetch(`/api/plan-days?planId=${encodeURIComponent(planId)}`);
    if (!r.ok) return;
    const d = (await r.json()) as { overrides?: PlanOverrides } | null;
    if (d && d.overrides && typeof d.overrides === "object") {
      commit(planId, d.overrides);
    }
  } catch {
    hydrated.delete(planId); // let a later mount retry
  }
}

/** Set (or clear, when null) one day's override: optimistic local write + notify,
 *  then persist to the server (fire-and-forget; the cache keeps it if that fails). */
export function setPlanOverride(planId: string, dateKey: string, override: PlanOverride | null) {
  const cur = readLocal(planId);
  const next: PlanOverrides = { ...cur };
  if (override) next[dateKey] = override;
  else delete next[dateKey];
  commit(planId, next);
  void fetch("/api/plan-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, date: dateKey, override }),
  }).catch(() => {
    /* stays in the local cache; re-synced on the next successful write */
  });
}

function subscribe(cb: () => void) {
  const onEvent = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("hybrid.plan-overrides.")) {
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

/** Reactive read of a plan's overrides + a setter. Hydrates from the server on
 *  mount; re-renders on any change. */
export function usePlanOverrides(planId: string | null | undefined): {
  overrides: PlanOverrides;
  setOverride: (dateKey: string, override: PlanOverride | null) => void;
} {
  const getSnapshot = useCallback(() => (planId ? readLocal(planId) : EMPTY), [planId]);
  const overrides = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  useEffect(() => {
    if (planId) void hydrate(planId);
  }, [planId]);

  const setOverride = useCallback(
    (dateKey: string, override: PlanOverride | null) => {
      if (planId) setPlanOverride(planId, dateKey, override);
    },
    [planId],
  );
  return { overrides, setOverride };
}
