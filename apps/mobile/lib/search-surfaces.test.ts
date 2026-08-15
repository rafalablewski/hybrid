import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SEARCH SURFACES, HELD TO THEIR OWN CLAIMS.
 *
 * Adding one movement used to be the slowest thing in the app, and every part
 * of the fix is a structural property of one file: the field is focused, the
 * list is virtualized, no layout animation is queued per keystroke, and the
 * ranking comes from @hybrid/core rather than a local substring filter.
 *
 * None of that is visible to a type-checker and all of it is one careless edit
 * away — a `ScrollView` back in the picker, an `autoFocus` dropped in a
 * refactor, a `.includes(q)` added to "just filter this list quickly". So it is
 * asserted here, in the same source-scanning idiom as design-tokens.test.ts.
 *
 * These are HARD rules: the counts are zero and must stay zero.
 */

const ROOT = join(__dirname, "..");

/**
 * The file's CODE, with comments removed. These files document the defects they
 * replaced — the picker's own docblock quotes `name.includes(q)` — and a guard
 * that greps the prose would fire on the history rather than the behaviour.
 */
const read = (p: string): string =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const PICKER = "components/aurora/exercise-picker.tsx";
const SPORT = "components/quick-sport.tsx";
const DRAWER = "components/aurora/side-menu.tsx";

describe("the exercise picker", () => {
  const src = read(PICKER);

  it("focuses its field on open — the first action is typing, not a tap", () => {
    expect(src).toMatch(/<ASearch[\s\S]*?autoFocus/);
  });

  it("takes the top match on return, instead of inventing a custom lift", () => {
    expect(src).toMatch(/onSubmit=\{submit\}/);
    expect(src).toMatch(/const best = results\[0\]/);
  });

  it("virtualizes — the A–Z index once mounted ~310 rows in one commit", () => {
    expect(src).toMatch(/<FlatList/);
    expect(src).toMatch(/initialNumToRender=\{\d+\}/);
    expect(src).not.toMatch(/<ScrollView/);
  });

  it("queues no layout animation while typing", () => {
    expect(src).not.toMatch(/useListMotion|animateListChange/);
  });

  it("ranks through core, never a local substring filter", () => {
    expect(src).toMatch(/searchExerciseIndex/);
    expect(src).not.toMatch(/\.includes\(q\b/);
  });

  it("offers a custom add only for a name the catalog lacks", () => {
    expect(src).toMatch(/exerciseNameTaken/);
  });

  it("records what it could not find", () => {
    expect(src).toMatch(/noteSearchMiss\(q, "empty"\)/);
    expect(src).toMatch(/noteSearchMiss\(q, "custom"\)/);
  });

  it("adds no bottom pad of its own — the sheet owns the one under the last row", () => {
    expect(src).not.toMatch(/contentContainerStyle=\{\{[^}]*paddingBottom/);
  });

  it("only offers the queue when the caller can take several", () => {
    expect(src).toMatch(/const multi = !!onPickMany/);
    expect(src).toMatch(/onLongPress=\{onPickMany \? queueFrom : undefined\}/);
  });
});

describe("the sport picker", () => {
  const src = read(SPORT);

  it("ranks through the shared engine rather than its own filter", () => {
    expect(src).toMatch(/searchExerciseIndex/);
    expect(src).not.toMatch(/\.toLowerCase\(\)\.includes\(/);
  });

  it("uses the shared search field", () => {
    expect(src).toMatch(/<ASearch/);
  });
});

describe("the drawer's cross-app search", () => {
  const src = read(DRAWER);

  it("is the app's search entry point, ranked by the shared engine", () => {
    expect(src).toMatch(/<ASearch/);
    expect(src).toMatch(/buildGlobalSearchIndex/);
    expect(src).toMatch(/searchGlobal/);
    expect(src).toMatch(/groupGlobalResults/);
  });

  it("builds its index only once the drawer has been opened", () => {
    expect(src).toMatch(/!everOpen\s*\n?\s*\?\s*\[\]/);
  });

  it("lands a result on the thing, not merely on its screen", () => {
    for (const route of [/pathname: "\/exercise"/, /pathname: "\/sport-page"/, /pathname: "\/plans"/, /pathname: "\/nutrition"/])
      expect(src).toMatch(route);
    expect(src).toMatch(/SETTINGS_ROUTES/);
  });

  it("routes a locked screen to the paywall rather than a dead end", () => {
    expect(src).toMatch(/if \(r\.locked\)/);
  });
});

describe("the sheet", () => {
  const src = read("components/aurora/sheet.tsx");

  it("shortens a filling panel for the keyboard instead of being pushed off the top", () => {
    expect(src).toMatch(/useKeyboardHeight\(render && fill\)/);
    expect(src).toMatch(/Math\.min\(screenH \* sheetGesture\.detents\.large, screenH - keyboardH\)/);
  });

  it("stays inert for every other sheet — no listeners when it is not filling", () => {
    expect(src).toMatch(/if \(!active\)/);
  });
});
