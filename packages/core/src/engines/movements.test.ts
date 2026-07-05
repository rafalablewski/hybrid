import { describe, it, expect } from "vitest";
import { MOVEMENTS, mergeMovements, exercisesByCategory, aliasNames, catalogNames, type LibraryMovement } from "./movements";

const custom: LibraryMovement[] = [
  { name: "Zercher Squat", pattern: "squat", muscles: ["quads", "glutes"], baseLoad: 80, system: null, aliases: ["Zerchers"] },
];

describe("mergeMovements", () => {
  it("keeps every built-in when nothing custom is provided", () => {
    const merged = mergeMovements(MOVEMENTS, []);
    expect(Object.keys(merged)).toEqual(Object.keys(MOVEMENTS));
    expect(merged).not.toBe(MOVEMENTS); // a copy, not the original reference
  });

  it("adds a custom exercise and resolves its aliases to the same movement", () => {
    const merged = mergeMovements(MOVEMENTS, custom);
    expect(merged["Zercher Squat"]).toMatchObject({ pattern: "squat", baseLoad: 80 });
    expect(merged["Zerchers"]).toBe(merged["Zercher Squat"]);
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
    expect(MOVEMENTS["Zercher Squat"]).toBeUndefined();
  });
});

describe("catalogNames", () => {
  it("lists built-ins + custom primary names, excluding aliases", () => {
    const names = catalogNames(MOVEMENTS, custom);
    expect(names).toContain("Zercher Squat");
    expect(names).not.toContain("Zerchers"); // alias resolves but isn't pickable
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
    expect([...set].sort()).toEqual(["Bench Press", "Zerchers"]);
  });
});

describe("exercisesByCategory", () => {
  it("buckets built-ins by pattern, A–Z, in the fixed display order", () => {
    const order = ["squat", "hinge", "push", "pull", "cond", "other"];
    const groups = exercisesByCategory(MOVEMENTS);
    const cats = groups.map((g) => g.category);
    expect(cats).toEqual([...cats].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    const squat = groups.find((g) => g.category === "squat")!;
    expect(squat.names).toContain("Back Squat");
    expect(squat.names).toEqual([...squat.names].sort((a, b) => a.localeCompare(b)));
    expect(squat.labelKey).toBe("exercise.cat.squat");
  });

  it("drops empty buckets", () => {
    const groups = exercisesByCategory({ "Back Squat": MOVEMENTS["Back Squat"]! });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe("squat");
  });

  it("falls unknown patterns + free-typed extras into 'other'", () => {
    const merged = mergeMovements({}, [
      { name: "Mystery Lift", pattern: "weird", muscles: [], baseLoad: null, system: null },
    ]);
    const groups = exercisesByCategory(merged, ["Free Typed Move"]);
    const other = groups.find((g) => g.category === "other")!;
    expect(other.names).toEqual(["Free Typed Move", "Mystery Lift"]);
  });
});
