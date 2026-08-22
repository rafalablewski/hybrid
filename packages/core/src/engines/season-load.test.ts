import { describe, it, expect } from "vitest";
import { seasonAdjust, seasonBlockLabel, DELOAD_PCT_ADJ, DELOAD_SET_ADJ, LOAD_PCT_CAP } from "./season-load";
import { buildMacrocycle } from "./periodization";
import { prescribeSession } from "./prescription";
import { SAMPLE_TRAINING_LOG } from "./sample-data";
import type { PrescribedBlock } from "./types";

/**
 * THE SEASON REACHING THE SESSION.
 *
 * buildMacrocycle has written a per-week intensity and volume onto every
 * enrolment since it was built, and nothing read it. An athlete standing in a
 * scheduled recovery week was prescribed exactly what the loading week before
 * it prescribed; the deload existed only as a drawing on /periodize.
 */

const strength = (blocks: PrescribedBlock[]) => blocks.find((b) => b.kind === "strength")!;
const macro = buildMacrocycle("power");

/** The season weeks the engine itself marked as recovery. */
const recoveryWeeks = macro.blocks
  .flatMap((b) => b.micros)
  .filter((m) => m.kind === "recovery")
  .map((m) => m.week);

describe("reading the week", () => {
  it("has recovery weeks to find at all", () => {
    // Non-vacuity: every assertion below is trivially true on a season with no
    // deloads in it.
    expect(recoveryWeeks.length).toBeGreaterThan(0);
  });

  it("returns null with no season, so the engine prescribes as before", () => {
    expect(seasonAdjust(null, 1)).toBeNull();
    expect(seasonAdjust(undefined, 1)).toBeNull();
    expect(seasonAdjust({ ...macro, blocks: [] }, 1)).toBeNull();
  });

  it("names the block and the week inside it", () => {
    const s = seasonAdjust(macro, 2)!;
    expect(s.week).toBe(2);
    expect(s.weekInBlock).toBe(2);
    expect(s.blockWeeks).toBeGreaterThan(1);
    expect(seasonBlockLabel(s)).toBe(`${s.blockLabel}, week 2 of ${s.blockWeeks}`);
  });

  it("marks a scheduled recovery week as a deload and nothing else as one", () => {
    for (let w = 1; w <= macro.totalWeeks; w++) {
      expect(seasonAdjust(macro, w)!.deload).toBe(recoveryWeeks.includes(w));
    }
  });
});

describe("what the week does to the bar", () => {
  it("takes load and a set off in a deload week", () => {
    const s = seasonAdjust(macro, recoveryWeeks[0]!)!;
    expect(s.pctAdj).toBe(DELOAD_PCT_ADJ);
    expect(s.setAdj).toBe(DELOAD_SET_ADJ);
  });

  it("keeps a loading week's move small and inside its cap", () => {
    for (let w = 1; w <= macro.totalWeeks; w++) {
      const s = seasonAdjust(macro, w)!;
      if (s.deload) continue;
      expect(Math.abs(s.pctAdj)).toBeLessThanOrEqual(LOAD_PCT_CAP);
      expect(s.setAdj).toBe(0);
    }
  });

  it("ramps within a block — a later loading week is not easier than an earlier one", () => {
    // The engine ramps intensity by 4 per week inside a block, so the reading
    // has to be monotonic across the loading weeks of one block or it is not
    // reporting the ramp it was built from.
    const block = macro.blocks.find((b) => b.micros.filter((m) => m.kind === "load").length >= 2)!;
    const loads = block.micros.filter((m) => m.kind === "load");
    const adjs = loads.map((m) => seasonAdjust(macro, m.week)!.pctAdj);
    for (let i = 1; i < adjs.length; i++) expect(adjs[i]!).toBeGreaterThanOrEqual(adjs[i - 1]!);
  });

  it("clamps a week past the end rather than throwing", () => {
    expect(seasonAdjust(macro, macro.totalWeeks + 50)).not.toBeNull();
    expect(seasonAdjust(macro, 0)!.week).toBe(1);
  });
});

describe("the deload actually deloads the session", () => {
  const rx = (week: number | null) =>
    prescribeSession(SAMPLE_TRAINING_LOG, undefined, {
      experience: "intermediate",
      season: week === null ? null : seasonAdjust(macro, week),
    });

  it("prescribes less on a deload week than on a loading week", () => {
    const loadWeek = 2;
    const deloadWeek = recoveryWeeks[0]!;
    const loading = strength(rx(loadWeek).blocks);
    const deload = strength(rx(deloadWeek).blocks);
    expect(Number(deload.sets![0]!.load)).toBeLessThan(Number(loading.sets![0]!.load));
    expect(deload.sets!.length).toBeLessThan(loading.sets!.length);
  });

  it("says which week it is, and says a deload is a deload", () => {
    // A change to the work that is not stated is indistinguishable from the
    // engine being inconsistent.
    const s = seasonAdjust(macro, recoveryWeeks[0]!)!;
    expect(rx(recoveryWeeks[0]!).why).toContain(seasonBlockLabel(s));
    expect(rx(recoveryWeeks[0]!).why).toContain("scheduled deload");
    expect(rx(2).why).not.toContain("scheduled deload");
  });

  it("prescribes exactly as before when no season is passed", () => {
    const bare = prescribeSession(SAMPLE_TRAINING_LOG, undefined, { experience: "intermediate" });
    expect(rx(null).blocks).toEqual(bare.blocks);
  });
});
