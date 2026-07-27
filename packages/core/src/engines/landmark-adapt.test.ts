import { describe, it, expect } from "vitest";
import { VOLUME_LANDMARKS } from "./landmarks";
import { observeVolumeResponse, estimateMrv, adaptLandmarks, type VolumeWeekObservation } from "./landmark-adapt";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/** `sets` sets of Back Squat at `load` × 5 — quads primary. */
const legs = (day: number, sets: number, load: number, fatigue?: number): LoggedSession => ({
  id: `${day}-${sets}-${load}`,
  title: "Legs",
  startedAt: daysAgo(day),
  fatigue: fatigue ?? null,
  blocks: [{ kind: "strength", name: "Back Squat", sets: Array.from({ length: sets }, () => ({ load: String(load), reps: "5" })) }],
});

const obs = (o: Partial<VolumeWeekObservation> & { weeksAgo: number; sets: number }): VolumeWeekObservation => ({
  performance: null,
  fatigue: null,
  soreness: null,
  ...o,
});

const QUADS = VOLUME_LANDMARKS.quads; // mv 6, mev 8, mav 12–18, mrv 20

describe("observing the response to volume", () => {
  it("buckets sets, best e1RM and post-session fatigue into 7-day windows", () => {
    const rows = observeVolumeResponse([legs(1, 5, 100, 3), legs(9, 5, 90, 4)], { now: NOW, weeks: 3 }).get("quads")!;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.sets).toBe(5);
    expect(rows[1]!.sets).toBe(5);
    expect(rows[2]!.sets).toBe(0);
    expect(rows[0]!.performance).toBeGreaterThan(rows[1]!.performance!);
    expect(rows[0]!.fatigue).toBe(3);
    expect(rows[1]!.fatigue).toBe(4);
  });

  it("attaches weekly soreness reports to the window they fall in", () => {
    const rows = observeVolumeResponse([legs(1, 5, 100)], {
      now: NOW,
      weeks: 2,
      soreness: [{ date: daysAgo(2), soreness: 5 }, { date: daysAgo(10), soreness: 2 }],
    }).get("quads")!;
    expect(rows[0]!.soreness).toBe(5);
    expect(rows[1]!.soreness).toBe(2);
  });
});

describe("estimating the recoverable ceiling", () => {
  it("returns the prior untouched without at least two qualifying weeks", () => {
    const e = estimateMrv([obs({ weeksAgo: 0, sets: 19, performance: 100 })], QUADS);
    expect(e.mrv).toBe(QUADS.mrv);
    expect(e.confidence).toBe(0);
  });

  it("ignores weeks that carried too little volume to prove anything", () => {
    // Six sets a week is nowhere near a ceiling, however good it felt.
    const e = estimateMrv(
      [0, 1, 2, 3].map((w) => obs({ weeksAgo: w, sets: 6, performance: 100 + (3 - w) })),
      QUADS,
    );
    expect(e.evidence).toHaveLength(0);
    expect(e.mrv).toBe(QUADS.mrv);
  });

  it("RAISES the ceiling when high volume is carried with performance intact", () => {
    // 20–21 sets/wk (at and above the prior ceiling of 20) with e1RM climbing.
    const e = estimateMrv(
      [
        obs({ weeksAgo: 0, sets: 21, performance: 106, fatigue: 3 }),
        obs({ weeksAgo: 1, sets: 21, performance: 104, fatigue: 3 }),
        obs({ weeksAgo: 2, sets: 20, performance: 102, fatigue: 3 }),
        obs({ weeksAgo: 3, sets: 20, performance: 100, fatigue: 3 }),
      ],
      QUADS,
    );
    expect(e.mrv).toBeGreaterThan(QUADS.mrv);
    expect(e.confidence).toBeGreaterThan(0);
    expect(e.evidence.every((x) => x.verdict === "tolerated")).toBe(true);
  });

  it("does NOT raise the ceiling off volume that never approached it", () => {
    // Tolerated weeks, but at 18 sets against a ceiling of 20 — that is
    // evidence you can do 18, not evidence the ceiling is higher.
    const e = estimateMrv(
      [0, 1, 2].map((w) => obs({ weeksAgo: w, sets: 18, performance: 100 + (2 - w), fatigue: 2 })),
      QUADS,
    );
    expect(e.mrv).toBe(QUADS.mrv);
  });

  it("LOWERS the ceiling when performance falls at high volume", () => {
    const e = estimateMrv(
      [
        obs({ weeksAgo: 0, sets: 18, performance: 92 }),
        obs({ weeksAgo: 1, sets: 19, performance: 100 }),
        obs({ weeksAgo: 2, sets: 19, performance: 105 }),
        obs({ weeksAgo: 3, sets: 18, performance: 100 }),
      ],
      QUADS,
    );
    // Symptoms showed at 18 sets → the ceiling sits below that.
    expect(e.mrv).toBeLessThan(18);
    expect(e.evidence.some((x) => x.verdict === "overreached")).toBe(true);
  });

  it("treats a soreness or post-session fatigue spike as an overreach signal", () => {
    const e = estimateMrv(
      [
        obs({ weeksAgo: 0, sets: 19, performance: 101, fatigue: 4.6 }),
        obs({ weeksAgo: 1, sets: 19, performance: 100, soreness: 4.5 }),
        obs({ weeksAgo: 2, sets: 19, performance: 99 }),
      ],
      QUADS,
    );
    expect(e.mrv).toBeLessThan(QUADS.mrv);
  });

  it("symptoms beat 'I got away with it' when both appear", () => {
    const e = estimateMrv(
      [
        obs({ weeksAgo: 0, sets: 21, performance: 102, fatigue: 2 }), // tolerated
        obs({ weeksAgo: 1, sets: 19, performance: 100, fatigue: 4.8 }), // overreached
        obs({ weeksAgo: 2, sets: 19, performance: 101, fatigue: 2 }),
      ],
      QUADS,
    );
    expect(e.mrv).toBeLessThan(19);
  });

  it("never moves the estimate more than ±35% of the prior", () => {
    const crashed = estimateMrv(
      [0, 1, 2, 3].map((w) => obs({ weeksAgo: w, sets: 19, performance: 100 - w * -20 })),
      QUADS,
    );
    expect(crashed.mrv).toBeGreaterThanOrEqual(Math.round(QUADS.mrv * 0.65));
    const soared = estimateMrv(
      [0, 1, 2, 3].map((w) => obs({ weeksAgo: w, sets: 60, performance: 200 + (3 - w) * -1, fatigue: 1 })),
      QUADS,
    );
    expect(soared.mrv).toBeLessThanOrEqual(Math.round(QUADS.mrv * 1.35));
  });

  it("keeps the ceiling clear of MEV whatever the evidence", () => {
    // A ceiling that collapses onto the minimum-effective volume would leave no
    // productive range at all. The band follows the ceiling down (see
    // `adaptLandmarks`), but MEV is the hard floor under it.
    const e = estimateMrv(
      [0, 1, 2, 3].map((w) => obs({ weeksAgo: w, sets: QUADS.mavHigh, performance: 100 - w * -30 })),
      QUADS,
    );
    expect(e.mrv).toBeGreaterThanOrEqual(QUADS.mev + 2);
  });
});

describe("adapting a full landmark map", () => {
  it("leaves everything alone with no evidence", () => {
    const a = adaptLandmarks([], { now: NOW });
    expect(a.landmarks).toEqual(VOLUME_LANDMARKS);
    expect(a.adapted).toEqual([]);
    expect(a.confidence).toBe(0);
  });

  it("pulls the ceiling down for a muscle whose numbers fell under load", () => {
    // Four weeks at ~20 quad sets with the top set sliding backwards.
    const sessions: LoggedSession[] = [];
    const loads = [92, 96, 100, 100];
    for (let w = 0; w < 4; w++) {
      sessions.push(legs(w * 7 + 1, 10, loads[w]!, 4.5), legs(w * 7 + 3, 10, loads[w]!, 4.5));
    }
    const a = adaptLandmarks(sessions, { now: NOW, weeks: 5 });
    expect(a.adapted).toContain("quads");
    expect(a.landmarks.quads.mrv).toBeLessThan(VOLUME_LANDMARKS.quads.mrv);
    // The productive band follows the ceiling down and stays coherent.
    const l = a.landmarks.quads;
    expect(l.mev).toBeLessThanOrEqual(l.mavLow);
    expect(l.mavLow).toBeLessThanOrEqual(l.mavHigh);
    expect(l.mavHigh).toBeLessThanOrEqual(l.mrv);
    // MEV is untouched — the log can prove a ceiling, never a floor.
    expect(l.mev).toBe(VOLUME_LANDMARKS.quads.mev);
    // A muscle that was never trained is untouched.
    expect(a.landmarks.glutes).toEqual(VOLUME_LANDMARKS.glutes);
  });

  it("adapts on top of an already personalized map", () => {
    const custom = { ...VOLUME_LANDMARKS, quads: { mv: 5, mev: 6, mavLow: 9, mavHigh: 14, mrv: 15 } };
    const a = adaptLandmarks([], { now: NOW, landmarks: custom });
    expect(a.landmarks.quads).toEqual(custom.quads);
    expect(a.estimates.quads.prior).toBe(15);
  });
});
