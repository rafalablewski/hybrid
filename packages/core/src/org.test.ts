import { describe, it, expect } from "vitest";
import {
  canRead,
  canManageOrg,
  roleScope,
  buildTeamTree,
  flattenTree,
  teamSubtreeIds,
  visibleTeamIds,
  canSeeAthlete,
  type TeamNode,
} from "./org";

describe("org permissions", () => {
  it("medical sees medical, a coach does not", () => {
    expect(canRead("MEDICAL", "medical")).toBe(true);
    expect(canRead("COACH", "medical")).toBe(false);
    expect(canRead("COACH", "performance")).toBe(true);
  });

  it("only owner/director can manage the org", () => {
    expect(canManageOrg("OWNER")).toBe(true);
    expect(canManageOrg("DIRECTOR")).toBe(true);
    expect(canManageOrg("COACH")).toBe(false);
  });

  it("athletes have no roster access (own data only)", () => {
    expect(canRead("ATHLETE", "performance")).toBe(false);
    expect(roleScope("ATHLETE")).toContain("Own");
  });

  it("describes a director's scope", () => {
    const s = roleScope("DIRECTOR");
    expect(s).toContain("medical");
    expect(s).toContain("manage");
  });
});

describe("team tree", () => {
  const teams: TeamNode[] = [
    { id: "first", name: "First Team", parentId: null },
    { id: "b", name: "B Team", parentId: null },
    { id: "u19", name: "U19", parentId: "b" },
    { id: "u16", name: "U16", parentId: "u19" },
    { id: "u12", name: "U12", parentId: "b" },
  ];

  it("builds a forest with correct depth", () => {
    const forest = buildTeamTree(teams);
    expect(forest).toHaveLength(2); // first + b
    const b = forest.find((n) => n.id === "b")!;
    expect(b.children.map((c) => c.id).sort()).toEqual(["u12", "u19"]);
    const u19 = b.children.find((c) => c.id === "u19")!;
    expect(u19.depth).toBe(1);
    expect(u19.children[0]!.id).toBe("u16");
    expect(u19.children[0]!.depth).toBe(2);
  });

  it("flattens depth-first in order", () => {
    const flat = flattenTree(buildTeamTree(teams)).map((n) => n.id);
    expect(flat).toContain("u16");
    // a parent always precedes its child
    expect(flat.indexOf("b")).toBeLessThan(flat.indexOf("u19"));
    expect(flat.indexOf("u19")).toBeLessThan(flat.indexOf("u16"));
  });

  it("returns a team's inclusive subtree ids", () => {
    expect(teamSubtreeIds(teams, "b").sort()).toEqual(["b", "u12", "u16", "u19"]);
    expect(teamSubtreeIds(teams, "first")).toEqual(["first"]);
  });

  it("treats an orphaned parent reference as a root (cycle-safe)", () => {
    const orphan: TeamNode[] = [{ id: "x", name: "X", parentId: "ghost" }];
    expect(buildTeamTree(orphan)).toHaveLength(1);
  });

  it("scopes a team-pinned coach to their subtree; managers see all", () => {
    expect(visibleTeamIds("DIRECTOR", "u19", teams)).toBeNull(); // manager → all
    expect(visibleTeamIds("COACH", null, teams)).toBeNull(); // unscoped staff → all
    expect(visibleTeamIds("COACH", "b", teams)!.sort()).toEqual(["b", "u12", "u16", "u19"]);
    expect(visibleTeamIds("ATHLETE", "b", teams)).toEqual([]);
  });

  it("canSeeAthlete enforces subtree + performance permission", () => {
    // a U19 coach sees a U16 athlete (U16 is under U19) but not a First-Team one
    expect(canSeeAthlete("COACH", "u19", "u16", teams)).toBe(true);
    expect(canSeeAthlete("COACH", "u19", "first", teams)).toBe(false);
    // an athlete role can't read the roster
    expect(canSeeAthlete("ATHLETE", null, "u16", teams)).toBe(false);
    // a director sees anyone
    expect(canSeeAthlete("DIRECTOR", null, "first", teams)).toBe(true);
  });
});
