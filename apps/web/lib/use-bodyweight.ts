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

/** Dated bodyweight lookup — lookup(session.startedAt) → kg at that date;
 *  lookup() → current weight; null-returning until loaded / when empty. */
export function useBodyweightLookup(): BodyweightLookup {
  const [points, setPoints] = useState<BodyweightPoint[]>([]);
  useEffect(() => {
    let on = true;
    fetchPoints().then((p) => {
      if (on) setPoints(p);
    });
    return () => {
      on = false;
    };
  }, []);
  return useMemo(() => bodyweightLookup(points), [points]);
}

/** The athlete's CURRENT bodyweight (kg), or null. */
export function useBodyweight(): number | null {
  return useBodyweightLookup()();
}
