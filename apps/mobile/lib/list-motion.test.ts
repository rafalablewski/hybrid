import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIST-MOTION GUARD, for the live logger's set list.
 *
 * A missing layout animation is the quietest bug this codebase can ship. The
 * code is correct, the state is correct, the tests pass, the typechecker is
 * happy — and the app just feels cheap in a way nobody can point at. It is only
 * findable by watching a device, which means it survives every other gate here.
 *
 * It did survive them. `animateListChange` sat on the EXERCISE mutations and on
 * exactly ONE of the seven set mutations (plain "Add set"), under a comment
 * asserting that "EVERY MUTATION OF THE LIST TRAVELS". The presets rail, all
 * three special-set adders, the auto warm-up ramp — and BANKING A SET, the
 * most-repeated interaction in the app and the biggest layout change on the
 * screen — all teleported. The report was "I never saw them in my app".
 *
 * The fix was structural: one door, `commitSets`, that arms the animation before
 * it commits. This file stops the door being walked around. Every `setExercises`
 * call in the logger that rebuilds a set array must either go through
 * `commitSets` or be named in EXEMPT below with its reason.
 *
 * WHY AN ALLOWLIST RATHER THAN A COUNT: the exclusions are not debt being paid
 * down, they are permanent, and each is a real judgement — a per-keystroke write
 * must NOT animate or the card springs on every digit typed. Naming them forces
 * whoever adds the next set-writing path to decide which kind theirs is, which
 * is exactly the decision that got skipped six times.
 */

const LOGGER = join(__dirname, "..", "app", "workout.tsx");
const src = readFileSync(LOGGER, "utf8");

/**
 * The source of one top-level `const <name> = …` in the logger component, up to
 * the next top-level declaration or comment. Text-slicing rather than a regex
 * for the body: a balanced-brace pattern over 3000 lines of JSX is its own bug.
 */
function decl(name: string): string {
  const at = src.indexOf(`  const ${name} = `);
  if (at < 0) return "";
  const rest = src.slice(at + `  const ${name} = `.length);
  // A declaration or comment at exactly two spaces of indent is the next
  // sibling; anything more deeply indented is still inside this body.
  const next = rest.match(/\n {2}(?:const |let |function |\/\/ |\/\*\*)/);
  return next ? rest.slice(0, next.index) : rest;
}

/** The door itself — the one place allowed to write a set array unanimated. */
const DOOR = "sets: fn(x.sets)";

/** Set-writing paths that deliberately do NOT animate, and why. */
const EXEMPT: { marker: string; why: string }[] = [
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? setTypeToSet(s, type) : s))",
    why: "setTypeTo — swaps a row's badge. The row stays exactly where it is, so there is no layout change to travel.",
  },
  {
    marker: "sets: x.sets.filter((_, j) => j !== i)",
    why: "removeSet — its only caller is a SwipeRow, and closing the gap after a swipe belongs to the gesture that opened it (see components/swipe-row.tsx).",
  },
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s))",
    why: "setSetField — runs per KEYSTROKE. Animating would spring the card on every digit.",
  },
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? { ...s, load: nextKg } : s))",
    why: "bumpLoad — the quick +/− load stepper. A value changing inside a row that stays put is not a layout change.",
  },
];

/** The mutations that CHANGE THE SHAPE of the set list, so must animate. */
const MUST_TRAVEL = [
  "addSet",
  "applyPreset",
  "addDropSet",
  "addWarmupSet",
  "addCooldownSet",
  "addWarmupRamp",
  "toggleDone",
];

describe("live logger — every set-list mutation travels", () => {
  it("the door exists, and arms the animation BEFORE it commits", () => {
    const body = decl("commitSets");
    expect(body, "commitSets not found in app/workout.tsx").not.toBe("");
    // configureNext applies to the NEXT layout, so after the setState it lands a
    // frame late and animates whatever happens after this commit instead.
    const armed = body.indexOf("animateListChange");
    const committed = body.indexOf("setExercises");
    expect(armed, "commitSets must call animateListChange").toBeGreaterThan(-1);
    expect(committed, "commitSets must call setExercises").toBeGreaterThan(-1);
    expect(armed, "animateListChange must come BEFORE setExercises").toBeLessThan(committed);
    // Reduce Motion still has to be honoured, or this trades one accessibility
    // bug for another.
    expect(body).toContain("animateListChange(reducedMotion)");
  });

  it("banking a set goes through the door — the regression that started this", () => {
    const body = decl("toggleDone");
    expect(body, "toggleDone not found").not.toBe("");
    expect(body, "toggleDone must not write sets directly — route it through commitSets").not.toContain("setExercises(");
    expect(body).toContain("commitSets(");
  });

  it("each shape-changing mutation routes through the door", () => {
    for (const name of MUST_TRAVEL) {
      const body = decl(name);
      expect(body, `${name} not found in app/workout.tsx`).not.toBe("");
      expect(body, `${name} changes the set list's shape, so it must commit through commitSets`).toContain("commitSets(");
      expect(body, `${name} must not bypass the door with a raw setExercises`).not.toContain("setExercises(");
    }
  });

  it("no other setExercises call rebuilds a set array unless it is exempt", () => {
    const writes = src.match(/setExercises\(\(xs\) =>[\s\S]{0,600}?sets: [^\n]*/g) ?? [];
    expect(writes.length, "no set-writing setExercises calls found — did the logger change shape?")
      .toBeGreaterThan(0);
    const unexplained = writes.filter(
      (w) => !w.includes(DOOR) && !EXEMPT.some((e) => w.includes(e.marker)),
    );
    expect(
      unexplained,
      "A set-list mutation writes sets directly. Route it through commitSets so the change " +
        "travels, or add it to EXEMPT in this file with the reason it must not animate:\n\n" +
        unexplained.map((u) => `  ${u.replace(/\s+/g, " ").slice(0, 150)}…`).join("\n\n"),
    ).toEqual([]);
  });

  it("the exemptions are all still real call sites", () => {
    // An exemption for code that no longer exists is a licence left lying in the
    // file for whoever writes the next thing that happens to match it.
    for (const e of EXEMPT) {
      expect(src, `EXEMPT entry matches nothing any more — delete it: ${e.why}`).toContain(e.marker);
    }
  });

  it("the RPE disclosure animates too — it grows the card", () => {
    // Opening the pill row shifts everything below it, which is the same kind of
    // layout change as a set arriving. It is not a set mutation, so the door
    // cannot cover it; this is what keeps it honest.
    const chip = src.slice(src.indexOf("setRpeOpenSet((u) =>") - 400, src.indexOf("setRpeOpenSet((u) =>") + 80);
    expect(chip, "the RPE chip must arm a layout animation when it toggles the pill row")
      .toContain("animateListChange(reducedMotion)");
  });
});
