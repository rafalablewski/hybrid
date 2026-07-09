import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchPlanMaxes, savePlanMaxes } from "./api";

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

// Cross-device sync: the maxes also live on the account (User.planMaxes). We
// hydrate once on first use — merging the server's values over the local ones so
// a second device sees them — and write the whole map back on every change. Both
// soft-degrade (a signed-out user / un-migrated column keeps the on-device copy).
let hydrated = false;
function hydrateFromServer() {
  if (hydrated) return;
  hydrated = true;
  fetchPlanMaxes()
    .then((server) => {
      if (!server || typeof server !== "object" || !Object.keys(server).length) return;
      const next = { ...maxes, ...server };
      if (JSON.stringify(next) === JSON.stringify(maxes)) return;
      maxes = next;
      AsyncStorage.setItem(KEY, JSON.stringify(maxes)).catch(() => {});
      emit();
    })
    .catch(() => {});
}

/** Reset the store on sign-out / user switch so the next account on this device
 *  doesn't inherit the previous athlete's maxes or the one-shot hydrate guard. */
export function resetPlanMaxes(): void {
  maxes = {};
  hydrated = false;
  AsyncStorage.removeItem(KEY).catch(() => {});
  emit();
}

/** Set (or clear, with a null/≤0 value) one max — persisted on-device and pushed
 *  to the account (best-effort). */
export function setPlanMax(key: string, value: number | null): void {
  const next = { ...maxes };
  if (value == null || !Number.isFinite(value) || value <= 0) delete next[key];
  else next[key] = value;
  maxes = next;
  AsyncStorage.setItem(KEY, JSON.stringify(maxes)).catch(() => {});
  void savePlanMaxes(maxes);
  emit();
}

/** Read the current maxes synchronously (for a one-shot read, e.g. prefill). */
export function readPlanMaxes(): Record<string, number> {
  return maxes;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  hydrateFromServer(); // one-time account hydrate on first use
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
