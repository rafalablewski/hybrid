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
 * Three things read this: the field's compression, the bar's latch, and the
 * band preview in the admin panel. When the thresholds lived in the screen the
 * bar could arrive before the field had finished leaving, which reads as two
 * headers on screen at once — so they are one exported object with the
 * arithmetic stated below.
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
 * Rungs 3 and 4 refuse a fill (see day-band.ts): a filled field is a call to
 * act, and those two tell the athlete not to train. They still have a subject,
 * though, and the subject has a colour in the palette already: a calendar fact
 * is `amber` (sport / plan / caution), recovery is `blue` (conditioning / feel),
 * and a day already trained is `lime` (the "done" green the tonnage wears).
 * `done` is listed although its unrated case DOES take a fill — the rated case
 * does not, and both must resolve.
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
 * The FIELD still washes this at `ALPHA.solid` on a reporting rung and fills at
 * full strength on an acting one. The BAR is always solid: at 46dp it is a
 * label, not a call to act, so it carries the colour concentrated rather than
 * diluted. Returns null only for the empty band, which draws nothing at all.
 */
export function bandHue(band: Pick<DayBand, "fill" | "rung">): AccentKey | null {
  if (band.rung === "none") return null;
  if (band.fill) return ROLE_COLOR[band.fill];
  return REPORT_HUE[band.rung] ?? "blue";
}
