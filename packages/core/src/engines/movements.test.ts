import { describe, it, expect } from "vitest";
import { MOVEMENTS, mergeMovements, exercisesByCategory, aliasNames, catalogNames, categoriesByName, type LibraryMovement } from "./movements";

// A name that is NOT in the built-in exercise DB (Zercher Squat now is).
const custom: LibraryMovement[] = [
  { name: "Jefferson Curl", pattern: "hinge", muscles: ["posterior"], baseLoad: 20, system: null, aliases: ["Jeffersons"] },
];

describe("mergeMovements", () => {
  it("keeps every built-in when nothing custom is provided", () => {
    const merged = mergeMovements(MOVEMENTS, []);
    expect(Object.keys(merged)).toEqual(Object.keys(MOVEMENTS));
    expect(merged).not.toBe(MOVEMENTS); // a copy, not the original reference
  });

  it("adds a custom exercise and resolves its aliases to the same movement", () => {
    const merged = mergeMovements(MOVEMENTS, custom);
    expect(merged["Jefferson Curl"]).toMatchObject({ pattern: "hinge", baseLoad: 20 });
    expect(merged["Jeffersons"]).toBe(merged["Jefferson Curl"]);
  });

  it("lets a custom exercise override a built-in of the same name", () => {
    const merged = mergeMovements(MOVEMENTS, [
      { name: "Back Squat", pattern: "squat", muscles: ["quads"], baseLoad: 200, system: null },
    ]);
    expect(merged["Back Squat"]?.baseLoad).toBe(200);
  });

  it("never lets an alias clobber an existing entry", () => {
    const merged = mergeMovements(MOVEMENTS, [
      { name: "My Squat", pattern: "squat", muscles: ["quads"], baseLoad: 90, system: null, aliases: ["Back Squat"] },
    ]);
    // the built-in Back Squat survives the alias collision
    expect(merged["Back Squat"]?.baseLoad).toBe(100);
  });

  it("does not mutate the built-in map", () => {
    mergeMovements(MOVEMENTS, custom);
    expect(MOVEMENTS["Jefferson Curl"]).toBeUndefined();
  });
});

describe("catalogNames", () => {
  it("lists built-ins + custom primary names, excluding aliases", () => {
    const names = catalogNames(MOVEMENTS, custom);
    expect(names).toContain("Jefferson Curl");
    expect(names).not.toContain("Jeffersons"); // alias resolves but isn't pickable
    expect(names).toContain("Back Squat"); // untouched built-in still shown
  });

  it("hides a built-in that a custom descriptive name supersedes via alias", () => {
    // the exact option-A case: keep the descriptive name, fold the built-in in
    const lib: LibraryMovement[] = [
      { name: "Barbell Bench Press", pattern: "push", muscles: ["chest"], baseLoad: 100, system: null, aliases: ["Bench Press"] },
    ];
    const names = catalogNames(MOVEMENTS, lib);
    expect(names).toContain("Barbell Bench Press");
    expect(names).not.toContain("Bench Press"); // superseded built-in hidden from the picker
    // …but still resolvable for old logged sessions:
    expect(mergeMovements(MOVEMENTS, lib)["Bench Press"]).toBeDefined();
  });

  it("is null/undefined-safe on both params", () => {
    expect(() => catalogNames(undefined, undefined)).not.toThrow();
    expect(() => aliasNames(undefined)).not.toThrow();
    expect(catalogNames()).toEqual([]);
  });

  it("is empty-safe and dedupes an override of a built-in", () => {
    expect(catalogNames(MOVEMENTS, [])).toEqual(Object.keys(MOVEMENTS));
    const names = catalogNames(MOVEMENTS, [
      { name: "Back Squat", pattern: "squat", muscles: ["quads"], baseLoad: 200, system: null },
    ]);
    expect(names.filter((n) => n === "Back Squat")).toHaveLength(1);
  });
});

describe("aliasNames", () => {
  it("collects every aliased name across the library", () => {
    const set = aliasNames([
      { name: "Barbell Bench Press", pattern: "push", muscles: ["chest"], baseLoad: 100, system: null, aliases: ["Bench Press"] },
      ...custom,
    ]);
    expect([...set].sort()).toEqual(["Bench Press", "Jeffersons"]);
  });
});

describe("exercisesByCategory", () => {
  it("groups the built-in DB under muscle headings, pattern buckets first, A–Z inside", () => {
    const groups = exercisesByCategory(MOVEMENTS);
    const cats = groups.map((g) => g.category);
    // The conditioning built-ins (Row Intervals, Assault Bike, …) keep their
    // pattern bucket; every DB exercise gets its muscle-group heading.
    const cond = groups.find((g) => g.category === "cond")!;
    expect(cond.labelKey).toBe("exercise.cat.cond");
    expect(cats.indexOf("cond")).toBeLessThan(cats.indexOf("Chest"));
    const quads = groups.find((g) => g.category === "Quads & Glutes")!;
    expect(quads.names).toContain("Back Squat");
    expect(quads.names).toEqual([...quads.names].sort((a, b) => a.localeCompare(b)));
    // Muscle headings follow LIBRARY_CATEGORY_ORDER.
    expect(cats.indexOf("Chest")).toBeLessThan(cats.indexOf("Biceps"));
    expect(cats.indexOf("Abs & Core")).toBeLessThan(cats.indexOf("Olympic & Power"));
  });

  it("drops empty buckets", () => {
    const groups = exercisesByCategory({ "Back Squat": MOVEMENTS["Back Squat"]! });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe("Quads & Glutes");
  });

  it("falls unknown patterns + free-typed extras into 'other'", () => {
    const merged = mergeMovements({}, [
      { name: "Mystery Lift", pattern: "weird", muscles: [], baseLoad: null, system: null },
    ]);
    const groups = exercisesByCategory(merged, ["Free Typed Move"]);
    const other = groups.find((g) => g.category === "other")!;
    expect(other.names).toEqual(["Free Typed Move", "Mystery Lift"]);
  });

  it("groups library exercises by their category, after the pattern buckets", () => {
    const groups = exercisesByCategory(
      MOVEMENTS,
      ["My Curl Variant", "Cable Crossover"],
      { "My Curl Variant": "Biceps", "Cable Crossover": "Chest" },
    );
    const cats = groups.map((g) => g.category);
    // pattern buckets keep their i18n key; library sections carry a raw label
    const cond = groups.find((g) => g.category === "cond")!;
    expect(cond.labelKey).toBe("exercise.cat.cond");
    const chest = groups.find((g) => g.category === "Chest")!;
    expect(chest.label).toBe("Chest");
    expect(chest.names).toContain("Cable Crossover");
    expect(chest.labelKey).toBeUndefined();
    expect(groups.find((g) => g.category === "Biceps")!.names).toContain("My Curl Variant");
    // Chest is ordered before Biceps (LIBRARY_CATEGORY_ORDER) and both trail the patterns
    expect(cats.indexOf("Chest")).toBeLessThan(cats.indexOf("Biceps"));
    expect(cats.indexOf("cond")).toBeLessThan(cats.indexOf("Chest"));
    // a library-categorised name does NOT also appear in a pattern bucket
    expect(groups.find((g) => g.category === "other")).toBeUndefined();
  });
});

describe("categoriesByName", () => {
  it("maps only custom entries that declare a category", () => {
    const map = categoriesByName([
      { name: "Barbell Curl", pattern: "pull", muscles: [], baseLoad: null, system: null, category: "Biceps" },
      { name: "No Cat", pattern: "pull", muscles: [], baseLoad: null, system: null },
    ]);
    expect(map).toEqual({ "Barbell Curl": "Biceps" });
  });
});
