import { describe, it, expect } from "vitest";
import {
  enduranceWindow, enduranceDeltaPct, enduranceLead, enduranceValue, hasEnduranceHistory,
} from "./endurance-window";
import { activitySummary, resolveActivityRange } from "./activity-window";
import type { LoggedSession, SessionBlock } from "./engines/session";

const NOW = Date.parse("2026-07-15T12:00:00.000Z"); // a Wednesday
const DAY = 86_400_000;

const cardio = (name: string, minutes: number, discipline: string, distance?: number) =>
  ({ kind: "cardio", name, minutes, discipline, ...(distance ? { distance } : {}) }) as unknown as SessionBlock;
const lift = (name: string) =>
  ({ kind: "strength", name, sets: [{ reps: 5, weight: 100 }] }) as unknown as SessionBlock;

function sess(id: string, daysAgo: number, blocks: SessionBlock[], minutes = 60): LoggedSession {
  const started = NOW - daysAgo * DAY;
  return {
    id,
    title: id,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(started + minutes * 60000).toISOString(),
    blocks,
  } as LoggedSession;
}

const week = () => resolveActivityRange("week", NOW);

describe("enduranceWindow", () => {
  it("is empty, not broken, when nothing endurance is logged", () => {
    const w = enduranceWindow([sess("lift", 1, [lift("Squat")])], week());
    expect(w.totals).toEqual({ efforts: 0, minutes: 0, distanceKm: 0 });
    expect(w.slices).toEqual([]);
    expect(w.disciplines).toBe(0);
    expect(w.sports).toBe(0);
  });

  it("counts BOTH lane disciplines and other sports — a squash-only week is not zero", () => {
    const w = enduranceWindow([
      sess("squash", 1, [cardio("Squash", 45, "sport")], 45),
    ], week());
    expect(w.totals.efforts).toBe(1);
    expect(w.totals.minutes).toBe(45);
    expect(w.sports).toBe(1);
    expect(w.disciplines).toBe(0);
    expect(w.slices[0]!.kind).toBe("sport");
    expect(w.slices[0]!.label).toBe("Squash");
  });

  it("EFFORTS ARE SESSIONS — a brick session counts once, not once per block", () => {
    const w = enduranceWindow([
      sess("brick", 1, [cardio("Ride", 60, "cycling", 30), cardio("Run", 20, "running", 4)], 80),
    ], week());
    expect(w.totals.efforts).toBe(1);
    expect(w.slices.length).toBe(2);
  });

  it("its minutes and distance are a SLICE of the verdict card's columns, never a second opinion", () => {
    const sessions = [
      sess("run", 1, [cardio("Run", 40, "running", 8)], 40),
      sess("gym", 2, [lift("Bench")], 70),
      sess("tennis", 0, [cardio("Tennis", 90, "sport")], 90),
    ];
    const r = week();
    const w = enduranceWindow(sessions, r);
    const sum = activitySummary(sessions, r);
    // Distance is only ever carried by these groups, so it must match exactly.
    expect(w.totals.distanceKm).toBeCloseTo(sum.totals.distance, 6);
    // Time is a strict subset — the gym session's 70 minutes are not ours.
    expect(w.totals.minutes).toBe(130);
    expect(w.totals.minutes).toBeLessThan(sum.totals.hours);
  });

  it("shares are of MINUTES, so a timed sport with no distance still gets a slice", () => {
    const w = enduranceWindow([
      sess("run", 1, [cardio("Run", 50, "running", 10)], 50),
      sess("squash", 2, [cardio("Squash", 50, "sport")], 50),
    ], week());
    expect(w.slices.length).toBe(2);
    for (const s of w.slices) expect(s.share).toBeCloseTo(0.5, 6);
  });

  it("orders slices biggest-first by time", () => {
    const w = enduranceWindow([
      sess("swim", 1, [cardio("Swim", 30, "swimming", 1.2)], 30),
      sess("ride", 2, [cardio("Ride", 120, "cycling", 45)], 120),
      sess("run", 0, [cardio("Run", 60, "running", 11)], 60),
    ], week());
    expect(w.slices.map((s) => s.discipline)).toEqual(["cycling", "running", "swimming"]);
  });

  it("compares against the preceding windows of the same length, empty ones included", () => {
    const sessions = [
      // this week: one 40-minute run
      sess("now", 1, [cardio("Run", 40, "running", 8)], 40),
      // four weeks back, one week of it carrying a run
      sess("prior", 8, [cardio("Run", 40, "running", 8)], 40),
    ];
    const w = enduranceWindow(sessions, week());
    expect(w.baselineOf).toBe(4);
    expect(w.baselinePeriods).toBe(1);
    // One trained window out of four → the mean keeps the three empty ones.
    expect(w.baseline.efforts).toBeCloseTo(0.25, 6);
  });

  it("has NO delta when there is no baseline to move from — never a 0%", () => {
    const w = enduranceWindow([sess("run", 1, [cardio("Run", 40, "running", 8)], 40)], week());
    expect(w.baseline.distanceKm).toBe(0);
    expect(enduranceDeltaPct(w, "distance")).toBeNull();
  });

  it("signs the delta against the baseline mean", () => {
    const sessions = [
      sess("now", 1, [cardio("Run", 40, "running", 10)], 40),
      sess("w1", 8, [cardio("Run", 40, "running", 8)], 40),
      sess("w2", 15, [cardio("Run", 40, "running", 8)], 40),
      sess("w3", 22, [cardio("Run", 40, "running", 8)], 40),
      sess("w4", 29, [cardio("Run", 40, "running", 8)], 40),
    ];
    const w = enduranceWindow(sessions, week());
    expect(w.baseline.distanceKm).toBeCloseTo(8, 6);
    expect(enduranceDeltaPct(w, "distance")).toBe(25);
    expect(enduranceValue(w.totals, "distance")).toBeCloseTo(10, 6);
  });
});

describe("enduranceLead", () => {
  it("says nothing was logged rather than inventing a leader", () => {
    const lead = enduranceLead(enduranceWindow([sess("gym", 1, [lift("Squat")])], week()));
    expect(lead.key).toBe("w.home.endw.empty");
    expect(lead.lead).toBeNull();
    expect(lead.sports).toBe(0);
  });

  it("treats ONE sport as its own shape, not a degenerate 'led by'", () => {
    const lead = enduranceLead(enduranceWindow([
      sess("a", 1, [cardio("Run", 40, "running", 8)], 40),
      sess("b", 2, [cardio("Run", 50, "running", 10)], 50),
    ], week()));
    expect(lead.key).toBe("w.home.endw.leadOne");
    expect(lead.sports).toBe(1);
    expect(lead.lead!.discipline).toBe("running");
  });

  it("says MOSTLY when the leader carried half the time or more", () => {
    const lead = enduranceLead(enduranceWindow([
      sess("run", 1, [cardio("Run", 120, "running", 22)], 120),
      sess("swim", 2, [cardio("Swim", 30, "swimming", 1.2)], 30),
    ], week()));
    expect(lead.key).toBe("w.home.endw.leadMost");
    expect(lead.lead!.discipline).toBe("running");
    expect(lead.sports).toBe(2);
  });

  it("says LED BY when no sport carried a majority — a claim any window supports", () => {
    const lead = enduranceLead(enduranceWindow([
      sess("run", 1, [cardio("Run", 60, "running", 11)], 60),
      sess("ride", 2, [cardio("Ride", 50, "cycling", 25)], 50),
      sess("squash", 0, [cardio("Squash", 45, "sport")], 45),
    ], week()));
    expect(lead.key).toBe("w.home.endw.leadLed");
    expect(lead.lead!.share).toBeLessThan(0.5);
    // The leader is the largest slice by definition, so "led by" is always true.
    expect(lead.lead!.discipline).toBe("running");
    expect(lead.sports).toBe(3);
  });

  it("counts other sports alongside lane disciplines, and can be led by one", () => {
    const lead = enduranceLead(enduranceWindow([
      sess("tennis", 1, [cardio("Tennis", 120, "sport")], 120),
      sess("run", 2, [cardio("Run", 30, "running", 6)], 30),
    ], week()));
    expect(lead.key).toBe("w.home.endw.leadMost");
    expect(lead.lead!.label).toBe("Tennis");
    expect(lead.sports).toBe(2);
  });

  it("carries the section's OWN time and its OWN move — never the card's", () => {
    const sessions = [
      sess("now", 1, [cardio("Run", 60, "running", 12)], 60),
      sess("gym", 2, [lift("Bench")], 90),          // not endurance: must not count
      sess("w1", 8, [cardio("Run", 40, "running", 8)], 40),
      sess("w2", 15, [cardio("Run", 40, "running", 8)], 40),
      sess("w3", 22, [cardio("Run", 40, "running", 8)], 40),
      sess("w4", 29, [cardio("Run", 40, "running", 8)], 40),
    ];
    const lead = enduranceLead(enduranceWindow(sessions, week()));
    expect(lead.minutes).toBe(60);
    expect(lead.whyKey).toBe("w.home.endw.why");
    expect(lead.deltaPct).toBe(50);                 // 60 against a 40-minute mean
  });

  it("has no comparison when there is no baseline — never a 0%", () => {
    const lead = enduranceLead(enduranceWindow([
      sess("run", 1, [cardio("Run", 40, "running", 8)], 40),
    ], week()));
    expect(lead.whyKey).toBe("w.home.endw.whyCold");
    expect(lead.deltaPct).toBeNull();
  });
});

describe("hasEnduranceHistory", () => {
  it("is false for a pure lifter, so the section is absent rather than empty", () => {
    expect(hasEnduranceHistory([sess("gym", 1, [lift("Squat")])])).toBe(false);
  });

  it("is true from ANY cardio, however long ago — a quiet week keeps the section", () => {
    expect(hasEnduranceHistory([sess("run", 400, [cardio("Run", 40, "running", 8)], 40)])).toBe(true);
  });

  it("is true for other sports too, not just lane disciplines", () => {
    expect(hasEnduranceHistory([sess("squash", 3, [cardio("Squash", 45, "sport")], 45)])).toBe(true);
  });
});
