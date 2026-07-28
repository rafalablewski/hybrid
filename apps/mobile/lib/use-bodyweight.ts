import { useEffect, useMemo, useState } from "react";
import { bodyweightLookup, latestHeightCm, type BodyMetric, type BodyweightLookup, type BodyweightPoint } from "@hybrid/core";
import { sapi } from "./social-api";

// The athlete's bodyweight over time — the /api/body log (Profile → Private →
// Body & progress) distilled into a DATED lookup, so bodyweight-aware tonnage
// and e1RM use the weight the athlete WAS at each session's date (core
// effectiveSetLoadKg: 10 pull-ups at 70 kg BW = 700 kg of work). Empty for
// guests / no entries — every consumer degrades to entered-load math.
//
// The same log carries the athlete's HEIGHT (a standing fact, not a series), so
// this reads both off ONE fetch rather than making every consumer of "how tall
// are you" issue a second request for a body log the screen already holds.

type BodyLog = { points: BodyweightPoint[]; heightCm: number | null };
const EMPTY: BodyLog = { points: [], heightCm: null };

// One fetch per app session, shared across every hook instance.
let logPromise: Promise<BodyLog> | null = null;
// Mounted hooks subscribe here so a fresh log (refreshBodyweight) re-fetches
// everywhere at once — the logger's just-set weight lands without a reload.
const listeners = new Set<() => void>();
const fetchLog = (): Promise<BodyLog> => {
  logPromise ??= sapi<{ metrics?: BodyMetric[] }>("/api/body")
    .then((d) => {
      const metrics = d.metrics ?? [];
      return {
        points: metrics
          .filter((m): m is BodyMetric & { measuredAt: string; weightKg: number } => typeof m.weightKg === "number" && m.weightKg > 0 && !!m.measuredAt)
          .map((m) => ({ date: m.measuredAt, weightKg: m.weightKg })),
        heightCm: latestHeightCm(metrics),
      };
    })
    .catch(() => {
      logPromise = null; // allow a retry on the next mount
      return EMPTY;
    });
  return logPromise;
};

/** Invalidate the shared cache and re-fetch in every mounted hook — call after
 *  logging a new bodyweight (POST /api/body) so tonnage updates without a
 *  reload. Safe to call when nothing is mounted (no-op beyond the reset). */
export function refreshBodyweight(): void {
  logPromise = null;
  listeners.forEach((l) => l());
}

/** The shared body log — subscribes to the same cache + refresh signal. */
function useBodyLog(): BodyLog {
  const [log, setLog] = useState<BodyLog>(EMPTY);
  useEffect(() => {
    let on = true;
    const load = () => {
      fetchLog().then((l) => {
        if (on) setLog(l);
      });
    };
    load();
    listeners.add(load);
    return () => {
      on = false;
      listeners.delete(load);
    };
  }, []);
  return log;
}

/** The raw dated measurements — for consumers that need the TREND rather than
 *  a point lookup (e.g. the volume profile reading energy availability off the
 *  scale). Empty until loaded / for guests. Mirrors web's useBodyweightPoints. */
export function useBodyweightPoints(): BodyweightPoint[] {
  return useBodyLog().points;
}

/** The athlete's standing height in cm, or null when the body log has none.
 *  Same cache + refresh signal as the weight, so setting a height in Profile
 *  reaches the volume model without a reload. */
export function useAthleteHeight(): number | null {
  return useBodyLog().heightCm;
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
