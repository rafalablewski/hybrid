import { describe, it, expect } from "vitest";
import {
  PLAN_PREVIEWS,
  FEATURED_PLAN_IDS,
  FEATURED_PREVIEWS,
  filterGoalGroups,
  GOAL_GROUPS,
  GOAL_CATEGORIES,
} from "./plans";

describe("FEATURED_PREVIEWS", () => {
  it("leads with the editor's picks, in FEATURED_PLAN_IDS order", () => {
    const resolvable = FEATURED_PLAN_IDS.filter((id) => PLAN_PREVIEWS.some((p) => p.plan.id === id));
    const leadIds = FEATURED_PREVIEWS.slice(0, resolvable.length).map((p) => p.plan.id);
    expect(leadIds).toEqual(resolvable);
  });

  it("contains every preview exactly once (nothing dropped, no dupes)", () => {
    expect(FEATURED_PREVIEWS).toHaveLength(PLAN_PREVIEWS.length);
    const ids = new Set(FEATURED_PREVIEWS.map((p) => p.plan.id));
    expect(ids.size).toBe(PLAN_PREVIEWS.length);
    for (const p of PLAN_PREVIEWS) expect(ids.has(p.plan.id)).toBe(true);
  });

  it("gives Explore at least three covers when the library has three plans", () => {
    if (PLAN_PREVIEWS.length >= 3) expect(FEATURED_PREVIEWS.slice(0, 3)).toHaveLength(3);
  });
});

describe("filterGoalGroups", () => {
  it("returns GOAL_GROUPS unchanged for the empty/all default", () => {
    expect(filterGoalGroups()).toEqual(GOAL_GROUPS);
    expect(filterGoalGroups("", "all")).toEqual(GOAL_GROUPS);
  });

  it("narrows to a single category", () => {
    for (const category of GOAL_CATEGORIES) {
      const groups = filterGoalGroups("", category);
      // either the category has goals (one group, matching) or it drops out entirely
      expect(groups.every((g) => g.category === category)).toBe(true);
      if (groups.length) expect(groups[0].category).toBe(category);
    }
  });

  it("matches a free-text query against goal name/blurb and drops empty groups", () => {
    const groups = filterGoalGroups("running");
    const names = groups.flatMap((g) => g.goals.map((goal) => goal.name.toLowerCase()));
    expect(names.some((n) => n.includes("running"))).toBe(true);
    expect(groups.every((g) => g.goals.length > 0)).toBe(true);
  });

  it("is case-insensitive and returns nothing for a no-match query", () => {
    expect(filterGoalGroups("RUNNING").length).toBe(filterGoalGroups("running").length);
    expect(filterGoalGroups("zzz-nonexistent-goal")).toEqual([]);
  });
});
