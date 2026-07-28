"use client";

import { useEffect, useMemo, useState } from "react";
import { bodyweightLookup, type BodyweightLookup, type BodyweightPoint } from "@hybrid/core";

// The athlete's bodyweight over time — the /api/body log (Profile → Private →
// Body & progress) distilled into a DATED lookup, so bodyweight-aware tonnage
// and e1RM use the weight the athlete WAS at each session's date (core
// effectiveSetLoadKg: 10 pull-ups at 70 kg BW = 700 kg of work). Empty for
// guests / no entries — every consumer degrades to entered-load math.

// One fetch per page load, shared across every hook instance.
let pointsPromise: Promise<BodyweightPoint[]> | null = null;
// Mounted hooks subscribe here so a fresh log (refreshBodyweight) re-fetches
// everywhere at once — the logger's just-set weight lands without a reload.
const listeners = new Set<() => void>();
const fetchPoints = (): Promise<BodyweightPoint[]> => {
  pointsPromise ??= fetch("/api/body")
    .then((r) => (r.ok ? (r.json() as Promise<{ metrics?: { measuredAt?: string; weightKg?: number | null }[] }>) : null))
    .then((d) =>
      (d?.metrics ?? [])
        .filter((m): m is { measuredAt: string; weightKg: number } => typeof m.weightKg === "number" && m.weightKg > 0 && !!m.measuredAt)
        .map((m) => ({ date: m.measuredAt, weightKg: m.weightKg })),
    )
    .catch(() => {
      pointsPromise = null; // allow a retry on the next mount
      return [];
    });
  return pointsPromise;
};

/** Invalidate the shared cache and re-fetch in every mounted hook — call after
 *  logging a new bodyweight (POST /api/body) so tonnage updates without a
 *  reload. Safe to call when nothing is mounted (no-op beyond the reset). */
export function refreshBodyweight(): void {
  pointsPromise = null;
  listeners.forEach((l) => l());
}

/** The raw dated measurements — for consumers that need the TREND rather than
 *  a point lookup (e.g. the volume profile reading energy availability off the
 *  scale). Empty until loaded / for guests. Mirrors mobile's useBodyweightPoints. */
export function useBodyweightPoints(): BodyweightPoint[] {
  const [points, setPoints] = useState<BodyweightPoint[]>([]);
  useEffect(() => {
    let on = true;
    const load = () => {
      fetchPoints().then((p) => {
        if (on) setPoints(p);
      });
    };
    load();
    listeners.add(load);
    return () => {
      on = false;
      listeners.delete(load);
    };
  }, []);
  return points;
}

/** Dated bodyweight lookup — lookup(session.startedAt) → kg at that date;
 *  lookup() → current weight; null-returning until loaded / when empty. */
export function useBodyweightLookup(): BodyweightLookup {
  const points = useBodyweightPoints();
  return useMemo(() => bodyweightLookup(points), [points]);
}

/** The athlete's CURRENT bodyweight (kg), or null. */
export function useBodyweight(): number | null {
  return useBodyweightLookup()();
}
