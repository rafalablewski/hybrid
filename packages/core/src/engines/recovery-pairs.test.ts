import { describe, it, expect } from "vitest";
import { pairReads, athleteClearance } from "./recovery-pairs";
import type { LoggedSession } from "./session";
import type { RecoveryReport } from "./landmark-adapt";
import {
  feelReading,
  recoveryCurve,
  recoveryIndex,
  clearanceFactor,
  CLEARANCE_FACTOR_BOUNDS,
  MIN_RECOVERY_PAIRS,
  MIN_PAIR_FATIGUE,
  CLEARANCE_FAST,
  CLEARANCE_SLOW,
  CLEARANCE_INTERVAL_FLOOR,
} from "../feel-timing";
import { athleteLandmarks } from "./landmark-resolve";
import { checkinFromSoreness } from "../checkin-scales";
import { READINESS_PAIR_WEIGHT } from "../readiness-reads";

const H = 3_600_000;
const NOW = Date.parse("2026-07-28T20:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const squat = (): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Back Squat",
  sets: [
    { reps: "5", load: "140" },
    { reps: "5", load: "140" },
    { reps: "5", load: "140" },
  ],
});

const sess = (over: Partial<LoggedSession> = {}): LoggedSession =>
  ({
    id: "s1",
    title: "Lower",
    startedAt: iso(26 * H),
    completedAt: iso(25 * H),
    blocks: [squat()],
    ...over,
  }) as LoggedSession;

/** A check-in reporting `spent` on the 1–5 spentness scale, written `hAgo`
 *  hours ago. Freshness is the inverse, which is what the column stores. */
const checkin = (spent: number, hAgo: number): RecoveryReport => ({
  date: iso(hAgo * H),
  soreness: checkinFromSoreness(spent),
  loggedAt: iso(hAgo * H),
});

describe("the ratio between the two reads", () => {
  it("is 1 when the athlete drains exactly as the curve predicts", () => {
    // cost is timing-normalised, so equal costs at different lags means the
    // decay happened at exactly the modelled rate.
    const immediate = feelReading(5, 1)!;
    // Find the later report whose cost matches: raw_later = raw_imm × R(12)/R(1).
    const rawLater = immediate.raw * (0.35 + 0.65 * Math.exp(-12 / 6)) / immediate.expected;
    const later = feelReading(1 + rawLater * 4, 12)!;
    const c = recoveryCurve(immediate, later)!;
    expect(c.ratio).toBeGreaterThan(0.97);
    expect(c.ratio).toBeLessThan(1.03);
    expect(c.clearance).toBe("onTrack");
  });

  it("THE POINT: same later reading, opposite verdicts depending on the first", () => {
    // Two athletes both report 2/5 spent the next morning. One walked out of
    // the gym wrecked and has cleared a big disturbance; the other walked out
    // merely worked and has barely shifted. A single report cannot tell them
    // apart — it is the same 2 either way. The pair can.
    const nextMorning = feelReading(2, 20)!;
    const drained = recoveryCurve(feelReading(5, 0.5)!, nextMorning)!;
    const stuck = recoveryCurve(feelReading(3, 0.5)!, nextMorning)!;
    expect(drained.ratio).toBeLessThan(stuck.ratio);
    expect(drained.clearance).toBe("fast");
    expect(stuck.clearance).toBe("slow");
  });

  it("refuses to judge a session the athlete walked out of fine", () => {
    // 2/5 in the gym and 2/5 the next morning divides 0.26 by 0.61 and reads
    // as a badly impaired recoverer. Nothing happened to this athlete either
    // time, and the pair must not invent a verdict from it.
    expect(recoveryCurve(feelReading(2, 0.5)!, feelReading(2, 14)!)).toBeNull();
    expect(MIN_PAIR_FATIGUE).toBe(3);
  });

  it("and a high reading long after training is slow however hard the session was", () => {
    // The ceiling on this is deliberate. Still 4/5 spent twelve hours later is
    // a recovery problem even for the athlete who was at 5 in the gym — the
    // curve says under half the acute spike should be left by then.
    expect(recoveryCurve(feelReading(5, 0.5)!, feelReading(4, 12)!)!.clearance).toBe("slow");
  });

  it("refuses to judge reads that are too close together", () => {
    expect(recoveryCurve(feelReading(4, 1)!, feelReading(4, 3)!)).toBeNull();
  });

  it("refuses to judge a session that cost nothing", () => {
    // "Fresh" in the gym and "fresh" the next day is not a recovery measurement.
    expect(recoveryCurve(feelReading(1, 0.5)!, feelReading(1, 12)!)).toBeNull();
  });

  it("refuses to judge an untimed report", () => {
    expect(recoveryCurve(feelReading(4, null), feelReading(4, 12))).toBeNull();
  });
});

describe("the index across pairs", () => {
  const slowPair = () => recoveryCurve(feelReading(3, 0.5)!, feelReading(4, 12)!)!;

  it("says nothing at all from a single pair", () => {
    const idx = recoveryIndex([slowPair()]);
    expect(idx.confidence).toBe(0);
    expect(idx.index).toBe(1);
    expect(clearanceFactor(idx)).toBe(1);
    expect(MIN_RECOVERY_PAIRS).toBe(2);
  });

  it("a consistently slow clearer gets a lower ceiling multiplier", () => {
    const idx = recoveryIndex([slowPair(), slowPair(), slowPair()]);
    expect(idx.clearance).toBe("slow");
    expect(clearanceFactor(idx)).toBeLessThan(1);
  });

  it("a consistently fast clearer gets a higher one", () => {
    const fast = () => recoveryCurve(feelReading(5, 0.5)!, feelReading(2, 12)!)!;
    const idx = recoveryIndex([fast(), fast(), fast()]);
    expect(idx.clearance).toBe("fast");
    expect(clearanceFactor(idx)).toBeGreaterThan(1);
  });

  it("states an interval, and it is the POPULATION corridor until pairs exist", () => {
    // Unproven, the index reads 1.0 — the curve itself — so the band has to say
    // "somewhere in the band everybody starts in" rather than implying the
    // athlete has been measured at exactly average.
    const none = recoveryIndex([]);
    expect(none.lo).toBe(CLEARANCE_FAST);
    expect(none.hi).toBe(CLEARANCE_SLOW);
  });

  it("…and once measured, the band is the standard error, never zero-width", () => {
    // Three identical pairs have zero spread, which is not the same as having
    // measured a ratio to three decimals — the floor is what stops the least
    // evidence in the app producing the most confident claim on the screen.
    const idx = recoveryIndex([slowPair(), slowPair(), slowPair()]);
    expect(idx.hi - idx.lo).toBeGreaterThanOrEqual(2 * CLEARANCE_INTERVAL_FLOOR - 0.001);
    expect(idx.lo).toBeLessThan(idx.index);
    expect(idx.hi).toBeGreaterThan(idx.index);

    // A spread of pairs widens it past the floor.
    const mixed = recoveryIndex([
      slowPair(),
      recoveryCurve(feelReading(5, 0.5)!, feelReading(2, 12)!)!,
      recoveryCurve(feelReading(4, 0.5)!, feelReading(5, 20)!)!,
    ]);
    expect(mixed.hi - mixed.lo).toBeGreaterThan(idx.hi - idx.lo);
  });

  it("is bounded — two taps a day is not a blood panel", () => {
    const brutal = () => recoveryCurve(feelReading(2, 0.5)!, feelReading(5, 30)!)!;
    const idx = recoveryIndex(Array.from({ length: 40 }, brutal));
    const f = clearanceFactor(idx);
    expect(f).toBeGreaterThanOrEqual(CLEARANCE_FACTOR_BOUNDS[0]);
    expect(f).toBeLessThanOrEqual(CLEARANCE_FACTOR_BOUNDS[1]);
  });
});

describe("matching a check-in back to its session", () => {
  it("pairs a gym read with the evening's check-in", () => {
    const s = sess({ fatigue: 4, feelLoggedAt: iso(24.5 * H) });
    const pairs = pairReads([s], [checkin(3, 12)], { now: NOW });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.sessionId).toBe("s1");
  });

  it("THE EXCLUSION: a second session inside the gap kills the pair", () => {
    // Trained Monday evening AND Tuesday morning, then checked in. Blaming
    // Monday for Tuesday's fatigue would read as poor recovery forever.
    const a = sess({ id: "a", completedAt: iso(25 * H), fatigue: 4, feelLoggedAt: iso(24.5 * H) });
    const b = sess({ id: "b", startedAt: iso(15 * H), completedAt: iso(14 * H) });
    const pairs = pairReads([a, b], [checkin(3, 12)], { now: NOW });
    expect(pairs.map((p) => p.sessionId)).not.toContain("a");
  });

  it("ignores a session with no immediate read to anchor against", () => {
    expect(pairReads([sess({ fatigue: 4, feelLoggedAt: null })], [checkin(3, 12)], { now: NOW })).toEqual([]);
    expect(pairReads([sess()], [checkin(3, 12)], { now: NOW })).toEqual([]);
  });

  it("ignores a check-in written before the session ended", () => {
    const s = sess({ fatigue: 4, feelLoggedAt: iso(24.5 * H) });
    expect(pairReads([s], [checkin(3, 30)], { now: NOW })).toEqual([]);
  });

  it("takes the FIRST qualifying read, not the freshest memory", () => {
    const s = sess({ fatigue: 4, feelLoggedAt: iso(24.5 * H) });
    const pairs = pairReads([s], [checkin(4, 14), checkin(1, 2)], { now: NOW });
    expect(pairs).toHaveLength(1);
    // 11h after the session, not 23h.
    expect(pairs[0]!.curve.gapH).toBeLessThan(12);
  });
});

describe("clearance reaches the landmarks", () => {
  /** N days of "trained, said 3 in the gym, still 4 that evening" — a slow
   *  clearer, measured the only way the app can measure it. */
  const slowHistory = (n: number) => {
    const sessions: LoggedSession[] = [];
    const recovery: RecoveryReport[] = [];
    for (let d = 0; d < n; d++) {
      const base = (d * 48 + 25) * H; // one session every two days, so no gap is contaminated
      sessions.push(
        sess({
          id: `s${d}`,
          startedAt: iso(base + H),
          completedAt: iso(base),
          fatigue: 3,
          feelLoggedAt: iso(base - 0.5 * H),
        }),
      );
      recovery.push({ date: iso(base - 12 * H), soreness: checkinFromSoreness(4), loggedAt: iso(base - 12 * H) });
    }
    return { sessions, recovery };
  };

  it("a measured slow clearer trains under a lower ceiling than the profile alone gives", () => {
    const { sessions, recovery } = slowHistory(4);
    const profile = { experience: "intermediate" as const, bodyweightKg: 80 };
    const withPairs = athleteLandmarks({ profile, sessions, recovery, now: NOW });
    const without = athleteLandmarks({ profile, sessions, now: NOW });

    expect(withPairs.clearance.pairs).toBeGreaterThanOrEqual(2);
    expect(withPairs.clearance.clearance).toBe("slow");
    expect(withPairs.landmarks.quads.mrv).toBeLessThan(without.landmarks.quads.mrv);
    expect(withPairs.layers).toContain("observed");
    expect(withPairs.factors.some((f) => f.key === "clearance")).toBe(true);
  });

  it("and the floor does not move — clearance is a recovery measure only", () => {
    const { sessions, recovery } = slowHistory(4);
    const profile = { experience: "intermediate" as const, bodyweightKg: 80 };
    const a = athleteLandmarks({ profile, sessions, recovery, now: NOW });
    const b = athleteLandmarks({ profile, sessions, now: NOW });
    expect(a.landmarks.quads.mev).toBe(b.landmarks.quads.mev);
  });

  it("no pairs, no change — the population/profile answer stands", () => {
    const r = athleteLandmarks({ profile: { experience: "intermediate" }, sessions: [sess()], now: NOW });
    expect(r.clearance.confidence).toBe(0);
    expect(r.factors.some((f) => f.key === "clearance")).toBe(false);
  });

  it("stays monotonic after the clearance scaling", () => {
    const { sessions, recovery } = slowHistory(5);
    const r = athleteLandmarks({ profile: { experience: "advanced", bodyweightKg: 110 }, sessions, recovery, now: NOW });
    for (const l of Object.values(r.landmarks)) {
      expect(l.mv).toBeLessThanOrEqual(l.mev);
      expect(l.mev).toBeLessThanOrEqual(l.mavLow);
      expect(l.mavLow).toBeLessThanOrEqual(l.mavHigh);
      expect(l.mavHigh).toBeLessThanOrEqual(l.mrv);
    }
  });
});

describe("a day's own two reads, when there is no post-workout answer", () => {
  // The athlete skipped the finish card entirely — no `fatigue`, no
  // `feelLoggedAt`. Before a day could hold more than one read this session
  // produced nothing at all: one answer, and if it landed in the gym there was
  // nothing to pair it with.
  const noFinishCard = sess({ fatigue: null, feelLoggedAt: null });
  const end = Date.parse(noFinishCard.completedAt!);

  const reads = (...rest: { h: number; energy: number }[]): RecoveryReport[] =>
    rest.map((r) => ({
      date: new Date(end).toISOString(),
      energy: r.energy,
      loggedAt: new Date(end + r.h * H).toISOString(),
    }));

  it("pairs the in-the-gym read with the evening one", () => {
    const pairs = pairReads([noFinishCard], reads({ h: 1, energy: 2 }, { h: 14, energy: 2 }), { now: NOW });
    expect(pairs).toHaveLength(1);
    // Still as wrecked fourteen hours on as one hour on: slower than the curve.
    expect(pairs[0]!.curve.clearance).toBe("slow");
  });

  it("counts for less than a direct session report", () => {
    const pairs = pairReads([noFinishCard], reads({ h: 1, energy: 2 }, { h: 14, energy: 2 }), { now: NOW });
    expect(pairs[0]!.curve.weight).toBeLessThanOrEqual(READINESS_PAIR_WEIGHT);
  });

  it("refuses to build one out of a single read", () => {
    expect(pairReads([noFinishCard], reads({ h: 1, energy: 2 }), { now: NOW })).toEqual([]);
  });

  it("will not treat a read taken hours later as the immediate side", () => {
    // Nothing inside the immediate window, so there is no anchor — and inventing
    // one out of the 8h read would compare two late reads across a curve that
    // has already flattened.
    expect(pairReads([noFinishCard], reads({ h: 8, energy: 2 }, { h: 20, energy: 2 }), { now: NOW })).toEqual([]);
  });

  it("still prefers the session's own answer when there is one", () => {
    const withCard = sess({ fatigue: 4, feelLoggedAt: new Date(end + 0.5 * H).toISOString() });
    const pairs = pairReads([withCard], reads({ h: 1, energy: 2 }, { h: 14, energy: 2 }), { now: NOW });
    expect(pairs).toHaveLength(1);
    // Full weight: this pair is anchored on the direct report, not on a read.
    expect(pairs[0]!.curve.weight).toBeGreaterThan(READINESS_PAIR_WEIGHT);
  });
});
