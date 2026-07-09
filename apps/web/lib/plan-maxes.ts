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

function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(maxes));
  } catch {
    /* ignore (private mode) */
  }
}

// Cross-device sync: the maxes also live on the account (User.planMaxes, via
// /api/plan-maxes). We hydrate once on first use — merging the server's values
// over the local ones (server wins per key) so a second device sees them — and
// write the whole map back on every change. Both soft-degrade: a signed-out user
// or an un-migrated column just keeps the on-device copy.
let hydrated = false;
function hydrateFromServer() {
  if (hydrated) return;
  hydrated = true;
  fetch("/api/plan-maxes")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { maxes?: Record<string, number> } | null) => {
      const server = d?.maxes;
      if (!server || typeof server !== "object") return;
      const next = { ...maxes, ...server };
      if (JSON.stringify(next) === JSON.stringify(maxes)) return;
      maxes = next;
      persistLocal();
      emit();
    })
    .catch(() => {});
}

// Debounce the account sync — typing "200" is 3 keystrokes, but only the settled
// value needs to reach the server. The local copy is written immediately; the PUT
// coalesces to one call ~600ms after the last edit.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushToServer() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    fetch("/api/plan-maxes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxes }),
    }).catch(() => {});
  }, 600);
}

/** Reset the store on sign-out / user switch so the next account on this device
 *  doesn't inherit the previous athlete's maxes or the one-shot hydrate guard. */
export function resetPlanMaxes(): void {
  if (pushTimer) {
    clearTimeout(pushTimer); // never let a queued push land after logout
    pushTimer = null;
  }
  maxes = {};
  hydrated = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Set (or clear, with a null/≤0 value) one max — persisted on-device and pushed
 *  to the account (best-effort). */
export function setPlanMax(key: string, value: number | null): void {
  const next = { ...maxes };
  if (value == null || !Number.isFinite(value) || value <= 0) delete next[key];
  else next[key] = value;
  maxes = next;
  persistLocal();
  pushToServer();
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  hydrateFromServer(); // one-time account hydrate on first use
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
