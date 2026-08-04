import { describe, expect, it } from "vitest";
import { capabilityTrend } from "./capability";
import { performanceTrajectory, stateVerdict } from "./performance-state";
import { computeHpi } from "./hpi";
import { computeFatigue } from "./fatigue";
import { prsBetween } from "./recap";
import type { Biometrics, LoggedSession } from "./types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const lift = (daysAgo: number, name: string, load: number, reps = 5): LoggedSession => ({
  id: `s-${name}-${daysAgo}`,
  startedAt: at(daysAgo),
  completedAt: at(daysAgo),
  blocks: [{ kind: "strength", name, sets: [{ load, reps }] }],
} as unknown as LoggedSession);

const run = (daysAgo: number, km: number, minutes: number, name = "Run"): LoggedSession => ({
  id: `r-${daysAgo}`,
  startedAt: at(daysAgo),
  completedAt: at(daysAgo),
  blocks: [{ kind: "cardio", name, distance: km, minutes }],
} as unknown as LoggedSession);

describe("capabilityTrend", () => {
  it("returns null with nothing to compare — never a zero", () => {
    const out = capabilityTrend([], { now: NOW });
    expect(out.pct).toBeNull();
    expect(out.movements).toEqual([]);
    expect(out.strength).toBeNull();
  });

  it("ignores a movement that appears in only one half", () => {
    // Every squat is inside the recent half — no baseline to compare against.
    const out = capabilityTrend([lift(10, "Back Squat", 100), lift(3, "Back Squat", 120)], { now: NOW });
    expect(out.pct).toBeNull();
  });

  it("reads a heavier lift as positive", () => {
    const out = capabilityTrend(
      [lift(50, "Back Squat", 100), lift(5, "Back Squat", 110)],
      { now: NOW },
    );
    expect(out.strength?.name).toBe("Back Squat");
    expect(out.strength!.to).toBeGreaterThan(out.strength!.from);
    expect(out.pct!).toBeGreaterThan(0);
  });

  it("reads a FASTER pace as positive, though the number went down", () => {
    // 5 km in 25 min (300 s/km) → 5 km in 23 min (276 s/km): faster, so better.
    const out = capabilityTrend([run(50, 5, 25), run(5, 5, 23)], { now: NOW });
    expect(out.endurance).not.toBeNull();
    expect(out.endurance!.to).toBeLessThan(out.endurance!.from);
    expect(out.endurance!.pct).toBeGreaterThan(0);
  });

  it("a slower pace is negative", () => {
    const out = capabilityTrend([run(50, 5, 23), run(5, 5, 25)], { now: NOW });
    expect(out.endurance!.pct).toBeLessThan(0);
  });

  it("mixes both kinds into one headline without mixing their units", () => {
    const out = capabilityTrend(
      [lift(50, "Back Squat", 100), lift(5, "Back Squat", 110), run(50, 5, 25), run(5, 5, 23)],
      { now: NOW },
    );
    expect(out.movements).toHaveLength(2);
    expect(out.strength!.kind).toBe("strength");
    expect(out.endurance!.kind).toBe("endurance");
    // The headline is the mean of the two signed percents.
    const mean = (out.movements[0]!.pct + out.movements[1]!.pct) / 2;
    expect(out.pct!).toBeCloseTo(Math.round(mean * 10) / 10, 5);
  });

  it("drops training older than the window", () => {
    const out = capabilityTrend([lift(400, "Back Squat", 100), lift(5, "Back Squat", 110)], { now: NOW });
    expect(out.pct).toBeNull();
  });
});

describe("performanceTrajectory — today agrees with the headline", () => {
  const log = [
    { daysAgo: 1, items: [{ move: "Back Squat", sets: 5, reps: 5, load: 100, rpe: 8 }] },
    { daysAgo: 4, items: [{ move: "Back Squat", sets: 5, reps: 5, load: 100, rpe: 8 }] },
  ] as unknown as Parameters<typeof performanceTrajectory>[0];

  const bio: Biometrics = {
    hrv: { today: 90, baseline: 70, better: "high" },
    restingHr: { today: 48, baseline: 52, better: "low" },
    sleep: { today: 8, baseline: 7, better: "high" },
  } as unknown as Biometrics;

  it("leaves the series load-driven when no wearable is passed", () => {
    const bare = performanceTrajectory(log, 14);
    const fatigue = computeFatigue(log);
    expect(bare[bare.length - 1]!.hpi).toBe(computeHpi(fatigue).score);
  });

  it("makes the LAST point equal the figure the card prints", () => {
    const withBio = performanceTrajectory(log, 14, bio);
    const fatigue = computeFatigue(log);
    // This is the exact number computePerformanceState puts in 46pt type.
    expect(withBio[withBio.length - 1]!.hpi).toBe(computeHpi(fatigue, bio).score);
  });

  it("does not back-date the wearable onto days it was never recorded for", () => {
    const bare = performanceTrajectory(log, 14);
    const withBio = performanceTrajectory(log, 14, bio);
    for (let i = 0; i < bare.length - 1; i++) {
      expect(withBio[i]!.hpi).toBe(bare[i]!.hpi);
      expect(withBio[i]!.readiness).toBe(bare[i]!.readiness);
    }
  });
});

describe("stateVerdict", () => {
  const hpi = computeHpi(computeFatigue([]));

  it("names the band, with no tissue clause when nothing is flagged", () => {
    const v = stateVerdict(hpi, { flagged: [] });
    expect(v.headKey).toBe(`w.home.cockpit.verdict.${hpi.band}`);
    expect(v.tissueKey).toBeNull();
    expect(v.tissue).toBeNull();
  });

  it("carries the highest-risk tissue when one is flagged", () => {
    const v = stateVerdict(hpi, { flagged: [{ tissue: "posterior" }] });
    expect(v.tissueKey).toBe("w.home.cockpit.verdict.oneTissue");
    expect(v.tissue).toBe("posterior");
  });

  it("switches to the plural clause for more than one", () => {
    const v = stateVerdict(hpi, { flagged: [{ tissue: "posterior" }, { tissue: "quads" }] });
    expect(v.tissueKey).toBe("w.home.cockpit.verdict.manyTissues");
  });
});

describe("prsBetween", () => {
  const sessions = [
    lift(40, "Back Squat", 100),
    lift(20, "Back Squat", 110),
    lift(2, "Back Squat", 120),
  ];

  it("finds a PR inside the window, judged against ALL prior history", () => {
    const out = prsBetween(sessions, NOW - 7 * DAY, NOW + DAY);
    expect(out).toHaveLength(1);
    expect(out[0]!.lift).toBe("Back Squat");
    expect(out[0]!.topLoad).toBe(120);
  });

  it("reports nothing for a window with no sessions in it", () => {
    expect(prsBetween(sessions, NOW - 1 * DAY, NOW + DAY)).toEqual([]);
  });

  it("does not treat an older session as a PR just because the window starts there", () => {
    // The 20-day-old 110 kg WAS a PR at the time, so it reports in its window.
    const out = prsBetween(sessions, NOW - 25 * DAY, NOW - 10 * DAY);
    expect(out.map((p) => p.topLoad)).toEqual([110]);
  });
});
