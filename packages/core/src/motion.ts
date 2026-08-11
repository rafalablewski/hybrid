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
  /** CELEBRATION — the finish card's entrance pop, and nothing else. The
   *  bounciest spring in the system, and the one token allowed past the 450ms
   *  ceiling (its own guard holds it under the celebration tier instead): a win
   *  is allowed to take its time, and hurrying the one moment the app
   *  congratulates you would spend the exception where it buys nothing. Both
   *  finish surfaces hand-rolled their own version of this (friction 5 against
   *  tension 120 and 90 — the same feel, tuned twice on different afternoons);
   *  this is that feel, written down once so the guard can see it. */
  pop: { response: 0.32, dampingFraction: 0.4 },
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
  /** A list row collapsing to nothing (or opening from it). Long enough to read
   *  as the row LEAVING rather than blinking out, short enough that deleting
   *  five sets in a row doesn't become a queue. */
  collapse: 180,
  /** A PLACEHOLDER handing over to the thing it was holding space for.
   *  Deliberately longer than `dissolve`: a crossfade between two states of the
   *  same box is the one transition where the eye is comparing them, and 200ms
   *  reads as a flicker rather than a hand-over. This is what makes skeleton →
   *  content an arrival instead of a swap. */
  crossfade: 250,
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
  /** Entrance offset for a PRESENTED detour, as a fraction of screen height.
   *  (It was the drill-down's offset until the drill-down became horizontal —
   *  the rise belongs to the thing that rises over a receding parent.) */
  pushOffset: 0.16,
  /** Sibling entrance offset, as a fraction of screen width. */
  slideOffset: 1,
  /** Parent scale under a full-screen COVER. Further back than `recedeScale`
   *  deliberately: a sheet's parent is coming back in a moment and stays a
   *  legible page behind it; a covered screen is not coming back until the mode
   *  ends, so it goes further away and stops being something you could read. */
  coverScale: 0.88,
  /** Focus blur (px) on the covered screen. The recede alone says "behind"; the
   *  blur is what says "not for you right now" — and it is the difference
   *  between a screen that is merely underneath and an app that changed mode. */
  coverBlur: 8,
  /** Brightness of the covered screen. Darker than a sheet's parent for the
   *  same reason it is smaller. */
  coverBrightness: 0.55,
} as const;

/**
 * THE SKELETON BREATH — one placeholder pulse, shared so the two clients cannot
 * breathe at different rates.
 *
 * A spinner is only correct when you cannot predict the shape of what is
 * coming, and this app almost always can: a session card, a macro ring, a set
 * row, a chart. Everything else should reserve its own geometry and fill in.
 * The two clients had different loading languages entirely — web occasionally
 * reserved space and breathed, mobile spun — and where both had a pulse it was
 * 1.4s on each by coincidence rather than by construction.
 *
 * The breath is a NICETY; reserving the space is the actual job, and that part
 * never depends on motion — which is why Reduce Motion stills the placeholder
 * rather than removing it.
 */
export const skeleton = {
  /** One full breath (dim → bright → dim), in ms. */
  pulseMs: 1400,
  /** The opacity the breath falls to. */
  dim: 0.25,
  /** The opacity it rises to. */
  bright: 0.6,
  /** Reduce Motion: held still, and still clearly a placeholder. */
  still: 0.45,
} as const;

/**
 * STATE CHANGES — the vocabulary for a thing REPORTING WHAT HAPPENED TO IT.
 *
 * Audit §17 lists ten of these (empty → populated, editing, saving, saved,
 * error, offline…) and the app had numbers for none. Every save button in the
 * app therefore invented its own: swap the label to "Adding…", drop the opacity
 * to 0.6, and hope. That has one concrete defect the audit names outright — the
 * button RESIZES, because "Add meal" and "Adding…" are different widths, so the
 * layout shifts under a finger that is still on the button.
 *
 * These are the numbers. The behaviour that uses them is the clients' shared
 * commit button; the numbers are here so the two cannot disagree about how long
 * a tick holds or how far an error shakes.
 */
export const states = {
  /** Empty state leaving. Shorter than the arrival: the thing you are waiting
   *  for should feel like it arrives, not like the placeholder resents going. */
  emptyOutMs: 160,
  /** Content arriving IN PLACE — no positional move, because the container is
   *  the constant. A first-data arrival that also slides reads as a new screen. */
  emptyInMs: 200,
  /** Siblings' opacity while one field is being edited. Editing is a MODE, and
   *  the mode is legible only if the things you are not editing recede. */
  editDim: 0.6,
  editMs: 180,
  /** How long a commit button holds its tick before returning to its label.
   *  Long enough to be read, short enough that a second save isn't blocked on
   *  watching an animation. */
  savedHoldMs: 800,
  /** THE ERROR SHAKE: ±4px, three cycles, 250ms all in. A shake is a TRANSFORM
   *  and never a layout change — a field that grows or reflows to report an
   *  error moves everything under it, which is the one thing a user reading an
   *  error message does not need. */
  shakeDx: 4,
  shakeCycles: 3,
  shakeMs: 250,
} as const;

/**
 * The shake as a list of offsets, so both clients shake identically and neither
 * has to hand-write a keyframe list that drifts from the other's.
 *
 * Starts and ends at 0 (a shake that ends off-centre has moved the thing it was
 * only supposed to draw attention to), and DECAYS — a constant-amplitude shake
 * reads as a broken animation loop rather than as an object recoiling.
 */
export function shakeOffsets(dx: number = states.shakeDx, cycles: number = states.shakeCycles): number[] {
  const out: number[] = [0];
  const steps = cycles * 2;
  for (let i = 0; i < steps; i++) {
    // Decay across the whole shake, so the last swing is a fraction of the first.
    const decay = 1 - (i + 1) / (steps + 1);
    out.push((i % 2 === 0 ? 1 : -1) * dx * decay);
  }
  out.push(0);
  return out;
}

/**
 * Style keys that describe an element's relationship to its PARENT rather than
 * its own appearance.
 *
 * This exists because wrapping a component changes who those keys belong to. A
 * commit button that shakes needs an outer node to carry the transform (the
 * press primitive applies its own scale last and would clobber a merged one),
 * and the moment that wrapper appears, a caller's `flex: 1` is being applied to
 * the INNER node while the wrapper — the actual child of the caller's row —
 * sizes to content and refuses to stretch.
 *
 * That is not a hypothetical: 11 of APill's callers pass `flex: 1` and about as
 * many pass padding, so neither "all to the wrapper" nor "all to the inner" is
 * right. The split is by MEANING — how do I sit in my parent (outer) versus
 * what do I look like (inner).
 *
 * Width is outer with the rest: a percentage width resolved against a
 * content-sized wrapper is circular. The inner node then stretches to fill,
 * which is a no-op in the common case where the wrapper is content-sized.
 */
export const OUTER_BOX_KEYS = [
  "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf",
  "width", "minWidth", "maxWidth",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "marginHorizontal", "marginVertical", "marginStart", "marginEnd",
  "position", "top", "right", "bottom", "left", "start", "end", "zIndex",
] as const;

/**
 * Split a flattened style into the part that belongs on a WRAPPER and the part
 * that belongs on the thing inside it. Pure, so it can be tested without a
 * renderer — the failure it guards against (a button that silently stops
 * stretching) is invisible in a typecheck and easy to miss by eye.
 */
export function splitBoxStyle<T extends Record<string, unknown>>(
  style: T | null | undefined,
): { outer: Partial<T>; inner: Partial<T> } {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style ?? {})) {
    ((OUTER_BOX_KEYS as readonly string[]).includes(k) ? outer : inner)[k] = v;
  }
  return { outer: outer as Partial<T>, inner: inner as Partial<T> };
}

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
  /** How old (ms) the last movement sample may be and still count as velocity.
   *  A hand that has been holding the sheet still is not throwing it anywhere,
   *  whatever its last sample said — and now that a sheet is dragged UP as well
   *  as down, holding it somewhere to look at it before letting go is ordinary.
   *  Without this, that release fires on a velocity from a moment ago and the
   *  sheet leaves under the hand that was steadying it. */
  stale: 100,
  /** Detent heights, as a fraction of the screen. `large` is not 1.0 — a sheet
   *  that reaches the top edge reads as a full-screen cover, and the strip of
   *  parent left visible is what says "this is temporary, you'll be back". */
  detents: { medium: 0.5, large: 0.92 },
  /** The smallest growth (px) worth its own detent. Two stops closer than this
   *  are the same stop: a sheet whose content already nearly fills the screen
   *  must not sprout a 12px "expand" that snaps under your finger. */
  minGrow: 64,
} as const;

export type SheetDetent = keyof typeof sheetGesture.detents;

/**
 * THE STOPS a sheet can rest at, as offsets from fully-open, ascending (0 = the
 * panel's full `large` height, larger = further down the screen).
 *
 * EVERY SHEET GROWS. The panel is always laid out at `large` and translated
 * down to its resting stop, so `0` is always in the set: an upward drag from
 * any resting height elongates the sheet to full, and the way back down
 * shortens it again before dismissing. A sheet that was merely content-sized
 * used to have exactly one stop, so the handle's upward direction did nothing —
 * the panel rubber-banded and fell back, which reads as "broken", not "no".
 *
 * `contentH` is the sheet's natural height (chrome included) — a stop like any
 * other, and the SHORTEST one wins as the resting height. A sheet holding two
 * buttons therefore rests two buttons tall whatever it declares: a declared
 * detent adds a stop, it does not inflate a sheet to fill it. Pass `null` for a
 * sheet with no natural height (a child that flexes into whatever it is given).
 */
export function sheetSnaps(
  maxH: number,
  detents?: readonly SheetDetent[],
  contentH?: number | null,
): number[] {
  const raw = [0];
  for (const d of detents ?? []) raw.push(Math.round(maxH * (1 - sheetGesture.detents[d] / sheetGesture.detents.large)));
  if (contentH != null) raw.push(maxH - Math.round(contentH));
  const out: number[] = [];
  for (const v of raw.map((n) => Math.max(0, Math.min(maxH, n))).sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1]! >= sheetGesture.minGrow) out.push(v);
  }
  return out.length ? out : [0];
}

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
 * The velocity a release should actually be decided on, given how long ago the
 * last movement was sampled. Shared so both clients forget a held gesture's
 * speed at the same moment.
 */
export function releaseVelocity(velocity: number, ageMs: number): number {
  return ageMs > sheetGesture.stale ? 0 : velocity;
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
  /** A logged session's TITLE on its row/card ⇄ the same title heading its
   *  breakdown. The highest-traffic card→screen move in the app.
   *
   *  The title rather than a figure, deliberately: it is literally the same
   *  string at both ends (`session.title`), so the travelling element cannot
   *  show one value and land on another. A figure would have to be derived
   *  identically in two places to make that guarantee, and a shared element
   *  that lies mid-flight is worse than a hard cut. */
  sessionHero: "hybrid-session-hero",
  /** A GOAL/PLAN COVER, tile-sized in the library ⇄ the same poster at screen
   *  scale on the screen it opens.
   *
   *  The only pair in the app that wants FULL MATCHED GEOMETRY rather than a
   *  travelling figure, and it is the one that earns it: the tile and the hero
   *  are the same recipe (core `goalCoverView` / `planCoverView` — one accent
   *  wash, one ghost glyph, one display title) drawn at two sizes. The Plans
   *  stack already calls itself "one object at three compressions"; this is the
   *  compression happening in front of you instead of being cut to. */
  planCover: "hybrid-plan-cover",
  /** A PERSON'S AVATAR on a row or a rail ⇄ the portrait heading their page.
   *
   *  The most obviously "same object" element there is: not a figure that
   *  happens to be equal at both ends, not a recipe drawn twice — literally the
   *  same image of the same person, at 52px in a list and 84px on the page it
   *  opens. A circle growing into a circle is also the cheapest possible
   *  matched geometry, which is why the audit put it third. */
  personAvatar: "hybrid-person-avatar",
  /** A CALENDAR DAY CELL ⇄ the day-detail card it selects.
   *
   *  The one pair whose two ends live on the SAME screen: tapping a day swaps
   *  which day the detail panel describes, so the "navigation" is a state
   *  change the shell never sees. The cell is the source frame and the detail
   *  card is the destination — the audit's own prescription ("the day cell →
   *  the detail card's frame"), because what you selected is a REGION of the
   *  month, and the region should be seen arriving where its contents land. */
  calendarDay: "hybrid-calendar-day",
  /** The PR BADGE on an exercise card ⇄ the trophy chip in the finish summary.
   *
   *  The badge appears on the card the moment the record set is banked (core
   *  `livePrLifts`), and when the workout ends it FLIES into the summary's
   *  trophy chip instead of one trophy vanishing and another appearing — the
   *  handoff the wave-3 list called "the keyframes exist, only the handoff is
   *  missing". One badge flies: the heaviest record's (prs[0]), the same one
   *  the celebration headlines. Like calendarDay this pair never crosses a
   *  navigation — finishing is a state swap inside the logger screen. */
  prBadge: "hybrid-pr-badge",
} as const;

export type SharedElementName = (typeof SHARED_ELEMENTS)[keyof typeof SHARED_ELEMENTS];

/* ────────────────────────────────────────────────────────────────────────
   Direction from hierarchy
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The bottom-nav destinations, in BAR ORDER: the capsule's four places
 * (Today – Nutrition – Messages – Profile, nav-bar.ts AURORA_NAV_TABS) and then
 * Train, whose action circle sits detached to the capsule's right. Moving
 * between two of these is a SIBLING move and travels horizontally in this
 * order; anything else is a drill-down.
 *
 * Kept here rather than in nav.ts because it is the *motion* ordering (what sits
 * left of what on screen), not the nav taxonomy. It still has to FOLLOW the
 * bar: this list once kept ranking the retired More tab and did not rank
 * Messages after it took More's slot, so Today ⇄ Messages — two roots sitting
 * beside each other in the capsule — animated as a drill-down on web while the
 * native bar swapped them as siblings.
 */
export const NAV_ROOT_ORDER = ["today", "nutrition", "messages", "profile", "train"] as const;

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

/**
 * THE DETOURS — screens that are a self-contained TASK rather than a place.
 *
 * The app had one spatial gesture for two different relationships. Everything
 * that was not a tab arrived from the right, whether it was genuinely deeper in
 * the hierarchy (a session's breakdown) or a detour you would finish and leave
 * (Settings, the Builder, the daily check-in). A right-slide makes the spatial
 * claim "this is deeper in the same tree"; a presented sheet makes the claim
 * "this is a detour, and you will come back" — and they exit by different
 * gestures, so teaching one motion for both teaches the wrong exit.
 *
 * Both clients' ids are listed here for the same reason ROOT_ALIAS exists: the
 * two name some of these screens differently (web `timer`, mobile
 * `interval-timer`), and a detour that is only a detour on one client is exactly
 * the drift the shared file is for.
 *
 * The test is "would the user say they FINISHED it?" — you finish editing your
 * profile; you do not finish History. A screen that is a destination in its own
 * right (a session, a plan, an exercise) is depth, not a detour, however deep.
 */
export const MODAL_SCREENS = [
  /** Settings, and the logger's own settings page reached from inside it. */
  "settings",
  "logger-settings",
  /** Editors: you open them to change a thing, and leave when it is changed. */
  "profile-edit",
  "builder",
  /** The daily check-in — a form with an end. */
  "checkin",
  /** The interval timer: a tool you use and put down. (`timer` on web.) */
  "timer",
  "interval-timer",
] as const;

const MODAL_SET = new Set<string>(MODAL_SCREENS);

/** Is this screen a self-contained task rather than a place in the hierarchy? */
export function isDetour(screen: string): boolean {
  return MODAL_SET.has(screen);
}

/**
 * THE MODE CHANGES — screens where the app stops being the same tool.
 *
 * Entering the live logger takes the tab bar away, disables the back-swipe and
 * turns the app into a stopwatch with a keyboard. That is not "deeper" and it is
 * not "a detour"; it is the app becoming something else, and it is the one KIND
 * of transition the system had no vocabulary for. It arrived as an ordinary
 * right-slide — the identical motion to opening Settings — so the biggest state
 * change in the product was also its quietest.
 *
 * A cover rises from the bottom edge over a parent that recedes FURTHER than a
 * sheet's parent does and blurs, because a sheet's parent is coming back in a
 * moment and a covered screen is not: you leave a cover deliberately, by
 * finishing or by abandoning, never by brushing the edge of the screen.
 *
 * ⚠ `log` MEANS DIFFERENT THINGS ON THE TWO CLIENTS, and it is the only id in
 * this file that does. On WEB `log` is the live logger (app-shell renders
 * AuroraLogger for it). On MOBILE `log` is the Train LAUNCHER tab
 * (app/(tabs)/log.tsx renders AuroraTrain) and the live logger is the `workout`
 * route. Both ids are listed because a mode change must be a mode change on
 * both clients — but it means nothing on mobile may test one of ITS routes
 * against this set: `isCover("/log")` would be true for a tab. Mobile reaches
 * this set through the explicit route list in app/_layout.tsx and nowhere else,
 * and motion.test.ts states that so it cannot be quietly wired up elsewhere.
 */
export const COVER_SCREENS = [
  /** The live session — mobile's route. */
  "workout",
  /** The live session — WEB's screen id. On mobile this is the launcher tab. */
  "log",
] as const;

const COVER_SET = new Set<string>(COVER_SCREENS);

/** Does arriving at this screen change what the app IS? */
export function isCover(screen: string): boolean {
  return COVER_SET.has(screen);
}

export type ScreenTransition =
  /** Between two bottom-nav destinations. `dir` is +1 rightward, −1 leftward. */
  | { kind: "sibling"; dir: 1 | -1 }
  /** Going deeper: the child slides in over a parallaxing parent. */
  | { kind: "push"; dir: 0 }
  /** Coming back out: the exact inverse of the push. */
  | { kind: "pop"; dir: 0 }
  /** A DETOUR arriving: the parent recedes and the task rises over it. */
  | { kind: "present"; dir: 0 }
  /** The detour leaving: the exact inverse of the presentation. */
  | { kind: "dismiss"; dir: 0 }
  /** A MODE CHANGE arriving: the full screen rises, the app behind it recedes
   *  and blurs out of focus. */
  | { kind: "cover"; dir: 0 }
  /** The mode ending: the exact inverse of the cover. */
  | { kind: "uncover"; dir: 0 }
  /** Same screen, or nothing meaningful to say — crossfade. */
  | { kind: "replace"; dir: 0 };

/**
 * The transition between two screens, derived from the nav hierarchy.
 *
 * A detour presents and dismisses; sibling ⇄ sibling slides in bar order; root →
 * detail pushes; detail → root pops; detail → detail replaces (there is no
 * defensible direction between two unrelated leaves, and inventing one is worse
 * than a crossfade).
 *
 * The detour test runs FIRST and ignores `back`, because a presentation is a
 * property of the DESTINATION, not of the direction travelled: going forward
 * through history into Settings must present exactly as tapping Settings did,
 * or Forward and Back stop being inverses of each other.
 *
 * `back` forces the inverse when the caller knows it is a back-navigation (a
 * browser Back, a hardware back, a swipe) even though the ids alone can't say.
 */
export function screenTransition(from: string, to: string, back = false): ScreenTransition {
  if (from === to) return { kind: "replace", dir: 0 };
  // A MODE CHANGE outranks every other reading of a move, and that is the whole
  // point of it: entering the live logger from Nutrition is not a sideways
  // sibling slide that happens to land in a stopwatch. Tested first for the
  // same reason detours are tested before `back` — it is a property of what the
  // destination IS, and nothing about where you came from can change it.
  if (isCover(to)) return { kind: "cover", dir: 0 };
  if (isCover(from)) return { kind: "uncover", dir: 0 };
  const fromDetour = isDetour(from);
  const toDetour = isDetour(to);
  // Detour → detour (Settings → the logger's settings) is neither: nothing rises
  // over anything, so it crossfades like any two unrelated leaves.
  if (toDetour && fromDetour) return { kind: "replace", dir: 0 };
  if (toDetour) return { kind: "present", dir: 0 };
  if (fromDetour) return { kind: "dismiss", dir: 0 };
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
  // SIBLING and PUSH/POP are the same horizontal travel, and that is deliberate.
  // The push used to be a rise over a receding parent — the sheet's motion —
  // which meant the shared token defined for "web and mobile can't disagree"
  // described a move only web performed (mobile's whole Stack is
  // `slide_from_right`, rendered natively and reversed by the OS's own
  // interruptible edge-swipe, which is better than anything hand-rolled). The
  // resolution is the one the audit recommended: keep mobile's native push, move
  // WEB onto the horizontal push, and reserve recede-and-rise for what it
  // actually is — modality.
  if (t.kind === "sibling" || t.kind === "push" || t.kind === "pop") {
    const right = t.kind === "sibling" ? t.dir === 1 : t.kind === "push";
    return {
      name: role === "enter"
        ? (right ? "motionSlideInRight" : "motionSlideInLeft")
        : (right ? "motionSlideOutLeft" : "motionSlideOutRight"),
      durationMs: springDurationMs(springs.slide),
      easing: `var(--e-slide, ${easings.fade})`,
    };
  }
  if (t.kind === "present" || t.kind === "dismiss") {
    const present = t.kind === "present";
    // Timing is a function of ROLE, not direction: the arriving task rides the
    // sheet spring, and the departing one leaves fast on an accelerating curve.
    // (Keying this off the direction instead gave enter and exit the same
    // duration — the "leaves faster than it arrives" rule was silently
    // unenforced.) The PARENT is the other half of both moves and rides the
    // sheet spring in both directions: receding and returning are one physical
    // gesture with the panel, not a thing that leaves.
    if (present) {
      return role === "enter"
        ? { name: "motionPresentIn", durationMs: springDurationMs(springs.sheet), easing: `var(--e-sheet, ${easings.fade})` }
        : { name: "motionRecedeBack", durationMs: springDurationMs(springs.sheet), easing: `var(--e-sheet, ${easings.fade})` };
    }
    return role === "enter"
      ? { name: "motionRecedeForward", durationMs: springDurationMs(springs.sheet), easing: `var(--e-sheet, ${easings.fade})` }
      : { name: "motionDismissOut", durationMs: durations.fast, easing: easings.exit };
  }
  if (t.kind === "cover" || t.kind === "uncover") {
    // On the ZOOM spring, which is the longest in the system (429ms) — a mode
    // change earns the longest ordinary transition, and this is the audit's
    // "350ms full-screen cover" honoured in the system's own vocabulary rather
    // than by inventing a duration+bezier for the one transition that most
    // wants to be interruptible. Both halves ride it, including the exit: a
    // cover leaving is the app coming BACK, not a thing being dismissed, so
    // hurrying it on the exit curve would undercut the return to normal.
    const cover = t.kind === "cover";
    return {
      name: role === "enter"
        ? (cover ? "motionCoverIn" : "motionFocusIn")
        : (cover ? "motionFocusOut" : "motionCoverOut"),
      durationMs: springDurationMs(springs.zoom),
      easing: `var(--e-zoom, ${easings.fade})`,
    };
  }
  return {
    name: role === "enter" ? "motionDissolveIn" : "motionDissolveOut",
    durationMs: durations.dissolve,
    easing: easings.fade,
  };
}
