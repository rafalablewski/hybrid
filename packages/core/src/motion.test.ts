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
  sheetGesture,
  resolveSheetRelease,
  releaseVelocity,
  sheetSnaps,
  cssSpringVar,
  navRootRank,
  screenTransition,
  screenAnimation,
  isDetour,
  MODAL_SCREENS,
  NAV_ROOT_ORDER,
} from "./motion";

describe("springs", () => {
  it("keeps the press spring's shipped values", () => {
    // Was `springs.nav`, named for global-nav.tsx — a component deleted when the
    // bottom bar became the system tab bar. The numbers never changed; press
    // feedback is what actually rides them.
    expect(springs.press).toEqual({ response: 0.32, dampingFraction: 0.74 });
  });

  it("keeps the selection lens inside the ceiling", () => {
    // Both clients used to hard-code SwiftUI's DEFAULT spring here (response
    // .551), which settles in 629ms — 40% over. It went unnoticed for exactly
    // one reason: this loop only ever sees tokens, and that was not one.
    expect(springDurationMs(springs.lens)).toBeLessThanOrEqual(450);
    // Playful is FAST with overshoot, not slow with it.
    expect(springs.lens.dampingFraction).toBeLessThan(0.745);
    expect(springs.lens.response).toBeLessThan(0.551);
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
    expect(screenTransition("plans", "exercises")).toEqual({ kind: "replace", dir: 0 });
  });

  it("honours an explicit back-navigation", () => {
    expect(screenTransition("today", "plans", true)).toEqual({ kind: "pop", dir: 0 });
  });

  it("is a no-op onto itself", () => {
    expect(screenTransition("today", "today")).toEqual({ kind: "replace", dir: 0 });
  });
});

describe("modality", () => {
  it("presents a DETOUR and dismisses it, from anywhere", () => {
    // The app used to have one spatial gesture for two relationships: Settings
    // and a session's breakdown both arrived from the right.
    expect(screenTransition("today", "settings")).toEqual({ kind: "present", dir: 0 });
    expect(screenTransition("settings", "today")).toEqual({ kind: "dismiss", dir: 0 });
    // …and from a leaf, not just from a root.
    expect(screenTransition("plans", "builder")).toEqual({ kind: "present", dir: 0 });
    expect(screenTransition("builder", "plans")).toEqual({ kind: "dismiss", dir: 0 });
  });

  it("presents on a FORWARD history move as well as on a tap", () => {
    // Presentation is a property of the DESTINATION, not of the direction
    // travelled. If `back` could turn it into a pop, Forward and Back would stop
    // being inverses of each other on exactly the screens that need it most.
    expect(screenTransition("today", "settings", true)).toEqual({ kind: "present", dir: 0 });
    expect(screenTransition("settings", "today", true)).toEqual({ kind: "dismiss", dir: 0 });
  });

  it("does not present a detour over a detour", () => {
    expect(screenTransition("settings", "logger-settings")).toEqual({ kind: "replace", dir: 0 });
  });

  it("keeps DEPTH a push — a destination is not a detour however deep", () => {
    for (const deep of ["plans", "history", "exercise", "coaches"]) {
      expect(isDetour(deep), `${deep} should be depth, not a detour`).toBe(false);
    }
    for (const task of MODAL_SCREENS) expect(isDetour(task)).toBe(true);
  });

  it("names the same detour on BOTH clients", () => {
    // The two clients name the interval timer differently, and a detour that is
    // only a detour on one client is the drift this file exists to prevent.
    expect(isDetour("timer")).toBe(true);          // web
    expect(isDetour("interval-timer")).toBe(true); // mobile
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
    // The DETOUR is where this rule lives: the task leaves on the accelerating
    // exit curve while the parent it uncovers comes back on the sheet spring.
    const t = screenTransition("today", "settings");
    expect(screenAnimation(t, "enter").name).toBe("motionPresentIn");
    const back = screenTransition("settings", "today");
    expect(screenAnimation(back, "exit").durationMs).toBeLessThan(screenAnimation(t, "enter").durationMs);
    expect(screenAnimation(back, "exit").easing).toBe(easings.exit);
  });

  it("makes the drill-down travel horizontally, like the native stack does", () => {
    // The push was a rise over a receding parent on web and a slide_from_right
    // on mobile, so the shared token that exists to keep them honest described
    // a motion only one client performed.
    const push = screenTransition("today", "plans");
    const pop = screenTransition("plans", "today");
    expect(screenAnimation(push, "enter").name).toBe("motionSlideInRight");
    expect(screenAnimation(push, "exit").name).toBe("motionSlideOutLeft");
    expect(screenAnimation(pop, "enter").name).toBe("motionSlideInLeft");
    expect(screenAnimation(pop, "exit").name).toBe("motionSlideOutRight");
  });

  it("makes dismissal the exact inverse of presentation", () => {
    const present = screenTransition("today", "settings");
    const dismiss = screenTransition("settings", "today");
    // The parent recedes on the way in and returns on the way out, on the SAME
    // spring — receding and returning are one physical gesture with the panel.
    expect(screenAnimation(present, "exit").name).toBe("motionRecedeBack");
    expect(screenAnimation(dismiss, "enter").name).toBe("motionRecedeForward");
    expect(screenAnimation(present, "exit").durationMs).toBe(screenAnimation(dismiss, "enter").durationMs);
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

describe("sheet drag release", () => {
  // A 600px panel with two detents: large (y=0) and medium (y=250).
  const H = 600;
  const SNAPS = [0, 250];

  it("stays put when barely moved", () => {
    expect(resolveSheetRelease(20, 0, H, SNAPS)).toEqual({ target: 0, dismiss: false });
  });

  it("dismisses on a slow drag past the halfway point", () => {
    expect(resolveSheetRelease(460, 0, H, SNAPS).dismiss).toBe(true);
  });

  it("dismisses a downward FLICK from the lowest detent, however short", () => {
    // The whole point of projecting: 260px in is barely past the medium detent,
    // but it is leaving at speed and must not snap back.
    const r = resolveSheetRelease(260, 1200, H, SNAPS);
    expect(r.dismiss).toBe(true);
  });

  it("moves exactly ONE detent on a flick, not all the way out", () => {
    // Flicking down from fully open goes to medium — the gesture says
    // "further", not "gone".
    expect(resolveSheetRelease(0, 1200, H, SNAPS)).toEqual({ target: 250, dismiss: false });
  });

  it("expands on an upward flick", () => {
    expect(resolveSheetRelease(250, -1200, H, SNAPS)).toEqual({ target: 0, dismiss: false });
  });

  it("cannot be flicked up past its largest detent", () => {
    expect(resolveSheetRelease(0, -2000, H, SNAPS)).toEqual({ target: 0, dismiss: false });
  });

  it("snaps to the NEAREST detent on a lazy release", () => {
    expect(resolveSheetRelease(200, 0, H, SNAPS).target).toBe(250);
    expect(resolveSheetRelease(90, 0, H, SNAPS).target).toBe(0);
  });

  it("works for a single-detent sheet (the common case)", () => {
    expect(resolveSheetRelease(100, 0, H, [0])).toEqual({ target: 0, dismiss: false });
    expect(resolveSheetRelease(400, 0, H, [0]).dismiss).toBe(true);
    expect(resolveSheetRelease(30, 1200, H, [0]).dismiss).toBe(true);
  });

  it("elongates on the way up and shortens on the way back", () => {
    // A content-sized sheet: 600px panel holding 240px of content. It RESTS at
    // 360 (240 visible) and the stop above it is 0 — one drag up is the whole
    // elongation, one drag back down is the whole shortening.
    const snaps = sheetSnaps(600, undefined, 240);
    expect(snaps).toEqual([0, 360]);
    // Up from rest: past the midpoint it lands full, and a flick gets there
    // from anywhere.
    expect(resolveSheetRelease(150, 0, 600, snaps).target).toBe(0);
    expect(resolveSheetRelease(360, -1200, 600, snaps)).toEqual({ target: 0, dismiss: false });
    // Back down: the FIRST thing a downward drag from full finds is the
    // content height, not the exit — shortening cannot skip to dismissal.
    expect(resolveSheetRelease(0, 1200, 600, snaps)).toEqual({ target: 360, dismiss: false });
    expect(resolveSheetRelease(300, 0, 600, snaps).dismiss).toBe(false);
    // And only from there does further down leave.
    expect(resolveSheetRelease(500, 0, 600, snaps).dismiss).toBe(true);
  });

  it("keeps the dismiss travel identical to the old content-sized sheet", () => {
    // The panel used to BE the content (600px tall, dismissing at 600); it is
    // now the full height with the content resting part-way down. Half the
    // content height is the drag that dismisses either way — the change in
    // geometry must not change the feel.
    const snaps = sheetSnaps(1000, undefined, 600);
    const rest = snaps[snaps.length - 1]!;
    expect(resolveSheetRelease(rest + 299, 0, 1000, snaps).dismiss).toBe(false);
    expect(resolveSheetRelease(rest + 301, 0, 1000, snaps).dismiss).toBe(true);
  });

  it("gives a declared detent the pull to full", () => {
    // ['medium'] on a 920px panel (0.92 of a 1000px screen) rests at half the
    // SCREEN — 500px visible — and still pulls up to full.
    expect(sheetSnaps(920, ["medium"], null)).toEqual([0, 420]);
    expect(sheetSnaps(920, ["medium", "large"])).toEqual([0, 420]);
  });

  it("never inflates a short sheet to a declared detent", () => {
    // THE REGRESSION THIS GUARDS: a confirm sheet declares ['medium'] and holds
    // two buttons. The declared stop is a place it can GO, not a height it must
    // be — resting it at half the screen would put 300px of empty panel under
    // the last button. The shortest stop wins, and medium survives as a stop in
    // between only when it is far enough from both to be its own.
    expect(sheetSnaps(920, ["medium"], 200)).toEqual([0, 420, 720]);
    // And a sheet TALLER than its declared detent rests at the detent — the
    // content simply scrolls, exactly as it did before.
    expect(sheetSnaps(920, ["medium"], 800)).toEqual([0, 120, 420]);
  });

  it("does not sprout a stop for a sheet that already fills the screen", () => {
    // Content taller than the panel: one stop, fully open.
    expect(sheetSnaps(600, undefined, 900)).toEqual([0]);
    // And a hair short of it is the same stop, not a 20px snap under the finger.
    expect(sheetSnaps(600, undefined, 580)).toEqual([0]);
    expect(sheetSnaps(600, undefined, 600 - sheetGesture.minGrow)).toEqual([0, sheetGesture.minGrow]);
  });

  it("forgets the speed of a gesture that was being HELD", () => {
    // Drag up, hold it there to read what you uncovered, let go. The hand is
    // not throwing the sheet anywhere — but the last sample says it was.
    expect(releaseVelocity(-1400, 16)).toBe(-1400);
    expect(releaseVelocity(-1400, 240)).toBe(0);
    const held = resolveSheetRelease(360, releaseVelocity(1400, 240), 600, [0, 360]);
    expect(held).toEqual({ target: 360, dismiss: false });
  });

  it("falls back to a single open stop when nothing is known yet", () => {
    expect(sheetSnaps(600)).toEqual([0]);
    expect(sheetSnaps(600, [], null)).toEqual([0]);
  });

  it("keeps `large` short of the screen top", () => {
    // A sheet that reaches the top edge reads as a full-screen cover; the strip
    // of parent left visible is what says you'll be coming back.
    expect(sheetGesture.detents.large).toBeLessThan(1);
  });
});
