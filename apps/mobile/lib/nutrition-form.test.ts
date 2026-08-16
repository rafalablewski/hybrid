import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeServingLabel, portionMeasure, foodPortions, parseFoodPortions, unitById, SERVING_UNITS } from "@hybrid/core";

/**
 * THE CREATE-FOOD FORM'S SERVING, GUARDED — because a blank one silently took
 * the packs away.
 *
 * The bug this pins closed was invisible in every way a bug can be. The serving
 * row RENDERED "per 1 Grams" (the field's placeholder), so the form looked
 * filled in; the packs block simply was not there, and nothing said why. Reading
 * the source, each half is reasonable: a placeholder is a placeholder, and
 * guarding a composition on non-empty text is ordinary defensive code. The
 * defect only exists in the SEAM — every reader of the serving guarded on the
 * text being non-empty, so a fresh form had no measure, so
 * `portionMeasure` returned null, so the one control that exists to record a
 * pack at creation time never rendered. The flow the tap budget registers as
 * "save a new food and what the whole bottle is" could not be walked at all.
 *
 * It was wrong on the way out too. A food saved without touching the field went
 * to the database as the column default "1 serving" while the screen had said
 * grams — so it arrived with no measure, and could never afterwards be weighed
 * or carry a pack. The screen and the store described two different foods.
 *
 * A render test would be the stronger guard and is not affordable here (the
 * screen pulls in the API layer, the query client, the persona and the theme).
 * So this reads the DEFAULT out of the source and then runs it through the REAL
 * core functions the screen calls: it fails if the default stops being a
 * measurable serving, whether that happens by editing the constant or by
 * reintroducing a guard that discards it.
 */

const SRC = readFileSync(join(__dirname, "..", "components", "aurora", "nutrition.tsx"), "utf8");

/** The `serving` and `unit` the Create Food form opens on. */
function blankFormServing(): { serving: string; unit: string } {
  const block = /const BLANK_CREATE_FORM = \{([\s\S]*?)\n\};/.exec(SRC);
  expect(block, "BLANK_CREATE_FORM not found — this guard has lost its subject").toBeTruthy();
  const body = block![1]!;
  const serving = /\bserving:\s*"([^"]*)"/.exec(body);
  const unit = /\bunit:\s*"([^"]*)"/.exec(body);
  expect(serving, "BLANK_CREATE_FORM has no serving").toBeTruthy();
  expect(unit, "BLANK_CREATE_FORM has no unit").toBeTruthy();
  return { serving: serving![1]!, unit: unit![1]! };
}

describe("the Create Food form opens on a MEASURABLE serving", () => {
  it("HARD — the default serving composes to a label with a measure", () => {
    const { serving, unit } = blankFormServing();
    const label = composeServingLabel(serving, unit);
    const measure = portionMeasure({ serving: label });
    expect(measure, `a new food opens on "${label}", which has no measure — the packs block cannot render`).not.toBeNull();
    expect(measure!.perServing).toBeGreaterThan(0);
  });

  it("and that serving is the one a food label is actually written per", () => {
    // Not a taste call: 100 g is the shape core's own doctrine uses as its
    // worked example, and the number every EU label states its panel per.
    const { serving, unit } = blankFormServing();
    expect(Number(serving)).toBe(100);
    expect(composeServingLabel(serving, unit)).toBe("100 g");
  });

  it("HARD — the default unit is a registry ID, never one of its aliases", () => {
    // The second half of the same bug, and the one that hid for longer. The
    // registry id is "g"; "gram" is an ALIAS, read by parseServing on the way IN
    // from free text and by nothing else. `unitById` matches ids exactly, so an
    // alias resolves to undefined at BOTH ends the form uses it: the serving row
    // printed the raw string ("per 1 gram" where every other unit prints a
    // symbol) and composeServingLabel fell through to its "serving" fallback, so
    // the food was stored as a COUNT with no measure — no weighing, no packs.
    const { unit } = blankFormServing();
    expect(unitById(unit), `"${unit}" is not a serving-unit id — check ALIASES`).toBeTruthy();
    expect(unitById(unit)!.id).toBe(unit);
  });

  it("and the unit picker can actually reach it, so the default is selectable", () => {
    // A default the picker cannot show is a state the athlete can leave and
    // never return to.
    expect(SERVING_UNITS.some((u) => u.id === blankFormServing().unit)).toBe(true);
  });

  it("so a pack typed on a fresh form survives to the food's portions", () => {
    // The whole point, end to end: the form's own default, a typed pack, and
    // the reader the pantry row uses — through core, not through a mock.
    const { serving, unit } = blankFormServing();
    const packs = foodPortions({
      serving: composeServingLabel(serving, unit),
      portions: parseFoodPortions([{ label: "bottle", size: 400, source: "typed" }]),
    });
    expect(packs).toEqual([{ label: "bottle", size: 400, source: "typed" }]);
  });

  it("HARD — nothing composes the serving behind a non-empty check any more", () => {
    // The guard that caused it. `composeServingLabel` already reads a blank
    // quantity as 1, so a caller testing the text first can only ever discard a
    // serving the screen was already displaying.
    const guarded = [...SRC.matchAll(/serving\.trim\(\)\s*\?\s*composeServingLabel/g)];
    expect(guarded.map((m) => m[0]), "a serving is being composed only when non-empty").toEqual([]);
  });
});
