import { describe, it, expect } from "vitest";
import {
  PLAN_PREVIEWS,
  FEATURED_PLAN_IDS,
  FEATURED_PREVIEWS,
  filterGoalGroups,
  goalShelves,
  GOAL_GROUPS,
  GOAL_CATEGORIES,
} from "./plans";
import { libraryCoverView } from "./plan-program";

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
      // a category either yields exactly its own group, or drops out entirely
      expect(groups.length).toBeLessThanOrEqual(1);
      for (const group of groups) expect(group.category).toBe(category);
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

describe("goalShelves", () => {
  it("keeps every goal — it reorders, it never drops", () => {
    const flat = (groups: { goals: { id: string }[] }[]) => groups.flatMap((g) => g.goals.map((x) => x.id)).sort();
    expect(flat(goalShelves())).toEqual(flat(GOAL_GROUPS));
  });

  it("puts the goals that have plans ahead of the ones still coming", () => {
    for (const group of goalShelves()) {
      const readiness = group.goals.map((g) => g.plans.length > 0);
      // every `true` precedes every `false` — no ready goal behind a coming-soon one
      expect(readiness.indexOf(false) === -1 || !readiness.slice(readiness.indexOf(false)).includes(true)).toBe(true);
    }
  });

  it("holds GOAL_TREE order inside each half", () => {
    for (const group of goalShelves()) {
      const source = GOAL_GROUPS.find((g) => g.category === group.category)!.goals.map((g) => g.id);
      for (const half of [group.goals.filter((g) => g.plans.length > 0), group.goals.filter((g) => g.plans.length === 0)]) {
        const positions = half.map((g) => source.indexOf(g.id));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    }
  });

  it("narrows on the same query as filterGoalGroups", () => {
    expect(goalShelves("zzz-nonexistent-goal")).toEqual([]);
    expect(goalShelves("running").flatMap((g) => g.goals).length).toBe(filterGoalGroups("running").flatMap((g) => g.goals).length);
  });
});

describe("libraryCoverView", () => {
  const labels = { chip: "Library", title: "Plans", goal: "goal", goals: "goals" };

  it("counts the library in the top-right slot, pluralized and upper-cased", () => {
    expect(libraryCoverView(19, [], labels).count).toBe("19 GOALS");
    expect(libraryCoverView(1, [], labels).count).toBe("1 GOAL");
  });

  it("carries the categories as the meta line, in the order given", () => {
    expect(libraryCoverView(19, [...GOAL_CATEGORIES], labels).metaParts).toEqual(GOAL_CATEGORIES);
  });

  it("uses a glyph no goal uses, so the level reads as its own object", () => {
    const goalGlyphs = new Set(GOAL_GROUPS.flatMap((g) => g.goals.map((x) => x.icon)));
    expect(goalGlyphs.has(libraryCoverView(19, [], labels).glyph)).toBe(false);
  });
});
