import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MOVEMENTS,
  catalogNames,
  musclesFor,
  setExerciseCatalog,
  resetExerciseCatalog,
  type LibraryMovement,
} from "./movements";
import { GYM_EXERCISES, gymExercise } from "../exercise-db";
import { PLAN_PROGRAMS } from "../plan-programs";
import { SPORTS } from "../sports";
import type { PlanProgram } from "../plan-program";
import type { MuscleGroup } from "./types";

/**
 * THE INVARIANT: anything an athlete can PICK must attribute load.
 *
 * A logged lift reaches the engines as a NAME. Every muscle-attribution engine
 * (fatigue, injury risk, ACWR, volume-by-muscle, landmarks, muscle records)
 * resolves that name to a Movement and its muscle groups — and a name that
 * doesn't resolve, or resolves to an EMPTY muscle list, is indistinguishable
 * from "this tissue was never trained". That failure is silent by construction:
 * the output is a plausible-looking zero, not an error.
 *
 * So the catalog is pinned here instead. This test reads the shipped exercise
 * library seed — the actual rows the picker offers — and fails the build if any
 * of them can't attribute. It would have caught both historical breakages:
 *   • 153 names unresolvable by exact key ("Barbell Deadlift", "Pull-up",
 *     "Dumbbell Bulgarian Split Squat"), and
 *   • 55 rows that resolved but carried no muscles (curls, calves, abs, grip),
 * each of which silently dropped every set logged against them.
 *
 * Runtime additions are covered separately: the admin write path
 * (api/admin/exercises/shared.ts parseExercise) already rejects an exercise with
 * no muscles, so the only way to introduce an empty row is raw SQL — which is
 * exactly what this file guards.
 */

const SEED = fileURLToPath(new URL("../../../../reference/sql-exercise-seed.sql", import.meta.url));

interface SeedRow {
  slug: string;
  name: string;
  pattern: string;
  muscles: MuscleGroup[];
  category: string;
  aliases: string[];
}

/** Parse the seed's INSERT tuples — slug, name, pattern, muscles, category, …, aliases. */
function seedRows(): SeedRow[] {
  const sql = readFileSync(SEED, "utf8");
  const row =
    /^\s*\('([a-z0-9-]+)',\s*'((?:[^']|'')+)',\s*'([^']*)',\s*(ARRAY\[[^\]]*\]|'\{\}')::text\[\],\s*'([^']*)',\s*(?:ARRAY\[[^\]]*\]|'\{\}')::text\[\],\s*(ARRAY\[[^\]]*\]|'\{\}')::text\[\]/gm;
  const list = (raw: string): string[] =>
    raw === "'{}'" ? [] : [...raw.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]!.replace(/''/g, "'"));
  return [...sql.matchAll(row)].map((m) => ({
    slug: m[1]!,
    name: m[2]!.replace(/''/g, "'"),
    pattern: m[3]!,
    muscles: list(m[4]!) as MuscleGroup[],
    category: m[5]!,
    aliases: list(m[6]!),
  }));
}

/** The seed as the clients see it once /api/exercises has published it. */
function asLibrary(rows: SeedRow[]): LibraryMovement[] {
  return rows.map((r) => ({
    name: r.name,
    pattern: r.pattern,
    muscles: r.muscles,
    baseLoad: null,
    system: null,
    aliases: r.aliases,
    category: r.category,
  }));
}

afterEach(() => resetExerciseCatalog());

describe("shipped exercise library", () => {
  const rows = seedRows();

  it("parses every row (guards the parser itself against a format change)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(209);
    expect(rows.every((r) => r.name && r.pattern && r.category)).toBe(true);
  });

  it("declares at least one muscle group on EVERY row", () => {
    // An empty muscle list resolves fine and still attributes nothing — the
    // second, quieter half of the original bug. Coarse beats absent: biceps /
    // forearms / traps belong on "back", calves / abs / obliques on "posterior".
    const empty = rows.filter((r) => r.muscles.length === 0).map((r) => r.name);
    expect(empty, `${empty.length} library rows attribute to no muscle group`).toEqual([]);
  });

  it("only uses muscle groups the engine knows", () => {
    const known = new Set<string>(["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"]);
    const bad = rows.flatMap((r) => r.muscles.filter((m) => !known.has(m)).map((m) => `${r.name}: ${m}`));
    expect(bad).toEqual([]);
  });

  it("resolves EVERY library name to a non-empty muscle set", () => {
    setExerciseCatalog(asLibrary(rows));
    const dropped = rows.filter((r) => musclesFor(r.name).length === 0).map((r) => r.name);
    expect(dropped, `${dropped.length} library lifts would log zero load`).toEqual([]);
  });

  it("resolves every ALIAS a library row claims", () => {
    // An alias is what a previously-logged session is stored under; it has to
    // keep attributing after the rename.
    setExerciseCatalog(asLibrary(rows));
    const dropped = rows.flatMap((r) => r.aliases.filter((a) => musclesFor(a).length === 0));
    expect(dropped).toEqual([]);
  });

  it("resolves every PICKABLE name — built-ins and library together", () => {
    // catalogNames is exactly what the two pickers render, so this is the
    // end-to-end statement of the invariant: if you can tap it, it counts.
    const library = asLibrary(rows);
    setExerciseCatalog(library);
    const dropped = catalogNames(MOVEMENTS, library).filter((n) => musclesFor(n).length === 0);
    expect(dropped, `${dropped.length} pickable exercises would log zero load`).toEqual([]);
  });
});

describe("PRESCRIBED movements — plan programs + sport S&C pools", () => {
  // The third name source, and the one the picker guards above cannot see.
  // Plan programs (plan-programs.ts) and the sport S&C pools (olympic-sports.ts)
  // are authored free-hand in TypeScript: a coach writes "Squat", "Dips",
  // "Single-arm KB Swing", and nothing checked those strings against the
  // catalog. 154 of 214 prescribed plan movements and 22 of 34 sport movements
  // used to resolve to nothing — follow the 12-week kettlebell plan exactly and
  // 108 of its 121 movements logged zero load.
  const rows = seedRows();

  /** Every exercise NAME the shipped plans prescribe as gym work. Prose entries
   *  (runs, "or cross-train") are workout types, not lifts, so they're excluded —
   *  a structured entry is one carrying `sets` or a `scheme`. */
  function prescribedPlanNames(): { plan: string; name: string }[] {
    const out: { plan: string; name: string }[] = [];
    for (const [plan, p] of Object.entries(PLAN_PROGRAMS as Record<string, PlanProgram>))
      for (const w of p.weeks ?? [])
        for (const d of w.days ?? [])
          for (const s of d.sessions ?? []) {
            for (const l of s.lifts ?? []) if (l?.name) out.push({ plan, name: l.name });
            for (const e of s.entries ?? []) if (e.sets != null || e.scheme) out.push({ plan, name: e.label });
          }
    return out;
  }

  function prescribedSportNames(): { plan: string; name: string }[] {
    const out: { plan: string; name: string }[] = [];
    for (const [key, s] of Object.entries(SPORTS as Record<string, { pool?: { name: string }[] }>))
      for (const x of s.pool ?? []) if (x?.name) out.push({ plan: `sport:${key}`, name: x.name });
    return out;
  }

  it("every PLAN-prescribed movement attributes load", () => {
    setExerciseCatalog(asLibrary(rows));
    const dropped = prescribedPlanNames()
      .filter((x) => musclesFor(x.name).length === 0)
      .map((x) => `${x.plan}: ${x.name}`);
    expect([...new Set(dropped)], `${dropped.length} prescribed plan movements would log zero load`).toEqual([]);
  });

  it("every SPORT S&C-prescribed movement attributes load", () => {
    setExerciseCatalog(asLibrary(rows));
    const dropped = prescribedSportNames()
      .filter((x) => musclesFor(x.name).length === 0)
      .map((x) => `${x.plan}: ${x.name}`);
    expect([...new Set(dropped)], `${dropped.length} prescribed sport movements would log zero load`).toEqual([]);
  });

  it("resolves prescribed movements WITHOUT the library too", () => {
    // A plan is followed offline / signed-out / before the library loads, and it
    // still has to attribute. The plans and sport pools are code, so unlike the
    // DB-backed library they have no excuse to depend on a fetch.
    resetExerciseCatalog();
    const dropped = [...prescribedPlanNames(), ...prescribedSportNames()]
      .filter((x) => musclesFor(x.name).length === 0)
      .map((x) => `${x.plan}: ${x.name}`);
    expect([...new Set(dropped)], `${dropped.length} prescribed movements need the library to resolve`).toEqual([]);
  });
});

describe("degraded path — the library hasn't been published", () => {
  // Signed out, the table isn't seeded, or the /api/exercises fetch failed: the
  // engines fall back to the built-ins ALONE, while stored sessions still carry
  // library names. That is exactly the state the original bug ran in, and the
  // tests above can't see it because they publish the catalog first.
  //
  // The invariant that holds here: THE ENGINES MUST NEVER BE BLINDER THAN THE
  // PROPERTY SHEET. If gymExercise() can resolve a name to a built-in — via a
  // rename breadcrumb, the library's equipment-qualified alias, or case — then
  // movementFor() has to resolve it too, or the exercise page shows a full
  // muscle map for a lift the engines are silently scoring as zero.
  it("resolves every name the property sheet resolves", () => {
    resetExerciseCatalog();
    const rows = seedRows();
    const blind = rows
      .filter((r) => gymExercise(r.name) && musclesFor(r.name).length === 0)
      .map((r) => `${r.name} -> gymExercise: ${gymExercise(r.name)!.name}, engines: none`);
    expect(blind, `${blind.length} lifts resolve for the exercise page but log zero load`).toEqual([]);
  });
});

describe("built-in exercise DB", () => {
  it("resolves every built-in to a non-empty muscle set", () => {
    const dropped = GYM_EXERCISES.filter((e) => musclesFor(e.name).length === 0).map((e) => e.name);
    expect(dropped).toEqual([]);
  });

  it("resolves every MOVEMENTS key", () => {
    const dropped = Object.keys(MOVEMENTS).filter((n) => musclesFor(n).length === 0);
    expect(dropped).toEqual([]);
  });
});
