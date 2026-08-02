import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRESS-STYLE CONTRACT.
 *
 * Build 81628102 shipped with every card in the app missing its background,
 * border, radius, width and flex direction. The cause was one character class:
 * `PressScale` handed a FUNCTION to an `Animated.createAnimatedComponent`
 * wrapper's `style` prop. Animated walks that prop to find AnimatedValues; it
 * cannot walk a function, so it passed down a style containing none of the
 * caller's declarations — and because the adoption sweep had aliased
 * `Pressable` to `PressScale` in 83 files, that hit essentially every tappable
 * surface at once.
 *
 * Neither existing gate could see it. `tsc` was happy because Pressable's own
 * type accepts both a style object and a style function. `expo export` was
 * happy because bundling is not rendering. This file is the gate that would
 * have caught it.
 *
 * resolvePressStyle is imported through a source read rather than an import
 * because lib/ui.tsx pulls in react-native, which cannot load in this node
 * test environment (see vitest.config.ts — the pure-modules-only boundary).
 * The function is small and self-contained, so it is evaluated in isolation.
 */

const SRC = readFileSync(join(__dirname, "ui.tsx"), "utf8");

// Pull the function body out of the real source and evaluate it, so the test
// exercises the SHIPPING implementation rather than a copy that can drift.
function loadResolvePressStyle() {
  const start = SRC.indexOf("export function resolvePressStyle(");
  expect(start, "resolvePressStyle is missing from lib/ui.tsx").toBeGreaterThan(-1);
  const end = SRC.indexOf("\n}", start) + 2;
  const src = SRC.slice(start, end)
    .replace("export function", "function")
    .replace(/:\s*PressStyle \| undefined/, "")
    .replace(/:\s*boolean/g, "")
    .replace(/:\s*StyleProp<ViewStyle> \| null/g, "")
    .replace(/\)\s*:\s*StyleProp<ViewStyle>\[\]\s*\{/, ") {");
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return resolvePressStyle;`)() as (
    style: unknown,
    pressed: boolean,
    fx: unknown,
  ) => unknown[];
}

const resolvePressStyle = loadResolvePressStyle();

describe("resolvePressStyle", () => {
  const card = { backgroundColor: "#151715", borderRadius: 16, width: 200 };
  const fx = { opacity: 1 };

  it("NEVER returns a function — Animated cannot walk one", () => {
    // The exact production failure.
    for (const style of [card, [card], undefined, () => card]) {
      const out = resolvePressStyle(style, false, fx);
      expect(typeof out).not.toBe("function");
      expect(Array.isArray(out)).toBe(true);
      for (const entry of out) expect(typeof entry).not.toBe("function");
    }
  });

  it("keeps every one of the caller's declarations", () => {
    const [base] = resolvePressStyle(card, false, fx);
    expect(base).toBe(card);
    expect(base).toMatchObject({ backgroundColor: "#151715", borderRadius: 16, width: 200 });
  });

  it("resolves Pressable's function form against the pressed state", () => {
    const fn = ({ pressed }: { pressed: boolean }) => ({ ...card, opacity: pressed ? 0.5 : 1 });
    expect(resolvePressStyle(fn, false, fx)[0]).toMatchObject({ opacity: 1, width: 200 });
    expect(resolvePressStyle(fn, true, fx)[0]).toMatchObject({ opacity: 0.5, width: 200 });
  });

  it("passes an array style through untouched", () => {
    const arr = [card, { margin: 4 }];
    expect(resolvePressStyle(arr, false, fx)[0]).toBe(arr);
  });

  it("appends the press effect after the caller's style, so it wins", () => {
    expect(resolvePressStyle(card, false, fx)[1]).toBe(fx);
  });

  it("drops the effect when disabled without touching the caller's style", () => {
    const out = resolvePressStyle(card, false, null);
    expect(out[0]).toBe(card);
    expect(out[1]).toBeNull();
  });
});

describe("PressScale wiring", () => {
  it("hands the animated component an array, not a function literal", () => {
    // Guards the call site as well as the helper: re-inlining a function here
    // would reproduce the outage even with resolvePressStyle intact.
    const at = SRC.indexOf("<AnimatedPressable");
    const jsx = SRC.slice(at, SRC.indexOf(">", SRC.indexOf("style=", at)));
    expect(jsx).toContain("style={resolvePressStyle(");
    expect(jsx, "style must not be an inline arrow — Animated cannot walk it").not.toMatch(/style=\{\s*\(/);
  });
});

describe("the React Native gate this violated", () => {
  /**
   * Not a paraphrase — this reads the CONDITION out of the installed React
   * Native source and runs our value through it.
   *
   * AnimatedProps.js decides whether to process `style` with:
   *
   *     if (key === 'style') {
   *       // Ignore `style` if it is not an object (or array).
   *       if (typeof value === 'object' && value != null) { ... }
   *
   * A function is `typeof 'function'`, so the branch is skipped entirely:
   * AnimatedStyle.from() never runs, the AnimatedValues in the press effect are
   * never wired into the animated node graph, and they reach the view as raw
   * objects sitting where numbers belong — which is what destroyed every card.
   *
   * Reading it from node_modules rather than restating it means that if RN ever
   * changes the rule, this test changes with it instead of quietly going stale.
   */
  const ANIMATED_PROPS = join(
    __dirname, "..", "..", "..", "node_modules", "react-native",
    "Libraries", "Animated", "nodes", "AnimatedProps.js",
  );

  it("still gates on the condition we think it does", () => {
    const src = readFileSync(ANIMATED_PROPS, "utf8");
    const at = src.indexOf("if (key === 'style')");
    expect(at, "RN moved the style branch — re-read AnimatedProps.js").toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toContain("typeof value === 'object' && value != null");
  });

  it("passes what PressScale actually hands over through that condition", () => {
    const gate = (value: unknown) => typeof value === "object" && value != null;
    const fx = { opacity: 1 };
    const card = { backgroundColor: "#151715", borderRadius: 16 };

    // What we ship now — processed, so the AnimatedValues get wired.
    expect(gate(resolvePressStyle(card, false, fx))).toBe(true);
    expect(gate(resolvePressStyle(() => card, false, fx))).toBe(true);
    expect(gate(resolvePressStyle(undefined, false, fx))).toBe(true);

    // What shipped in 81628102 — SKIPPED by the gate, styles destroyed.
    const shipped = (state: { pressed: boolean }) => [card, fx, state];
    expect(gate(shipped)).toBe(false);
  });
});
