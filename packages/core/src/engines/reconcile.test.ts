import { describe, it, expect } from "vitest";
import {
  reconcilePlan,
  scheduleWeek,
  buildTrainingWeek,
  weekNeedsResync,
  reconciledToSessionBlocks,
  buildMacrocycle,
  prescribeSession,
  currentPhase,
  SAMPLE_TRAINING_LOG,
  type Prescription,
} from "./index";
import { prescribeForSport } from "../sports";

const macro = buildMacrocycle("Powerlifting"); // strength model, stacked from now
const daily = prescribeSession(SAMPLE_TRAINING_LOG);
const sport = prescribeForSport("Running", 2, { sessions: [] }); // bodyweight transfer work

// the macro week where the strength model deloads (last block is the deload phase)
const deloadWeek = macro.blocks[macro.blocks.length - 1]!.startWeek;

describe("reconcilePlan", () => {
  it("returns one ordered session: strength first, conditioning last", () => {
    const plan = reconcilePlan({ macro, daily, currentWeek: 1 });
    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.blocks[0]!.kind).toBe("strength");
    expect(plan.blocks[plan.blocks.length - 1]!.kind).toBe("conditioning");
  });

  it("exposes the phase envelope it dosed against", () => {
    const plan = reconcilePlan({ macro, daily, currentWeek: 1 });
    const { micro, block } = currentPhase(macro, 1);
    expect(plan.intensity).toBe(micro.intensity);
    expect(plan.volume).toBe(micro.volume);
    expect(plan.phase.label).toBe(block.label);
    expect(plan.phase.kind).toBe(micro.kind);
  });

  it("scales the working load down in a deload week vs a load week", () => {
    const strengthLoad = (p: Prescription, week: number) => {
      const plan = reconcilePlan({ macro, daily: p, currentWeek: week });
      return plan.blocks.find((b) => b.kind === "strength" && b.load != null)!.load!;
    };
    const loadWeek = strengthLoad(daily, 1);
    const deload = strengthLoad(daily, deloadWeek);
    expect(deload).toBeLessThan(loadWeek);
  });

  it("deduplicates a sport block that names today's primary lift", () => {
    // forge a daily prescription whose primary lift IS a sport transfer movement
    const forged: Prescription = {
      ...daily,
      blocks: [
        {
          uid: 1,
          kind: "strength",
          name: "Romanian Deadlift",
          sets: [{ load: "100", reps: "5", rpe: "" }],
        },
        { uid: 2, kind: "conditioning", name: "Easy Run", format: "Steady", work: 40, rest: 20, rounds: 8 },
      ],
    };
    const plan = reconcilePlan({ macro, daily: forged, sport, currentWeek: 1 });
    const rdlBlocks = plan.blocks.filter((b) => b.name === "Romanian Deadlift");
    expect(rdlBlocks.length).toBe(1); // not doubled
    expect(rdlBlocks[0]!.source).toBe("daily"); // the daily lift wins the movement
    expect(plan.dropped.some((d) => d.name === "Romanian Deadlift")).toBe(true);
  });

  it("trims accessory sport work in a recovery/deload week", () => {
    const load = reconcilePlan({ macro, daily, sport, currentWeek: 1 });
    const deload = reconcilePlan({ macro, daily, sport, currentWeek: deloadWeek });
    const sportCount = (p: ReturnType<typeof reconcilePlan>) =>
      p.blocks.filter((b) => b.source === "sport").length;
    expect(sportCount(deload)).toBeLessThanOrEqual(1);
    expect(sportCount(deload)).toBeLessThan(sportCount(load));
    expect(deload.phase.kind).toBe("recovery");
  });

  it("rounds loads to the nearest 2.5kg plate", () => {
    const plan = reconcilePlan({ macro, daily, sport, currentWeek: 1 });
    for (const b of plan.blocks) {
      if (b.load != null) expect(b.load % 2.5).toBe(0);
    }
  });

  it("works with no sport prescription (daily + macro only)", () => {
    const plan = reconcilePlan({ macro, daily, currentWeek: 1 });
    expect(plan.blocks.every((b) => b.source === "daily")).toBe(true);
    expect(plan.why).toContain("intensity");
  });
});

describe("reconciledToSessionBlocks", () => {
  it("maps reconciled blocks onto the persisted SessionBlock shape", () => {
    const plan = reconcilePlan({ macro, daily, sport, currentWeek: 1 });
    const blocks = reconciledToSessionBlocks(plan.blocks);
    for (const [i, b] of blocks.entries()) {
      const src = plan.blocks[i]!;
      expect(b.kind).toBe(src.kind);
      if (b.kind === "strength") {
        expect(b.sets.length).toBe(src.sets); // one set entry per prescribed set
        if (src.load != null) expect(b.sets[0]!.load).toBe(String(src.load));
      } else if (b.kind === "conditioning") {
        expect(b.rounds).toBe(src.sets);
      }
    }
  });
});

describe("scheduleWeek", () => {
  const start = new Date(2026, 5, 8, 12, 0, 0, 0); // a Monday, local noon

  it("spreads N training days across the week and carries the reconciled session", () => {
    const plan = reconcilePlan({ macro, daily, sport, currentWeek: 1 });
    const items = scheduleWeek(plan, { startDate: start, daysPerWeek: 3 });
    expect(items.length).toBe(3);
    const offsets = items.map((a) => Math.round((Date.parse(a.date) - start.getTime()) / 86400000));
    expect(offsets).toEqual([0, 2, 4]);
    for (const a of items) {
      expect(a.name).toContain(plan.phase.label);
      expect(a.blocks.length).toBe(plan.blocks.length);
    }
  });

  it("clamps daysPerWeek to 1..6", () => {
    const plan = reconcilePlan({ macro, daily, currentWeek: 1 });
    expect(scheduleWeek(plan, { startDate: start, daysPerWeek: 99 }).length).toBe(6);
    expect(scheduleWeek(plan, { startDate: start, daysPerWeek: 0 }).length).toBe(1);
  });
});

describe("buildTrainingWeek", () => {
  const start = new Date(2026, 5, 8, 12, 0, 0, 0);

  const primaryOf = (a: { blocks: { kind: string; name: string }[] }) => {
    const first = a.blocks.find((b) => b.kind === "strength");
    return first ? first.name : "";
  };

  it("varies the primary lift across the week (not the same session N times)", () => {
    const week = buildTrainingWeek({ macro, currentWeek: 1, log: SAMPLE_TRAINING_LOG, daysPerWeek: 3, startDate: start });
    expect(week.length).toBe(3);
    expect(new Set(week.map(primaryOf)).size).toBeGreaterThan(1); // distinct main lifts
  });

  it("sequentially re-prescribes: day 2 avoids the muscles day 1 just hammered", () => {
    // from a clean slate every lift is equally recovered, so day 1 takes the
    // first pattern; that fatigue must push day 2 onto a different lift.
    const week = buildTrainingWeek({ macro, currentWeek: 1, log: [], daysPerWeek: 3, startDate: start });
    expect(primaryOf(week[0]!)).not.toBe(primaryOf(week[1]!));
  });

  it("spreads the sport transfer work across days rather than piling it on one", () => {
    const week = buildTrainingWeek({ macro, currentWeek: 1, log: SAMPLE_TRAINING_LOG, sport, daysPerWeek: 3, startDate: start });
    const sportCounts = week.map((a) => a.blocks.filter((b) => b.kind === "strength").length);
    // at least two different days carry strength work (primary + distributed sport)
    expect(sportCounts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(2);
    const offsets = week.map((a) => Math.round((Date.parse(a.date) - start.getTime()) / 86400000));
    expect(offsets).toEqual([0, 2, 4]);
  });
});

describe("weekNeedsResync", () => {
  const NOW = Date.parse("2026-06-10T12:00:00.000Z");
  const iso = (daysFromNow: number) => new Date(NOW + daysFromNow * 86400000).toISOString();
  const me = "u1";

  it("flags a pending self-authored future day generated before the latest session", () => {
    const rows = [{ athleteId: me, assignedById: me, status: "assigned", date: iso(1), createdAt: iso(-2) }];
    const sessions = [{ startedAt: iso(-1) }]; // logged after the week was generated
    expect(weekNeedsResync(rows, sessions, NOW)).toBe(true);
  });

  it("ignores completed days, coach-authored days, and weeks newer than the last session", () => {
    const sessions = [{ startedAt: iso(-1) }];
    expect(weekNeedsResync([{ athleteId: me, assignedById: me, status: "completed", date: iso(1), createdAt: iso(-2) }], sessions, NOW)).toBe(false);
    expect(weekNeedsResync([{ athleteId: me, assignedById: "coach", status: "assigned", date: iso(1), createdAt: iso(-2) }], sessions, NOW)).toBe(false);
    expect(weekNeedsResync([{ athleteId: me, assignedById: me, status: "assigned", date: iso(1), createdAt: iso(0) }], sessions, NOW)).toBe(false);
    expect(weekNeedsResync([{ athleteId: me, assignedById: me, status: "assigned", date: iso(1), createdAt: iso(-2) }], [], NOW)).toBe(false);
  });
});
