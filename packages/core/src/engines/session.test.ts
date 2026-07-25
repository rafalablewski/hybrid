import { describe, it, expect } from "vitest";
import {
  e1rm,
  sessionVolume,
  totalVolume,
  e1rmSeries,
  bestE1rmByLift,
  bestTopLoadByLift,
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
  canonicalizeBlockNames,
  inferBlockKind,
  lastStrengthByLift,
  isWorkingSet,
  workingSets,
  setType,
  cycleSetType,
  setTypeBadge,
  warmupRamp,
  defaultSessionTitle,
  blockBestE1rm,
  moveItem,
  moveItemTo,
} from "./session";
import type { LoggedSession, StrengthBlock, SessionBlock } from "./session";

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

describe("defaultSessionTitle", () => {
  const at = (h: number) => new Date(2026, 5, 22, h, 0, 0);
  it("picks a friendly title by time of day", () => {
    expect(defaultSessionTitle(at(2))).toBe("Late night workout");
    expect(defaultSessionTitle(at(8))).toBe("Morning workout");
    expect(defaultSessionTitle(at(14))).toBe("Afternoon workout");
    expect(defaultSessionTitle(at(19))).toBe("Evening workout");
    expect(defaultSessionTitle(at(22))).toBe("Night workout");
  });
  it("covers the boundaries and is never empty", () => {
    for (let h = 0; h < 24; h++) expect(defaultSessionTitle(at(h)).length).toBeGreaterThan(0);
    expect(defaultSessionTitle()).toBeTruthy(); // default arg = now
  });
});

describe("block summaries", () => {
  it("conditioningSummary renders the interval (rounds × work/rest) when logged", () => {
    expect(conditioningSummary({ kind: "conditioning", name: "Row", format: "intervals", work: 40, rest: 20, rounds: 8, minutes: 8 })).toBe(
      "intervals, 8×40/20s, 8 min",
    );
  });
  it("conditioningSummary falls back to rounds, and adds RPE only when asked", () => {
    expect(conditioningSummary({ kind: "conditioning", name: "Metcon", rounds: 5, rpe: 9 })).toBe("5 rounds");
    expect(conditioningSummary({ kind: "conditioning", name: "Easy", minutes: 30, rpe: 6 }, { rpe: true })).toBe("30 min, RPE 6");
  });
  it("blockSummary formats strength sets", () => {
    expect(blockSummary({ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "110", reps: "3" }] })).toBe(
      "100×5, 110×3",
    );
  });
  it("cardioSummary shows distance and the derived pace for a run", () => {
    expect(cardioSummary({ kind: "cardio", name: "Run", distance: 8, minutes: 50, rpe: 6 }, { rpe: true })).toBe(
      "8 km, 50 min, 6:15 /km, RPE 6",
    );
  });
});

describe("lastStrengthByLift", () => {
  it("returns the most recent prior block per lift (newest session wins)", () => {
    const map = lastStrengthByLift(sessions);
    // Two Back Squat sessions (May 20 + May 27) — the newer one (id 2) is kept.
    expect(blockSummary(map.get("Back Squat")!)).toBe("120×3");
    expect(map.has("Row Intervals")).toBe(false); // conditioning isn't strength
  });
  it("skips strength blocks with no sets and is empty for no history", () => {
    expect(lastStrengthByLift([]).size).toBe(0);
    const noSets: LoggedSession[] = [{ id: "x", title: "t", startedAt: "2026-01-01T00:00:00.000Z", blocks: [{ kind: "strength", name: "Bench", sets: [] }] }];
    expect(lastStrengthByLift(noSets).has("Bench")).toBe(false);
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
    expect(out[0]).toEqual({ kind: "cardio", name: "Easy Run", distance: 8, minutes: 50, rpe: 6, discipline: "running" });
    expect(out[1]!.kind).toBe("conditioning"); // intervals stay conditioning
    expect(out[2]!.kind).toBe("strength");
  });
  it("migrateBlocks leaves an interval block with distance as conditioning", () => {
    const out = migrateBlocks([{ kind: "conditioning", name: "X", distance: 2, work: 30, rest: 30, rounds: 5 }]);
    expect(out[0]!.kind).toBe("conditioning");
  });
  it("canonicalizeBlockNames folds an admin rename map and leaves other fields intact", () => {
    const blocks: SessionBlock[] = [
      { kind: "strength", name: "Bench Press", sets: [{ load: "100", reps: "5" }] },
      { kind: "cardio", name: "Easy Run", distance: 5 },
    ];
    const out = canonicalizeBlockNames(blocks, { "Bench Press": "Barbell Bench Press" });
    expect(out[0]!.name).toBe("Barbell Bench Press");
    expect((out[0] as StrengthBlock).sets).toEqual([{ load: "100", reps: "5" }]);
    expect(out[1]!.name).toBe("Easy Run"); // untouched
  });
  it("migrateBlocks heals a built-in rename in the logged block name", () => {
    // A session logged under the OLD catalog name displays + attributes under
    // the current one, with no data migration.
    const out = migrateBlocks([
      { kind: "strength", name: "Incline Bench Press", sets: [{ load: "24", reps: "10" }] },
    ]);
    expect(out[0]!.name).toBe("Incline Dumbbell Bench Press");
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

  it("a bilateral dumbbell lift counts both bells (24 kg × 10 = 480, not 240)", () => {
    const db: LoggedSession["blocks"] = [
      { kind: "strength", name: "Incline Dumbbell Bench Press", sets: [{ load: "24", reps: "10" }] },
    ];
    expect(sessionVolume(db)).toBe(480);
    // A single-arm (unilateral) dumbbell lift stays per-bell.
    const uni: LoggedSession["blocks"] = [
      { kind: "strength", name: "DB Row", sets: [{ load: "30", reps: "10" }] },
    ];
    expect(sessionVolume(uni)).toBe(300);
    // A barbell lift is unchanged.
    const bar: LoggedSession["blocks"] = [
      { kind: "strength", name: "Bench Press", sets: [{ load: "100", reps: "5" }] },
    ];
    expect(sessionVolume(bar)).toBe(500);
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

  it("bestTopLoadByLift returns the heaviest ACTUAL load per lift, not e1RM", () => {
    const prs = bestTopLoadByLift(sessions);
    expect(prs[0]!.lift).toBe("Back Squat");
    expect(prs[0]!.weightKg).toBe(120); // heaviest weight lifted, not the ~132 e1RM
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

describe("set roles (warm-up / cool-down)", () => {
  const block: StrengthBlock = {
    kind: "strength",
    name: "Bench Press",
    sets: [
      { load: "40", reps: "8", role: "warmup" },
      { load: "60", reps: "5", role: "warmup" },
      { load: "100", reps: "3", rpe: "9" }, // working (role absent)
      { load: "90", reps: "5", drop: true }, // drop set — still working
      { load: "20", reps: "12", role: "cooldown" },
    ],
  };

  it("isWorkingSet treats absent role and drop sets as work, excludes warm-up/cool-down", () => {
    expect(isWorkingSet({})).toBe(true);
    expect(isWorkingSet({ role: "working" })).toBe(true);
    expect(isWorkingSet({ role: "warmup" })).toBe(false);
    expect(isWorkingSet({ role: "cooldown" })).toBe(false);
    expect(workingSets(block).map((s) => s.load)).toEqual(["100", "90"]);
  });

  it("blockBestE1rm ignores warm-up ramps (a heavy warm-up can't set the block best)", () => {
    const sneaky: StrengthBlock = {
      kind: "strength",
      name: "Deadlift",
      sets: [
        { load: "200", reps: "1", role: "warmup" }, // would be the best if counted
        { load: "150", reps: "3" },
      ],
    };
    expect(blockBestE1rm(sneaky)).toBe(e1rm(150, 3));
  });

  it("sessionVolume + working e1RM exclude warm-up / cool-down tonnage", () => {
    const vol = sessionVolume([block]);
    expect(vol).toBe(100 * 3 + 90 * 5); // only the working + drop sets
    expect(blockBestE1rm(block)).toBe(e1rm(100, 3));
  });

  it("setType folds role + drop into one mutually-exclusive choice", () => {
    expect(setType({})).toBe("working");
    expect(setType({ role: "warmup" })).toBe("warmup");
    expect(setType({ role: "cooldown" })).toBe("cooldown");
    expect(setType({ drop: true })).toBe("drop");
  });

  it("cycleSetType walks working → warm-up → cool-down → drop → working, preserving other fields", () => {
    let s: { load: string; reps: string; role?: "warmup" | "working" | "cooldown"; drop?: boolean } = { load: "100", reps: "5" };
    s = cycleSetType(s);
    expect(setType(s)).toBe("warmup");
    expect(s.load).toBe("100"); // untouched
    s = cycleSetType(s);
    expect(setType(s)).toBe("cooldown");
    s = cycleSetType(s);
    expect(setType(s)).toBe("drop");
    s = cycleSetType(s);
    expect(setType(s)).toBe("working");
    expect(s.role).toBeUndefined();
    expect(s.drop).toBeUndefined();
  });

  it("warmupRamp builds a plate-friendly ramp to the working load", () => {
    const ramp = warmupRamp(100);
    expect(ramp.map((s) => s.load)).toEqual([40, 60, 80]);
    expect(ramp.map((s) => s.reps)).toEqual([8, 5, 3]);
    expect(warmupRamp(20)).toEqual([]); // nothing to ramp for a light/bodyweight load
  });

  it("setTypeBadge shows the index for working, else W / C / ↓", () => {
    expect(setTypeBadge({}, 0)).toBe("1");
    expect(setTypeBadge({ role: "warmup" }, 1)).toBe("W");
    expect(setTypeBadge({ role: "cooldown" }, 2)).toBe("C");
    expect(setTypeBadge({ drop: true }, 3)).toBe("↓");
  });

  it("moveItem swaps an item one slot, clamping at the ends without mutating", () => {
    const arr = ["a", "b", "c"];
    expect(moveItem(arr, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(arr, 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(arr, 0, -1)).toBe(arr); // past the top edge — no-op (same ref)
    expect(moveItem(arr, 2, 1)).toBe(arr); // past the bottom edge — no-op
    expect(arr).toEqual(["a", "b", "c"]); // original untouched
  });

  it("moveItemTo slides an item to an arbitrary index (drag reorder)", () => {
    const arr = ["a", "b", "c", "d"];
    expect(moveItemTo(arr, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItemTo(arr, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItemTo(arr, 1, 1)).toBe(arr); // same index — no-op
    expect(moveItemTo(arr, 0, 9)).toBe(arr); // out of range — no-op
    expect(arr).toEqual(["a", "b", "c", "d"]); // original untouched
  });
});
