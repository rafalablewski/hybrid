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

import type { DayBand, TrainingKind } from "./day-band";
import { ROLE_COLOR, type AccentKey } from "./semantic";
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

/**
 * WHAT A TRAINING KIND IS COLOURED, wherever a kind has to be drawn rather than
 * named — the logbook strip's load bars, chiefly.
 *
 * THREE COLOURS, NOT NINE, and the three are the distinction this app is about.
 * A hybrid athlete's week is bar work, engine work and their sport; the palette
 * already assigns those exact meanings (tokens.ts: lime is action and the bar,
 * blue is conditioning, amber is sport), so the strip inherits a vocabulary
 * rather than inventing one. Giving each of the six endurance disciplines its
 * own hue would need six accents the palette does not have, and would answer a
 * question — "was Tuesday a swim or a row?" — that the day's own row answers in
 * words a tap away.
 */
export function kindHue(kind: TrainingKind): AccentKey {
  if (kind === "gym") return "lime";
  if (kind === "sport") return "amber";
  return "blue";
}

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
  streak: { top: 1, size: fs.nano, tracking: tracking.label },
  /** The initials in the avatar tile. A rung under the header's `fs.note`. */
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
