/**
 * Set-focus model — the single source of truth (shared by BOTH clients) for the
 * live logger's "focus the next set, sunset the rest" treatment.
 *
 * When an exercise carries many sets, showing every row at equal weight is
 * noise. The logger instead lifts ONE set — the active set — and recedes the
 * others: banked sets read as quiet history, still-to-do sets as a faded plan.
 *
 * This is presentation state derived from the set list; it changes NO data.
 *
 * The two logging habits both fall out of one rule (see `addSetIsNext`):
 *  - plan-ahead lifter (queues empty sets up front): the active set sits above a
 *    faded queue, so "+ Add set" stays a quiet, secondary control.
 *  - one-at-a-time lifter (logs a set, then adds the next): nothing is queued
 *    below the active set, so "+ Add set" IS the next action and takes the
 *    prominent "ghost" affordance.
 */

/** A set, as far as focus is concerned — only its banked flag matters. */
export interface FocusableSet {
  done?: boolean;
}

/** How a single set row should read in the live logger. */
export type SetFocus =
  /** banked — quiet history, receded. */
  | "done"
  /** the first un-banked set — the hero, lifted onto glass. */
  | "active"
  /** an un-banked set after the active one — faded plan. */
  | "upcoming";

/**
 * The active set is the FIRST set that hasn't been banked yet — the next thing
 * the athlete does. Role (warm-up / cool-down / drop) doesn't change this: the
 * next incomplete set is the next set, whatever its type.
 *
 * Returns -1 when every set is banked (the exercise is complete).
 */
export function activeSetIndex(sets: readonly FocusableSet[]): number {
  return sets.findIndex((s) => !s.done);
}

/** Classify set `i` for the focus treatment (see `SetFocus`). */
export function setFocus(sets: readonly FocusableSet[], i: number): SetFocus {
  const active = activeSetIndex(sets);
  if (i === active) return "active";
  return sets[i]?.done ? "done" : "upcoming";
}

/**
 * Whether "+ Add set" should take the prominent "ghost / next" role rather than
 * a quiet secondary one. True when NOTHING is queued below the active set — the
 * one-at-a-time lifter, whose next move genuinely is to add a set:
 *  - every set is banked (nothing left to do → add the next), or
 *  - the active set is the last set (no faded plan sits beneath it).
 *
 * False for the plan-ahead lifter, who already has a queue of empty sets below
 * the active one — for them the next action is that queue, not the button.
 */
export function addSetIsNext(sets: readonly FocusableSet[]): boolean {
  if (sets.length === 0) return true;
  const active = activeSetIndex(sets);
  return active === -1 || active === sets.length - 1;
}
