"use client";

import { useSyncExternalStore } from "react";

// The athlete's training maxes (1RMs) — the numbers a discipline-shaped plan
// derives working loads from (e.g. { snatch: 100, backSquat: 200 }). Entered on
// the Plans "fill in your numbers" panel and persisted on-device (like the
// onboarding intake) so "Your plan today" can show REAL working kg, not just the
// prescribed %. A flat athlete-level map keyed by ProgramInput.key, shared across
// plans — your snatch max is your snatch max, whatever program reads it.
const KEY = "hybrid.planMaxes";

function readInitial(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

let maxes: Record<string, number> = readInitial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Set (or clear, with a null/≤0 value) one max and persist it. */
export function setPlanMax(key: string, value: number | null): void {
  const next = { ...maxes };
  if (value == null || !Number.isFinite(value) || value <= 0) delete next[key];
  else next[key] = value;
  maxes = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(maxes));
  } catch {
    /* ignore (private mode) */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// A stable empty snapshot for SSR — the real map only affects client-rendered
// working weights, so React reconciles it in after hydration (no mismatch).
const EMPTY: Record<string, number> = {};

/** The athlete's persisted training maxes (reactive). */
export function usePlanMaxes(): Record<string, number> {
  return useSyncExternalStore(
    subscribe,
    () => maxes,
    () => EMPTY,
  );
}
