import { describe, it, expect } from "vitest";
import {
  e1rm,
  sessionVolume,
  totalVolume,
  e1rmSeries,
  bestE1rmByLift,
  liftNames,
  toTrainingLog,
  conditioningSummary,
  cardioSummary,
  blockSummary,
  pacePerKm,
  supersetLabels,
  toggleSuperset,
  isSupersettedWithPrev,
  paceSeries,
  headlineRunMove,
  paceClock,
  migrateBlocks,
  inferBlockKind,
} from "./session";
import type { LoggedSession } from "./session";

const sessions: LoggedSession[] = [
  {
    id: "1",
    title: "Lower",
    startedAt: "2026-05-20T10:00:00.000Z",
    blocks: [
      { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "110", reps: "3" }] },
      { kind: "conditioning", name: "Row Intervals", minutes: 16, rpe: 8 },
    ],
  },
  {
    id: "2",
    title: "Lower",
    startedAt: "2026-05-27T10:00:00.000Z",
    blocks: [
      { kind: "strength", name: "Back Squat", sets: [{ load: "120", reps: "3", rpe: "8" }] },
    ],
  },
];

describe("block summaries", () => {
  it("conditioningSummary renders the interval (rounds × work/rest) when logged", () => {
    expect(conditioningSummary({ kind: "conditioning", name: "Row", format: "intervals", work: 40, rest: 20, rounds: 8, minutes: 8 })).toBe(
      "intervals · 8×40/20s · 8 min",
    );
  });
  it("conditioningSummary falls back to rounds, and adds RPE only when asked", () => {
    expect(conditioningSummary({ kind: "conditioning", name: "Metcon", rounds: 5, rpe: 9 })).toBe("5 rounds");
    expect(conditioningSummary({ kind: "conditioning", name: "Easy", minutes: 30, rpe: 6 }, { rpe: true })).toBe("30 min · RPE 6");
  });
  it("blockSummary formats strength sets", () => {
    expect(blockSummary({ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "110", reps: "3" }] })).toBe(
      "100×5 · 110×3",
    );
  });
  it("cardioSummary shows distance and the derived pace for a run", () => {
    expect(cardioSummary({ kind: "cardio", name: "Run", distance: 8, minutes: 50, rpe: 6 }, { rpe: true })).toBe(
      "8 km · 50 min · 6:15 /km · RPE 6",
    );
  });
});

describe("supersets", () => {
  const S = (name: string, group?: string) => ({ kind: "strength" as const, name, sets: [{ load: "60", reps: "10" }], ...(group ? { group } : {}) });
  const C = { kind: "conditioning" as const, name: "Run", minutes: 10 };

  it("labels ≥2-member groups A1/A2/A3, lettering by first appearance", () => {
    const blocks = [S("Bench", "g1"), S("Row", "g1"), C, S("Squat", "g2"), S("Leg Curl", "g2"), S("Calf", "g2")];
    expect(supersetLabels(blocks)).toEqual(["A1", "A2", null, "B1", "B2", "B3"]);
  });
  it("ignores a singleton group", () => {
    expect(supersetLabels([S("Bench", "lonely"), S("Squat")])).toEqual([null, null]);
  });
  it("normalizes the legacy link-to-next boolean", () => {
    const legacy = [
      { kind: "strength" as const, name: "Bench", sets: [], superset: true },
      { kind: "strength" as const, name: "Row", sets: [] },
      { kind: "strength" as const, name: "Squat", sets: [] },
    ];
    expect(supersetLabels(legacy)).toEqual(["A1", "A2", null]);
  });
  it("toggleSuperset joins with the block above, then leaves", () => {
    let blocks = [S("Bench"), S("Row")];
    blocks = toggleSuperset(blocks, 1, () => "g");
    expect(isSupersettedWithPrev(blocks, 1)).toBe(true);
    expect(supersetLabels(blocks)).toEqual(["A1", "A2"]);
    blocks = toggleSuperset(blocks, 1, () => "g");
    expect(supersetLabels(blocks)).toEqual([null, null]);
    expect(blocks.every((b) => !b.group)).toBe(true);
  });
});

describe("cardio/conditioning split", () => {
  it("migrateBlocks upgrades a legacy conditioning-with-distance block to cardio", () => {
    const out = migrateBlocks([
      { kind: "conditioning", name: "Easy Run", distance: 8, minutes: 50, rpe: 6 },
      { kind: "conditioning", name: "Metcon", format: "AMRAP", work: 40, rest: 20, rounds: 8 },
      { kind: "strength", name: "Squat", sets: [{ load: "100", reps: "5" }] },
    ]);
    expect(out[0]).toEqual({ kind: "cardio", name: "Easy Run", distance: 8, minutes: 50, rpe: 6 });
    expect(out[1]!.kind).toBe("conditioning"); // intervals stay conditioning
    expect(out[2]!.kind).toBe("strength");
  });
  it("migrateBlocks leaves an interval block with distance as conditioning", () => {
    const out = migrateBlocks([{ kind: "conditioning", name: "X", distance: 2, work: 30, rest: 30, rounds: 5 }]);
    expect(out[0]!.kind).toBe("conditioning");
  });
  it("inferBlockKind classifies by catalog then keyword, defaulting to strength", () => {
    expect(inferBlockKind("Easy Run")).toBe("cardio");
    expect(inferBlockKind("Row Intervals")).toBe("conditioning");
    expect(inferBlockKind("Trail Run")).toBe("cardio");
    expect(inferBlockKind("EMOM Burpees")).toBe("conditioning");
    expect(inferBlockKind("Back Squat")).toBe("strength");
    expect(inferBlockKind("Zercher Carry")).toBe("strength");
  });
});

describe("cardio pace", () => {
  it("pacePerKm derives min/km from distance + minutes", () => {
    expect(pacePerKm({ distance: 10, minutes: 50 })).toBe("5:00 /km");
    expect(pacePerKm({ distance: 8, minutes: 50 })).toBe("6:15 /km");
  });
  it("pacePerKm is null without both distance and minutes", () => {
    expect(pacePerKm({ minutes: 50 })).toBeNull();
    expect(pacePerKm({ distance: 8 })).toBeNull();
  });
  it("paceClock formats seconds-per-km as m:ss", () => {
    expect(paceClock(342)).toBe("5:42");
    expect(paceClock(300)).toBe("5:00");
  });
  it("paceClock rounds the whole value so it never shows :60", () => {
    expect(paceClock(359.6)).toBe("6:00"); // not 5:60
    expect(paceClock(359.4)).toBe("5:59");
  });
  it("paceSeries tracks one move's pace over time, oldest first", () => {
    const runs: LoggedSession[] = [
      { id: "b", title: "Run", startedAt: "2026-05-10T00:00:00.000Z", blocks: [{ kind: "cardio", name: "Easy Run", distance: 10, minutes: 55 }] },
      { id: "a", title: "Run", startedAt: "2026-05-03T00:00:00.000Z", blocks: [{ kind: "cardio", name: "Easy Run", distance: 10, minutes: 60 }] },
    ];
    expect(paceSeries(runs, "Easy Run").map((p) => p.secPerKm)).toEqual([360, 330]);
  });
  it("headlineRunMove picks the longest paced distance", () => {
    expect(
      headlineRunMove([
        { kind: "cardio", name: "Warm-up Jog", distance: 2, minutes: 12 },
        { kind: "cardio", name: "Long Run", distance: 15, minutes: 80 },
        { kind: "strength", name: "Squat", sets: [] },
      ]),
    ).toBe("Long Run");
  });
});

describe("session stats", () => {
  it("e1rm uses the Epley formula", () => {
    expect(Math.round(e1rm(100, 5))).toBe(117);
    expect(e1rm(100, 0)).toBe(0);
  });

  it("sessionVolume sums load × reps over strength sets", () => {
    expect(sessionVolume(sessions[0]!.blocks)).toBe(100 * 5 + 110 * 3);
  });

  it("totalVolume sums across sessions", () => {
    expect(totalVolume(sessions)).toBe(100 * 5 + 110 * 3 + 120 * 3);
  });

  it("e1rmSeries returns points oldest→newest for a lift", () => {
    const s = e1rmSeries(sessions, "Back Squat");
    expect(s).toHaveLength(2);
    expect(s[0]!.e1rm).toBeLessThan(s[1]!.e1rm); // progress
  });

  it("bestE1rmByLift returns the all-time best per lift", () => {
    const prs = bestE1rmByLift(sessions);
    expect(prs[0]!.lift).toBe("Back Squat");
    expect(prs[0]!.e1rm).toBe(Math.round(e1rm(120, 3)));
  });

  it("liftNames lists distinct lifts", () => {
    expect(liftNames(sessions)).toEqual(["Back Squat"]);
  });

  it("toTrainingLog produces engine input with daysAgo + items", () => {
    const log = toTrainingLog(sessions, new Date("2026-05-28T10:00:00.000Z").getTime());
    expect(log).toHaveLength(2);
    expect(log[1]!.daysAgo).toBe(1);
    const squat = log[1]!.items.find((i) => i.move === "Back Squat");
    expect(squat?.e1rm).toBe(Math.round(e1rm(120, 3)));
    expect(squat?.topRpe).toBe(8);
  });
});
