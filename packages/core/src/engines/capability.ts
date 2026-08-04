/**
 * CAPABILITY — did the training work?
 *
 * The Performance page's headline (HPI) is a FRESHNESS index: `100 − fatigue`.
 * It rises on a deload and rises further on a layoff, and falls during the
 * hardest, most productive block of a season. Read alone it tells an athlete
 * the opposite of the truth about their training, because it answers "can you
 * train today", not "is any of this working".
 *
 * This is the other half. It asks the only question that makes the word
 * PERFORMANCE true: over the last N weeks, is the athlete lifting more and
 * running faster than they were?
 *
 * The measure is deliberately boring, because the athlete has to believe it:
 * split the window in half, take each movement's BEST in each half, and compare.
 * No smoothing, no regression, no model — a number an athlete can check by
 * scrolling their own history. A movement is only counted when it appears in
 * BOTH halves, so a lift introduced last week can't read as infinite progress
 * and one dropped a month ago can't read as collapse.
 *
 * Units differ and are never mixed: strength improves when e1RM goes UP,
 * endurance improves when seconds-per-km goes DOWN. Both are converted to a
 * signed percent where positive always means "better", and the headline is the
 * mean across every qualifying movement.
 */

import { e1rmSeries, paceSeries } from "./session";
import { deviceTrueSessions } from "../device-truth";
import type { BodyweightInput } from "../bodyweight";
import type { LoggedSession } from "./session";

const DAY = 86_400_000;

/** One movement's change across the window's two halves. */
export interface CapabilityMovement {
  kind: "strength" | "endurance";
  /** the movement's own name, as logged */
  name: string;
  /** e1RM in kg (strength) or seconds per km (endurance) */
  from: number;
  to: number;
  /** signed percent, POSITIVE ALWAYS MEANS BETTER (heavier, or faster) */
  pct: number;
  /** how many logged efforts back this movement in the window */
  points: number;
}

export interface CapabilityTrend {
  /** Mean signed percent across every qualifying movement, or null when the
   *  athlete has no movement present in both halves — which is a real answer
   *  ("not enough history yet"), never a zero. */
  pct: number | null;
  /** the window, in weeks */
  weeks: number;
  /** every qualifying movement, biggest evidence base first */
  movements: CapabilityMovement[];
  /** the most-trained example of each kind, for a one-line summary */
  strength: CapabilityMovement | null;
  endurance: CapabilityMovement | null;
}

const pctChange = (from: number, to: number, betterIs: "high" | "low"): number => {
  if (!from) return 0;
  const raw = ((to - from) / from) * 100;
  return betterIs === "high" ? raw : -raw;
};

/** Best (or fastest) value in a half, or null when the half is empty. */
const bestIn = <T>(pts: T[], at: (p: T) => number, val: (p: T) => number, from: number, to: number, betterIs: "high" | "low"): number | null => {
  let out: number | null = null;
  for (const p of pts) {
    const t = at(p);
    if (!Number.isFinite(t) || t < from || t >= to) continue;
    const v = val(p);
    if (v <= 0) continue;
    if (out === null || (betterIs === "high" ? v > out : v < out)) out = v;
  }
  return out;
};

const countIn = <T>(pts: T[], at: (p: T) => number, from: number, to: number): number =>
  pts.reduce((n, p) => (at(p) >= from && at(p) < to ? n + 1 : n), 0);

/**
 * Capability over the last `weeks` (default 8), comparing the most recent half
 * to the half before it.
 *
 * `bw` is threaded through to `e1rmSeries` so bodyweight movements resolve at
 * each session's own weight — an athlete who lost 4 kg did not get weaker at
 * pull-ups, and the comparison must not say they did.
 */
export function capabilityTrend(
  sessions: LoggedSession[],
  opts?: { weeks?: number; now?: number; bw?: BodyweightInput },
): CapabilityTrend {
  const weeks = Math.max(2, opts?.weeks ?? 8);
  const now = opts?.now ?? Date.now();
  const start = now - weeks * 7 * DAY;
  const mid = now - (weeks / 2) * 7 * DAY;

  // Device-true first: a run the watch measured is the run that happened, and
  // pace derived from a rounded typed duration would contradict the panel that
  // shows the recording. See device-truth.ts.
  const measured = deviceTrueSessions(sessions);

  const names = { strength: new Set<string>(), endurance: new Set<string>() };
  for (const s of measured) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < start) continue;
    for (const b of s.blocks) {
      if (b.kind === "strength") names.strength.add(b.name);
      else if (b.kind === "cardio" && b.distance && b.distance > 0) names.endurance.add(b.name);
    }
  }

  const movements: CapabilityMovement[] = [];

  for (const lift of names.strength) {
    const pts = e1rmSeries(measured, lift, opts?.bw);
    const at = (p: { date: string }) => Date.parse(p.date);
    const prev = bestIn(pts, at, (p) => p.e1rm, start, mid, "high");
    const recent = bestIn(pts, at, (p) => p.e1rm, mid, now + 1, "high");
    if (prev === null || recent === null) continue;
    movements.push({
      kind: "strength", name: lift, from: prev, to: recent,
      pct: pctChange(prev, recent, "high"),
      points: countIn(pts, at, start, now + 1),
    });
  }

  for (const move of names.endurance) {
    const pts = paceSeries(measured, move);
    const at = (p: { date: string }) => Date.parse(p.date);
    const prev = bestIn(pts, at, (p) => p.secPerKm, start, mid, "low");
    const recent = bestIn(pts, at, (p) => p.secPerKm, mid, now + 1, "low");
    if (prev === null || recent === null) continue;
    movements.push({
      kind: "endurance", name: move, from: prev, to: recent,
      pct: pctChange(prev, recent, "low"),
      points: countIn(pts, at, start, now + 1),
    });
  }

  // Most-evidenced first, so the example the UI shows is the movement the
  // athlete actually trains rather than whichever one moved most.
  movements.sort((a, b) => b.points - a.points || Math.abs(b.pct) - Math.abs(a.pct));

  const pct = movements.length
    ? Math.round((movements.reduce((a, m) => a + m.pct, 0) / movements.length) * 10) / 10
    : null;

  return {
    pct,
    weeks,
    movements,
    strength: movements.find((m) => m.kind === "strength") ?? null,
    endurance: movements.find((m) => m.kind === "endurance") ?? null,
  };
}
