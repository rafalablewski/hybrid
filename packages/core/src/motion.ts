/**
 * HYBRID motion tokens — the single source of truth for screen transitions on
 * BOTH clients (the parity rule: web and mobile must run the same motion, not
 * two eyeballed approximations of each other).
 *
 * WHY SPRINGS, NOT DURATION + BEZIER
 * A cubic-bezier carries no velocity state, so an animation driven by one
 * cannot be interrupted or retargeted mid-flight — you can only restart it from
 * a standstill. Every gesture-tracked transition (the interruptible back swipe,
 * a sheet you catch halfway) therefore *requires* a spring. The app already
 * proves this: the shipped nav lens (apps/mobile/components/aurora/global-nav.tsx)
 * is a real SwiftUI spring, and it is the best motion in the product.
 *
 * Springs here are expressed in SwiftUI's own vocabulary — `response` (the
 * period of one oscillation, i.e. how quickly it moves) and `dampingFraction`
 * (1 = no overshoot, <1 = some bounce) — because that is what the native side
 * consumes directly. `springToCss()` integrates the same physics into a CSS
 * `linear()` easing so the web runs the identical curve; `springToRN()` converts
 * it to the mass/stiffness/damping triple React Native's Animated.spring wants.
 *
 * Beziers survive ONLY for opacity, where there is no position to interrupt.
 *
 * REDUCE MOTION is a SUBSTITUTION, not a deletion. Positional animation is
 * replaced by a short cross-dissolve (`durations.reduced`), never removed — a
 * user with Reduce Motion on still needs to perceive that the screen changed,
 * and an instant cut removes that signal entirely.
 */

/** A spring in SwiftUI's parameterisation. */
export interface Spring {
  /** Period of one oscillation, in seconds. Lower = snappier. */
  response: number;
  /** 1 = critically damped (no overshoot); below 1 adds arrival bounce. */
  dampingFraction: number;
}

/**
 * Every spring in the system. Anything that MOVES uses one of these, and
 * motion.test.ts holds all of them to the 450ms ceiling — so a spring that
 * isn't here is a spring nothing is checking.
 *
 * `press` was called `nav` and was documented as "THE SHIPPED NAV LENS —
 * global-nav.tsx already animates on this". That file no longer exists: the
 * hand-built floating capsule was deleted when the bottom bar became the real
 * system tab bar (expo-router NativeTabs), which renders its own selection
 * motion. The token survived the component it was named for and is, in
 * practice, what press feedback runs on — so it is named for that now. The
 * numbers are unchanged; only the name and the reason are honest again.
 */
export const springs = {
  /** Sibling travel between bottom-nav destinations. Critically damped: a
   *  full-screen slide that overshoots reads as sloppy, not lively.
   *  Settles in ~403ms, close to the iOS navigation push. */
  slide: { response: 0.34, dampingFraction: 1.0 },
  /** Shared-element zoom + hero-number travel. A large surface moving a long
   *  distance needs a longer response or it feels flung. The longest transition
   *  in the system at ~429ms, and it earns it. */
  zoom: { response: 0.46, dampingFraction: 0.92 },
  /** Sheets, modals and the parent recede behind them — a touch of arrival
   *  energy (peaks ~0.5% past target), matching how an iOS sheet settles. */
  sheet: { response: 0.38, dampingFraction: 0.86 },
  /** Press feedback — the scale-down under a finger. Short and a little lively;
   *  a press is the one place a small overshoot reads as responsiveness rather
   *  than wobble. */
  press: { response: 0.32, dampingFraction: 0.74 },
  /** THE SELECTION LENS — the pill that flies between segments (liquid-seg on
   *  both clients).
   *
   *  Both clients previously hard-coded SwiftUI's DEFAULT spring here
   *  (response .551 / dampingFraction .745, reached on mobile as
   *  `stiffness: 130, damping: 17`), which settles in 629ms — 40% past this
   *  system's own ceiling, on the control users touch most often. It went
   *  unnoticed because the guard only ever iterated the tokens, and this was
   *  not one. The lens should feel PLAYFUL, and playful is fast with overshoot,
   *  not slow with overshoot: this is quicker AND bouncier (damping .68 vs
   *  .745). */
  lens: { response: 0.35, dampingFraction: 0.68 },
} as const satisfies Record<string, Spring>;

export type SpringToken = keyof typeof springs;

/** Opacity-only curves. Nothing positional, so nothing to interrupt. */
export const easings = {
  /** The app's existing curve, kept for crossfades. */
  fade: "cubic-bezier(.2,.7,.3,1)",
  /** Accelerating — things leave faster than they arrive. */
  exit: "cubic-bezier(.4,0,.9,.4)",
} as const;

/** Durations for the things that are genuinely time-based, in ms. */
export const durations = {
  /** Dismissals, press states. */
  fast: 160,
  /** Content crossfade under a travelling shared element. */
  dissolve: 200,
  /** The Reduce Motion cross-dissolve SUBSTITUTION. Never zero. */
  reduced: 150,
} as const;

/** Positional constants shared by both clients. */
export const motion = {
  /** How far the underlying screen travels during a sibling move (fraction). */
  parallaxUnder: 0.33,
  /** Parent scale while a sheet/modal is presented. */
  recedeScale: 0.92,
  /** Parent corner radius (px) at full recede — matches a device corner. */
  recedeRadius: 30,
  /** Parent brightness at full recede. */
  recedeBrightness: 0.72,
  /** Scrim opacity WITH the recede. Without it the scrim has to do all the
   *  separation work and needs ~0.6, which flattens the screen behind. */
  scrimWithRecede: 0.28,
  /** Scrim opacity when the parent does NOT recede (the legacy look). */
  scrimFlat: 0.6,
  /** Entrance offset for a drill-down, as a fraction of screen height. */
  pushOffset: 0.16,
  /** Sibling entrance offset, as a fraction of screen width. */
  slideOffset: 1,
} as const;

/**
 * SWIPE ACTIONS — the geometry and the release rule for a row you swipe to
 * reveal a destructive action on.
 *
 * Here rather than in each client because the two implementations had drifted
 * on every single number (open 76 vs 84, commit 40 vs 44, clamp 110 vs 120)
 * while calling each other twins in their own header comments.
 */
export const swipe = {
  /** Width of the revealed action, in px/dp. */
  action: 80,
  /** How far past the action width the row can be dragged before it stops. */
  max: 120,
  /** Fraction of `action` the drag must PROJECT past to commit the reveal. */
  openAt: 0.5,
  /** Fraction of the row's width that commits the delete outright, no tap. */
  fullAt: 0.6,
  /** Seconds of velocity to project the release position by. iOS decides a
   *  flick from where the finger is GOING, not from where it let go — a fast
   *  flick that travelled 35px should open, and displacement alone says no. */
  project: 0.15,
  /** Speed (px/s) that commits on its own, however short the travel. */
  flick: 800,
  /** Rubber-band constant past the clamp: resistance grows with distance so the
   *  row never runs off, and the finger feels the end instead of hitting a wall. */
  resist: 90,
} as const;

/**
 * SHEET GESTURE — dragging a presented sheet, and where it lands on release.
 *
 * Both clients drew iOS's 40×4 grab handle on every sheet and bound NOTHING to
 * it: the app displayed the platform's universal "drag me" glyph and ignored
 * the gesture users try first. This is the physics behind fixing that.
 *
 * A sheet is the one surface in the app that MUST be interruptible — you catch
 * it halfway, change your mind, throw it back. That is the exact capability
 * springs were chosen over beziers for at the top of this file, and until now
 * nothing exercised it.
 */
export const sheetGesture = {
  /** Fraction of the panel's height a release must PROJECT past to dismiss. */
  dismissAt: 0.4,
  /** Speed (px/s) that moves a detent (or dismisses) regardless of distance. */
  flick: 800,
  /** Seconds of velocity to project the release by. Shared with swipe actions
   *  deliberately: one "where is this going" constant for the whole app. */
  project: swipe.project,
  /** Rubber-band constant when dragged ABOVE its resting position. */
  resist: 90,
  /** Detent heights, as a fraction of the screen. `large` is not 1.0 — a sheet
   *  that reaches the top edge reads as a full-screen cover, and the strip of
   *  parent left visible is what says "this is temporary, you'll be back". */
  detents: { medium: 0.5, large: 0.92 },
} as const;

export type SheetDetent = keyof typeof sheetGesture.detents;

/**
 * Where a released sheet drag lands.
 *
 * The panel is laid out at its LARGEST detent and translated down, so one axis
 * describes everything: `y` 0 is fully open, `y` = panelH is dismissed, and each
 * smaller detent is a `y` in between. `snaps` are those detent offsets, ascending.
 *
 * A FLICK moves exactly one detent rather than jumping the whole way — the
 * gesture's force says "further in this direction", not "all the way". From the
 * smallest detent, further down is dismissal.
 */
export function resolveSheetRelease(
  y: number,
  velocity: number,
  panelH: number,
  snaps: readonly number[],
): { target: number; dismiss: boolean } {
  const stops = [...snaps].sort((a, b) => a - b);
  const dismissY = panelH;

  if (velocity > sheetGesture.flick) {
    // Downward flick: the next stop below, or out.
    const below = stops.find((s) => s > y + 1);
    const target = below ?? dismissY;
    return { target, dismiss: target === dismissY };
  }
  if (velocity < -sheetGesture.flick) {
    // Upward flick: the next stop above; already at the top means stay.
    const above = [...stops].reverse().find((s) => s < y - 1);
    return { target: above ?? stops[0]!, dismiss: false };
  }

  // Otherwise: land on whatever the projected position is nearest to.
  const projected = y + velocity * sheetGesture.project;
  const candidates = [...stops, dismissY];
  let target = candidates[0]!;
  let best = Infinity;
  for (const c of candidates) {
    const d = Math.abs(projected - c);
    if (d < best) { best = d; target = c; }
  }
  return { target, dismiss: target === dismissY };
}

/**
 * Rubber-banded travel: 1:1 up to `limit`, then asymptotically approaching
 * `limit + resist`. The standard iOS overscroll feel, as a pure function so
 * both clients rubber-band identically.
 */
export function rubberBand(offset: number, limit: number, resist: number = swipe.resist): number {
  const over = Math.abs(offset) - limit;
  if (over <= 0) return offset;
  const damped = limit + resist * (1 - Math.exp(-over / resist));
  return offset < 0 ? -damped : damped;
}

/**
 * Where a released swipe is HEADING, given where it is and how fast it is
 * moving. Positive `velocity` travels right.
 */
export function projectSwipe(offset: number, velocity: number): number {
  return offset + velocity * swipe.project;
}

/* ────────────────────────────────────────────────────────────────────────
   Spring integration
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Where a spring counts as VISUALLY settled — within 0.5% of the target, which
 * is well under a pixel on any screen dimension we animate.
 *
 * This deliberately isn't the mathematical settle time. A spring's tail is
 * asymptotic, and a critically damped one carries a `(1 + ωt)` polynomial that
 * stretches it much further: measuring to 0.08% made the slide 521ms and the
 * zoom 641ms — both over the 450ms ceiling this system sets — for tail motion
 * nobody can see. The animation's duration must be how long it *looks* like it
 * is moving.
 */
const SETTLE_EPSILON = 0.005;

/**
 * How long this spring takes to settle visually, in ms. This is the animation's
 * real duration — a spring has no author-chosen duration, it has a physics one.
 *
 * Solved numerically rather than from the envelope bound, because the envelope
 * alone is wrong for the critically damped case (it ignores the `1 + ωt` term)
 * and conservative for the under-damped one. Requires the curve to STAY inside
 * the epsilon band, so a spring still oscillating isn't reported as settled.
 */
export function springDurationMs(s: Spring): number {
  const step = 0.001;
  const hold = 80; // must remain settled for 80ms, not merely cross the target
  for (let t = 0; t < 4; t += step) {
    let settled = true;
    for (let k = 0; k < hold; k++) {
      if (Math.abs(1 - springValueAt(s, t + k * step)) > SETTLE_EPSILON) {
        settled = false;
        break;
      }
    }
    if (settled) return Math.round(t * 1000);
  }
  return 4000;
}

/** Normalised position of a damped oscillator at time `t` (seconds), 0 → 1. */
export function springValueAt(s: Spring, t: number): number {
  const w = (2 * Math.PI) / s.response;
  const z = s.dampingFraction;
  const env = Math.exp(-z * w * t);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - env * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  // Critically damped (z === 1). Over-damped (z > 1) is not used by any token
  // and would need the hyperbolic form; the critical solution is the limit case.
  return 1 - env * (1 + w * t);
}

/**
 * The spring as a CSS `linear()` easing function, sampled across its settle
 * time. Pair it with `springDurationMs()` for the transition-duration.
 *
 * `linear()` is Baseline (Chrome 113+, Safari 17.2+, Firefox 112+); older
 * engines ignore the declaration, which is why `cssSpringVar()` emits a bezier
 * fallback first.
 */
export function springToCss(s: Spring, samples = 36): string {
  const settle = springDurationMs(s) / 1000;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * settle;
    pts.push(springValueAt(s, t).toFixed(5).replace(/0+$/, "").replace(/\.$/, ""));
  }
  return `linear(${pts.join(",")})`;
}

/**
 * React Native's Animated.spring / Reanimated withSpring physics config.
 * Derived from the SAME response/damping, so native and web can't drift.
 * (mass = 1: k = (2π/response)², c = 4π·dampingFraction/response.)
 */
export function springToRN(s: Spring): { mass: number; stiffness: number; damping: number } {
  const w = (2 * Math.PI) / s.response;
  return {
    mass: 1,
    stiffness: Math.round(w * w * 100) / 100,
    damping: Math.round(2 * s.dampingFraction * w * 100) / 100,
  };
}

/**
 * A progressive-enhancement pair for a CSS custom property: the bezier
 * approximation first, the exact spring second. An engine without `linear()`
 * keeps the first declaration; everything else takes the second.
 */
export function cssSpringVar(name: string, s: Spring, fallback = easings.fade): string {
  return `  ${name}: ${fallback};\n  ${name}: ${springToCss(s)};`;
}

/* ────────────────────────────────────────────────────────────────────────
   Shared elements
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Names for elements that persist ACROSS a screen change — the thing you tapped
 * travels into the screen it opens instead of being re-rendered there.
 *
 * Web uses these verbatim as `view-transition-name`; mobile uses them as the key
 * for its FLIP overlay. Shared so a pair can't be half-renamed on one client.
 *
 * A name must be UNIQUE AT ANY ONE MOMENT — two elements carrying the same name
 * in the same snapshot is an error, and the browser silently skips the
 * transition. Arm exactly one source before navigating, and clear it after.
 */
export const SHARED_ELEMENTS = {
  /** The headline figure on an exercise card ⇄ the hero on its stats page.
   *  Chosen over morphing the whole card because a chart card is not the shape
   *  of a stats page — but the NUMBER is the same fact in both places, and
   *  numbers are what this app is about. */
  exerciseHero: "hybrid-exercise-hero",
} as const;

export type SharedElementName = (typeof SHARED_ELEMENTS)[keyof typeof SHARED_ELEMENTS];

/* ────────────────────────────────────────────────────────────────────────
   Direction from hierarchy
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The bottom-nav destinations, in BAR ORDER (Today – Nutrition – [Train] – More
 * – Profile). Moving between two of these is a SIBLING move and travels
 * horizontally in this order; anything else is a drill-down.
 *
 * Kept here rather than in nav.ts because it is the *motion* ordering (what sits
 * left of what on screen), not the nav taxonomy.
 */
export const NAV_ROOT_ORDER = ["today", "nutrition", "train", "more", "profile"] as const;

/** Aliases so a client's own screen id resolves to its nav root. */
// The social screens (feed / discover / coaches / leaderboard) used to alias to
// the Explore root and so travelled SIDEWAYS from Today. With Explore gone they
// are what they always were underneath — leaves reached from More or from
// Today's coach rail — so they drill down and pop back out instead.
const ROOT_ALIAS: Record<string, string> = {
  log: "train",
  logger: "train",
  you: "profile",
};

/** The nav-root rank of a screen id, or -1 if it isn't a root. */
export function navRootRank(screen: string): number {
  const id = ROOT_ALIAS[screen] ?? screen;
  return (NAV_ROOT_ORDER as readonly string[]).indexOf(id);
}

export type ScreenTransition =
  /** Between two bottom-nav destinations. `dir` is +1 rightward, −1 leftward. */
  | { kind: "sibling"; dir: 1 | -1 }
  /** Going deeper: the parent recedes, the child rises. */
  | { kind: "push"; dir: 0 }
  /** Coming back out: the exact inverse of the push. */
  | { kind: "pop"; dir: 0 }
  /** Same screen, or nothing meaningful to say — crossfade. */
  | { kind: "replace"; dir: 0 };

/**
 * The transition between two screens, derived from the nav hierarchy.
 *
 * Sibling ⇄ sibling slides in bar order; root → detail pushes; detail → root
 * pops; detail → detail replaces (there is no defensible direction between two
 * unrelated leaves, and inventing one is worse than a crossfade).
 *
 * `back` forces the inverse when the caller knows it is a back-navigation (a
 * browser Back, a hardware back, a swipe) even though the ids alone can't say.
 */
export function screenTransition(from: string, to: string, back = false): ScreenTransition {
  if (from === to) return { kind: "replace", dir: 0 };
  const a = navRootRank(from);
  const b = navRootRank(to);
  if (a >= 0 && b >= 0) return { kind: "sibling", dir: b > a ? 1 : -1 };
  if (back) return { kind: "pop", dir: 0 };
  if (a >= 0 && b < 0) return { kind: "push", dir: 0 };
  if (a < 0 && b >= 0) return { kind: "pop", dir: 0 };
  return { kind: "replace", dir: 0 };
}

/**
 * The animation a screen should play, resolved for one transition and one role.
 * Returns the CSS animation-name the web keyframes define, plus the timing.
 * Mobile reads the same `kind`/`dir` and maps it to its native stack options.
 */
export function screenAnimation(
  t: ScreenTransition,
  role: "enter" | "exit",
  reduced = false,
): { name: string; durationMs: number; easing: string } {
  if (reduced) {
    return {
      name: role === "enter" ? "motionDissolveIn" : "motionDissolveOut",
      durationMs: durations.reduced,
      easing: "linear",
    };
  }
  if (t.kind === "sibling") {
    const right = t.dir === 1;
    return {
      name: role === "enter"
        ? (right ? "motionSlideInRight" : "motionSlideInLeft")
        : (right ? "motionSlideOutLeft" : "motionSlideOutRight"),
      durationMs: springDurationMs(springs.slide),
      easing: `var(--e-slide, ${easings.fade})`,
    };
  }
  if (t.kind === "push" || t.kind === "pop") {
    const push = t.kind === "push";
    // Timing is a function of ROLE, not direction: the arriving screen rides the
    // spring, the departing one leaves fast on an accelerating curve. (Keying
    // this off `push` instead gave enter and exit the same duration — the
    // "leaves faster than it arrives" rule was silently unenforced.)
    return {
      name: role === "enter"
        ? (push ? "motionPushIn" : "motionPopIn")
        : (push ? "motionPushOut" : "motionPopOut"),
      durationMs: role === "enter" ? springDurationMs(springs.sheet) : durations.fast,
      easing: role === "enter" ? `var(--e-sheet, ${easings.fade})` : easings.exit,
    };
  }
  return {
    name: role === "enter" ? "motionDissolveIn" : "motionDissolveOut",
    durationMs: durations.dissolve,
    easing: easings.fade,
  };
}
