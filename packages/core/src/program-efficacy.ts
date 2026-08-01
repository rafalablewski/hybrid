/**
 * Program Efficacy Index — programs ranked by MEASURED outcome, not vibes.
 *
 * The claim this module exists to make checkable: "this program, run by
 * athletes like you, produced this much strength." Every number it returns is
 * computed from what enrolled athletes actually logged over the standard
 * 12-week observation window, and nothing is published for a cohort smaller
 * than K_ANON athletes — a program card either carries real evidence or it
 * says it is still collecting, never a synthetic score.
 *
 * v1 scope (deliberate):
 * - OUTCOME is the athlete's e1RM change per lift: best e1RM in the window's
 *   first three weeks vs its last three weeks, per lift, athlete-level result
 *   = the mean across their qualifying lifts, program-level = the MEDIAN
 *   across athletes (medians because one outlier PR must not buy a ranking).
 * - ADHERENCE is the logged-days rate: distinct local days trained in the
 *   window over the days the program prescribes for it. Coarse but uniform
 *   across disciplines; the claim-based planSchedule adherence is the NEXT
 *   refinement (it needs per-day claiming to be fair to repeating programs).
 * - DROPOUT is stopping: an athlete whose last logged session lands before
 *   week 8 of 12 dropped out. Dropouts count against the program's dropout
 *   rate and are excluded from the outcome median (their absence is already
 *   reported honestly in `dropoutRate` — counting their truncated deltas
 *   would double-punish).
 * - Endurance programs produce no e1RM outcome; they appear as "collecting"
 *   until the pace-based outcome lands (NEXT).
 *
 * Pure: callers fetch enrollments + sessions, this module only computes.
 */
import type { LoggedSession } from "./engines/session";
import { e1rmSeries } from "./engines/session";
import { programCalendarDays } from "./plan-day";
import { programFor } from "./plan-programs";
import { K_ANON } from "./datanet";
import { localDayKey } from "./day-key";

const DAY = 86_400_000;

/** The standard observation window — the audit's "12-week e1RM delta". */
export const EFFICACY_WINDOW_DAYS = 84;
/** Baseline = best e1RM in the first BASE_DAYS; endpoint = best in the last. */
const BASE_DAYS = 21;
/** Last logged session before this day of the window = the athlete stopped. */
const DROPOUT_BEFORE_DAY = 56;
/** A lift needs this many sessions in the window to qualify (noise floor). */
const MIN_LIFT_SESSIONS = 4;

export type AdherenceBand = "high" | "mid" | "low";

/** ≥80% of prescribed days trained = high, ≥50% = mid, under = low. */
export function adherenceBand(rate: number): AdherenceBand {
  return rate >= 0.8 ? "high" : rate >= 0.5 ? "mid" : "low";
}

/** One athlete's enrollment: who, which program, when, and what they logged. */
export interface EfficacyEnrollment {
  userId: string;
  planId: string;
  startedAt: string | number | Date;
  /** The athlete's sessions (any range — windowed internally). */
  sessions: LoggedSession[];
  bodyweightKg?: number | null;
}

/** What one enrollment proved, or why it proved nothing. */
export interface EnrollmentOutcome {
  userId: string;
  planId: string;
  /** null while the 12-week window is still open — not evidence either way. */
  status: "measured" | "dropped" | "no-lifts";
  /** 0..1 logged-days rate over the window. */
  adherence: number;
  /** Mean across qualifying lifts of the athlete's e1RM change, as a fraction. */
  deltaPct: number | null;
  lifts: { lift: string; deltaPct: number; deltaKg: number }[];
}

export interface LiftEfficacy {
  lift: string;
  n: number;
  medianDeltaPct: number;
  medianDeltaKg: number;
}

export interface AdherenceBandEfficacy {
  band: AdherenceBand;
  n: number;
  medianDeltaPct: number;
}

/** The published card. Only exists at n ≥ K_ANON — see `programEfficacy`. */
export interface ProgramEfficacy {
  planId: string;
  /** Athletes with a measured outcome (completed window + qualifying lifts). */
  n: number;
  /** Enrollments old enough to judge (window closed), measured or not. */
  enrolled: number;
  /** Share of `enrolled` who stopped logging before week 8. */
  dropoutRate: number;
  /** Median athlete-level 12-week e1RM change, as a fraction (0.06 = +6%). */
  medianDeltaPct: number;
  /** Median logged-days adherence among measured athletes, 0..1. */
  medianAdherence: number;
  /** Per-lift medians — each row independently k-anonymous. */
  lifts: LiftEfficacy[];
  /** Outcome by adherence band — each row independently k-anonymous. */
  byAdherence: AdherenceBandEfficacy[];
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Prescribed training days across the 12-week window: a repeating one-week
 *  program prescribes its weekly count × 12; a fixed-length program its own
 *  total, capped at what fits in the window when it runs longer. */
function prescribedDays(planId: string): number | null {
  const cal = programCalendarDays(planId);
  const program = programFor(planId);
  if (!cal || !program || cal.trainingCount === 0) return null;
  const weeks = program.weeks.length;
  if (weeks <= 1) return cal.trainingCount * 12;
  const perWeek = cal.trainingCount / weeks;
  return Math.round(weeks >= 12 ? perWeek * 12 : cal.trainingCount);
}

/**
 * Judge one enrollment against the 12-week window. Returns null while the
 * window is still open — an unfinished run is not evidence of anything.
 */
export function enrollmentOutcome(
  e: EfficacyEnrollment,
  opts: { now?: number } = {},
): EnrollmentOutcome | null {
  const start = new Date(e.startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const now = opts.now ?? Date.now();
  const end = start + EFFICACY_WINDOW_DAYS * DAY;
  if (now < end) return null; // window still open

  const inWindow = e.sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return t >= start && t < end;
  });

  const expected = prescribedDays(e.planId);
  const daysTrained = new Set(inWindow.map((s) => localDayKey(s.startedAt))).size;
  const adherence = expected ? Math.min(1, daysTrained / expected) : 0;

  const base = { userId: e.userId, planId: e.planId, adherence };

  const lastTs = inWindow.reduce((m, s) => Math.max(m, new Date(s.startedAt).getTime()), 0);
  if (!inWindow.length || lastTs < start + DROPOUT_BEFORE_DAY * DAY)
    return { ...base, status: "dropped", deltaPct: null, lifts: [] };

  // Lifts with enough presence in the window to carry a before/after read.
  const liftCounts = new Map<string, number>();
  for (const s of inWindow)
    for (const b of s.blocks)
      if (b.kind === "strength") liftCounts.set(b.name, (liftCounts.get(b.name) ?? 0) + 1);

  const lifts: EnrollmentOutcome["lifts"] = [];
  for (const [lift, count] of liftCounts) {
    if (count < MIN_LIFT_SESSIONS) continue;
    const pts = e1rmSeries(inWindow, lift, e.bodyweightKg ?? undefined);
    const baseline = pts.filter((p) => new Date(p.date).getTime() < start + BASE_DAYS * DAY);
    const endpoint = pts.filter((p) => new Date(p.date).getTime() >= end - BASE_DAYS * DAY);
    if (!baseline.length || !endpoint.length) continue;
    const b0 = Math.max(...baseline.map((p) => p.e1rm));
    const b1 = Math.max(...endpoint.map((p) => p.e1rm));
    if (b0 <= 0) continue;
    lifts.push({ lift, deltaPct: (b1 - b0) / b0, deltaKg: b1 - b0 });
  }

  if (!lifts.length) return { ...base, status: "no-lifts", deltaPct: null, lifts: [] };
  lifts.sort((a, b) => b.deltaKg - a.deltaKg);
  return {
    ...base,
    status: "measured",
    deltaPct: lifts.reduce((s, l) => s + l.deltaPct, 0) / lifts.length,
    lifts,
  };
}

/**
 * Aggregate one program's closed-window enrollments into its efficacy card.
 * Returns null below K_ANON measured athletes — a cohort too small to publish
 * is too small to rank, and suppression beats a misleading n=2 median. Each
 * per-lift and per-band row is suppressed independently by the same rule.
 */
export function programEfficacy(
  planId: string,
  enrollments: EfficacyEnrollment[],
  opts: { now?: number; minN?: number } = {},
): ProgramEfficacy | null {
  const minN = opts.minN ?? K_ANON;
  const outcomes: EnrollmentOutcome[] = [];
  const seen = new Set<string>();
  for (const e of enrollments) {
    if (e.planId !== planId) continue;
    // One read per athlete per program — a re-run must not double-count.
    if (seen.has(e.userId)) continue;
    const o = enrollmentOutcome(e, opts);
    if (!o) continue;
    seen.add(e.userId);
    outcomes.push(o);
  }

  const measured = outcomes.filter((o) => o.status === "measured");
  if (measured.length < minN) return null;

  const liftRows = new Map<string, { pct: number[]; kg: number[] }>();
  for (const o of measured)
    for (const l of o.lifts) {
      const r = liftRows.get(l.lift) ?? { pct: [], kg: [] };
      r.pct.push(l.deltaPct);
      r.kg.push(l.deltaKg);
      liftRows.set(l.lift, r);
    }

  const bands = new Map<AdherenceBand, number[]>();
  for (const o of measured) {
    const band = adherenceBand(o.adherence);
    const arr = bands.get(band) ?? [];
    arr.push(o.deltaPct!);
    bands.set(band, arr);
  }

  return {
    planId,
    n: measured.length,
    enrolled: outcomes.length,
    dropoutRate: outcomes.length
      ? outcomes.filter((o) => o.status === "dropped").length / outcomes.length
      : 0,
    medianDeltaPct: median(measured.map((o) => o.deltaPct!)),
    medianAdherence: median(measured.map((o) => o.adherence)),
    lifts: [...liftRows.entries()]
      .filter(([, r]) => r.pct.length >= minN)
      .map(([lift, r]) => ({
        lift,
        n: r.pct.length,
        medianDeltaPct: median(r.pct),
        medianDeltaKg: median(r.kg),
      }))
      .sort((a, b) => b.n - a.n || b.medianDeltaPct - a.medianDeltaPct),
    byAdherence: (["high", "mid", "low"] as const)
      .map((band) => ({ band, n: bands.get(band)?.length ?? 0, medianDeltaPct: bands.get(band)?.length ? median(bands.get(band)!) : 0 }))
      .filter((r) => r.n >= minN),
  };
}

/** The ranking rule: measured outcome first, evidence weight breaks ties.
 *  Programs without a card rank below every program with one — an unmeasured
 *  program is not "average", it is unproven. */
export function rankProgramCards(cards: ProgramEfficacy[]): ProgramEfficacy[] {
  return [...cards].sort((a, b) => b.medianDeltaPct - a.medianDeltaPct || b.n - a.n);
}

export interface EfficacyLineView {
  measured: boolean;
  headline: string;
  sub: string;
}

const signedPct = (f: number) => `${f >= 0 ? "+" : ""}${(f * 100).toFixed(1)}%`;

/** The ONE line both clients print on a plan cover — identical copy by
 *  construction, and honest when there is nothing to print yet. */
export function efficacyLine(card: ProgramEfficacy | null | undefined): EfficacyLineView {
  if (!card) {
    return {
      measured: false,
      headline: "Not yet measured",
      sub: "Publishes automatically once 5+ athletes finish a 12-week window on this program.",
    };
  }
  return {
    measured: true,
    headline: `${signedPct(card.medianDeltaPct)} e1RM in 12 weeks (median, n=${card.n})`,
    sub: `Adherence ${(card.medianAdherence * 100).toFixed(0)}% median — dropout ${(card.dropoutRate * 100).toFixed(0)}% of ${card.enrolled} enrolled. Measured from real logs, k-anonymous (n ≥ 5).`,
  };
}
