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
 * The four springs. Anything that MOVES uses one of these.
 *
 * `nav` is the value already shipping in global-nav.tsx — it is reproduced here
 * so both clients can read it from one place, and it must not be retuned
 * without re-auditing that screen.
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
  /** THE SHIPPED NAV LENS. global-nav.tsx already animates on this. */
  nav: { response: 0.32, dampingFraction: 0.74 },
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
   Direction from hierarchy
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The bottom-nav destinations, in BAR ORDER (Today – Explore – [Train] – More –
 * Profile). Moving between two of these is a SIBLING move and travels
 * horizontally in this order; anything else is a drill-down.
 *
 * Kept here rather than in nav.ts because it is the *motion* ordering (what sits
 * left of what on screen), not the nav taxonomy.
 */
export const NAV_ROOT_ORDER = ["today", "explore", "train", "more", "profile"] as const;

/** Aliases so a client's own screen id resolves to its nav root. */
const ROOT_ALIAS: Record<string, string> = {
  log: "train",
  logger: "train",
  feed: "explore",
  discover: "explore",
  coaches: "explore",
  leaderboard: "explore",
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
