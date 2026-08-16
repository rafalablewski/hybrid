import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TABULAR_NUMS } from "@hybrid/core";

/**
 * TABULAR FIGURES, ENFORCED AT THE PRIMITIVES.
 *
 * The rule was never in doubt — a number in this app is a weight, a clock, a
 * count, a macro total, and none of those is prose. What was missing is the
 * only thing that makes a rule hold: an owner. `font-variant-numeric` was hand
 * written at ~25 call sites on mobile and at ZERO on web, and neither client's
 * figure primitives declared it — so whether a figure held still depended on
 * whoever typed the style, and every new figure was a fresh chance to forget.
 *
 * The cost is not cosmetic in either place:
 *
 *   A COLUMN stops being a column. Proportional `1` is drawn narrower than `8`,
 *     so four stat tiles in a row, or a table of loads, disagree about where a
 *     digit starts.
 *
 *   A ROLLING FIGURE JITTERS, and this is the sharper one. `RollingNumber`
 *     gives each digit its own box and animates only the columns that changed;
 *     with proportional numerals a units digit rolling 1 → 8 makes its own box
 *     WIDER mid-turn and shoves every digit beside it sideways. The component
 *     exists to make one change read as one event, and it was doing the
 *     opposite on web, where the property had never been set at all.
 *
 * So the guard is on the primitives every figure passes through rather than on
 * the call sites — a ratchet over ~25 hand-written sites would count the
 * symptom. Both clients are checked here together, because a figure that is
 * tabular on the phone and proportional in the admin panel is the same drift
 * one layer up.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const read = (...p: string[]) => readFileSync(join(REPO_ROOT, ...p), "utf8");

/**
 * The figure primitives, per client. Each entry is a file that MUST resolve the
 * numeral set itself, plus the marker that proves it does — mobile spreads the
 * shared `TABULAR` style, web spreads `tabular` or names the CSS property.
 */
const PRIMITIVES: { name: string; text: string; marker: RegExp }[] = [
  {
    name: "mobile RollingNumber",
    text: read("apps", "mobile", "components", "aurora", "rolling-number.tsx"),
    marker: /\bTABULAR\b/,
  },
  {
    name: "mobile AStat (aurora kit)",
    text: read("apps", "mobile", "components", "aurora", "kit.tsx"),
    marker: /\.\.\.TABULAR\b/,
  },
  {
    name: "mobile CountUp (Wrapped)",
    text: read("apps", "mobile", "components", "workout-wrapped.tsx"),
    marker: /\bTABULAR\b/,
  },
  {
    name: "web RollingNumber",
    text: read("apps", "web", "components", "aurora", "rolling-number.tsx"),
    marker: /fontVariantNumeric|\.\.\.tabular\b/,
  },
  {
    name: "web Stat (lib/ui)",
    text: read("apps", "web", "lib", "ui.tsx"),
    marker: /\.\.\.tabular\b/,
  },
];

describe("numeric type", () => {
  it("every figure primitive resolves the numeral set itself", () => {
    for (const { name, text, marker } of PRIMITIVES) {
      expect(marker.test(text), `${name} must declare tabular figures`).toBe(true);
    }
  });

  it("both clients spell the numeral set from the shared token", () => {
    // One CSS value, two property names — `fontVariant: [TABULAR_NUMS]` on RN
    // and `fontVariantNumeric: TABULAR_NUMS` on web. The value itself lives in
    // core scale.ts beside the leading and tracking derivations, so the clients
    // cannot end up asking for `tabular-nums` and `tnum` respectively.
    expect(TABULAR_NUMS).toBe("tabular-nums");
    expect(read("apps", "mobile", "lib", "ui.tsx")).toMatch(
      /export const TABULAR: TextStyle = \{ fontVariant: \[TABULAR_NUMS\] \};/,
    );
    expect(read("apps", "web", "lib", "ui.tsx")).toMatch(
      /export const tabular: CSSProperties = \{ fontVariantNumeric: TABULAR_NUMS \};/,
    );
  });

  it("web's stat tile takes the same rung as mobile's", () => {
    // Web's `Stat` figure was a raw 34 next to mobile's `fs.hero` — the same
    // number, spelled as a literal, which is exactly how the two tiles would
    // have drifted the first time the rung moved.
    expect(read("apps", "web", "lib", "ui.tsx")).toMatch(/fontSize: fs\.hero,/);
  });
});
