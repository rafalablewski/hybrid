import { describe, expect, it } from "vitest";
import { MOVEMENTS, exercisesByCategory } from "./engines/movements";
import { olympicSportsByCategory } from "./olympic-sports";
import { NAV_ITEMS } from "./nav";
import {
  buildGlobalSearchIndex,
  searchGlobal,
  groupGlobalResults,
  GLOBAL_RESULT_ORDER,
  type GlobalResult,
  type GlobalResultKind,
} from "./global-search";

const CATALOG = [
  ...exercisesByCategory(MOVEMENTS, [], {}).flatMap((s) => s.names),
  ...olympicSportsByCategory().flatMap((s) => s.sports.map((x) => x.name)),
];
const SCREENS = NAV_ITEMS.map((i) => ({ id: i.id }));
const INDEX = buildGlobalSearchIndex({ screens: SCREENS, exercises: CATALOG });

const hits = (q: string, n = 10) => searchGlobal(INDEX, q, { limit: n }).map((h) => h.value);
const first = (q: string): GlobalResult | undefined => hits(q, 1)[0];
const rankOf = (q: string, kind: GlobalResultKind, id: string): number =>
  searchGlobal(INDEX, q, { limit: 100 }).findIndex((h) => h.value.kind === kind && h.value.id === id);

describe("the corpus", () => {
  it("covers every kind the app can answer with", () => {
    const kinds = new Set(INDEX.map((e) => e.value.kind));
    for (const k of GLOBAL_RESULT_ORDER) expect(kinds.has(k)).toBe(true);
  });

  it("is built once and reused — no query state leaks into it", () => {
    const a = buildGlobalSearchIndex({ screens: SCREENS, exercises: CATALOG }).length;
    const b = buildGlobalSearchIndex({ screens: SCREENS, exercises: CATALOG }).length;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(CATALOG.length);
  });

  it("only offers screens the athlete can actually reach", () => {
    const locked = buildGlobalSearchIndex({ screens: [{ id: "periodize", locked: true }], exercises: [] });
    const hit = searchGlobal(locked, "periodize")[0];
    expect(hit?.value.locked).toBe(true);
    expect(searchGlobal(locked, "nutrition").filter((h) => h.value.kind === "screen")).toEqual([]);
  });

  it("takes localized labels, and falls back to the English one", () => {
    const pl = buildGlobalSearchIndex({
      screens: [{ id: "history" }],
      exercises: [],
      label: (key, fallback) => (key === "nav.history" ? "Historia" : fallback),
    });
    expect(searchGlobal(pl, "historia")[0]?.value.title).toBe("Historia");
    // The English name still finds it — an athlete who learned the app in one
    // language must not lose it by switching.
    expect(searchGlobal(pl, "history")[0]?.value.id).toBe("history");
  });
});

describe("what a query answers with", () => {
  it.each<[string, GlobalResultKind, string]>([
    ["history", "screen", "history"],
    ["nutrition", "screen", "nutrition"],
    ["deadlift", "exercise", "Deadlift"],
    ["rdl", "exercise", "Romanian Deadlift"],
    ["running", "sport", "Running"],
    ["bodybuilding", "plan", "bb"],
    ["ramen", "recipe", "ramen"],
  ])("%s → %s %s", (q, kind, id) => {
    const top = first(q);
    expect(top?.kind).toBe(kind);
    expect(top?.id).toBe(id);
  });

  it("finds a setting by the word people use for it, not its title", () => {
    expect(first("2fa")).toMatchObject({ kind: "setting", id: "security" });
    expect(first("export")).toMatchObject({ kind: "setting", id: "data" });
    expect(first("delete account")).toMatchObject({ kind: "setting", id: "danger" });
  });

  it("keeps the exercise vocabulary — nicknames, muscles and typos all still work", () => {
    expect(first("ohp")).toMatchObject({ kind: "exercise", id: "Overhead Press" });
    expect(first("deadlfit")).toMatchObject({ kind: "exercise", id: "Deadlift" });
    expect(rankOf("hamstrings", "exercise", "Romanian Deadlift")).toBeGreaterThanOrEqual(0);
  });

  it("carries the context line that tells near-identical rows apart", () => {
    expect(first("deadlift")?.sub).toBe("Barbell – Back");
    expect(first("2fa")?.sub).toContain("2FA");
  });

  it("gives a named plan its goal, so a result can land on the plan itself", () => {
    const plan = hits("push pull legs", 10).find((r) => r.kind === "plan" && r.parentId);
    expect(plan?.id).toBe("bb-ppl-6day");
    expect(plan?.parentId).toBe("bb");
  });

  it("returns nothing for an empty query — the caller shows its own list", () => {
    expect(searchGlobal(INDEX, "")).toEqual([]);
    expect(searchGlobal(INDEX, "   ")).toEqual([]);
  });
});

describe("grouping", () => {
  it("orders groups by their own best hit, and caps each", () => {
    const groups = groupGlobalResults(searchGlobal(INDEX, "run", { limit: 40 }), 3);
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(g.hits.length).toBeLessThanOrEqual(3);
    const bests = groups.map((g) => g.hits[0]!.score);
    // Descending, except where two groups matched equally well — there the
    // app's own order wins, which is the whole point of GROUP_TIE.
    for (let i = 1; i < bests.length; i++) expect(bests[i]!).toBeLessThan(bests[i - 1]! + 400);
  });

  it("lets the app's order decide when two groups match equally well", () => {
    // "plan" word-prefixes both the Plank and the Plans screen, 60 points apart
    // out of sixty thousand. A drawer is navigation: the screen leads.
    const groups = groupGlobalResults(searchGlobal(INDEX, "plan", { limit: 40 }), 3);
    expect(groups[0]!.kind).toBe("screen");
    expect(groups[0]!.hits[0]!.value.id).toBe("plans");
  });

  it("puts each hit in exactly one group", () => {
    const raw = searchGlobal(INDEX, "plan", { limit: 40 });
    const grouped = groupGlobalResults(raw, 40).flatMap((g) => g.hits);
    expect(grouped).toHaveLength(raw.length);
    expect(new Set(grouped.map((h) => `${h.value.kind}:${h.value.id}`)).size).toBe(raw.length);
  });
});

describe("cost", () => {
  it("ranks the whole app fast enough to run on every keystroke", () => {
    const started = performance.now();
    for (let i = 0; i < 50; i++) searchGlobal(INDEX, "press", { limit: 40 });
    expect((performance.now() - started) / 50).toBeLessThan(10);
  });
});
