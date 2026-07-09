import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The athlete's training maxes (1RMs) a discipline-shaped plan derives working
// loads from (e.g. { snatch: 100, backSquat: 200 }). Entered on the Plans "fill
// in your numbers" panel and persisted on-device (mirrors web lib/plan-maxes.ts +
// the persona store), so "Your plan today" shows REAL working kg, not just the
// prescribed %. A flat athlete-level map keyed by ProgramInput.key, shared across
// plans. Mirror of apps/web/lib/plan-maxes.ts.
const KEY = "hybrid.planMaxes";

let maxes: Record<string, number> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Hydrate once from storage; notify subscribers when it lands.
AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) out[k] = n;
      }
      maxes = out;
      emit();
    } catch {
      /* ignore malformed */
    }
  })
  .catch(() => {});

/** Set (or clear, with a null/≤0 value) one max and persist it. */
export function setPlanMax(key: string, value: number | null): void {
  const next = { ...maxes };
  if (value == null || !Number.isFinite(value) || value <= 0) delete next[key];
  else next[key] = value;
  maxes = next;
  AsyncStorage.setItem(KEY, JSON.stringify(maxes)).catch(() => {});
  emit();
}

/** Read the current maxes synchronously (for a one-shot read, e.g. prefill). */
export function readPlanMaxes(): Record<string, number> {
  return maxes;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The athlete's persisted training maxes (reactive). */
export function usePlanMaxes(): Record<string, number> {
  return useSyncExternalStore(
    subscribe,
    () => maxes,
    () => maxes,
  );
}
