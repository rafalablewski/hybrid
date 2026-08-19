import { describe, it, expect } from "vitest";
import {
  replayLandmarks,
  testedMuscles,
  REPLAY_VERDICT_KEY,
  SETTLED_DRIFT,
  SETTLE_WINDOW,
} from "./landmark-replay";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import { checkinFromSoreness } from "../checkin-scales";
import { athleteLandmarks } from "./landmark-resolve";

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
const NOW = Date.parse("2026-07-28T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * A REAL BLOCK, NOT A SYNTHETIC WEEK.
 *
 * Twelve weeks of quad training for one athlete, built the way a block actually
 * runs: three squat sessions a week, sets ramping from MEV toward the ceiling
 * and past it, a top set that holds while the volume is absorbed and falls when
 * it isn't, and a daily check-in whose freshness tracks the same story. Each
 * session carries an in-the-gym spentness read so the recovery pairs have an
 * anchor.
 *
 * This is the fixture the adaptive estimator was missing: the previous tests
 * proved the arithmetic on hand-built weeks, which cannot show whether the
 * estimate CONVERGES when fed a plausible training history.
 */
function block(opts: {
  weeks: number;
  /** Working sets per week, by week index (0 = oldest). */
  sets: (w: number) => number;
  /** Top-set load that week, kg. */
  load: (w: number) => number;
  /** In-the-gym spentness, 1–5. */
  gymSpent: (w: number) => number;
  /** Next-morning spentness, 1–5 — the recovery read. */
  morningSpent: (w: number) => number;
}): { sessions: LoggedSession[]; recovery: RecoveryReport[] } {
  const sessions: LoggedSession[] = [];
  const recovery: RecoveryReport[] = [];
  const start = NOW - opts.weeks * WEEK;

  for (let w = 0; w < opts.weeks; w++) {
    const perSession = Math.max(1, Math.round(opts.sets(w) / 3));
    for (let d = 0; d < 3; d++) {
      // Mon / Wed / Fri, ending at 18:00, so no two sessions sit inside one
      // recovery gap and every pair is clean.
      const end = start + w * WEEK + d * 2 * DAY + 18 * H;
      if (end > NOW) continue;
      sessions.push({
        id: `w${w}d${d}`,
        title: "Lower",
        startedAt: iso(end - 90 * 60_000),
        completedAt: iso(end),
        fatigue: opts.gymSpent(w),
        feelLoggedAt: iso(end + 10 * 60_000),
        blocks: [
          {
            kind: "strength",
            name: "Back Squat",
            sets: Array.from({ length: perSession }, () => ({ reps: "5", load: String(opts.load(w)) })),
          },
        ],
      } as LoggedSession);

      // The next morning's check-in — 14 h after the session ended.
      const at = end + 14 * H;
      if (at > NOW) continue;
      recovery.push({
        date: iso(at),
        soreness: checkinFromSoreness(opts.morningSpent(w)),
        energy: 6 - opts.morningSpent(w),
        loggedAt: iso(at),
      });
    }
  }
  return { sessions, recovery };
}

const PROFILE = { experience: "intermediate" as const, bodyweightKg: 82, heightCm: 180, daysPerWeek: 4 };

describe("replaying the estimate across a real block", () => {
  /**
   * The athlete ramps volume for six weeks and absorbs all of it: top set keeps
   * climbing, mornings stay fresh. The ceiling should be pushed UP and then stop
   * moving once the log stops producing new information.
   */
  const absorbed = block({
    weeks: 12,
    sets: (w) => Math.min(9 + w * 2, 22),
    load: (w) => 120 + w * 2.5,
    gymSpent: () => 3,
    morningSpent: () => 2,
  });

  it("produces a point for every replayed week, oldest first, with no lookahead", () => {
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 6 });
    const quads = r.find((x) => x.muscle === "quads")!;
    expect(quads.points).toHaveLength(6);
    expect(quads.points[0]!.weeksAgo).toBe(5);
    expect(quads.points[5]!.weeksAgo).toBe(0);
    for (const p of quads.points) expect(Date.parse(p.at)).toBeLessThanOrEqual(NOW);
  });

  it("THE PROOF: the estimate converges rather than wandering", () => {
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 8 });
    const quads = r.find((x) => x.muscle === "quads")!;
    expect(quads.testedWeeks).toBeGreaterThanOrEqual(SETTLE_WINDOW);
    expect(quads.verdict).toBe("settled");
    expect(quads.drift).toBeLessThanOrEqual(SETTLED_DRIFT);
  });

  it("an absorbed ramp raises the ceiling above the profile prior", () => {
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 8 });
    const quads = r.find((x) => x.muscle === "quads")!;
    const last = quads.points[quads.points.length - 1]!;
    expect(last.mrv).toBeGreaterThan(last.prior);
  });

  it("the replay's last point IS what the app shows today", () => {
    // The diagnostic must not be a second estimator. Same resolver, same answer.
    const live = athleteLandmarks({ profile: PROFILE, sessions: absorbed.sessions, recovery: absorbed.recovery, now: NOW });
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 4 });
    for (const rep of r) {
      expect(rep.points[rep.points.length - 1]!.mrv).toBe(live.landmarks[rep.muscle].mrv);
      expect(rep.current).toBe(live.landmarks[rep.muscle].mrv);
    }
  });

  /**
   * The same ramp, but the athlete stops absorbing it: from week 6 the top set
   * slides and the mornings turn heavy. The ceiling should come back DOWN.
   */
  const overreached = block({
    weeks: 12,
    sets: (w) => Math.min(9 + w * 2, 24),
    load: (w) => (w < 6 ? 120 + w * 2.5 : 135 - (w - 6) * 4),
    gymSpent: (w) => (w < 6 ? 3 : 4),
    morningSpent: (w) => (w < 6 ? 2 : 5),
  });

  it("an athlete who stops absorbing gets a LOWER ceiling than one who doesn't", () => {
    const a = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 6 });
    const b = replayLandmarks(overreached.sessions, overreached.recovery, { profile: PROFILE, now: NOW, replayWeeks: 6 });
    const qa = a.find((x) => x.muscle === "quads")!;
    const qb = b.find((x) => x.muscle === "quads")!;
    expect(qb.current).toBeLessThan(qa.current);
    // …and it settles there. The week classifier goes quiet once the athlete
    // backs off — there is no longer enough volume to test a ceiling — but the
    // measured clearance rate is still holding the number down, which is
    // exactly the case `tested` exists to keep visible.
    expect(qb.verdict).toBe("settled");
    expect(qb.points[qb.points.length - 1]!.adapted).toBe(false);
    expect(qb.points[qb.points.length - 1]!.tested).toBe(true);
  });

  it("names the muscles the log actually tested, and stays quiet about the rest", () => {
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: NOW, replayWeeks: 6 });
    const tested = testedMuscles(r);
    expect(tested.length).toBeGreaterThan(0);
    expect(tested.map((x) => x.muscle)).toContain("quads");
    // Nothing trained the chest in this block, so it must not appear as evidence.
    expect(tested.map((x) => x.muscle)).not.toContain("chest");
    for (const x of tested) expect(x.testedWeeks).toBeGreaterThan(0);
  });
});

describe("when there isn't enough to say anything", () => {
  it("an empty log is 'insufficient', not 'settled'", () => {
    const r = replayLandmarks([], [], { profile: PROFILE, now: NOW, replayWeeks: 6 });
    for (const x of r) {
      expect(x.verdict).toBe("insufficient");
      expect(x.testedWeeks).toBe(0);
    }
    expect(testedMuscles(r)).toEqual([]);
  });

  it("evidence that has aged out cannot certify the current estimate", () => {
    // The absorbed block, replayed 11 weeks after the athlete stopped training.
    // The early replay points still see the ramp inside their own lookback, so
    // stale tested weeks exist — but both observed layers have expired at the
    // recent points and the line has flattened back onto the profile prior.
    // That flat tail must read "insufficient", never "settled".
    const absorbed = block({
      weeks: 12,
      sets: (w) => Math.min(9 + w * 2, 22),
      load: (w) => 120 + w * 2.5,
      // A WELL-RESOLVED pair (5 in the gym, 2 the next morning), so the
      // evidence this test needs to age out is evidence that genuinely moved
      // the estimate. With a 3→2 pair the interval is wide enough that the
      // clearance term barely moves a landmark at all (feel-timing.ts,
      // `resolutionOf`), and the fixture would be proving the damping rather
      // than the ageing-out this test is about.
      gymSpent: () => 5,
      morningSpent: () => 2,
    });
    const later = NOW + 11 * WEEK;
    const r = replayLandmarks(absorbed.sessions, absorbed.recovery, { profile: PROFILE, now: later, replayWeeks: 8 });
    const quads = r.find((x) => x.muscle === "quads")!;
    expect(quads.testedWeeks).toBeGreaterThanOrEqual(SETTLE_WINDOW);
    expect(quads.points[quads.points.length - 1]!.tested).toBe(false);
    expect(quads.verdict).toBe("insufficient");
  });

  it("a flat line at the prior is never called evidence", () => {
    // Three sets a week forever: real training, but nowhere near a ceiling.
    const light = block({ weeks: 10, sets: () => 3, load: () => 100, gymSpent: () => 2, morningSpent: () => 2 });
    const r = replayLandmarks(light.sessions, light.recovery, { profile: PROFILE, now: NOW, replayWeeks: 6 });
    expect(r.find((x) => x.muscle === "quads")!.verdict).toBe("insufficient");
  });

  it("every verdict has a line of copy naming it", () => {
    for (const v of ["settled", "converging", "unsettled", "insufficient"] as const) {
      expect(REPLAY_VERDICT_KEY[v].startsWith("w.analyze.vol.replay")).toBe(true);
    }
  });
});
