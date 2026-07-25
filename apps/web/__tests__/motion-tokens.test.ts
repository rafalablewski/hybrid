import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { springs, springToCss, springDurationMs, durations, easings } from "@hybrid/core";

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
    for (const name of [
      "motionSlideInRight", "motionSlideInLeft", "motionSlideOutLeft", "motionSlideOutRight",
      "motionPushIn", "motionPushOut", "motionPopIn", "motionPopOut",
      "motionDissolveIn", "motionDissolveOut",
    ]) {
      expect(css, `missing @keyframes ${name}`).toContain(`@keyframes ${name}`);
    }
  });

  it("SUBSTITUTES a dissolve under Reduce Motion rather than zeroing it", () => {
    // The global !important backstop collapses every animation to 0.001ms.
    // Screen transitions must be exempted, or Reduce Motion becomes an instant
    // cut — which removes the only signal that the screen changed.
    expect(css).toContain("::view-transition-old(*)");
    expect(css).toMatch(/animation-duration:\s*var\(--d-reduced\)\s*!important/);
  });

  it("keeps the sidebar and header still — only the screen travels", () => {
    expect(css).toContain(".motion-screen { view-transition-name: hybrid-screen; }");
    // The default root cross-fade must be suppressed or the whole document
    // dissolves underneath the named element.
    expect(css).toMatch(/::view-transition-old\(root\)[\s\S]{0,80}animation:\s*none/);
  });
});
