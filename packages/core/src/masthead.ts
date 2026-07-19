/**
 * Living masthead — names the Today screen's viewed day.
 *
 * The home masthead leads with one big word ("Today") instead of a second
 * bold headline competing with the greeting. When the athlete scrubs the
 * plan week rail to another day, a static "Today" over Friday's session
 * would lie in the largest type on the screen — so the headline LIVES:
 *
 * - viewed day = today      → "today"      (i18n mastToday)
 * - one day back / out      → "yesterday" / "tomorrow"
 * - beyond ±1 calendar day  → "weekday" — the client renders the viewed
 *   date's weekday NAME ("Friday"), never a relative phrase ("2 days ago"
 *   is clumsy as a headline and inflects badly in PL/DE); the distance
 *   rides the caption line as a small meta tag instead (daysBack/daysOut).
 *
 * Shared here so web + mobile cannot drift on the naming rule.
 */

import { localDayKey, dayKeyDiff } from "./day-key";

export type MastheadKind = "today" | "yesterday" | "tomorrow" | "weekday";

export interface Masthead {
  kind: MastheadKind;
  /** Whole LOCAL calendar days from today to the viewed day (negative = past, 0 = today). */
  diffDays: number;
}

/** Name the viewed day. `viewedTs` undefined/null = today (the un-scrubbed screen). */
export function masthead(viewedTs?: number | null, now: number | Date = Date.now()): Masthead {
  const diffDays = viewedTs == null ? 0 : dayKeyDiff(localDayKey(now), localDayKey(viewedTs));
  const kind: MastheadKind =
    diffDays === 0 ? "today" : diffDays === -1 ? "yesterday" : diffDays === 1 ? "tomorrow" : "weekday";
  return { kind, diffDays };
}
