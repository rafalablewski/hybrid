import { describe, it, expect } from "vitest";
import { VOLUME_LANDMARKS } from "./landmarks";
import { athleteLandmarks } from "./landmark-resolve";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const legs = (day: number, sets: number, load: number, fatigue?: number): LoggedSession => ({
  id: `${day}-${sets}-${load}`,
  title: "Legs",
  startedAt: daysAgo(day),
  fatigue: fatigue ?? null,
  blocks: [{ kind: "strength", name: "Back Squat", sets: Array.from({ length: sets }, () => ({ load: String(load), reps: "5" })) }],
});

/** Four weeks of 22 quad sets — inside an advanced athlete's MAV→MRV gap, so
 *  the weeks qualify as evidence — with the top set sliding backwards. */
const overreached: LoggedSession[] = [92, 96, 100, 100].flatMap((load, w) => [
  legs(w * 7 + 1, 11, load, 4.5),
  legs(w * 7 + 3, 11, load, 4.5),
]);

describe("resolving one athlete's landmarks", () => {
  it("with nothing to go on, returns the population table and says so", () => {
    const r = athleteLandmarks();
    expect(r.landmarks).toEqual(VOLUME_LANDMARKS);
    expect(r.source).toBe("population");
    expect(r.layers).toEqual(["population"]);
  });

  it("the profile layer personalizes and reports its factors", () => {
    const r = athleteLandmarks({ profile: { experience: "beginner", bodyweightKg: 40, ageYears: 18 } });
    expect(r.source).toBe("profile");
    expect(r.landmarks.quads.mev).toBeLessThan(VOLUME_LANDMARKS.quads.mev);
    expect(r.factors.length).toBeGreaterThan(0);
    expect(r.profileConfidence).toBeGreaterThan(0);
  });

  it("the log corrects the profile's ceiling", () => {
    const withoutLog = athleteLandmarks({ profile: { experience: "advanced" } });
    const withLog = athleteLandmarks({ profile: { experience: "advanced" }, sessions: overreached, now: NOW, weeks: 5 });
    expect(withLog.source).toBe("observed");
    expect(withLog.adapted).toContain("quads");
    expect(withLog.landmarks.quads.mrv).toBeLessThan(withoutLog.landmarks.quads.mrv);
    expect(withLog.observedConfidence).toBeGreaterThan(0);
  });

  it("check-ins reach the observed layer — soreness alone can move a ceiling", () => {
    // Four weeks at 22 quad sets with the bar HOLDING, so the log alone sees
    // nothing wrong. The check-ins say the athlete is buried.
    const steady: LoggedSession[] = [0, 1, 2, 3].flatMap((w) => [legs(w * 7 + 1, 11, 100), legs(w * 7 + 3, 11, 100)]);
    const withoutCheckins = athleteLandmarks({ profile: { experience: "advanced" }, sessions: steady, now: NOW, weeks: 5 });
    const withCheckins = athleteLandmarks({
      profile: { experience: "advanced" },
      sessions: steady,
      now: NOW,
      weeks: 5,
      recovery: [0, 7, 14, 21].map((d) => ({ date: daysAgo(d), soreness: 5, energy: 1 })),
    });
    expect(withoutCheckins.adapted).not.toContain("quads");
    expect(withCheckins.adapted).toContain("quads");
    expect(withCheckins.landmarks.quads.mrv).toBeLessThan(withoutCheckins.landmarks.quads.mrv);
  });

  it("adaptive: false stops at the profile layer", () => {
    const r = athleteLandmarks({ profile: { experience: "advanced" }, sessions: overreached, now: NOW, adaptive: false });
    expect(r.layers).not.toContain("observed");
    expect(r.landmarks.quads.mrv).toBe(athleteLandmarks({ profile: { experience: "advanced" } }).landmarks.quads.mrv);
  });

  it("a manual override always wins, over every layer beneath it", () => {
    const r = athleteLandmarks({
      profile: { experience: "advanced" },
      sessions: overreached,
      now: NOW,
      weeks: 5,
      overrides: { quads: { mrv: 30 } },
    });
    expect(r.source).toBe("manual");
    expect(r.layers).toEqual(["population", "profile", "observed", "manual"]);
    expect(r.landmarks.quads.mrv).toBe(30);
    // …and only for the muscle it names.
    expect(r.landmarks.chest.mrv).not.toBe(30);
  });

  it("every resolved map stays monotonic", () => {
    const r = athleteLandmarks({
      profile: { experience: "advanced", ageYears: 55, bodyweightKg: 140, sleep: 2, stress: 5, nutrition: "deficit" },
      sessions: overreached,
      now: NOW,
      weeks: 5,
      overrides: { back: { mev: 40 } }, // a nonsense edit, clamped by resolveLandmarks
    });
    for (const l of Object.values(r.landmarks)) {
      expect(l.mv).toBeLessThanOrEqual(l.mev);
      expect(l.mev).toBeLessThanOrEqual(l.mavLow);
      expect(l.mavLow).toBeLessThanOrEqual(l.mavHigh);
      expect(l.mavHigh).toBeLessThanOrEqual(l.mrv);
    }
  });
});
