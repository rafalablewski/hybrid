import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHARED_ELEMENTS,
  motion,
  screenAnimation,
  springs,
  springToCss,
  springDurationMs,
  durations,
  easings,
  type ScreenTransition,
} from "@hybrid/core";

/**
 * The spring curves in globals.css are GENERATED from packages/core/src/motion.ts
 * and pasted in, because CSS can't call JavaScript. That paste is exactly the
 * kind of thing that silently rots, so this guard regenerates every curve and
 * fails if the stylesheet has drifted from core.
 *
 * If this test fails: re-generate the block, don't hand-edit the numbers.
 */
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

describe("globals.css motion tokens", () => {
  for (const [name, spring] of Object.entries(springs)) {
    it(`--e-${name} matches the spring in @hybrid/core`, () => {
      expect(css).toContain(`--e-${name}: ${springToCss(spring)};`);
    });

    it(`--d-${name} matches the spring's settle time`, () => {
      expect(css).toContain(`--d-${name}: ${springDurationMs(spring)}ms;`);
    });

    it(`--e-${name} declares a bezier fallback before the linear() curve`, () => {
      // An engine without linear() must still get a usable curve.
      const fallbackAt = css.indexOf(`--e-${name}: cubic-bezier`);
      const springAt = css.indexOf(`--e-${name}: linear(`);
      expect(fallbackAt).toBeGreaterThan(-1);
      expect(springAt).toBeGreaterThan(fallbackAt);
    });
  }

  it("carries the opacity-only curves and durations", () => {
    expect(css).toContain(`--e-fade: ${easings.fade};`);
    expect(css).toContain(`--e-exit: ${easings.exit};`);
    expect(css).toContain(`--d-fast: ${durations.fast}ms;`);
    expect(css).toContain(`--d-dissolve: ${durations.dissolve}ms;`);
    expect(css).toContain(`--d-reduced: ${durations.reduced}ms;`);
  });

  it("defines every keyframe screenAnimation() can name", () => {
    // Enumerated from the FUNCTION rather than from a hand-written list, so a
    // new transition kind cannot ship naming a keyframe nobody wrote. (The list
    // was hand-written and went stale the moment `present`/`dismiss` were
    // added — the guard named four keyframes that no longer existed and missed
    // the four that had replaced them.)
    const kinds: ScreenTransition[] = [
      { kind: "sibling", dir: 1 },
      { kind: "sibling", dir: -1 },
      { kind: "push", dir: 0 },
      { kind: "pop", dir: 0 },
      { kind: "present", dir: 0 },
      { kind: "dismiss", dir: 0 },
      { kind: "replace", dir: 0 },
    ];
    const names = new Set<string>();
    for (const t of kinds) {
      for (const role of ["enter", "exit"] as const) {
        names.add(screenAnimation(t, role).name);
        names.add(screenAnimation(t, role, true).name);
      }
    }
    for (const name of names) {
      expect(css, `missing @keyframes ${name}`).toContain(`@keyframes ${name}`);
    }
  });

  it("selects a rule for every transition kind", () => {
    for (const kind of ["sibling", "push", "pop", "present", "dismiss", "replace"]) {
      expect(css, `no CSS selects data-nav-kind="${kind}"`).toContain(`html[data-nav-kind="${kind}"]`);
    }
  });

  it("recedes a presented parent by exactly motion.recedeScale", () => {
    // The presented SCREEN and the presented PANEL are the same event; a screen
    // that recedes to .94 while a sheet recedes to .92 is two answers to one
    // question. (It was .94 here for as long as the keyframe existed.)
    const at = css.indexOf("@keyframes motionRecedeBack");
    const block = css.slice(at, css.indexOf("}", css.indexOf("to", at)));
    expect(block).toContain(`scale(${String(motion.recedeScale).replace(/^0/, "")})`);
    expect(block).toContain(`brightness(${String(motion.recedeBrightness).replace(/^0/, "")})`);
  });

  it("SUBSTITUTES a dissolve under Reduce Motion rather than zeroing it", () => {
    // The global !important backstop collapses every animation to 0.001ms.
    // Screen transitions must be exempted, or Reduce Motion becomes an instant
    // cut — which removes the only signal that the screen changed.
    expect(css).toContain("::view-transition-old(*)");
    expect(css).toMatch(/animation-duration:\s*var\(--d-reduced\)\s*!important/);
  });

  it("times every shared-element pair on the zoom spring", () => {
    // Read the rule each name belongs to rather than measuring a character
    // distance: pairs share one selector list, so the gap between a name and
    // its declarations grows every time a pair is added.
    for (const name of Object.values(SHARED_ELEMENTS)) {
      const sel = `::view-transition-group(${name})`;
      expect(css, `no CSS for shared element ${name}`).toContain(sel);
      const at = css.indexOf(sel);
      const block = css.slice(at, css.indexOf("}", at));
      expect(block, `${name} is not timed on the zoom spring`).toContain("var(--d-zoom)");
      expect(block, `${name} does not use the zoom easing`).toContain("var(--e-zoom)");
    }
  });

  it("holds the hub chrome still while the hub content dissolves", () => {
    // The Today-hub switch (data-nav-kind="hub") lifts the profile row + pills
    // into their own group; the flying lens owns the motion, so the content
    // behind it cross-dissolves. The chrome's name must be SCOPED to the hub
    // attribute, or ordinary screen transitions would capture Today in pieces.
    expect(css).toContain('html[data-nav-kind="hub"] .motion-hub-chrome { view-transition-name: hybrid-hub-chrome; }');
    expect(css).toMatch(/html\[data-nav-kind="hub"\]::view-transition-old\(hybrid-hub-chrome\)\s*{\s*animation:\s*none/);
    expect(css).toMatch(/html\[data-nav-kind="hub"\]::view-transition-new\(hybrid-screen\)\s*{\s*animation:\s*motionDissolveIn/);
  });

  it("keeps the sidebar and header still — only the screen travels", () => {
    expect(css).toContain(".motion-screen { view-transition-name: hybrid-screen; }");
    // The default root cross-fade must be suppressed or the whole document
    // dissolves underneath the named element.
    expect(css).toMatch(/::view-transition-old\(root\)[\s\S]{0,80}animation:\s*none/);
  });
});
