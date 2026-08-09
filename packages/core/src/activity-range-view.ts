/**
 * THE DATE FILTER'S VIEW MODEL — the words a range control and the block heads
 * under it print, in one place, because there is more than one of them.
 *
 * The filter was written inside the This-week verdict card, and its two clients
 * each kept their own copy of how a period names itself and which days its span
 * covers. That was already two copies. Splitting Today's retrospective into
 * PROGRESS and ENDURANCE — each carrying the control — would have made it four,
 * and four copies is how "last 30 days" ends up meaning two different windows
 * on one screen.
 *
 * It is deliberately SMALL. It used to also carry a segment list, a short-label
 * map and the "which segment is lit" arithmetic, for a five-segment bar that
 * sat under the verdict card's head — three levels below the clusters it
 * actually scoped. The control is a chip on the cluster's headline row now,
 * opening the period sheet it always had, so the segments and everything that
 * described them are gone.
 *
 * What stays with the client is the part that genuinely is a client concern:
 * the LOCALE-formatted month name (Intl lives in the app, not in core) and the
 * storage of the athlete's choice.
 *
 * Nothing here computes training. It is the filter's vocabulary, and every
 * figure it filters still comes from activity-window.ts.
 */
import type { ActivityRange } from "./activity-window";

/**
 * TODAY HAS ONE PERIOD, and this is its key.
 *
 * Both retrospective sections carry a filter — Progress above its verdict card,
 * Endurance above its summary — and they are the SAME filter shown twice, not
 * two of them. The first cut gave each its own key on the reasoning that a
 * control belongs to the card it sits above; what that actually produced was a
 * screen where "Last 30 days" could mean two different windows at once, with
 * the second control a scroll away from the first and no way to see the
 * disagreement. A reader who sets 30 days at the top means the retrospective,
 * not the paragraph.
 *
 * The clients hold this in a store keyed by this string, so every block reading
 * it moves together the moment any one of them is scrubbed — not merely on the
 * next launch, which is all a shared storage key alone would buy.
 *
 * It stays a PARAMETER on the clients' `useActivityRange` rather than being
 * baked in: a future period-scoped block that genuinely is its own scope (a
 * screen of its own, a sheet) can pass a different key and be independent by
 * saying so. Today's two blocks are not that, and pass this.
 */
export const TODAY_RANGE_STORE_KEY = "hybrid.today.range";

/** i18n key for the block head's title. Null for a month, which the client
 *  formats from `range.id` through its own locale. */
export const activityRangeTitleKey = (range: ActivityRange): string | null =>
  range.kind === "month" ? null : (range.labelKey ?? "w.home.act.rWeek");

/**
 * The last day the head's span should NAME, as a timestamp.
 *
 * A year-to-date span ends TODAY; a week or a month shows its whole frame, so
 * "Mon 27 – Sun 2" says which seven days the card means even on Tuesday.
 */
export const activityRangeSpanEnd = (range: ActivityRange): number =>
  (range.kind === "ytd" ? range.through : range.to) - 1;
