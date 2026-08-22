import { describe, it, expect } from "vitest";
import { resolveGoalId, goalIdToStore, goalLabel, isLibraryGoal } from "./goal-id";
import { GOAL_TREE } from "./plans";
import { modelKeyFor, MODEL_FOR } from "./engines/periodization";

describe("resolveGoalId", () => {
  it("passes an id straight through", () => {
    expect(resolveGoalId("hybrid")).toBe("hybrid");
    expect(resolveGoalId("power")).toBe("power");
  });

  it("resolves a display name to its id", () => {
    expect(resolveGoalId("Hybrid Athlete")).toBe("hybrid");
    expect(resolveGoalId("Olympic Weightlifting")).toBe("oly");
    expect(resolveGoalId("Pre & Postnatal")).toBe("prenatal");
  });

  it("is case- and whitespace-insensitive on names", () => {
    expect(resolveGoalId("  hybrid athlete  ")).toBe("hybrid");
    expect(resolveGoalId("RUNNING")).toBe("run");
  });

  it("returns null for anything the library does not carry", () => {
    // A coach's free-text goal is not an error — the caller passes it through.
    expect(resolveGoalId("Return from ACL, phase 2")).toBeNull();
    expect(resolveGoalId("")).toBeNull();
    expect(resolveGoalId(null)).toBeNull();
    expect(resolveGoalId(undefined)).toBeNull();
  });

  it("round-trips every goal in the library, from both representations", () => {
    for (const g of GOAL_TREE) {
      expect(resolveGoalId(g.id)).toBe(g.id);
      expect(resolveGoalId(g.name)).toBe(g.id);
      expect(goalLabel(g.id)).toBe(g.name);
      expect(goalLabel(g.name)).toBe(g.name);
    }
  });
});

describe("goalIdToStore", () => {
  it("stores the id for a library goal, whichever way it arrived", () => {
    expect(goalIdToStore("Hybrid Athlete")).toBe("hybrid");
    expect(goalIdToStore("hybrid")).toBe("hybrid");
  });

  it("stores a coach's own words verbatim", () => {
    expect(goalIdToStore("  Return from ACL, phase 2 ")).toBe("Return from ACL, phase 2");
  });
});

describe("goalLabel", () => {
  it("renders an id as its display name", () => {
    expect(goalLabel("oly")).toBe("Olympic Weightlifting");
  });

  it("renders an unknown value as written", () => {
    expect(goalLabel("Return from ACL, phase 2")).toBe("Return from ACL, phase 2");
  });

  it("renders nothing for nothing", () => {
    expect(goalLabel(null)).toBe("");
    expect(goalLabel("   ")).toBe("");
  });
});

describe("isLibraryGoal", () => {
  it("separates library goals from free text", () => {
    expect(isLibraryGoal("hybrid")).toBe(true);
    expect(isLibraryGoal("Hybrid Athlete")).toBe(true);
    expect(isLibraryGoal("Return from ACL, phase 2")).toBe(false);
  });
});

describe("moving to ids does not change which phase model a goal resolves to", () => {
  // THE REGRESSION THIS FILE EXISTS FOR. MODEL_FOR is keyed by display name, so
  // the moment enrolment started storing ids, the seven goals that DID match
  // would have stopped matching and silently fallen to the strength default.
  it("resolves the id and the name to the same model, for every goal", () => {
    for (const g of GOAL_TREE) {
      expect(modelKeyFor(g.id)).toBe(modelKeyFor(g.name));
    }
  });

  it("keeps the endurance goals on the endurance model, by id", () => {
    for (const id of ["run", "cycling", "swim", "hyrox", "tri"]) {
      expect(modelKeyFor(id)).toBe("endurance");
    }
  });

  it("still defaults an unknown goal to strength", () => {
    expect(modelKeyFor("Return from ACL, phase 2")).toBe("strength");
  });

  it("documents the twelve goals the table does not name (fixed separately)", () => {
    const unmapped = GOAL_TREE.filter((g) => MODEL_FOR[g.name] === undefined).map((g) => g.id);
    expect(unmapped).toContain("hybrid"); // the map says "Hybrid", the goal is "Hybrid Athlete"
    expect(unmapped).toHaveLength(12);
  });
});
