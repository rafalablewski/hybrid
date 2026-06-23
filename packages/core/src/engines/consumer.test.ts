import { describe, it, expect } from "vitest";
import { streak, habitStrength, weeklyConsistency, activeDays, trainingDaysPerWeek } from "./habits";
import { computeAccountability } from "./accountability";
import { projectLift, projectBodyweight, adherenceFactor } from "./future-self";
import type { LoggedSession } from "./session";
import type { Signal } from "./signals";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

function session(id: string, startedAt: string, lift?: string, e1rmLoad?: number): LoggedSession {
  return {
    id,
    title: "S",
    startedAt,
    blocks: lift ? [{ kind: "strength", name: lift, sets: [{ load: String(e1rmLoad ?? 100), reps: "1" }] }] : [{ kind: "conditioning", name: "Row", minutes: 12, rpe: 8 }],
  };
}

describe("habits — streaks", () => {
  it("counts a forgiving day-streak with one grace day", () => {
    // trained today, 2 days ago, 4 days ago → all within 1 grace day of each other
    const s = [session("a", daysAgo(0)), session("b", daysAgo(2)), session("c", daysAgo(4))];
    const r = streak(s, 1, NOW);
    expect(r.current).toBe(3);
    expect(r.alive).toBe(true);
    expect(r.daysSinceLast).toBe(0);
  });

  it("lapses the streak once the gap exceeds the grace", () => {
    const s = [session("a", daysAgo(3)), session("b", daysAgo(5))];
    const r = streak(s, 1, NOW); // 3 days since last > graceDays 1
    expect(r.alive).toBe(false);
    expect(r.current).toBe(0);
    expect(r.longest).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for no sessions", () => {
    expect(streak([], 1, NOW)).toMatchObject({ current: 0, longest: 0, lastActive: null });
    expect(activeDays([])).toEqual([]);
  });

  it("habitStrength rewards recent consistency, weeklyConsistency counts weeks", () => {
    const s = [session("a", daysAgo(0)), session("b", daysAgo(2)), session("c", daysAgo(4)), session("d", daysAgo(6))];
    expect(habitStrength(s, 3, NOW)).toBeGreaterThan(20);
    expect(weeklyConsistency(s, 4, NOW)).toBeGreaterThan(0);
  });

  it("trainingDaysPerWeek infers cadence from distinct active days, else uses fallback", () => {
    // 4 distinct days this week → infers 4
    const s = [session("a", daysAgo(0)), session("b", daysAgo(1)), session("c", daysAgo(3)), session("d", daysAgo(5))];
    expect(trainingDaysPerWeek(s, { now: NOW })).toBe(4);
    // no history → honors the onboarding fallback
    expect(trainingDaysPerWeek([], { now: NOW, fallback: 5 })).toBe(5);
    expect(trainingDaysPerWeek([], { now: NOW })).toBe(3);
    // a genuine 1-day/week athlete keeps 1 (floor matches the no-history path)
    expect(trainingDaysPerWeek([session("z", daysAgo(0))], { now: NOW })).toBe(1);
  });
});

describe("accountability engine", () => {
  it("flags a brand-new user as getting started (onboard), not a lapse", () => {
    const a = computeAccountability([], { now: NOW });
    expect(a.intervention.type).toBe("onboard");
    expect(a.daysSinceLast).toBeNull();
    // A new user hasn't disengaged from anything: zero risk, a distinct "new"
    // band — never "wobbling"/"at-risk", which would wrongly imply slipping.
    expect(a.band).toBe("new");
    expect(a.risk).toBe(0);
    expect(a.drivers).toHaveLength(0);
  });

  it("scores a consistent athlete as low risk + celebrates", () => {
    const s = [session("a", daysAgo(0)), session("b", daysAgo(2)), session("c", daysAgo(4)), session("d", daysAgo(6))];
    const a = computeAccountability(s, { now: NOW, targetPerWeek: 3 });
    expect(a.risk).toBeLessThan(35);
    expect(["thriving", "steady"]).toContain(a.band);
    expect(a.intervention.type).toBe("celebrate");
  });

  it("raises risk when a gap opens", () => {
    const s = [session("a", daysAgo(6)), session("b", daysAgo(9))];
    const a = computeAccountability(s, { now: NOW, targetPerWeek: 3 });
    expect(a.risk).toBeGreaterThan(35);
    expect(a.daysSinceLast).toBe(6);
    expect(a.drivers[0]!.label).toMatch(/since last session/);
  });

  it("marks a long absence dormant with a win-back", () => {
    const s = [session("a", daysAgo(20)), session("b", daysAgo(23))];
    const a = computeAccountability(s, { now: NOW });
    expect(a.band).toBe("dormant");
    expect(a.intervention.type).toBe("winback");
    expect(a.intervention.urgency).toBe("high");
    expect(a.risk).toBeGreaterThan(70);
  });

  it("bands a high-risk but RECENTLY-active user as at-risk, not dormant", () => {
    // Trained 12 days ago (≤14) but risk is maxed — must NOT be 'dormant'
    // (which would fire the "it's been a while" win-back at someone still here).
    const s = [session("a", daysAgo(12)), session("b", daysAgo(13))];
    const a = computeAccountability(s, { now: NOW, targetPerWeek: 3 });
    expect(a.daysSinceLast).toBeLessThanOrEqual(14);
    expect(a.risk).toBeGreaterThanOrEqual(55);
    expect(a.band).toBe("at-risk");
    expect(a.band).not.toBe("dormant");
  });

  it("detects week-over-week frequency decline", () => {
    // 1 session this week, 3 last week
    const s = [
      session("a", daysAgo(1)),
      session("b", daysAgo(8)),
      session("c", daysAgo(10)),
      session("d", daysAgo(12)),
    ];
    const a = computeAccountability(s, { now: NOW, targetPerWeek: 3 });
    expect(a.sessionsLast7).toBe(1);
    expect(a.sessionsPrev7).toBe(3);
    expect(a.frequencyTrend).toBeLessThan(0);
  });
});

describe("future-self simulator", () => {
  // rising e1RM: 100 → 110 → 120 over 4 weeks
  const rising: LoggedSession[] = [
    session("a", daysAgo(28), "Back Squat", 100),
    session("b", daysAgo(14), "Back Squat", 110),
    session("c", daysAgo(0), "Back Squat", 120),
    // a couple recent sessions so adherence isn't punished
    session("d", daysAgo(3), "Bench Press", 80),
    session("e", daysAgo(6), "Bench Press", 80),
  ];

  it("projects a positive rate and a finite ETA toward a higher goal", () => {
    const p = projectLift(rising, "Back Squat", { goal: 140, horizonWeeks: 12, now: NOW });
    expect(p.insufficient).toBe(false);
    expect(p.ratePerWeek).toBeGreaterThan(0);
    expect(p.current).toBeGreaterThan(120); // e1RM of a 1-rep 120kg set ≈ 124 (Epley)
    expect(p.etaWeeks).not.toBeNull();
    expect(p.etaWeeks!).toBeGreaterThan(0);
    expect(p.goalProbability!).toBeGreaterThan(0);
    expect(p.goalProbability!).toBeLessThanOrEqual(1);
    expect(p.series.length).toBeGreaterThan(2);
  });

  it("is insufficient with <2 data points", () => {
    const p = projectLift([session("a", daysAgo(0), "Deadlift", 200)], "Deadlift", { now: NOW });
    expect(p.insufficient).toBe(true);
    expect(p.etaWeeks).toBeNull();
  });

  it("adherenceFactor scales 0.5..1.2 with recent frequency", () => {
    expect(adherenceFactor([], 3, NOW)).toBe(0.5);
    const busy = [session("a", daysAgo(0)), session("b", daysAgo(2)), session("c", daysAgo(4)), session("d", daysAgo(7)), session("e", daysAgo(9)), session("f", daysAgo(11))];
    expect(adherenceFactor(busy, 3, NOW)).toBeGreaterThan(0.8);
  });

  it("projects bodyweight toward a loss goal", () => {
    const sig: Signal[] = [
      { athleteId: "u", kind: "bodyMass", value: 90, unit: "kg", source: "manual", ts: daysAgo(28) },
      { athleteId: "u", kind: "bodyMass", value: 88, unit: "kg", source: "manual", ts: daysAgo(14) },
      { athleteId: "u", kind: "bodyMass", value: 86, unit: "kg", source: "manual", ts: daysAgo(0) },
    ];
    const p = projectBodyweight(sig, { goal: 80, direction: "down", horizonWeeks: 12, now: NOW });
    expect(p.ratePerWeek).toBeLessThan(0);
    expect(p.etaWeeks).not.toBeNull();
    expect(p.goalProbability!).toBeGreaterThan(0);
  });
});
