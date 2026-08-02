import { describe, it, expect } from "vitest";
import {
  SHARED_ELEMENTS,
  springs,
  easings,
  durations,
  motion,
  springDurationMs,
  springValueAt,
  springToCss,
  springToRN,
  swipe,
  rubberBand,
  projectSwipe,
  cssSpringVar,
  navRootRank,
  screenTransition,
  screenAnimation,
  NAV_ROOT_ORDER,
} from "./motion";

describe("springs", () => {
  it("keeps the SHIPPED nav lens values (global-nav.tsx must not drift)", () => {
    expect(springs.press).toEqual({ response: 0.32, dampingFraction: 0.74 });
  });

  it("never overshoots on a full-screen slide", () => {
    // dampingFraction 1 = critically damped: the position approaches 1 from
    // below and never exceeds it. An overshooting full-screen slide reads sloppy.
    expect(springs.slide.dampingFraction).toBe(1);
    const settle = springDurationMs(springs.slide) / 1000;
    for (let i = 0; i <= 60; i++) {
      expect(springValueAt(springs.slide, (i / 60) * settle)).toBeLessThanOrEqual(1.00001);
    }
  });

  it("does overshoot where arrival energy is wanted", () => {
    const settle = springDurationMs(springs.sheet) / 1000;
    const peak = Math.max(
      ...Array.from({ length: 200 }, (_, i) => springValueAt(springs.sheet, (i / 200) * settle)),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.12); // a touch of energy, not a bounce
  });

  it("starts at rest and settles at the target", () => {
    for (const s of Object.values(springs)) {
      expect(springValueAt(s, 0)).toBeCloseTo(0, 6);
      expect(springValueAt(s, springDurationMs(s) / 1000)).toBeCloseTo(1, 2);
      // …and STAYS there — a spring mid-oscillation must not report as settled.
      expect(springValueAt(s, springDurationMs(s) / 1000 + 0.05)).toBeCloseTo(1, 2);
    }
  });

  it("keeps every transition under the 450ms ceiling this system sets", () => {
    // The rule from the motion spec: nothing over 450ms. The zoom is the
    // longest and earns it by moving the largest distance. This test caught the
    // first cut of these tokens at 521ms (slide) and 641ms (zoom).
    for (const [name, s] of Object.entries(springs)) {
      expect(springDurationMs(s), `${name} settles too slowly`).toBeLessThanOrEqual(450);
    }
    expect(springDurationMs(springs.zoom)).toBeGreaterThan(springDurationMs(springs.slide));
  });
});

describe("springToCss", () => {
  it("emits a linear() easing that starts at 0 and ends at 1", () => {
    const css = springToCss(springs.slide);
    expect(css.startsWith("linear(")).toBe(true);
    const pts = css.slice(7, -1).split(",").map(Number);
    expect(pts[0]).toBe(0);
    expect(pts[pts.length - 1]).toBeCloseTo(1, 2);
    expect(pts.every((n) => Number.isFinite(n))).toBe(true);
  });

  it("is deterministic — the same spring always yields the same curve", () => {
    expect(springToCss(springs.zoom)).toBe(springToCss(springs.zoom));
  });

  it("emits a bezier fallback BEFORE the linear() curve", () => {
    // Engines without linear() must keep the first declaration.
    const decl = cssSpringVar("--e-slide", springs.slide);
    const lines = decl.split("\n");
    expect(lines[0]).toContain("cubic-bezier");
    expect(lines[1]).toContain("linear(");
    expect(lines[0]!.indexOf("--e-slide")).toBeGreaterThanOrEqual(0);
  });
});

describe("springToRN", () => {
  it("converts to RN physics that round-trips back to the same response", () => {
    for (const s of Object.values(springs)) {
      const { stiffness, damping, mass } = springToRN(s);
      const w = Math.sqrt(stiffness / mass);
      expect((2 * Math.PI) / w).toBeCloseTo(s.response, 3);
      expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeCloseTo(s.dampingFraction, 3);
    }
  });
});

describe("SHARED_ELEMENTS", () => {
  it("gives every pair a unique, namespaced name", () => {
    const names = Object.values(SHARED_ELEMENTS);
    // A view-transition-name must be unique at any one moment; colliding names
    // make the browser silently skip the whole transition.
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/^hybrid-[a-z-]+$/);
    }
  });
});

describe("screenTransition", () => {
  it("slides between bottom-nav destinations in bar order", () => {
    expect(screenTransition("today", "nutrition")).toEqual({ kind: "sibling", dir: 1 });
    expect(screenTransition("nutrition", "today")).toEqual({ kind: "sibling", dir: -1 });
    expect(screenTransition("today", "profile")).toEqual({ kind: "sibling", dir: 1 });
    expect(screenTransition("profile", "nutrition")).toEqual({ kind: "sibling", dir: -1 });
  });

  it("resolves client-specific ids onto their nav root", () => {
    expect(navRootRank("log")).toBe(NAV_ROOT_ORDER.indexOf("train"));
    expect(navRootRank("you")).toBe(NAV_ROOT_ORDER.indexOf("profile"));
    expect(screenTransition("today", "log")).toEqual({ kind: "sibling", dir: 1 });
  });

  it("pushes into a detail screen and pops back out", () => {
    expect(screenTransition("today", "plans")).toEqual({ kind: "push", dir: 0 });
    expect(screenTransition("plans", "today")).toEqual({ kind: "pop", dir: 0 });
  });

  it("drills into the social screens now that Explore is not a root", () => {
    // feed / discover / coaches / leaderboard used to alias onto the Explore
    // root and travel sideways; they are reached from More (and Today's coach
    // rail) now, so they are pushes.
    expect(navRootRank("feed")).toBe(-1);
    expect(screenTransition("today", "coaches")).toEqual({ kind: "push", dir: 0 });
    expect(screenTransition("coaches", "today")).toEqual({ kind: "pop", dir: 0 });
  });

  it("crossfades between two unrelated leaves rather than inventing a direction", () => {
    expect(screenTransition("plans", "builder")).toEqual({ kind: "replace", dir: 0 });
  });

  it("honours an explicit back-navigation", () => {
    expect(screenTransition("today", "plans", true)).toEqual({ kind: "pop", dir: 0 });
  });

  it("is a no-op onto itself", () => {
    expect(screenTransition("today", "today")).toEqual({ kind: "replace", dir: 0 });
  });
});

describe("screenAnimation", () => {
  it("makes back the exact inverse of forward", () => {
    const fwd = screenTransition("today", "nutrition");
    const back = screenTransition("nutrition", "today");
    expect(screenAnimation(fwd, "enter").name).toBe("motionSlideInRight");
    expect(screenAnimation(back, "enter").name).toBe("motionSlideInLeft");
    expect(screenAnimation(fwd, "exit").name).toBe("motionSlideOutLeft");
    expect(screenAnimation(back, "exit").name).toBe("motionSlideOutRight");
  });

  it("SUBSTITUTES a cross-dissolve under Reduce Motion — never removes motion", () => {
    const t = screenTransition("today", "nutrition");
    for (const role of ["enter", "exit"] as const) {
      const a = screenAnimation(t, role, true);
      expect(a.durationMs).toBe(durations.reduced);
      expect(a.durationMs).toBeGreaterThan(0); // the whole point: not an instant cut
      expect(a.name).toMatch(/Dissolve/);
    }
  });

  it("leaves faster than it arrives", () => {
    const t = screenTransition("today", "plans");
    expect(screenAnimation(t, "exit").durationMs).toBeLessThan(screenAnimation(t, "enter").durationMs);
    expect(screenAnimation(t, "exit").easing).toBe(easings.exit);
  });
});

describe("constants", () => {
  it("drops the scrim once the parent recedes", () => {
    expect(motion.scrimWithRecede).toBeLessThan(motion.scrimFlat);
  });
  it("keeps the reduced-motion dissolve perceptible", () => {
    expect(durations.reduced).toBeGreaterThanOrEqual(120);
    expect(durations.reduced).toBeLessThanOrEqual(220);
  });
});

describe("swipe actions", () => {
  it("rubber-bands past the clamp instead of running off or hitting a wall", () => {
    // 1:1 while inside the limit …
    expect(rubberBand(-60, 80)).toBe(-60);
    expect(rubberBand(-80, 80)).toBe(-80);
    // … then resists, asymptotically, never exceeding limit + resist.
    const far = rubberBand(-400, 80);
    expect(Math.abs(far)).toBeGreaterThan(80);
    expect(Math.abs(far)).toBeLessThan(80 + swipe.resist);
    // Monotonic: pulling further always moves further, just less.
    expect(Math.abs(rubberBand(-200, 80))).toBeGreaterThan(Math.abs(rubberBand(-120, 80)));
  });

  it("projects a release from velocity, not displacement alone", () => {
    // THE BUG THIS EXISTS FOR: a fast flick that travelled only 35px used to
    // snap shut, because both clients compared raw distance against a
    // threshold. Projected, it is clearly heading past the action.
    const flick = projectSwipe(-35, -900);
    expect(flick).toBeLessThan(-swipe.action * swipe.openAt);
    // A drag the same distance that has STOPPED is not heading anywhere, and
    // must not open. (Note the projection is deliberately sensitive: even a
    // gentle 40px/s drift carries -35 past the threshold, which is the point —
    // the rule is "where is this going", not "how far did it get".)
    expect(projectSwipe(-35, 0)).toBeGreaterThan(-swipe.action * swipe.openAt);
    // And a flick heading BACK closes even from a fully open row.
    expect(projectSwipe(-80, 900)).toBeGreaterThan(-swipe.action * swipe.openAt);
  });

  it("commits a full swipe further out than it commits a reveal", () => {
    expect(swipe.fullAt).toBeGreaterThan(swipe.openAt);
  });
});
