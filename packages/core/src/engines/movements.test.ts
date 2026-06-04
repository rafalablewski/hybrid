import { describe, it, expect } from "vitest";
import { MOVEMENTS, mergeMovements, type LibraryMovement } from "./movements";

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
    expect(merged["Back Squat"].baseLoad).toBe(200);
  });

  it("never lets an alias clobber an existing entry", () => {
    const merged = mergeMovements(MOVEMENTS, [
      { name: "My Squat", pattern: "squat", muscles: ["quads"], baseLoad: 90, system: null, aliases: ["Back Squat"] },
    ]);
    // the built-in Back Squat survives the alias collision
    expect(merged["Back Squat"].baseLoad).toBe(100);
  });

  it("does not mutate the built-in map", () => {
    mergeMovements(MOVEMENTS, custom);
    expect(MOVEMENTS["Zercher Squat"]).toBeUndefined();
  });
});
