import { describe, it, expect, afterEach } from "vitest";
import {
  MOVEMENTS,
  movementFor,
  musclesFor,
  setExerciseCatalog,
  resetExerciseCatalog,
  type LibraryMovement,
} from "./movements";
import { computeInjuryRisk } from "./injury";
import { computeFatigue } from "./fatigue";
import { volumeByMuscle } from "./records";
import type { TrainingLog } from "./types";

// Regression: a lift logged under the DB-backed exercise library's name resolved
// to NO Movement in the engines, so it added zero load to every muscle-attribution
// engine. Symptom in the wild: a second workout (deadlift, pull-up, bench,
// Bulgarian split squat) left injury risk bit-for-bit unchanged, with quads /
// glutes / posterior / back showing "—" (no chronic history at all).

afterEach(() => resetExerciseCatalog());

describe("movementFor", () => {
  it("resolves the exact built-in key", () => {
    expect(movementFor("Deadlift")?.muscles).toEqual(["posterior", "back", "glutes"]);
  });

  it("resolves the shipped library's equipment-qualified names", () => {
    expect(musclesFor("Barbell Deadlift")).toEqual(["posterior", "back", "glutes"]);
    expect(musclesFor("Barbell Bench Press")).toEqual(["chest", "triceps", "shoulders"]);
    expect(musclesFor("Standing Overhead Press")).toEqual(["shoulders", "triceps"]);
    expect(musclesFor("Dumbbell Bench Press")).toEqual(["chest", "triceps", "shoulders"]);
  });

  it("resolves a case-only difference (library 'Pull-up' vs built-in 'Pull-Up')", () => {
    expect(musclesFor("Pull-up")).toEqual(["back"]);
    expect(musclesFor("Chin-up")).toEqual(musclesFor("Chin-Up"));
    expect(musclesFor("Step-up")).toEqual(musclesFor("Step-Up"));
  });

  it("tolerates surrounding whitespace", () => {
    expect(musclesFor("  Bench Press  ")).toEqual(["chest", "triceps", "shoulders"]);
  });

  it("returns undefined / [] for a genuinely unknown name", () => {
    expect(movementFor("Jefferson Curl")).toBeUndefined();
    expect(musclesFor("Jefferson Curl")).toEqual([]);
    expect(musclesFor("")).toEqual([]);
  });

  it("resolves against an explicit map when one is passed", () => {
    expect(movementFor("Deadlift", MOVEMENTS)).toBeDefined();
    expect(movementFor("Deadlift", {})).toBeUndefined();
  });
});

describe("exercise catalog registry", () => {
  const custom: LibraryMovement[] = [
    {
      name: "Dumbbell Bulgarian Split Squat",
      pattern: "lunge",
      muscles: ["quads", "glutes"],
      baseLoad: 20,
      system: null,
      aliases: [],
      category: "Quads & Glutes",
    },
  ];

  it("a library-only lift attributes nothing until the catalog is published", () => {
    expect(musclesFor("Dumbbell Bulgarian Split Squat")).toEqual([]);
    setExerciseCatalog(custom);
    expect(musclesFor("Dumbbell Bulgarian Split Squat")).toEqual(["quads", "glutes"]);
  });

  it("keeps the built-ins resolvable, and reset drops back to them", () => {
    setExerciseCatalog(custom);
    expect(musclesFor("Bench Press")).toEqual(["chest", "triceps", "shoulders"]);
    resetExerciseCatalog();
    expect(musclesFor("Dumbbell Bulgarian Split Squat")).toEqual([]);
  });

  it("an empty / missing library is a no-op", () => {
    setExerciseCatalog([]);
    expect(musclesFor("Deadlift")).toEqual(["posterior", "back", "glutes"]);
    setExerciseCatalog(null);
    expect(musclesFor("Deadlift")).toEqual(["posterior", "back", "glutes"]);
  });
});

describe("a second, library-named workout moves injury risk", () => {
  // The reported session: deadlift, pull-up, bench, Bulgarian split squat — all
  // under the names the shipped exercise library presents them by.
  const pushDay = { daysAgo: 1, items: [{ move: "Bench Press", topRpe: 9, hardSets: 2 }] };
  const libraryDay = {
    daysAgo: 0,
    items: [
      { move: "Barbell Deadlift", topRpe: 9, hardSets: 3 },
      { move: "Pull-up", topRpe: 9, hardSets: 3 },
      { move: "Barbell Bench Press", topRpe: 9, hardSets: 3 },
      { move: "Dumbbell Bulgarian Split Squat", topRpe: 9, hardSets: 3 },
    ],
  };

  it("loads the lower body and back instead of leaving them untrained", () => {
    setExerciseCatalog([
      {
        name: "Dumbbell Bulgarian Split Squat",
        pattern: "lunge",
        muscles: ["quads", "glutes"],
        baseLoad: 20,
        system: null,
        aliases: [],
        category: "Quads & Glutes",
      },
    ]);
    const log: TrainingLog = [pushDay, libraryDay];
    const fatigue = computeFatigue(log);
    for (const m of ["quads", "glutes", "posterior", "back"] as const) {
      expect(fatigue.muscles[m], m).toBeGreaterThan(0);
    }

    const risk = computeInjuryRisk(log);
    for (const t of risk.tissues) {
      expect(t.enoughHistory, t.tissue).toBe(true);
      expect(t.risk, t.tissue).toBeGreaterThan(0);
    }
  });

  it("raises overall risk versus the push day alone", () => {
    const before = computeInjuryRisk([pushDay]).overall;
    setExerciseCatalog([]);
    const after = computeInjuryRisk([pushDay, libraryDay]).overall;
    expect(after).toBeGreaterThan(before);
  });
});

describe("volume-by-muscle sees library-named lifts", () => {
  it("counts a set of 'Barbell Deadlift' toward the posterior chain", () => {
    const vols = volumeByMuscle([
      { kind: "strength", name: "Barbell Deadlift", sets: [{ load: "140", reps: "5" }] },
    ]);
    const posterior = vols.find((v) => v.muscle === "posterior");
    expect(posterior?.volume).toBeGreaterThan(0);
  });
});
