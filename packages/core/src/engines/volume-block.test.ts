import { describe, it, expect } from "vitest";
import { VOLUME_LANDMARKS } from "./landmarks";
import {
  resolveBlock,
  blockWeeks,
  currentBlockWeek,
  targetSetsForWeek,
  blockVolumePlan,
  advanceBlock,
  blockFromMacrocycle,
  DEFAULT_BLOCK,
} from "./volume-block";
import { buildMacrocycle } from "./periodization";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const squats = (when: string, sets: number): LoggedSession => ({
  id: when + sets,
  title: "Legs",
  startedAt: when,
  blocks: [{ kind: "strength", name: "Back Squat", sets: Array.from({ length: sets }, () => ({ load: "100", reps: "5" })) }],
});

describe("volume across a block", () => {
  it("a 4-week block runs introduction → accumulation ×2 → deload", () => {
    const ws = blockWeeks({ week: 1, weeks: 4, deloadLast: true });
    expect(ws.map((w) => w.kind)).toEqual(["introduction", "accumulation", "accumulation", "deload"]);
    // Week 1 sits at the bottom of the ramp, the last LOAD week at the top.
    expect(ws[0]!.ramp).toBe(0);
    expect(ws[2]!.ramp).toBe(1);
    expect(ws[3]!.ramp).toBe(0);
  });

  it("week 1 prescribes MEV and the last load week the top of MAV", () => {
    const l = VOLUME_LANDMARKS.quads; // mev 8, mavHigh 18, mrv 20, mv 6
    const ws = blockWeeks({ week: 1, weeks: 4 });
    expect(targetSetsForWeek(l, ws[0]!)).toBe(l.mev);
    expect(targetSetsForWeek(l, ws[2]!)).toBe(l.mavHigh);
    expect(targetSetsForWeek(l, ws[3]!)).toBe(l.mv);
  });

  it("targets climb monotonically through the accumulation weeks", () => {
    const l = VOLUME_LANDMARKS.back;
    const targets = blockWeeks({ week: 1, weeks: 6 })
      .filter((w) => w.kind !== "deload")
      .map((w) => targetSetsForWeek(l, w));
    for (let i = 1; i < targets.length; i++) expect(targets[i]!).toBeGreaterThanOrEqual(targets[i - 1]!);
    expect(targets[0]).toBe(l.mev);
    expect(targets[targets.length - 1]).toBe(l.mavHigh);
  });

  it("an overreaching block pushes the last load week past MAV but under MRV", () => {
    const l = VOLUME_LANDMARKS.quads;
    const ws = blockWeeks({ week: 1, weeks: 4, peakAt: "overreach" });
    expect(ws[2]!.kind).toBe("overreach");
    const peak = targetSetsForWeek(l, ws[2]!, "overreach");
    expect(peak).toBeGreaterThan(l.mavHigh);
    expect(peak).toBeLessThan(l.mrv);
  });

  it("never prescribes at or above the ceiling, on any muscle or block length", () => {
    for (const weeks of [2, 3, 4, 5, 6, 8]) {
      for (const peakAt of ["mav", "overreach"] as const) {
        for (const w of blockWeeks({ week: 1, weeks, peakAt })) {
          for (const l of Object.values(VOLUME_LANDMARKS)) {
            const t = targetSetsForWeek(l, w, peakAt);
            expect(t).toBeGreaterThanOrEqual(l.mv);
            expect(t).toBeLessThan(l.mrv);
          }
        }
      }
    }
  });

  it("a one-week block is just its single week", () => {
    expect(blockWeeks({ week: 1, weeks: 1 }).map((w) => w.kind)).toEqual(["introduction"]);
    expect(blockWeeks({ week: 1, weeks: 1 })[0]!.ramp).toBe(1);
  });

  it("normalizes nonsense block input", () => {
    expect(resolveBlock({ week: 9, weeks: 4 })).toEqual({ week: 4, weeks: 4, deloadLast: true, peakAt: "mav" });
    expect(resolveBlock({ week: -3, weeks: 0 })).toEqual({ week: 1, weeks: 4, deloadLast: true, peakAt: "mav" });
    expect(resolveBlock(null)).toEqual(DEFAULT_BLOCK);
    expect(currentBlockWeek({ week: 3, weeks: 4 }).week).toBe(3);
  });

  it("the plan compares logged sets against THIS week's target, not the band", () => {
    // 12 sets of squats this week (quads primary).
    const sessions = [squats(daysAgo(1), 6), squats(daysAgo(3), 6)];
    const wk1 = blockVolumePlan(sessions, { block: { week: 1, weeks: 4 }, now: NOW });
    const wk3 = blockVolumePlan(sessions, { block: { week: 3, weeks: 4 }, now: NOW });
    const q1 = wk1.targets.find((t) => t.muscle === "quads")!;
    const q3 = wk3.targets.find((t) => t.muscle === "quads")!;
    expect(q1.sets).toBe(12);
    expect(q3.sets).toBe(12);
    // Week 1 wants MEV (8) — 12 is already OVER the introduction target.
    expect(q1.target).toBe(VOLUME_LANDMARKS.quads.mev);
    expect(q1.delta).toBeLessThan(0);
    // Week 3 wants the top of MAV (18) — the same 12 sets are now short.
    expect(q3.target).toBe(VOLUME_LANDMARKS.quads.mavHigh);
    expect(q3.delta).toBeGreaterThan(0);
    // The landmark view is unchanged either way: 12 sets is productive.
    expect(q1.status.zone).toBe("productive");
    expect(q1.overCeiling).toBe(false);
  });

  it("the deload week prescribes the maintenance floor", () => {
    const plan = blockVolumePlan([squats(daysAgo(1), 6)], { block: { week: 4, weeks: 4 }, now: NOW });
    expect(plan.week.kind).toBe("deload");
    expect(plan.targets.find((t) => t.muscle === "quads")!.target).toBe(VOLUME_LANDMARKS.quads.mv);
  });

  it("flags the ceiling regardless of the ramp", () => {
    // 22 sets of squats — past the quads ceiling (20) even in a peak week.
    const sessions = [squats(daysAgo(1), 11), squats(daysAgo(3), 11)];
    const plan = blockVolumePlan(sessions, { block: { week: 3, weeks: 4 }, now: NOW });
    const q = plan.targets.find((t) => t.muscle === "quads")!;
    expect(q.overCeiling).toBe(true);
    expect(q.status.action).toBe("reduce");
  });

  it("advancing rolls over into week 1 of the next block", () => {
    expect(advanceBlock({ week: 2, weeks: 4 }).week).toBe(3);
    expect(advanceBlock({ week: 4, weeks: 4 }).week).toBe(1);
  });

  it("reads the block position out of a macrocycle", () => {
    const macro = buildMacrocycle("Bodybuilding");
    const first = macro.blocks[0]!;
    const b = blockFromMacrocycle(macro, first.startWeek);
    expect(b.week).toBe(1);
    expect(b.weeks).toBe(first.endWeek - first.startWeek + 1);
    // The hypertrophy mesocycle ends on a recovery microcycle → deload week.
    expect(b.deloadLast).toBe(true);
    const mid = blockFromMacrocycle(macro, first.endWeek);
    expect(mid.week).toBe(b.weeks);
  });
});
