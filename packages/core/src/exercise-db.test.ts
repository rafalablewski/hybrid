import { describe, it, expect } from "vitest";
import {
  GYM_EXERCISES,
  GYM_MOVEMENTS,
  gymExercise,
  gymExercisesByMuscle,
  gymExercisesByEquipment,
  GYM_CATEGORY_BY_NAME,
  GYM_LIBRARY_ALIASES,
  GYM_EXERCISE_MAP,
  loadUnitCount,
  builtinExerciseRefs,
  LIBRARY_PATTERNS,
} from "./exercise-db";
import { MOVEMENTS, exercisesByCategory, LIBRARY_CATEGORY_ORDER, ALL_MUSCLES } from "./engines/movements";
import { exerciseProfile } from "./exercise-profile";
import { inferBlockKind } from "./engines/session";

describe("exercise DB integrity", () => {
  it("is a comprehensive catalog", () => {
    expect(GYM_EXERCISES.length).toBeGreaterThanOrEqual(150);
  });

  it("names are unique (case-insensitively)", () => {
    const lower = GYM_EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("obeys the naming rules: KB prefix, no middots", () => {
    for (const e of GYM_EXERCISES) {
      expect(e.name.includes("Kettlebell")).toBe(false);
      expect(e.name.includes("·")).toBe(false);
    }
  });

  it("every entry has primary muscles and a known category heading", () => {
    for (const e of GYM_EXERCISES) {
      expect(e.primary.length).toBeGreaterThan(0);
      expect(LIBRARY_CATEGORY_ORDER).toContain(e.category);
    }
  });

  it("bodyweight loadMode never carries a baseLoad", () => {
    for (const e of GYM_EXERCISES)
      if (e.loadMode === "bodyweight") expect(e.baseLoad).toBeNull();
  });

  it("covers every category heading", () => {
    const used = new Set(GYM_EXERCISES.map((e) => e.category));
    for (const c of LIBRARY_CATEGORY_ORDER) expect(used.has(c as never)).toBe(true);
  });
});

describe("lookups", () => {
  it("finds by exact and case-insensitive name", () => {
    expect(gymExercise("Lat Pulldown")?.equipment).toBe("cable");
    expect(gymExercise("lat pulldown")?.name).toBe("Lat Pulldown");
    expect(gymExercise("No Such Lift")).toBeUndefined();
  });

  it("queries by muscle (primaries first) and equipment", () => {
    const hams = gymExercisesByMuscle("hamstrings");
    expect(hams.some((e) => e.name === "Romanian Deadlift")).toBe(true);
    expect(hams.findIndex((e) => e.name === "Romanian Deadlift")).toBeLessThan(
      hams.findIndex((e) => e.name === "Back Squat"),
    );
    expect(gymExercisesByEquipment("kettlebell").every((e) => e.equipment === "kettlebell")).toBe(true);
    expect(gymExercisesByEquipment("kettlebell").length).toBeGreaterThanOrEqual(6);
  });
});

describe("loadUnitCount (dumbbell tonnage counts both bells)", () => {
  it("the incline dumbbell bench press is a dumbbell exercise", () => {
    const e = gymExercise("Incline Dumbbell Bench Press");
    expect(e?.equipment).toBe("dumbbell");
    // The old "Incline Bench Press" name is a rename breadcrumb (GYM_ALIASES):
    // it still RESOLVES to the current dumbbell entry so historical logs keep
    // their exercise profile + doubled (two-bell) tonnage.
    expect(gymExercise("Incline Bench Press")?.name).toBe("Incline Dumbbell Bench Press");
    expect(loadUnitCount("Incline Bench Press")).toBe(2);
  });

  it("a bilateral dumbbell lift counts two implements, a barbell lift one", () => {
    expect(loadUnitCount("Incline Dumbbell Bench Press")).toBe(2);
    expect(loadUnitCount("DB Bench Press")).toBe(2);
    expect(loadUnitCount("DB Curl")).toBe(2);
    expect(loadUnitCount("Bench Press")).toBe(1); // barbell
  });

  it("a two-hands-ONE-bell hold counts one implement (explicit override)", () => {
    // A Goblet Squat / overhead dumbbell extension is gripped bilaterally on a
    // SINGLE bell, so 100 kg × 10 is 1 000 kg, not 2 000. The catalog entry
    // carries implements:1, which wins over the equipment/pattern heuristic.
    expect(loadUnitCount("Goblet Squat")).toBe(1);
    expect(loadUnitCount("Overhead Triceps Extension")).toBe(1);
    expect(gymExercise("Goblet Squat")?.implements).toBe(1);
  });

  it("single-ARM (upper-body unilateral) dumbbell work logs one bell", () => {
    expect(loadUnitCount("DB Row")).toBe(1); // one-arm row
    expect(loadUnitCount("Concentration Curl")).toBe(1); // one-arm curl
  });

  it("single-LEG (lower-body unilateral) dumbbell work still counts two bells", () => {
    // The leg is what works one side at a time; both hands still hold a bell,
    // so 100 kg × 1 rep is 200 kg of tonnage, not 100.
    expect(loadUnitCount("Bulgarian Split Squat")).toBe(2);
    expect(loadUnitCount("Walking Lunge")).toBe(2);
    expect(loadUnitCount("Reverse Lunge")).toBe(2);
    expect(loadUnitCount("Step-Up")).toBe(2);
    expect(loadUnitCount("Single-Leg RDL")).toBe(2);
  });

  it("a single kettlebell and an unknown non-dumbbell lift both count one", () => {
    expect(loadUnitCount("KB Swing")).toBe(1);
    expect(loadUnitCount("Bench Pressing Machine 3000")).toBe(1);
  });

  it("a CUSTOM dumbbell lift the catalog doesn't know still counts two bells (name fallback)", () => {
    // Free-text names from the picker's "+ …" custom add never reach the DB, so
    // the doubling is read from the NAME — otherwise a bespoke DB lift silently
    // under-counts its tonnage by half.
    expect(loadUnitCount("Dumbbell Thruster")).toBe(2);
    expect(loadUnitCount("DB Snatch")).toBe(2);
    expect(loadUnitCount("Dumbbell Devil Press")).toBe(2);
    // A custom single-LEG dumbbell lift is two bells too (both hands loaded).
    expect(loadUnitCount("Dumbbell Bulgarian Split Squat")).toBe(2);
  });

  it("a CUSTOM single-arm / concentration dumbbell lift stays one bell", () => {
    expect(loadUnitCount("Single-Arm Dumbbell Row")).toBe(1);
    expect(loadUnitCount("One-Arm DB Press")).toBe(1);
    expect(loadUnitCount("Dumbbell Concentration Curl")).toBe(1);
  });

  it("a CUSTOM two-hands-one-bell hold (goblet / pullover) stays one bell", () => {
    expect(loadUnitCount("Dumbbell Goblet Squat")).toBe(1);
    expect(loadUnitCount("Heavy DB Goblet Squat")).toBe(1);
    expect(loadUnitCount("DB Pullover")).toBe(1);
  });

  it("a custom non-dumbbell lift is unaffected by the name fallback", () => {
    expect(loadUnitCount("Sandbag Carry")).toBe(1);
    expect(loadUnitCount("Cable Woodchopper")).toBe(1);
  });
});

describe("builtinExerciseRefs (admin-editable built-in rows)", () => {
  it("projects every built-in into a CMS-valid, admin-editable row", () => {
    const refs = builtinExerciseRefs();
    expect(refs.length).toBe(GYM_EXERCISES.length);
    const patterns = new Set<string>(LIBRARY_PATTERNS);
    const muscles = new Set<string>(ALL_MUSCLES);
    for (const r of refs) {
      expect(r.name).toBeTruthy();
      expect(r.slug).toBeTruthy();
      // pattern + muscles pass the CMS validation allow-lists, so an override saves
      expect(patterns.has(r.pattern)).toBe(true);
      expect(r.muscles.length).toBeGreaterThan(0);
      expect(r.muscles.every((m) => muscles.has(m))).toBe(true);
    }
  });

  it("carries the incline dumbbell bench press with its category + equipment", () => {
    const incline = builtinExerciseRefs().find((r) => r.name === "Incline Dumbbell Bench Press");
    expect(incline?.category).toBe("Chest");
    expect(incline?.equipment).toEqual(["dumbbell"]);
  });
});

describe("engine bridge", () => {
  it("every DB exercise is a MOVEMENTS entry (fatigue/volume attribution works)", () => {
    for (const e of GYM_EXERCISES) {
      const m = MOVEMENTS[e.name];
      expect(m, e.name).toBeDefined();
      expect(m!.muscles.length).toBeGreaterThan(0);
    }
  });

  it("hand-tuned legacy entries still override their DB twins", () => {
    // The prescription engine anchors on these baseLoads — they must not move.
    expect(MOVEMENTS["Back Squat"]!.baseLoad).toBe(100);
    expect(MOVEMENTS["Deadlift"]!.baseLoad).toBe(140);
    expect(MOVEMENTS["Back Squat"]!.pattern).toBe("squat");
  });

  it("DB names resolve as strength in kind inference", () => {
    expect(inferBlockKind("Lat Pulldown")).toBe("strength");
    expect(inferBlockKind("Bulgarian Split Squat")).toBe("strength");
    expect(GYM_MOVEMENTS["Plank"]!.system).toBeNull();
  });
});

describe("picker grouping", () => {
  const sections = exercisesByCategory(MOVEMENTS);

  it("groups the whole DB under muscle-group headings", () => {
    const chest = sections.find((s) => s.category === "Chest");
    expect(chest?.names).toContain("Bench Press");
    expect(chest?.names).toContain("Push-Up");
    const oly = sections.find((s) => s.category === "Olympic & Power");
    expect(oly?.names).toContain("Snatch");
    expect(sections.find((s) => s.category === "Carries & Conditioning")?.names).toContain("Farmer Carry");
  });

  it("an admin-library category overrides the built-in heading", () => {
    const out = exercisesByCategory(MOVEMENTS, [], { "Bench Press": "My Custom Group" });
    expect(out.find((s) => s.category === "My Custom Group")?.names).toContain("Bench Press");
    expect(out.find((s) => s.category === "Chest")?.names).not.toContain("Bench Press");
  });
});

describe("strength profiles (per-exercise editor behaviour)", () => {
  it("a plank is measured in seconds, bodyweight", () => {
    const p = exerciseProfile("Plank");
    expect(p.kind).toBe("strength");
    expect(p.strength).toMatchObject({ measure: "time", loadMode: "bodyweight" });
  });

  it("load modes: deadlift is kg, pull-up is plain BW (no load), weighted pull-up is BW + added", () => {
    // Deadlift 100 kg × 7 / Pull-Up bodyweight × 7 / Weighted Pull-Up BW + plates × 7.
    expect(exerciseProfile("Deadlift").strength?.loadMode).toBe("external");
    expect(exerciseProfile("Pull-Up").strength?.loadMode).toBe("bodyweight");
    expect(exerciseProfile("Weighted Pull-Up").strength?.loadMode).toBe("bodyweight-plus");
    expect(exerciseProfile("Dip").strength?.loadMode).toBe("bodyweight");
    expect(exerciseProfile("Weighted Dip").strength?.loadMode).toBe("bodyweight-plus");
    expect(exerciseProfile("Chin-Up").strength?.loadMode).toBe("bodyweight");
    expect(exerciseProfile("Weighted Chin-Up").strength?.loadMode).toBe("bodyweight-plus");
  });

  it("dips split by target muscle: plain Dip is triceps, Chest Dip is chest; both bodyweight, both have weighted variants", () => {
    // Triceps-primary (upright) and chest-primary (forward-lean) dips are
    // distinct catalog entries so tonnage/analytics attribute the right muscle.
    expect(gymExercise("Dip")?.category).toBe("Triceps");
    expect(gymExercise("Dip")?.primary).toEqual(["triceps"]);
    expect(gymExercise("Chest Dip")?.category).toBe("Chest");
    expect(gymExercise("Chest Dip")?.primary).toEqual(["chest"]);
    // Plain variants count bodyweight; weighted variants add the entered plate.
    expect(gymExercise("Dip")?.loadMode).toBe("bodyweight");
    expect(gymExercise("Weighted Dip")?.loadMode).toBe("bodyweight-plus");
    expect(gymExercise("Chest Dip")?.loadMode).toBe("bodyweight");
    expect(gymExercise("Weighted Chest Dip")?.loadMode).toBe("bodyweight-plus");
  });

  it("a farmer carry is measured in metres", () => {
    expect(exerciseProfile("Farmer Carry").strength?.measure).toBe("distance");
  });

  it("a lunge is unilateral", () => {
    expect(exerciseProfile("Walking Lunge").strength?.unilateral).toBe(true);
  });

  it("an unknown custom lift falls back to reps + external load", () => {
    expect(exerciseProfile("Bench Pressing Machine 3000").strength).toMatchObject({
      measure: "reps",
      loadMode: "external",
      equipment: null,
    });
  });

  describe("library display-name aliases (GYM_LIBRARY_ALIASES)", () => {
    it("every alias points at a real built-in and is not itself one", () => {
      for (const [display, canonical] of Object.entries(GYM_LIBRARY_ALIASES)) {
        expect(GYM_EXERCISE_MAP[canonical], `${display} → ${canonical}`).toBeTruthy();
        // the display name must NOT already be a built-in (that'd be a needless entry)
        expect(GYM_EXERCISE_MAP[display], display).toBeUndefined();
      }
    });

    it("resolves the library's equipment-qualified names to their built-in entry", () => {
      // the marquee compounds users see under a library name still resolve
      expect(gymExercise("Barbell Bench Press")?.name).toBe("Bench Press");
      expect(gymExercise("Barbell Deadlift")?.name).toBe("Deadlift");
      expect(gymExercise("Barbell Back Squat")?.name).toBe("Back Squat");
      expect(gymExercise("Standing Overhead Press")?.name).toBe("Overhead Press");
      // and the property sheet comes through, so the anatomy/animation section renders
      expect(exerciseProfile("Barbell Bench Press").strength?.equipment).toBe("barbell");
    });
  });
});
