import { describe, expect, it } from "vitest";
import { MOVEMENTS, exercisesByCategory } from "./engines/movements";
import { olympicSportsByCategory } from "./olympic-sports";
import {
  buildExerciseIndex,
  searchExerciseIndex,
  searchExercises,
  exerciseNameTaken,
  exerciseSearchNicknameGaps,
  normalizeExerciseText,
  EXERCISE_NICKNAMES,
} from "./exercise-search";

// The catalog the picker actually searches: every gym movement plus the sport
// catalog, exactly as the mobile picker assembles it.
const NAMES = [
  ...exercisesByCategory(MOVEMENTS, [], {}).flatMap((s) => s.names),
  ...olympicSportsByCategory().flatMap((s) => s.sports.map((x) => x.name)),
];
const INDEX = buildExerciseIndex(NAMES);

const top = (q: string, n = 1): string[] =>
  searchExerciseIndex(INDEX, q, { limit: n }).slice(0, n).map((h) => h.name);
const first = (q: string): string | undefined => top(q, 1)[0];
const rank = (q: string, name: string): number =>
  searchExerciseIndex(INDEX, q, { limit: 200 }).findIndex((h) => h.name === name);

describe("normalizeExerciseText", () => {
  it("folds case, punctuation and accents", () => {
    expect(normalizeExerciseText("Trap-Bar Deadlift")).toBe("trap bar deadlift");
    expect(normalizeExerciseText("Clean & Jerk")).toBe("clean jerk");
    expect(normalizeExerciseText("  Pull-Up  ")).toBe("pull up");
  });
});

describe("the lift you typed is the first row", () => {
  // This is the entire point. A substring filter returned eleven deadlifts in
  // catalog order; the athlete typed the name of exactly one of them.
  it.each([
    ["deadlift", "Deadlift"],
    ["squat", "Back Squat"],
    ["bench", "Bench Press"],
    // The app's own vocabulary: exercise-db aliases bare "Press" to the
    // Overhead Press (that is how the shipped plans and the sport pools write
    // it), so the search agrees with the rest of the app rather than guessing.
    ["press", "Overhead Press"],
    ["row", "Barbell Row"],
    ["curl", "Barbell Curl"],
    ["clean", "Clean"],
    ["plank", "Plank"],
    ["lunge", "Walking Lunge"],
    ["hip thrust", "Hip Thrust"],
    ["romanian", "Romanian Deadlift"],
    ["lat pulldown", "Lat Pulldown"],
    ["run", "Running"],
    ["swim", "Swimming"],
  ])("%s → %s", (q, name) => {
    expect(first(q)).toBe(name);
  });

  it("keeps the plain lift ahead of every variant of it", () => {
    const hits = searchExerciseIndex(INDEX, "deadlift", { limit: 20 }).map((h) => h.name);
    expect(hits[0]).toBe("Deadlift");
    expect(hits.indexOf("Deadlift")).toBeLessThan(hits.indexOf("Snatch-Grip Deadlift"));
    expect(hits.indexOf("Romanian Deadlift")).toBeLessThan(hits.indexOf("DB Romanian Deadlift"));
  });

  it("finds the lift while it is still being typed", () => {
    for (const q of ["d", "de", "dea", "dead", "deadl", "deadli"]) expect(first(q)).toBe("Deadlift");
  });
});

describe("tokens match in any order", () => {
  it("matches across the gaps a substring filter can't cross", () => {
    expect(first("db bench")).toBe("DB Bench Press");
    expect(first("bench db")).toBe("DB Bench Press");
    expect(first("bench close grip")).toBe("Close-Grip Bench Press");
    expect(first("trap bar")).toBe("Trap-Bar Deadlift");
  });

  it("still requires EVERY token to land", () => {
    expect(searchExerciseIndex(INDEX, "bench zzzz")).toEqual([]);
  });
});

describe("the vocabulary athletes actually type", () => {
  it.each([
    ["rdl", "Romanian Deadlift"],
    ["ohp", "Overhead Press"],
    ["bp", "Bench Press"],
    ["t2b", "Toes-to-Bar"],
    ["ghr", "Glute-Ham Raise"],
    ["bss", "Bulgarian Split Squat"],
    ["military press", "Overhead Press"],
    ["farmers walk", "Farmer Carry"],
    ["bent over row", "Barbell Row"],
    ["hamstring curl", "Lying Leg Curl"],
    // The 150-odd alias breadcrumbs the DB already keeps for attribution.
    ["barbell deadlift", "Deadlift"],
    ["dumbbell bench press", "DB Bench Press"],
    ["standing overhead press", "Overhead Press"],
  ])("%s → %s", (q, name) => {
    expect(first(q)).toBe(name);
  });

  it("takes an admin-library alias the caller passes in", () => {
    const idx = buildExerciseIndex(NAMES, { "Barbell Floor Press": "Bench Press" });
    expect(searchExerciseIndex(idx, "barbell floor press")[0]!.name).toBe("Bench Press");
  });

  it("reads DB and Dumbbell as one implement (the catalog spells it both ways)", () => {
    expect(first("dumbbell bench")).toBe("DB Bench Press");
    expect(first("db pullover")).toBe("Dumbbell Pullover");
  });

  it("takes plurals and run-together spellings", () => {
    expect(first("pullups")).toBe("Pull-Up");
    expect(first("pushups")).toBe("Push-Up");
    expect(first("benchpress")).toBe("Bench Press");
  });

  it("survives a typo rather than offering to invent a lift called 'deadlfit'", () => {
    expect(first("deadlfit")).toBe("Deadlift");
    expect(first("sqaut")).toBe("Back Squat");
    expect(first("dumbell curl")).toBe("DB Curl");
  });

  it("does not fuzzy-match a token too short to be a typo of anything", () => {
    expect(searchExerciseIndex(INDEX, "zzz")).toEqual([]);
  });

  it("every nickname points at a name the catalog still has", () => {
    expect(exerciseSearchNicknameGaps(NAMES)).toEqual([]);
    expect(Object.keys(EXERCISE_NICKNAMES).length).toBeGreaterThan(20);
  });
});

describe("searching by what it trains", () => {
  it("answers a muscle with work FOR that muscle, not every lift that uses it", () => {
    expect(rank("abs", "Plank")).toBeGreaterThanOrEqual(0);
    expect(rank("abs", "Plank")).toBeLessThan(rank("abs", "Snatch"));
    expect(rank("hamstrings", "Romanian Deadlift")).toBeLessThan(rank("hamstrings", "Back Squat"));
  });

  it("answers a muscle group with its headline lift", () => {
    expect(first("chest")).toBe("Bench Press");
    expect(first("shoulder")).toBe("Overhead Press");
  });

  it("never puts a muscle match above a name match", () => {
    const hits = searchExerciseIndex(INDEX, "chest", { limit: 40 });
    const named = hits.findIndex((h) => h.tier === "meta");
    expect(named).toBeGreaterThan(2);
    expect(hits.slice(0, named).every((h) => h.tier !== "meta")).toBe(true);
  });
});

describe("the athlete's own lifts", () => {
  it("lifts a logged movement above an equally-matched one it would lose to", () => {
    const plain = rank("press", "Z Press");
    const boosted = searchExerciseIndex(INDEX, "press", { limit: 40, uses: { "Z Press": 25 } })
      .findIndex((h) => h.name === "Z Press");
    expect(boosted).toBeLessThan(plain);
  });

  it("still cannot outrank the lift whose name was typed exactly", () => {
    const hits = searchExerciseIndex(INDEX, "deadlift", { limit: 10, uses: { "Sumo Deadlift": 999 } });
    expect(hits[0]!.name).toBe("Deadlift");
    expect(hits[1]!.name).toBe("Sumo Deadlift");
  });

  it("matches the athlete's spelling case-insensitively", () => {
    const hits = searchExerciseIndex(INDEX, "press", { limit: 40, uses: { "z press": 25 } });
    expect(hits.findIndex((h) => h.name === "Z Press")).toBeLessThan(rank("press", "Z Press"));
  });
});

describe("the shape of the result list", () => {
  it("returns nothing for an empty query — the caller shows its browse view", () => {
    expect(searchExerciseIndex(INDEX, "")).toEqual([]);
    expect(searchExerciseIndex(INDEX, "   ")).toEqual([]);
  });

  it("honours the cap", () => {
    expect(searchExerciseIndex(INDEX, "a", { limit: 7 })).toHaveLength(7);
  });

  it("is deterministic — equal scores break on the name", () => {
    const a = searchExerciseIndex(INDEX, "squat", { limit: 30 }).map((h) => h.name);
    const b = searchExerciseIndex(INDEX, "squat", { limit: 30 }).map((h) => h.name);
    expect(a).toEqual(b);
  });

  it("scores descend", () => {
    const scores = searchExerciseIndex(INDEX, "press", { limit: 30 }).map((h) => h.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it("searches a bare list too, for callers that have no index", () => {
    expect(searchExercises(["Deadlift", "Sumo Deadlift"], "deadlift")[0]!.name).toBe("Deadlift");
  });

  it("finds a custom movement the catalog has never heard of", () => {
    const custom = buildExerciseIndex([...NAMES, "Sandbag Shouldering"]);
    expect(searchExerciseIndex(custom, "sandbag should")[0]!.name).toBe("Sandbag Shouldering");
  });
});

describe("exerciseNameTaken", () => {
  it("refuses to offer a custom add for a lift that already exists", () => {
    expect(exerciseNameTaken(NAMES, "deadlift")).toBe(true);
    expect(exerciseNameTaken(NAMES, "  DEADLIFT ")).toBe(true);
    expect(exerciseNameTaken(NAMES, "Trap Bar Deadlift")).toBe(true); // punctuation-blind
    expect(exerciseNameTaken(NAMES, "Sandbag Shouldering")).toBe(false);
  });

  it("counts an alias as taken, so a renamed lift is never re-created", () => {
    expect(exerciseNameTaken(NAMES, "Barbell Bench Press", ["Barbell Bench Press"])).toBe(true);
  });

  it("treats an empty query as taken (nothing to create)", () => {
    expect(exerciseNameTaken(NAMES, "   ")).toBe(true);
  });
});

describe("cost", () => {
  it("ranks the whole catalog fast enough to run on every keystroke", () => {
    const started = performance.now();
    for (let i = 0; i < 100; i++) searchExerciseIndex(INDEX, "deadlift", { limit: 40 });
    // Generous for CI; in practice this is ~0.2ms a query over ~300 entries,
    // which is why there is no debounce anywhere in the picker.
    expect((performance.now() - started) / 100).toBeLessThan(5);
  });
});
