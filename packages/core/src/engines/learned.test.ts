import { describe, it, expect } from "vitest";
import {
  learnedMonth,
  learnedFigure,
  learnedIntervalLabel,
  learnedIntervalKey,
  learnedDeltaLabel,
  learnedSense,
  learnedIsEmpty,
  LEARNED_CHAPTERS,
  MIN_READINESS_DAYS,
  type LearnedFinding,
  type LearnedMonth,
} from "./learned";
import { athleteLandmarks } from "./landmark-resolve";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import { checkinFromSoreness } from "../checkin-scales";
import { CLEARANCE_FAST, CLEARANCE_SLOW } from "../feel-timing";
import { MUSCLE_GROUP_KEY } from "../volume-view";

const H = 3_600_000;
const DAY = 24 * H;
const WEEK = 7 * DAY;
const NOW = Date.parse("2026-07-28T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The same real block landmark-replay.test.ts uses — three squat sessions a
 * week, a top set, an in-the-gym read and the next morning's check-in — because
 * this module's whole claim is that it reports what those engines found. A
 * synthetic week would prove the assembly and nothing about the story.
 */
function block(opts: {
  weeks: number;
  sets: (w: number) => number;
  load: (w: number) => number;
  gymSpent: (w: number) => number;
  morningSpent: (w: number) => number;
}): { sessions: LoggedSession[]; recovery: RecoveryReport[] } {
  const sessions: LoggedSession[] = [];
  const recovery: RecoveryReport[] = [];
  const start = NOW - opts.weeks * WEEK;

  for (let w = 0; w < opts.weeks; w++) {
    const perSession = Math.max(1, Math.round(opts.sets(w) / 3));
    for (let d = 0; d < 3; d++) {
      const end = start + w * WEEK + d * 2 * DAY + 18 * H;
      if (end > NOW) continue;
      sessions.push({
        id: `w${w}d${d}`,
        title: "Lower",
        startedAt: iso(end - 90 * 60_000),
        completedAt: iso(end),
        fatigue: opts.gymSpent(w),
        feelLoggedAt: iso(end + 10 * 60_000),
        blocks: [{
          kind: "strength",
          name: "Back Squat",
          sets: Array.from({ length: perSession }, () => ({ reps: "5", load: String(opts.load(w)) })),
        }],
      } as LoggedSession);

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

/** An athlete who ramps volume and absorbs all of it. */
const absorbed = block({
  weeks: 12,
  sets: (w) => Math.min(9 + w * 2, 22),
  load: (w) => 120 + w * 2.5,
  gymSpent: () => 3,
  morningSpent: () => 2,
});

const find = (m: LearnedMonth, id: string): LearnedFinding => {
  const f = m.findings.find((x) => x.id === id);
  if (!f) throw new Error(`no finding ${id} — got ${m.findings.map((x) => x.id).join(", ")}`);
  return f;
};

const story = (over: Parameters<typeof learnedMonth>[0] = {}): LearnedMonth =>
  learnedMonth({ sessions: absorbed.sessions, recovery: absorbed.recovery, landmarks: { profile: PROFILE }, now: NOW, ...over });

describe("the month has nothing to say yet", () => {
  const empty = learnedMonth({ now: NOW });

  it("says so, rather than reporting the population table as a finding", () => {
    expect(learnedIsEmpty(empty)).toBe(true);
    expect(empty.learned).toBe(0);
    expect(empty.headline).toBeNull();
    expect(empty.known).toBe(0);
  });

  it("still emits a finding per chapter — an absence is a finding", () => {
    expect(empty.chapters.map((c) => c.chapter)).toEqual([...LEARNED_CHAPTERS]);
    for (const c of empty.chapters) expect(c.findings.length).toBeGreaterThan(0);
  });

  it("every waiting finding names what would settle it", () => {
    for (const f of empty.findings) {
      expect(f.state).toBe("waiting");
      expect(f.needKey, f.id).toBeTruthy();
      expect(f.confidence).toBe(0);
    }
  });

  it("an unproven clearance rate is labelled as the POPULATION curve, not as you", () => {
    const c = find(empty, "clearance");
    expect(c.source).toBe("population");
    expect(c.value).toBe(1);
    // The honest interval with no pairs is the corridor everybody starts in.
    expect(c.interval).toEqual({ lo: CLEARANCE_FAST, hi: CLEARANCE_SLOW, kind: "belief" });
  });
});

describe("a real block, learned", () => {
  const m = story();

  it("leads with a claim that MOVED, and it is a learned one", () => {
    expect(m.headline).not.toBeNull();
    expect(m.headline!.state).toBe("learned");
    expect(m.headline!.delta).not.toBeNull();
    expect(m.headline!.delta).not.toBe(0);
  });

  it("reports the SAME ceiling the app is showing today", () => {
    // The story is an assembly, not a second estimator. If these ever diverge,
    // this file is the bug.
    const live = athleteLandmarks({ profile: PROFILE, sessions: absorbed.sessions, recovery: absorbed.recovery, now: NOW });
    for (const f of m.findings.filter((x) => x.chapter === "ceiling" && x.muscle)) {
      expect(f.value, f.id).toBe(live.landmarks[f.muscle!].mrv);
    }
  });

  it("every ceiling claim carries its evidence count, interval and provenance", () => {
    const ceilings = m.findings.filter((f) => f.chapter === "ceiling" && f.state === "learned");
    expect(ceilings.length).toBeGreaterThan(0);
    for (const f of ceilings) {
      expect(f.source).toBe("observed");
      expect(f.evidence).toBeGreaterThan(0);
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.interval!.kind).toBe("belief");
      expect(f.interval!.lo).toBeLessThanOrEqual(f.value!);
      expect(f.interval!.hi).toBeGreaterThanOrEqual(f.value!);
      // It names the muscle through the one shared map, so `posterior` cannot
      // print its own key.
      expect(f.titleKey).toBe(MUSCLE_GROUP_KEY[f.muscle!]);
    }
  });

  it("names the untested muscles ONCE, with the count and what would test them", () => {
    const untested = m.findings.filter((f) => f.id === "ceiling:untested");
    expect(untested).toHaveLength(1);
    expect(untested[0]!.state).toBe("waiting");
    expect(untested[0]!.evidence).toBeGreaterThan(0);
    expect(untested[0]!.needKey).toBe("w.learned.needWeeks");
    // Untested means the prior still stands — never "observed".
    expect(untested[0]!.source).toBe("profile");
  });

  it("measures the clearance rate and states its standard error", () => {
    const c = find(m, "clearance");
    expect(c.state).toBe("learned");
    expect(c.source).toBe("observed");
    expect(c.evidence).toBeGreaterThanOrEqual(2);
    expect(c.interval!.lo).toBeLessThan(c.value!);
    expect(c.interval!.hi).toBeGreaterThan(c.value!);
    expect(c.labelKey).toBeTruthy();
  });

  it("reports readiness as a mean with the athlete's own SPREAD, not a confidence band", () => {
    const r = find(m, "readiness:level");
    expect(r.state).toBe("learned");
    expect(r.evidence).toBeGreaterThanOrEqual(MIN_READINESS_DAYS);
    expect(r.interval!.kind).toBe("spread");
    expect(r.interval!.lo).toBeLessThanOrEqual(r.value!);
    expect(r.interval!.hi).toBeGreaterThanOrEqual(r.value!);
  });

  it("names the limiter as a share of the deficit, counted rather than estimated", () => {
    const l = find(m, "readiness:limiter");
    expect(l.state).toBe("learned");
    expect(l.value!).toBeGreaterThan(0);
    expect(l.value!).toBeLessThanOrEqual(100);
    expect(l.labelKey).toBeTruthy();
    // A census carries no belief interval — its honesty is the day count.
    expect(l.interval).toBeNull();
    expect(l.evidence).toBeGreaterThanOrEqual(MIN_READINESS_DAYS);
  });

  it("knows how much of the athlete it has measured, and it is not everything", () => {
    expect(m.known).toBeGreaterThan(0);
    expect(m.known).toBeLessThan(1);
    // Chapter means, not finding means — seven tested muscles must not drown
    // out a clearance rate nobody measured.
    expect(m.known).toBeCloseTo(m.chapters.reduce((a, c) => a + c.known, 0) / 3, 2);
  });
});

describe("what it refuses to claim", () => {
  it("a fortnight of training is not a month's readiness pattern", () => {
    const short = block({ weeks: 1, sets: () => 12, load: () => 120, gymSpent: () => 3, morningSpent: () => 2 });
    const m = learnedMonth({ sessions: short.sessions, recovery: short.recovery, landmarks: { profile: PROFILE }, now: NOW });
    const r = find(m, "readiness:level");
    expect(r.state).toBe("waiting");
    expect(r.value).toBeNull();
    expect(r.interval).toBeNull();
    expect(r.needKey).toBe("w.learned.needDays");
  });

  it("a month with no earlier month to compare against reports no movement", () => {
    // Four weeks of history: the ceiling may be known, but "how it moved" has
    // nothing behind it, and 0 would be a claim.
    const fresh = block({ weeks: 4, sets: () => 20, load: () => 130, gymSpent: () => 3, morningSpent: () => 2 });
    const m = learnedMonth({ sessions: fresh.sessions, recovery: fresh.recovery, landmarks: { profile: PROFILE }, now: NOW });
    expect(find(m, "readiness:level").delta).toBeNull();
    expect(find(m, "clearance").delta).toBeNull();
  });

  it("learning switched off is a DECISION, and reads as one", () => {
    const m = story({ landmarks: { profile: PROFILE, adaptive: false } });
    const ceiling = m.chapters.find((c) => c.chapter === "ceiling")!;
    expect(ceiling.findings).toHaveLength(1);
    expect(ceiling.findings[0]!.id).toBe("ceiling:off");
    expect(ceiling.findings[0]!.needKey).toBe("w.learned.needAdaptive");
    expect(ceiling.known).toBe(0);
  });

  it("a number the athlete typed is labelled MANUAL, never as something measured", () => {
    const m = story({ landmarks: { profile: PROFILE, overrides: { chest: { mrv: 25 } } } });
    const chest = find(m, "ceiling:chest");
    expect(chest.source).toBe("manual");
    expect(chest.value).toBe(25);
    expect(chest.confidence).toBe(1);
  });
});

describe("stating the figures", () => {
  const m = story();

  it("prints a set count whole and a ratio to two places", () => {
    const ceiling = m.findings.find((f) => f.chapter === "ceiling" && f.state === "learned")!;
    expect(learnedFigure(ceiling)).toMatch(/^\d+$/);
    expect(learnedFigure(find(m, "clearance"))).toMatch(/^\d\.\d\d$/);
    expect(learnedIntervalLabel(find(m, "clearance"))).toMatch(/^\d\.\d\d–\d\.\d\d$/);
  });

  it("signs the movement with a real minus, and says '—' when it did not move", () => {
    const base = find(m, "clearance");
    expect(learnedDeltaLabel({ ...base, delta: 0.12, decimals: 2 })).toBe("+0.12");
    expect(learnedDeltaLabel({ ...base, delta: -0.12, decimals: 2 })).toBe("−0.12");
    expect(learnedDeltaLabel({ ...base, delta: -0.12, decimals: 2 })).not.toContain("-");
    expect(learnedDeltaLabel({ ...base, delta: 0, decimals: 2 })).toBe("—");
    expect(learnedDeltaLabel({ ...base, delta: null })).toBeNull();
  });

  it("knows which way is good — and it is not the same way per chapter", () => {
    const ceiling = m.findings.find((f) => f.chapter === "ceiling" && f.muscle)!;
    expect(learnedSense({ ...ceiling, delta: 2 })).toBe("better");
    expect(learnedSense({ ...ceiling, delta: -2 })).toBe("worse");
    // The clearance index is a ratio against the population decay curve: LOWER
    // is faster. An arrow drawn off the sign alone would congratulate an
    // athlete for recovering worse.
    const c = find(m, "clearance");
    expect(learnedSense({ ...c, delta: 0.1 })).toBe("worse");
    expect(learnedSense({ ...c, delta: -0.1 })).toBe("better");
    const level = find(m, "readiness:level");
    expect(learnedSense({ ...level, delta: 3 })).toBe("better");
    const limiter = find(m, "readiness:limiter");
    expect(learnedSense({ ...limiter, delta: 9 })).toBe("worse");
    expect(learnedSense({ ...limiter, delta: null })).toBe("unknown");
    expect(learnedSense({ ...limiter, delta: 0 })).toBe("flat");
  });

  it("states a band the evidence closed as PINNED, not as 'between 23 and 23'", () => {
    const base = m.findings.find((f) => f.chapter === "ceiling" && f.state === "learned")!;
    const pinned = { ...base, interval: { lo: 23, hi: 23, kind: "belief" as const } };
    expect(learnedIntervalLabel(pinned)).toBe("23");
    expect(learnedIntervalKey(pinned)).toBe("w.learned.intervalPinned");
    const open = { ...base, interval: { lo: 22, hi: 24, kind: "belief" as const } };
    expect(learnedIntervalLabel(open)).toBe("22–24");
    expect(learnedIntervalKey(open)).toBe("w.learned.intervalBelief");
    // A claim with no interval has no caption to print either — the client says
    // "counted, not estimated" instead, and must not be handed a key.
    expect(learnedIntervalKey(find(m, "readiness:limiter"))).toBeNull();
  });

  it("the limiter is qualified by the tissue it names, never by a ledger sentence", () => {
    // READINESS_COST_KEY's tissue string carries a "{tissue}" placeholder — used
    // here it would print the placeholder, and it is a sentence where this row
    // wants a word.
    const l = find(m, "readiness:limiter");
    expect(l.muscle).not.toBeNull();
    expect(l.labelKey).toBe(MUSCLE_GROUP_KEY[l.muscle!]);
  });

  it("never qualifies a learned ceiling with the trajectory's own 'not enough'", () => {
    // Two different "not enough"s on one screen — one about the claim, one about
    // its stability — is the collision this suppression exists to prevent.
    for (const f of m.findings.filter((x) => x.chapter === "ceiling")) {
      expect(f.labelKey, f.id).not.toBe("w.analyze.vol.replayInsufficient");
    }
  });

  it("no claim ever labels a spread as a belief interval", () => {
    // The two statements are not interchangeable: a spread does not narrow with
    // evidence, because it is describing the athlete rather than our doubt.
    for (const f of m.findings) {
      if (!f.interval) continue;
      const spread = f.id === "readiness:level";
      expect(f.interval.kind, f.id).toBe(spread ? "spread" : "belief");
    }
  });
});
