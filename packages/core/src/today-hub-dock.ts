// ============================================================
//  THE TODAY HUB DOCK — what the home screen leaves behind on scroll.
//
//  The sticky pill rail that used to own this slot was deleted: every pill it
//  drew was the residue of a card the athlete had already read, so a bar that
//  survived scrolling spent itself restating the screen above it. The slot now
//  carries NAVIGATION instead — the hub switcher itself (Dashboard /
//  Performance / Feed), so the thing that persists is the way OUT of the view
//  you are in rather than a summary of it.
//
//  Two rules, and this module owns both:
//
//  SPLIT — once the in-flow segmented control has scrolled off, the three
//  destinations stop being segments of one track and become three independent
//  pills. The equal-width constraint that forces glyph-only labels only exists
//  INSIDE a track; free pills may be unequal, so exactly one of them — the one
//  you are in — carries its word, and the row states where you are in language
//  rather than in a highlight.
//
//  RETURN — the row answers scroll DIRECTION, not depth. Scrolling down means
//  "I am reading", so the pills leave; the first flick UP means "I am looking
//  for something", so they come straight back, wherever you happen to be. A
//  dead zone keeps momentum decay and a resting thumb from strobing them.
//
//  Pure and client-agnostic: web measures with getBoundingClientRect and reads
//  window.scrollY, mobile subscribes to the nav-scroll signal every scroller
//  already publishes, and both feed the SAME numbers in here — so the two
//  clients cannot drift on when a pill appears (see today-hub-dock.tsx on
//  both clients).
// ============================================================

import {
  durations,
  easings,
  springDurationMs,
  springToCss,
  springs,
  type Spring,
} from "./motion";

/**
 * Where the switcher's own bottom edge sits when a client cannot measure it.
 *
 * The threshold that matters is "the in-flow control has left the viewport",
 * NOT a fixed scroll depth — detaching earlier would draw the floating row
 * while the real control is still on screen, which is two copies of one
 * control. Web measures the exact edge and passes it as `controlBottom`;
 * mobile's scrollers report only their offset (rebuilding the parent-chain
 * geometry is the exact fragility the deleted rail carried), so it falls back
 * to this constant: the page gutter, the profile row, the switcher's own top
 * margin and its track. Deliberately a touch LATE — a floating row that
 * arrives a few pixels after the real one leaves is invisible; one that
 * arrives early is a duplicate.
 */
export const HUB_DOCK_FLOOR = 116;

/** Re-attach slightly BEFORE the detach point, so scrolling back and forth
 *  across the threshold cannot make the row flicker. */
export const HUB_DOCK_RELEASE = 10;

/** How far you must travel in one direction before the row believes you.
 *  Below this, momentum decay, a resting thumb and the tail of a fling are all
 *  just noise. */
export const HUB_DOCK_DEAD_ZONE = 12;

/**
 * - `attached` — the in-flow switcher is still on screen; nothing floats.
 * - `shown` — detached, and the athlete is reaching for it (or has not moved).
 * - `hidden` — detached, and the athlete is reading downward.
 */
export type HubDockPhase = "attached" | "shown" | "hidden";

export interface HubDockState {
  phase: HubDockPhase;
  /** The signed distance travelled since the last direction change. Carried
   *  between frames so the dead zone measures a RUN, not one event's delta. */
  run: number;
  /** The offset this state was resolved at, so the next frame can diff it. */
  y: number;
}

/** The state every hub view mounts in: at the top, nothing floating. */
export const HUB_DOCK_REST: HubDockState = { phase: "attached", run: 0, y: 0 };

export interface HubDockOpts {
  /** The switcher's own bottom edge in content space, when the client can
   *  measure it. `null` falls back to HUB_DOCK_FLOOR. */
  controlBottom?: number | null;
  /** Override the fallback threshold. */
  floor?: number;
  /** Re-attach margin; 0 disables the hysteresis. */
  release?: number;
  /** Direction dead zone; 0 makes every pixel of travel count. */
  deadZone?: number;
  /** Under reduced motion the row never hides — RETURN's whole point is the
   *  motion, and a control that vanishes without one is just a control that
   *  disappeared. The clients render DOCK's single capsule there instead. */
  reduced?: boolean;
  /** The previous frame's state. */
  prev?: HubDockState;
}

/**
 * Resolve the dock for a scroll position.
 *
 * Offsets are clamped at zero before anything is compared: iOS rubber-band at
 * the top and Android's overscroll both report NEGATIVE offsets, and an
 * unclamped diff turns the settle of a bounce into a phantom upward flick that
 * pops the row open at the very moment the athlete arrives at the top.
 */
export function hubDockState(y: number, opts: HubDockOpts = {}): HubDockState {
  const floor = opts.floor ?? HUB_DOCK_FLOOR;
  const release = Math.max(0, opts.release ?? HUB_DOCK_RELEASE);
  const deadZone = Math.max(0, opts.deadZone ?? HUB_DOCK_DEAD_ZONE);
  const prev = opts.prev ?? HUB_DOCK_REST;

  const bottom = opts.controlBottom;
  const detachAt = Math.max(bottom != null && Number.isFinite(bottom) ? bottom : floor, floor);
  const attachAt = Math.max(0, detachAt - release);

  const now = Math.max(0, y);
  const was = Math.max(0, prev.y);
  const floating = prev.phase !== "attached";

  // ATTACHED — the real control is (back) on screen. Held pills use the looser
  // threshold, so coming back up re-attaches a touch before going down
  // detached.
  if (now <= (floating ? attachAt : detachAt)) return { phase: "attached", run: 0, y: now };

  // FLOATING — resolve the direction. A first detach always lands HIDDEN: you
  // only got here by scrolling down, and down means reading.
  const delta = now - was;
  let run = prev.run;
  if (delta > 0) run = run > 0 ? run + delta : delta;
  else if (delta < 0) run = run < 0 ? run + delta : delta;

  let phase: HubDockPhase = floating ? prev.phase : "hidden";
  if (run >= deadZone) { phase = "hidden"; run = 0; }
  else if (run <= -deadZone) { phase = "shown"; run = 0; }

  // Reduced motion keeps the row on screen for the whole detached range.
  if (opts.reduced) return { phase: "shown", run: 0, y: now };

  return { phase, run, y: now };
}

/** The row is drawn (and reachable) only in this phase. */
export const hubDockVisible = (phase: HubDockPhase): boolean => phase === "shown";

// ── Geometry ─────────────────────────────────────────────────────────────────
// Shared so the two clients cannot draw the same row at two sizes. Widths of
// the ACTIVE pill are deliberately absent: it sizes to its own label, which is
// a different number in every language, so each client measures its own text
// and both apply the same paddings to it.

export const HUB_PILL = {
  /** The row's own height, and every pill's. Matches the resting control's
   *  segment height, so the split reads as the same object rearranged. */
  height: 36,
  /** A glyph-only sibling. 44 keeps the platform's minimum touch target
   *  without a hit-slop hack. */
  siblingWidth: 44,
  /** The mark itself, at the switcher's size. */
  glyph: 21,
  /**
   * Between pills, once they are free of the track — and the whole of SPLIT.
   *
   * The row arrives at gap ZERO: three capsules touching, which under Liquid
   * Glass is not three shapes at all but ONE lozenge, because adjacent glass
   * inside a `GlassEffectContainer` fuses. Springing the gap open from there is
   * the split — the track becoming three pills, rendered in the material rather
   * than mimed by three views scaling in — and running it backwards on the way
   * out is MERGE. Both clients animate this one number.
   */
  gap: 10,
  /** The active pill's horizontal padding, and the space between its glyph and
   *  its word. */
  labelPadX: 14,
  labelGap: 8,
  /** Below the safe area (mobile) or the viewport top (web). */
  top: 8,
  /**
   * The row is anchored to the LEADING edge, not centred, and it lines up with
   * the CONTENT COLUMN rather than the raw screen edge — the pills sit where
   * the in-flow switcher's own left edge was, so detaching reads as the control
   * lifting straight up rather than sliding sideways on its way out.
   *
   * This is the fallback when a client cannot measure that column: the screen
   * gutter, which is 16 on both clients. Web measures the switcher's real left
   * edge instead (it has a sidebar, so the column is not at the viewport edge);
   * mobile's gutter is the column.
   */
  inset: 16,
} as const;

/** The active pill's width for a measured label, so both clients round the
 *  same way. `labelWidth` is the text's own measured width. */
export const hubActiveWidth = (labelWidth: number): number =>
  Math.round(HUB_PILL.labelPadX * 2 + HUB_PILL.glyph + HUB_PILL.labelGap + Math.max(0, labelWidth));

/**
 * The three pills' target widths for a selection: the one you are IN carries
 * its word, the two siblings contract to their glyph.
 *
 * Shared because these numbers are consumed TWICE on iOS — once by the RN layer
 * that draws the marks and once by the SwiftUI layer that draws the glass under
 * them — and a dock whose glyphs and glass disagreed by a pixel would be worse
 * than one with no glass at all. `labelWidths` is keyed by tab id; a tab whose
 * label has not been measured yet stays at its glyph width, so the row is
 * never laid out against a guess.
 */
export function hubPillWidths(
  activeId: string,
  labelWidths: Readonly<Record<string, number>>,
  tabs: ReadonlyArray<{ id: string }>,
): number[] {
  return tabs.map((tab) => {
    const measured = tab.id === activeId ? labelWidths[tab.id] : undefined;
    return measured ? hubActiveWidth(measured) : HUB_PILL.siblingWidth;
  });
}

// ── Motion ───────────────────────────────────────────────────────────────────
// The dock runs on the app's SPRINGS (motion.ts), not on beziers of its own.
//
// This is not tidiness. On iOS the dock's glass is REAL SwiftUI — a
// GlassEffectContainer whose capsules morph natively — and SwiftUI animates in
// exactly this vocabulary (`.spring(response:dampingFraction:)`). Handing the
// native side the same two numbers the RN marks and the CSS pills integrate
// means the glass and the glyph riding on it are solving the SAME differential
// equation, frame for frame, instead of two hand-tuned curves that look alike
// at the endpoints and drift in the middle. A bezier could not be handed over
// at all: it carries no velocity, so it cannot be interrupted, and a dock you
// can flick back at any moment is nothing but interruptions.
//
// Three transitions, and no more:
//  - SPLIT/MERGE (reveal): the row arrives fused and springs apart; leaving, it
//    runs backwards. `springs.sheet` — arrival energy, no wobble.
//  - EXCHANGE: the pill you select inflates to its word as its sibling
//    contracts. `springs.lens` — the same spring the in-flow switcher's own
//    selection flies on, because it is the same gesture one layer up.
//  - CONCEAL: the row leaving is opacity and a short lift. Nothing positional
//    to interrupt, so a bezier is right, and it is FASTER than the arrival —
//    a control going away should not ask to be watched.

export const HUB_DOCK_SPRINGS = {
  /** SPLIT and MERGE — the gap opening and closing as the row comes and goes. */
  reveal: springs.sheet,
  /** EXCHANGE — one pill inflating to its word as another contracts. */
  exchange: springs.lens,
} as const satisfies Record<string, Spring>;

export type HubSpringKey = keyof typeof HUB_DOCK_SPRINGS;
export type HubMotionKey = HubSpringKey | "conceal";

export type Bezier = readonly [number, number, number, number];

/** One resolved transition, in every form the three renderers need. */
export interface HubMotion {
  /** Duration in ms — for a spring, its visual settle time. */
  ms: number;
  /** The spring to integrate, or null where the motion is opacity-only.
   *  Mobile feeds it to `springToRN`, iOS to `Animation.spring`. */
  spring: Spring | null;
  /** The same motion as a CSS easing — a sampled `linear()` for a spring. */
  css: string;
  /** The flat curves as control points, because React Native's `Easing` takes
   *  numbers where CSS takes a string. Null for springs (nothing to
   *  approximate) and for a linear ramp. */
  bezier: Bezier | null;
}

/** Read the control points back out of a CSS curve, so the ONE definition in
 *  motion.ts serves both clients rather than each keeping its own copy. */
function bezierOf(css: string): Bezier | null {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(css);
  if (!m) return null;
  const n = m[1]!.split(",").map((v) => Number(v.trim()));
  return n.length === 4 && n.every((v) => Number.isFinite(v)) ? (n as unknown as Bezier) : null;
}

/** Deriving a `linear()` easing walks the spring at 1ms steps; the dock asks
 *  for the same three on every render, so they are solved once. */
const MOTION_CACHE = new Map<string, HubMotion>();

/** One named transition, honouring reduced motion. */
export function hubMotion(key: HubMotionKey, reduced = false): HubMotion {
  const cacheKey = `${key}:${reduced}`;
  const hit = MOTION_CACHE.get(cacheKey);
  if (hit) return hit;

  // Reduce Motion is a SUBSTITUTION, not a deletion (motion.ts): every
  // transition becomes the same flat cross-dissolve. Clients additionally
  // render DOCK — one capsule, permanently on screen — because RETURN's whole
  // value is the motion, and a control that vanishes without one has simply
  // disappeared.
  const resolved: HubMotion = reduced
    ? { ms: durations.reduced, spring: null, css: "linear", bezier: null }
    : key === "conceal"
      ? { ms: durations.fast, spring: null, css: easings.exit, bezier: bezierOf(easings.exit) }
      : {
          ms: springDurationMs(HUB_DOCK_SPRINGS[key]),
          spring: HUB_DOCK_SPRINGS[key],
          css: springToCss(HUB_DOCK_SPRINGS[key]),
          bezier: null,
        };
  MOTION_CACHE.set(cacheKey, resolved);
  return resolved;
}
