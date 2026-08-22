/**
 * THE GOAL, AS ONE VALUE.
 *
 * `Macrocycle.goal` used to hold the goal's DISPLAY NAME, because that is what
 * both enrolment paths sent: `enrollPlan(goal.name, plan.id)` from the plans
 * screen and `plan.goalLabel` from onboarding. The goal tree's stable ids —
 * `power`, `oly`, `hybrid`, `run` — never left the client.
 *
 * That had three consequences, and they compound:
 *
 *  1. `MODEL_FOR` in engines/periodization.ts is a lookup keyed by those names,
 *     and it had drifted to a vocabulary the goal tree replaced. Seven of
 *     nineteen goals matched. The flagship one did not: the map says `Hybrid`,
 *     the goal is called `Hybrid Athlete`, so the athlete the app is named for
 *     fell through to the default. A rename or a translation would have moved
 *     any of the other six the same way, silently, on the next enrolment.
 *  2. The column cannot be joined, counted or grouped meaningfully — the admin
 *     stats page groups by it, so a renamed goal splits into two bars.
 *  3. Nothing validated the write, so the column is the union of every string
 *     any client version ever sent.
 *
 * So ids are what gets STORED now, and this module is the one place that knows
 * how to get from whatever a row actually holds to either representation.
 *
 * IT MUST STAY TOLERANT OF BOTH, permanently — not as a migration window:
 *  - Rows written before this change hold display names, and there is no
 *    backfill on a database the deploy cannot reach (reference/sql-macrocycle-
 *    goal-id.sql normalises them when the operator chooses to run it).
 *  - An older app build still sends a name. The server normalises on write, so
 *    those rows land as ids without the client changing.
 *  - COACH-AUTHORED GOALS ARE FREE TEXT. /api/coach/links/[id]/macrocycle takes
 *    whatever a coach types, and that is deliberate — a coach writing "Return
 *    from ACL, phase 2" is not choosing from a library. An unrecognised value is
 *    therefore NOT an error and must never be dropped: it passes through both
 *    directions unchanged and displays as written.
 */

import { GOAL_TREE } from "./plans";

/** id → display name, for every goal in the library. */
const NAME_BY_ID: Record<string, string> = Object.fromEntries(
  GOAL_TREE.map((g) => [g.id, g.name]),
);

/** lower-cased display name → id. Lower-cased because the value being resolved
 *  may have come from an old client, a coach's typing, or a hand-run SQL. */
const ID_BY_NAME: Record<string, string> = Object.fromEntries(
  GOAL_TREE.map((g) => [g.name.toLowerCase(), g.id]),
);

/**
 * The canonical goal id for whatever a caller holds — an id already, or a
 * display name from before ids were stored.
 *
 * Returns null for anything the library does not know, which is the signal to
 * pass the value through as free text rather than to reject it.
 */
export function resolveGoalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (NAME_BY_ID[v]) return v;
  return ID_BY_NAME[v.toLowerCase()] ?? null;
}

/**
 * What to STORE for a given goal value: its id when the library knows it, and
 * otherwise the trimmed value exactly as given (a coach's free-text goal).
 *
 * Every write path runs through this, so a client that still sends a name lands
 * an id in the column without shipping a new build.
 */
export const goalIdToStore = (value: string): string => resolveGoalId(value) ?? value.trim();

/**
 * What to SHOW for a stored goal value: the library's display name when it is
 * recognised, and otherwise the value itself.
 *
 * Read every surface that prints a goal through this. It is what lets an old
 * row holding "Hybrid Athlete" and a new row holding "hybrid" render the same
 * words, and it is what will make the goal translatable later without touching
 * any of the rows.
 */
export function goalLabel(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  const id = resolveGoalId(v);
  return id ? NAME_BY_ID[id]! : v;
}

/** Whether the value names a goal the plan library actually carries — i.e.
 *  whether the engines can be expected to have a model for it. */
export const isLibraryGoal = (value: string | null | undefined): boolean =>
  resolveGoalId(value) !== null;
