/**
 * THE FOLD — what happens to the day field when Today is scrolled, and what
 * colour the bar that replaces it takes.
 *
 * The day field (aurora/day-band.tsx) is the whole top of Today: the status
 * inset, the avatar, the wordmark, the streak, the hub pills, the date, the
 * title, the score and the instruction, on one coloured ground. That is the
 * right shape for the top of the screen and the wrong shape for the rest of it,
 * so scrolling FOLDS it: the field compresses and fades from the bottom up, and
 * the app's own row — avatar, wordmark, streak, bell — arrives as a floating
 * bar in the day's colour, solid.
 *
 * ── THE NUMBERS LIVE HERE, NOT IN THE SCREEN ─────────────────────────────
 * Two things read this: the field's compression and the bar's latch. When the
 * thresholds lived in the screen the bar could arrive before the field had
 * finished leaving, which reads as two headers on screen at once — so they are
 * one exported object with the arithmetic stated below.
 *
 * ── WHY THE BAR IS NEVER GLASS ───────────────────────────────────────────
 * A blur is worth its cost over content worth blurring. Today is a near-black
 * page of flat dark cards: `ink` under `ink2` at 1.22:1, with nothing behind
 * the bar for a blur to resolve. Tinted glass there returns roughly the colour
 * it was given, at full GPU cost, and lands as a slightly murky solid — so the
 * bar IS a solid, in the day's own hue, and the material never changes with the
 * rung. Only the colour does. (A future three-pill fused variant would need
 * real glass and a native module; that is a different change with its own
 * argument, not a default to drift into.)
 */

import type { DayBand } from "./day-band";
import { ROLE_COLOR, type AccentKey } from "./semantic";
import { smoothstep } from "./contrast";
import { fs, space, tracking } from "./scale";
import { APP_HEADER } from "./app-header";

/**
 * THE FOLD'S THRESHOLDS, in dp of scroll offset.
 *
 * `start`→`end` is the compression: 76dp, a little over two rows of the field,
 * which is long enough that a flick does not skip it and short enough that a
 * deliberate scroll clears it in one gesture.
 *
 * `barIn`/`barOut` are DELIBERATELY NOT THE SAME NUMBER. A single threshold
 * strobes the bar on and off while a finger rests across it — the most
 * expensive-looking bug a header can have — so the bar arrives at `barIn` and
 * only leaves once the offset falls back past `barOut`, 36dp lower.
 */
export const FOLD = {
  /** Nothing happens below this — the field is at rest. */
  start: 56,
  /** Fully folded: the field's content has gone. */
  end: 132,
  /** Scrolling DOWN past this mounts the bar. */
  barIn: 132,
  /** Scrolling UP past this dismisses it. Lower than `barIn`, on purpose. */
  barOut: 96,
} as const;

/** How far the field's own rows travel up as they fade, in dp. Ordered as they
 *  sit, so the head of the field leaves first and the instruction last — the
 *  opposite order would peel the day's answer off the screen before its
 *  question. */
export const FOLD_RISE = { chrome: -10, hub: -14, date: -18, title: -22 } as const;

/** 0 at rest, 1 fully folded. The one place the ramp is computed. */
export function foldProgress(offsetY: number): number {
  const p = (offsetY - FOLD.start) / (FOLD.end - FOLD.start);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Whether the bar should be up, given where it is now — the hysteresis latch.
 * Pass the CURRENT state back in; it is what makes the two thresholds work.
 */
export function barLatched(offsetY: number, wasLatched: boolean): boolean {
  return wasLatched ? offsetY > FOLD.barOut : offsetY > FOLD.barIn;
}

/**
 * THE HUE OF A REPORTING RUNG — the colour of what the rung is ABOUT.
 *
 * A reporting rung returns `fill: null` (see day-band.ts): those rungs tell the
 * athlete NOT to train, so they take no colour of action. They still have a
 * SUBJECT, though, and the subject has a colour in the palette already: a
 * calendar fact is `amber` (sport / plan / caution), recovery is `blue`
 * (conditioning / feel), and a day already trained is `lime` (the "done" green
 * the tonnage wears). `done` is listed although its unrated case DOES ask for
 * something — the rated case does not, and both must resolve.
 */
const REPORT_HUE: Partial<Record<DayBand["rung"], AccentKey>> = {
  protect: "amber",
  rest: "blue",
  done: "lime",
};

/**
 * The day's colour, whatever the rung. Two sources, one answer:
 *  - a rung that ASKS you to train takes the reading's own role, so the bar and
 *    the ring cannot disagree about how the day scored;
 *  - a rung that REPORTS takes the hue of its subject, above.
 *
 * WHAT THE SURFACES DO WITH IT DIFFERS, and no longer by rung. The FIELD washes
 * it at one strength whatever the rung (`BAND_WASH`) — it is one material, so
 * it has no join and no second state; whether the rung is asking is carried by
 * the READING instead, which lights in this hue on an acting rung and stays
 * held-back ink on a reporting one. The BAR is always solid: at 46dp it is a
 * label, and a floating capsule above the content is allowed to be its own
 * material. Returns null only for the empty band, which draws nothing at all.
 */
export function bandHue(band: Pick<DayBand, "fill" | "rung">): AccentKey | null {
  if (band.rung === "none") return null;
  if (band.fill) return ROLE_COLOR[band.fill];
  return REPORT_HUE[band.rung] ?? "blue";
}

/**
 * THE BAND ENDS BECAUSE THE COLOUR ENDS — the ramp, and the rule it replaces.
 *
 * The quiet band used to be a FLAT wash (`ALPHA.solid`, 0.16) with a 1px rule
 * drawn across its bottom edge. Both halves of that were wrong.
 *
 * A HAIRLINE SEPARATES TWO SURFACES THAT BOTH CONTINUE. Here the surface stops,
 * so the line had nothing on its far side to belong to — and at
 * `ALPHA.line` over amber it composited to `#503f12`, a warm rule at roughly
 * three times the page ground's luminance, run edge to edge under the tallest
 * object on the screen. It read as a rendering fault, which is what it was.
 *
 * AND A FLAT 16% OF A SATURATED WARM ACCENT OVER NEAR-BLACK IS MUD. It lands at
 * L* ≈ 15 with its chroma still attached: enough colour to be noticed, not
 * enough lightness to be a surface. Not amber — a stain.
 *
 * So the band is a RAMP now. Four stops, and the last one is fully transparent,
 * which means the band resolves to whatever the screen's own ground is rather
 * than to a hardcoded copy of it. There is no border at any stop. Because the
 * bottom dissolves, the top can afford MORE colour than the flat wash carried
 * (0.20 against 0.16) — so the band reads as more of its hue and less of an
 * edge at the same time.
 */
/** How many stops a band's ramp is drawn with. The stops define the CURVE, not
 *  the smoothness — a renderer interpolates between them either way — so this
 *  is "how closely does the straight line between stops follow the ease", and
 *  nine is where that error stops being visible at these distances. */
export const BAND_RAMP_STOPS = 9;

/** The tint the quiet band carries where its content sits. Higher than the flat
 *  wash it replaced (0.16) precisely because the bottom now dissolves: the band
 *  can be more of its hue and less of an edge at the same time. */
export const BAND_WASH_TOP = 0.2;

/**
 * THE QUIET BAND'S RAMP, as tint alphas over the page ground.
 *
 * Alphas rather than colours because the last stop must be genuinely
 * TRANSPARENT: the band then resolves to whatever the screen's own ground is
 * rather than to a hardcoded copy of it, which is the trick that let the
 * hairline go.
 *
 * EASED, not linear. A linear ramp has a discontinuous first derivative at both
 * ends, so the eye finds the corner where the field stops being solid — the
 * crease. `smoothstep` holds the tint where the CONTENT is, then dissolves.
 */
export const BAND_WASH: readonly { at: number; alpha: number }[] = Array.from(
  { length: BAND_RAMP_STOPS },
  (_, i) => {
    const at = i / (BAND_RAMP_STOPS - 1);
    return { at, alpha: Number((BAND_WASH_TOP * (1 - smoothstep(at))).toFixed(4)) };
  },
);

/**
 * THERE IS ONE MATERIAL, WHICH IS WHY NOTHING HERE DESCRIBES AN EDGE.
 *
 * The band is a wash of the day's hue over the page ground, every rung, one
 * strength — the top OF the screen rather than a panel ON it. It has no border,
 * no foot and no second state, because it never meets anything.
 *
 * IT TOOK FOUR ATTEMPTS TO GET THERE and the discarded three are worth keeping,
 * because each looked right until it was measured. (1) A 1px rule across the
 * bottom: a hairline separates two surfaces that BOTH continue, and here one of
 * them stopped. (2) A 26dp scrim fading the accent into the page: a crease
 * where the solid stopped, and a stripe of mud. (3) The same eased over 46dp in
 * OKLab: a better-shaped stripe. (4) A crisp edge, on the argument that a
 * coloured field ending at an edge is not a seam.
 *
 * ALL FOUR WERE FINISHES ON A JOIN. The join existed because the acting rungs
 * were a solid slab of accent resting on a near-black page, and no finish makes
 * Wild Lime meet #0c0d0c invisibly: the midpoint of that journey is a dark
 * olive in EVERY colour space, so a fade does not soften the edge, it replaces
 * a clean one with a visible stripe. Taking the second material away is what
 * made the question stop needing an answer.
 *
 * `BAND_WASH` is eased for the same family of reason at the other end: a linear
 * ramp drops from the first pixel, so the eye finds the corner where the tint
 * begins. It holds where the CONTENT is, then dissolves.
 */

/**
 * THE HOLD-BACK LADDER for a band's secondary lines — the steps `inkHold()`
 * chooses from, most held back first.
 *
 * Ordered, not free: a component that can pick any alpha picks a different one
 * each time it is edited. Four steps is enough range for a dark ground to be
 * properly quiet and few enough that the band's tones stay a set.
 */
export const BAND_HOLD = [0.54, 0.62, 0.68, 0.78] as const;

/**
 * THE DAY BAR'S GEOMETRY — the app header's own row, compressed.
 *
 * It is deliberately DERIVED from `APP_HEADER` rather than typed fresh: the bar
 * is not a second header, it is the same three-column row (avatar, lockup,
 * bell) at the size a floating capsule can carry. Deriving it means a change to
 * the header's tile or badge cannot leave the folded version behind, which is
 * exactly how the two copies of that row drifted the last time they existed
 * separately.
 *
 * `clearance` is the extra distance the bar sits above the screen edge when it
 * is away. Without it, translating by the bar's own height alone leaves its
 * bottom edge exactly at the inset — a visible sliver of capsule parked at the
 * top of the screen, which reads as a rendering fault rather than a design.
 */
export const DAY_BAR = {
  /** Both flanks. Two rungs under the header's 44, which is what lets the row
   *  sit inside a 46dp capsule with its own padding. */
  tile: { size: 30, radius: 10 },
  /** The capsule's own height. tile + 2 × padY. */
  height: 46,
  /** In from the screen's left and right edges. */
  inset: space.ms,
  /** Below the safe-area inset. */
  top: space.sm,
  padX: space.ms,
  padY: space.sm,
  gap: space.ms,
  /** A rung under the header's 19 — still unmistakably the wordmark. */
  wordmark: { size: fs.bodyLg, tracking: APP_HEADER.wordmark.tracking },
  streak: { top: 1, size: fs.nano, tracking: tracking(fs.nano, "label") },
  /** The initials in the avatar tile. A rung under the header's `fs.bodyLg`. */
  initials: fs.body,
  /** The bell. Two under the header's 20, to sit inside a 30dp tile. */
  icon: 18,
  badge: { size: 16, inset: -4, ring: 1.5, text: fs.nano, padX: space.xxs / 2 },
  /** How far the held-back ink sits behind the full ink — the bell and the
   *  streak against the wordmark. The same 0.78 the day field's own second
   *  tone uses, so the two rows hold their hierarchy identically. */
  softInk: 0.78,
  clearance: space.lg,
} as const;

/** How far the bar sits above its resting place while it is away. */
export const DAY_BAR_AWAY = -(DAY_BAR.height + DAY_BAR.top + DAY_BAR.clearance);
