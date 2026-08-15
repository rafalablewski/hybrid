/**
 * THE TAP BUDGET — nothing in this app costs more than five.
 *
 * ── WHAT THIS FILE IS, AND WHAT IT IS NOT ─────────────────────────────────
 * It is a REGISTER, not a measurement. Nothing here reaches into a screen and
 * counts its buttons; a client cannot be instrumented from a pure package, and a
 * guard that pretended otherwise would be a ratchet counting its own answer —
 * the exact failure this codebase has already had to fix twice.
 *
 * What it does instead is make the count STATED and therefore arguable. A flow
 * that grows a step has to come here and write the step down, next to the number
 * it now breaks, in a file whose test fails at six. That is worth having for the
 * reason the design rules in CLAUDE.md are worth having: a limit nobody has
 * written down is a limit that is discovered afterwards, one screen at a time,
 * by somebody who is hungry and holding a bottle of kefir.
 *
 * ── HOW A TAP IS COUNTED ──────────────────────────────────────────────────
 * From the app's own root — the tab the athlete is standing on — to the outcome
 * being ON RECORD. That is the honest start: counting from halfway through a
 * flow is how every flow fits any budget.
 *
 *   A TAP IS      a press that changes what is on screen or commits something:
 *                 a tab, a row, a chip, a door, a menu row, the confirm.
 *   A HOLD IS     a tap. It is a press with a wait in it, and it puts a card on
 *                 screen; charging it as one and its chosen row as another is
 *                 the same arithmetic as any other two-step control.
 *   TYPING IS NOT a tap. A number keyed into a stepper, a name into a field: the
 *                 amount is the information the athlete came to give, and no
 *                 design can remove it. Counting keystrokes would make every
 *                 form fail identically and tell us nothing.
 *   SCROLLING IS  not a tap, and neither is a swipe. They cost nothing here and
 *                 they are not allowed to be the ONLY route to anything either —
 *                 see the swipe/hold pair on a saved food, where the hold is the
 *                 route that gets counted precisely because it is the visible
 *                 one.
 *
 * A step is written as what the athlete presses, not as what the code does.
 */

/** Five. The whole rule. */
export const TAP_BUDGET = 5;

export interface TapFlow {
  id: string;
  /** Where the count starts — a tab root, never mid-flow. */
  from: "today" | "nutrition";
  /** What the athlete is trying to do, in their words. */
  what: string;
  /** One entry per TAP, in order. */
  steps: string[];
  /** What the count deliberately excludes, when that is worth stating (typing
   *  an amount, a swipe that is the second route to the same thing). */
  note?: string;
}

export const tapCost = (f: TapFlow): number => f.steps.length;

/** Flows past the ceiling. Empty is the only acceptable answer. */
export const overBudget = (flows: readonly TapFlow[]): TapFlow[] =>
  flows.filter((f) => tapCost(f) > TAP_BUDGET);

/**
 * NUTRITION — the flows the food-logging redesign was measured against.
 *
 * Four of these used to be six or more. What the extra taps were spent on, in
 * every case, was asking a question the app already knew the answer to: which
 * unit a weight is in (the food states its own measure), how big the bottle is
 * (it was recorded when the food was saved), and whether a ⊕ on a saved food
 * means "log it" or "open something" (it means log it, on every list now).
 */
export const NUTRITION_TAP_FLOWS: readonly TapFlow[] = [
  {
    id: "log-recent",
    from: "today",
    what: "Log something I ate yesterday, the same way",
    steps: ["Nutrition tab", "Add to <meal>", "⊕ on the recent"],
  },
  {
    id: "log-saved-food",
    from: "today",
    what: "Log a saved food at the amount I usually eat",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "⊕ on the row"],
    note: "The ⊕ logs the athlete's LEARNED amount when they have one (core usualAmounts), which is why this is not the weighed flow below.",
  },
  {
    id: "log-whole-pack",
    from: "today",
    what: "Log the whole bottle",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "the pack chip on the row"],
    note: "Was six: the pack could only be reached by opening the portion editor, choosing the bottle on the unit switch and pressing Log.",
  },
  {
    id: "log-weighed",
    from: "today",
    what: "Log the 150 g I just put on the scale",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "the row", "Log"],
    note: "Typing 150 is not counted. Was six: the editor opened counting SERVINGS, so grams had to be chosen before a weight could be typed — it opens on the food's own measure now, which is the same portion in the unit the scale reads.",
  },
  {
    id: "delete-saved-food",
    from: "today",
    what: "Delete a saved food",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "hold the row", "Delete"],
    note: "The swipe is the same delete in fewer taps, and is deliberately not what gets counted: a gesture with nothing on screen saying it exists cannot be the route a budget is claimed on.",
  },
  {
    id: "edit-saved-food",
    from: "today",
    what: "Correct a saved food's numbers",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "hold the row", "Edit"],
    note: "Was six, and the door was inside the thing being corrected: the food had to be opened for LOGGING, then the form reached from the bottom of that sheet.",
  },
  {
    id: "forget-a-pack",
    from: "today",
    what: "Take a wrong pack size off a food",
    steps: ["Nutrition tab", "Add to <meal>", "Foods", "hold the pack", "Remove pack"],
    note: "Was impossible. Four sources could put a pack on a food and nothing could take one off.",
  },
  {
    id: "forget-a-recent",
    from: "today",
    what: "Forget a recent I logged by mistake",
    steps: ["Nutrition tab", "Add to <meal>", "hold the row", "Forget"],
    note: "Was impossible. The MRU was written on every log and never edited, so one mistyped entry sat at the top of the picker for the next twenty meals.",
  },
  {
    id: "create-food-with-pack",
    from: "today",
    what: "Save a new food and what the whole bottle is",
    steps: ["Nutrition tab", "Add to <meal>", "New food", "＋ Add a pack", "Save"],
    note: "Typing the name, the macros, the serving and the pack size is not counted. The unit defaults to grams, so the unit picker is not on the path.",
  },
] as const;

/** Every flow this app has written down. One list, so the guard cannot be
 *  satisfied by a second one nobody added to it. */
export const TAP_FLOWS: readonly TapFlow[] = NUTRITION_TAP_FLOWS;
