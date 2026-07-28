import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import { athleteLandmarks, type AthleteLandmarkOptions } from "./landmark-resolve";
import { ALL_MUSCLES } from "./movements";

/**
 * WHAT THE ESTIMATE WOULD HAVE SAID, WEEK BY WEEK.
 *
 * `landmark-adapt.ts` produces one number: your recoverable ceiling, today. It
 * is tested against synthetic weeks and it is arithmetically correct, and none
 * of that answers the question an athlete actually has, which is whether to
 * believe it.
 *
 * A single number cannot answer that. A TRAJECTORY can. Re-run the estimator at
 * every week in the athlete's own history — same inputs, same rules, only the
 * clock moved back — and the shape of the answer is the evidence:
 *
 *   SETTLED    the estimate stopped moving several weeks ago. It has seen
 *              enough of this athlete to stop changing its mind, which is the
 *              closest thing to a validated ceiling the app can offer.
 *   CONVERGING still moving, but by less each time. Worth showing, with the
 *              movement visible rather than a confident-looking single figure.
 *   UNSETTLED  jumping around. Something is wrong — too little volume to test a
 *              ceiling, or an athlete whose life changed mid-block. The honest
 *              response is to say the estimate is not ready, not to print it.
 *
 * This is a diagnostic, not a second estimator. It calls exactly the same
 * resolver the app uses, so it cannot drift from it: if the replay looks good
 * and the live number is wrong, the replay is wrong in the same way, which is
 * itself the point of building it this way.
 *
 * COST. One resolve per week per replay — the estimator walks the log each
 * time. Bounded by `weeks` (default 8), and callers should memoise it; it is a
 * screen-level computation, not a per-render one.
 */

const WEEK_MS = 7 * 86_400_000;

/** What the estimator said at one point in the past. */
export interface ReplayPoint {
  /** 0 = now, 1 = a week ago, … */
  weeksAgo: number;
  /** ISO of the moment the estimate was taken. */
  at: string;
  /** The ceiling it produced, weekly sets. */
  mrv: number;
  /** The prior it started from that week (profile ± measured clearance). */
  prior: number;
  /** 0…1 — the adaptive estimator's own confidence at that point. */
  confidence: number;
  /** True when the WEEK-CLASSIFIER moved this muscle's ceiling that week. */
  adapted: boolean;
  /**
   * True when the log has moved this ceiling off the answer the profile alone
   * would give — by EITHER observed route, the week classifier or the measured
   * clearance rate.
   *
   * The distinction from `adapted` matters. An athlete who ramps into a wall and
   * backs off stops producing qualifying weeks (there is no longer enough volume
   * to test a ceiling), so `adapted` goes false — while their measured clearance
   * is still holding the ceiling down. Counting only `adapted` would call that
   * trajectory "not enough evidence" at the exact moment the app is most
   * confident about them.
   *
   * Defined against the profile answer rather than against "some observed layer
   * ran", because a layer that ran and changed nothing has told the athlete
   * nothing, and a flat line at the prior must never be presented as a settled
   * measurement.
   */
  tested: boolean;
}

export type ReplayVerdict = "settled" | "converging" | "unsettled" | "insufficient";

export interface LandmarkReplay {
  muscle: MuscleGroup;
  /** Oldest first, so it reads left to right. */
  points: ReplayPoint[];
  verdict: ReplayVerdict;
  /** Largest week-on-week change across the recent window, in sets. */
  drift: number;
  /** The estimate now. */
  current: number;
  /** How many of the replayed weeks the log said anything about the ceiling. */
  testedWeeks: number;
}

/** A ceiling that hasn't moved by more than this across the settle window is
 *  settled. One set of wobble is the rounding, not a change of mind. */
export const SETTLED_DRIFT = 1;
/** …and converging is "still moving, but within a band you can train inside". */
export const CONVERGING_DRIFT = 2;
/** How many recent weeks the verdict looks at. Fewer than this and there is
 *  nothing to say about stability. */
export const SETTLE_WINDOW = 3;

function verdictFor(points: ReplayPoint[]): { verdict: ReplayVerdict; drift: number } {
  if (points.filter((p) => p.tested).length < SETTLE_WINDOW) return { verdict: "insufficient", drift: 0 };
  const recent = points.slice(-SETTLE_WINDOW);
  let drift = 0;
  for (let i = 1; i < recent.length; i++) drift = Math.max(drift, Math.abs(recent[i]!.mrv - recent[i - 1]!.mrv));
  if (drift <= SETTLED_DRIFT) return { verdict: "settled", drift };
  if (drift <= CONVERGING_DRIFT) return { verdict: "converging", drift };
  return { verdict: "unsettled", drift };
}

export interface ReplayOptions extends Omit<AthleteLandmarkOptions, "sessions" | "recovery" | "now"> {
  now?: number;
  /** How many weekly snapshots to take. */
  replayWeeks?: number;
}

/**
 * Re-run the resolver at each of the last `replayWeeks` week boundaries.
 *
 * Only sessions and check-ins that existed AT each point are visible to that
 * point's estimate — the whole exercise is worthless if a replay of six weeks
 * ago can see next week's training.
 */
export function replayLandmarks(
  sessions: LoggedSession[],
  recovery: RecoveryReport[] = [],
  opts: ReplayOptions = {},
): LandmarkReplay[] {
  const now = opts.now ?? Date.now();
  const weeks = Math.max(2, Math.min(16, Math.round(opts.replayWeeks ?? 8)));

  // The answer the profile alone gives. Time-independent — no sessions, no
  // observed layers — so it is computed once and every point measured against
  // it. This is the line the log has to move to count as evidence.
  const profileOnly = athleteLandmarks({ ...opts, sessions: [], recovery: [], adaptive: false, now });

  const byMuscle = new Map<MuscleGroup, ReplayPoint[]>();
  for (const m of ALL_MUSCLES) byMuscle.set(m, []);

  for (let w = weeks - 1; w >= 0; w--) {
    const at = now - w * WEEK_MS;
    // No lookahead: the past cannot be estimated from data that hadn't happened.
    const seen = sessions.filter((s) => {
      const t = Date.parse(s.completedAt ?? s.startedAt ?? "");
      return Number.isFinite(t) && t <= at;
    });
    const seenRecovery = recovery.filter((r) => {
      const t = Date.parse(r.loggedAt ?? r.date);
      return Number.isFinite(t) && t <= at;
    });

    const resolved = athleteLandmarks({ ...opts, sessions: seen, recovery: seenRecovery, now: at });
    const iso = new Date(at).toISOString();
    for (const m of ALL_MUSCLES) {
      const est = resolved.estimates[m];
      const adapted = resolved.adapted.includes(m);
      byMuscle.get(m)!.push({
        weeksAgo: w,
        at: iso,
        mrv: resolved.landmarks[m].mrv,
        prior: est?.prior ?? resolved.landmarks[m].mrv,
        confidence: est?.confidence ?? 0,
        adapted,
        tested: resolved.landmarks[m].mrv !== profileOnly.landmarks[m].mrv,
      });
    }
  }

  return ALL_MUSCLES.map((muscle) => {
    const points = byMuscle.get(muscle)!;
    const { verdict, drift } = verdictFor(points);
    return {
      muscle,
      points,
      verdict,
      drift,
      current: points[points.length - 1]?.mrv ?? 0,
      testedWeeks: points.filter((p) => p.tested).length,
    };
  });
}

/** The muscles worth showing: the ones the log has actually said something
 *  about, most-tested first. Everything else is the prior, and a flat line of
 *  the prior is not evidence of anything. */
export function testedMuscles(replays: LandmarkReplay[]): LandmarkReplay[] {
  return replays
    .filter((r) => r.points.some((p) => p.adapted))
    .sort((a, b) => b.testedWeeks - a.testedWeeks || a.muscle.localeCompare(b.muscle));
}

export const REPLAY_VERDICT_KEY: Record<ReplayVerdict, string> = {
  settled: "w.analyze.vol.replaySettled",
  converging: "w.analyze.vol.replayConverging",
  unsettled: "w.analyze.vol.replayUnsettled",
  insufficient: "w.analyze.vol.replayInsufficient",
};
