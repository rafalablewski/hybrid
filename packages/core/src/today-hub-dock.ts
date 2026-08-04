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
//  clients cannot drift on when a pill appears (see today-hub-pills.tsx on
//  both clients).
// ============================================================

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
  /** Between pills, once they are free of the track. */
  gap: 10,
  /** The active pill's horizontal padding, and the space between its glyph and
   *  its word. */
  labelPadX: 14,
  labelGap: 8,
  /** Below the safe area (mobile) or the viewport top (web). */
  top: 8,
} as const;

/** The active pill's width for a measured label, so both clients round the
 *  same way. `labelWidth` is the text's own measured width. */
export const hubActiveWidth = (labelWidth: number): number =>
  Math.round(HUB_PILL.labelPadX * 2 + HUB_PILL.glyph + HUB_PILL.labelGap + Math.max(0, labelWidth));

// ── Motion ───────────────────────────────────────────────────────────────────
// Five named transitions and no others, in the shape the retired rail used
// (that part of it was right): everything arriving shares one curve, everything
// leaving is faster and flat, because a control going away should not ask to be
// watched.

export type Bezier = readonly [number, number, number, number];
export interface HubMotion { ms: number; bezier: Bezier }

export const HUB_DOCK_MOTION = {
  /** the track dissolves and the three segments spring apart. */
  split: { ms: 300, bezier: [0.34, 1.42, 0.64, 1] },
  /** the pills re-merge into the in-flow control at the top of the page. */
  merge: { ms: 240, bezier: [0.4, 0, 0.2, 1] },
  /** RETURN's answer to an upward flick: the row drops back in. */
  reveal: { ms: 220, bezier: [0.2, 0.8, 0.2, 1] },
  /** RETURN's answer to reading: the row leaves, flat and quick. */
  conceal: { ms: 180, bezier: [0.4, 0, 1, 1] },
  /** selection — the new pill inflates to its word as the old one contracts. */
  exchange: { ms: 300, bezier: [0.34, 1.42, 0.64, 1] },
} as const satisfies Record<string, HubMotion>;

export type HubDockMotionKey = keyof typeof HUB_DOCK_MOTION;

/** Under reduced motion every transition above collapses to this. */
export const HUB_DOCK_MOTION_REDUCED: HubMotion = { ms: 120, bezier: [0, 0, 1, 1] };

/** Between the two siblings as they leave the track, outward from the active
 *  pill — so the split reads as one object opening, not three appearing. */
export const HUB_DOCK_STAGGER = 40;

/** `cubic-bezier(…)` for a CSS transition. */
export const hubCurve = (m: HubMotion): string => `cubic-bezier(${m.bezier.join(",")})`;

/** One named motion's timing, honouring reduced motion. */
export function hubMotion(key: HubDockMotionKey, reduced = false): HubMotion {
  return reduced ? HUB_DOCK_MOTION_REDUCED : HUB_DOCK_MOTION[key];
}
