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
  fatigueCost: null,
  soreness: null,
  energy: null,
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

  it("averages check-in soreness and energy into the window they fall in", () => {
    // `soreness` on the report is the COLUMN, which stores freshness (5 = fresh);
    // the observation carries real soreness, so the values invert on the way in.
    const rows = observeVolumeResponse([legs(1, 5, 100)], {
      now: NOW,
      weeks: 2,
      recovery: [
        { date: daysAgo(2), soreness: 5, energy: 2 },
        { date: daysAgo(4), soreness: 3, energy: 4 },
        { date: daysAgo(10), soreness: 2, energy: 5 },
      ],
    }).get("quads")!;
    expect(rows[0]!.soreness).toBe(2); // mean of soreness 1 and 3
    expect(rows[0]!.energy).toBe(3);   // mean of 2 and 4
    expect(rows[1]!.soreness).toBe(4); // freshness 2 → soreness 4
    expect(rows[1]!.energy).toBe(5);
  });

  it("reads the freshness column in the right direction", () => {
    // THE REGRESSION. An athlete reporting fresh muscles every day must not be
    // read as an athlete who is constantly wrecked.
    const fresh = observeVolumeResponse([legs(1, 5, 100)], {
      now: NOW, weeks: 2, recovery: [{ date: daysAgo(1), soreness: 5 }],
    }).get("quads")![0]!;
    const wrecked = observeVolumeResponse([legs(1, 5, 100)], {
      now: NOW, weeks: 2, recovery: [{ date: daysAgo(1), soreness: 1 }],
    }).get("quads")![0]!;
    expect(fresh.soreness).toBe(1);
    expect(wrecked.soreness).toBe(5);
    expect(fresh.soreness!).toBeLessThan(wrecked.soreness!);
  });

  it("skips off-scale and undated check-in values without losing the rest", () => {
    const rows = observeVolumeResponse([legs(1, 5, 100)], {
      now: NOW,
      weeks: 2,
      recovery: [
        { date: daysAgo(1), soreness: 4, energy: null },
        { date: daysAgo(2), soreness: 99 },
        { date: "not-a-date", soreness: 1 },
        { date: daysAgo(-2), soreness: 1 }, // the future
      ],
    }).get("quads")!;
    expect(rows[0]!.soreness).toBe(2); // freshness 4 → soreness 2
    expect(rows[0]!.energy).toBeNull();
  });

  it("leaves the recovery fields null when nobody checked in", () => {
    const rows = observeVolumeResponse([legs(1, 5, 100)], { now: NOW, weeks: 2 }).get("quads")!;
    expect(rows[0]!.soreness).toBeNull();
    expect(rows[0]!.energy).toBeNull();
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

  it("treats a collapse in reported energy as an overreach signal", () => {
    // The bar says nothing is wrong — the athlete says everything is.
    const e = estimateMrv(
      [
        obs({ weeksAgo: 0, sets: 19, performance: 101, energy: 1.5 }),
        obs({ weeksAgo: 1, sets: 19, performance: 100, energy: 1.5 }),
        obs({ weeksAgo: 2, sets: 19, performance: 99 }),
      ],
      QUADS,
    );
    expect(e.mrv).toBeLessThan(QUADS.mrv);
    expect(e.evidence.every((x) => x.verdict === "overreached")).toBe(true);
  });

  it("will not call a week tolerated while energy is on the floor", () => {
    // Numbers held, but at energy 2 the week is not evidence of a ceiling.
    const e = estimateMrv(
      [0, 1, 2].map((w) => obs({ weeksAgo: w, sets: 21, performance: 104 - w, energy: 2 })),
      QUADS,
    );
    expect(e.evidence.filter((x) => x.verdict === "tolerated")).toHaveLength(0);
    expect(e.mrv).toBe(QUADS.mrv);
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

describe("WHEN the feel was logged changes the ceiling", () => {
  /** Four weeks of 20 quad sets, all logged `fatigue`, with the top set holding
   *  steady — so nothing but the fatigue report can move the estimate. */
  const weeksOf = (fatigue: number, loggedAfterH: number | null): LoggedSession[] =>
    [0, 1, 2, 3].flatMap((w) =>
      [1, 3].map((d) => {
        const day = w * 7 + d;
        const start = NOW - day * 86_400_000;
        const end = start + 60 * 60_000; // a one-hour session
        return {
          id: `w${w}d${d}`,
          title: "Legs",
          startedAt: new Date(start).toISOString(),
          completedAt: new Date(end).toISOString(),
          fatigue,
          feelLoggedAt: loggedAfterH == null ? null : new Date(end + loggedAfterH * 3_600_000).toISOString(),
          blocks: [{ kind: "strength" as const, name: "Back Squat", sets: Array.from({ length: 10 }, () => ({ load: "100", reps: "5" })) }],
        };
      }),
    );

  it("the same 'tired' logged in the gym reads as a session ABSORBED", () => {
    // 20 sets a week, numbers holding, tired only in the gym — that is not a
    // ceiling being hit, it is a week that was tolerated. The estimate may rise
    // off it; what it must never do is fall.
    const a = adaptLandmarks(weeksOf(4, 0.5), { now: NOW, weeks: 5 });
    expect(a.estimates.quads.evidence.every((e) => e.verdict === "tolerated")).toBe(true);
    expect(a.landmarks.quads.mrv).toBeGreaterThanOrEqual(VOLUME_LANDMARKS.quads.mrv);
  });

  it("…and logged ten hours later pulls it down", () => {
    const a = adaptLandmarks(weeksOf(4, 10), { now: NOW, weeks: 5 });
    expect(a.adapted).toContain("quads");
    expect(a.landmarks.quads.mrv).toBeLessThan(VOLUME_LANDMARKS.quads.mrv);
  });

  it("still wrecked the next morning is the strongest read of the three", () => {
    const gym = adaptLandmarks(weeksOf(4, 0.5), { now: NOW, weeks: 5 }).landmarks.quads.mrv;
    const evening = adaptLandmarks(weeksOf(4, 10), { now: NOW, weeks: 5 }).landmarks.quads.mrv;
    const morning = adaptLandmarks(weeksOf(4, 20), { now: NOW, weeks: 5 }).landmarks.quads.mrv;
    expect(evening).toBeLessThan(gym);
    expect(morning).toBeLessThanOrEqual(evening);
  });

  it("without a timestamp the old raw rule still applies, unloosened", () => {
    // fatigue 4 with no lag is below the raw 4.2 threshold, exactly as before.
    expect(adaptLandmarks(weeksOf(4, null), { now: NOW, weeks: 5 }).adapted).not.toContain("quads");
    // …and a raw 5 still trips it.
    expect(adaptLandmarks(weeksOf(5, null), { now: NOW, weeks: 5 }).adapted).toContain("quads");
  });

  it("carries the cost that produced the verdict, for the athlete to see", () => {
    const a = adaptLandmarks(weeksOf(4, 10), { now: NOW, weeks: 5 });
    const ev = a.estimates.quads.evidence.find((e) => e.verdict === "overreached")!;
    expect(ev.fatigueCost).not.toBeNull();
    expect(ev.fatigueCost!).toBeGreaterThan(ev.fatigue! / 5);
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
