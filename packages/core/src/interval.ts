/**
 * Interval-timer engine — pure, shared by web + mobile so both clients run the
 * identical work/rest sequencing and clock formatting. The UI owns the ticking
 * (setInterval); this owns the math: expanding a config into an ordered list of
 * phases and locating where a given elapsed second lands.
 */
export type IntervalPhaseKind = "prep" | "work" | "rest";

export interface IntervalPhase {
  kind: IntervalPhaseKind;
  /** Duration of this phase, seconds. */
  seconds: number;
  /** 1-based round this phase belongs to (prep is round 0). */
  round: number;
  /** Total rounds, for "Round x/N" display. */
  totalRounds: number;
}

export interface IntervalConfig {
  rounds: number;
  workSec: number;
  restSec: number;
  /** Optional lead-in countdown before round 1. */
  prepSec?: number;
}

/** mm:ss (clamped at 0; supports >59 min as needed). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Expand a config into the ordered phase list (prep → work/rest × rounds; the
 *  final rest is dropped so a session ends on work). */
export function buildIntervalPlan(cfg: IntervalConfig): IntervalPhase[] {
  const rounds = Math.max(1, Math.floor(cfg.rounds));
  const work = Math.max(1, Math.floor(cfg.workSec));
  const rest = Math.max(0, Math.floor(cfg.restSec));
  const prep = Math.max(0, Math.floor(cfg.prepSec ?? 0));
  const phases: IntervalPhase[] = [];
  if (prep > 0) phases.push({ kind: "prep", seconds: prep, round: 0, totalRounds: rounds });
  for (let r = 1; r <= rounds; r++) {
    phases.push({ kind: "work", seconds: work, round: r, totalRounds: rounds });
    if (rest > 0 && r < rounds) phases.push({ kind: "rest", seconds: rest, round: r, totalRounds: rounds });
  }
  return phases;
}

/** Total seconds across all phases. */
export function intervalTotalSeconds(plan: IntervalPhase[]): number {
  return plan.reduce((sum, p) => sum + p.seconds, 0);
}

export interface IntervalPosition {
  /** Index into the plan, or plan.length when finished. */
  phaseIndex: number;
  /** Seconds remaining in the current phase. */
  remaining: number;
  done: boolean;
}

/** Given total elapsed seconds, find which phase we're in and the seconds left
 *  in it. Used to drive the display from a single elapsed counter. */
export function locateInterval(plan: IntervalPhase[], elapsed: number): IntervalPosition {
  let acc = 0;
  for (let i = 0; i < plan.length; i++) {
    const end = acc + plan[i]!.seconds;
    if (elapsed < end) return { phaseIndex: i, remaining: end - elapsed, done: false };
    acc = end;
  }
  return { phaseIndex: plan.length, remaining: 0, done: true };
}
