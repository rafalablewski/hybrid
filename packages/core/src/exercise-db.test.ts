import { describe, it, expect } from "vitest";
import {
  GYM_EXERCISES,
  GYM_MOVEMENTS,
  gymExercise,
  gymExercisesByMuscle,
  gymExercisesByEquipment,
  GYM_CATEGORY_BY_NAME,
} from "./exercise-db";
import { MOVEMENTS, exercisesByCategory, LIBRARY_CATEGORY_ORDER } from "./engines/movements";
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

  it("a pull-up reads BW + added load", () => {
    expect(exerciseProfile("Pull-Up").strength?.loadMode).toBe("bodyweight-plus");
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
});
