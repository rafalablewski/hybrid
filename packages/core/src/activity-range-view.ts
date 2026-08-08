/**
 * THE DATE FILTER'S VIEW MODEL — everything a range control needs to draw
 * itself, in one place, because there is now more than one of them.
 *
 * The segmented control (Week / 7 days / 30 days / YTD / a month) was written
 * inside the This-week verdict card, and its two clients each kept their own
 * copy of the segment list, the short-label map, the "which segment is lit"
 * arithmetic and the span-end rule. That was already two copies of one control.
 * Splitting Today's retrospective into PROGRESS and ENDURANCE — each with its
 * own period — would have made it four, and four copies of a control is how
 * "last 30 days" ends up meaning two different windows on one screen.
 *
 * So the shape of the control lives here and the clients only render it. What
 * stays with the client is the part that genuinely is a client concern: the
 * LOCALE-formatted month name (Intl lives in the app, not in core) and the
 * storage of the athlete's choice.
 *
 * Nothing here computes training. It is the filter's geometry, and every figure
 * it filters still comes from activity-window.ts.
 */
import { ACTIVITY_RANGE_PRESETS, type ActivityRange } from "./activity-window";

/**
 * The segment labels are SHORTER than the card's own title for the same period
 * ("7 days" under a card headed "Last 7 days") — a segmented control that wraps
 * is a segmented control that has stopped being one.
 */
export const ACTIVITY_RANGE_SHORT_KEY: Record<string, string> = {
  week: "w.home.act.sWeek", d7: "w.home.act.sD7", d30: "w.home.act.sD30", ytd: "w.home.act.sYtd",
};

/** The trailing segment, which opens the month sheet rather than selecting. */
export const MONTH_SEGMENT_ID = "month";

export interface ActivityRangeSegment {
  /** Preset id, or MONTH_SEGMENT_ID for the trailing one. */
  id: string;
  /** i18n key for the label. Null on the month segment while a month is in
   *  force — there the client prints the localized month name instead. */
  labelKey: string | null;
  /** True for the trailing segment: it INTERCEPTS to the picker sheet instead
   *  of selecting, and carries the ▾ that says so. */
  isMonth: boolean;
  /** The month id ("m:2026-07") the segment should print, when one is in
   *  force. Null otherwise. */
  monthId: string | null;
}

/** The control's segments, in filter order: the presets, then the month. */
export function activityRangeSegments(range: ActivityRange): ActivityRangeSegment[] {
  const onMonth = range.kind === "month";
  return [
    ...ACTIVITY_RANGE_PRESETS.map((p) => ({
      id: p.id,
      labelKey: ACTIVITY_RANGE_SHORT_KEY[p.id] ?? p.labelKey,
      isMonth: false,
      monthId: null,
    })),
    {
      id: MONTH_SEGMENT_ID,
      labelKey: onMonth ? null : "w.home.act.sMonth",
      isMonth: true,
      monthId: onMonth ? range.id : null,
    },
  ];
}

/** Which segment the thumb rests on. The month segment only takes it once a
 *  month is actually in force — opening the picker and dismissing it must not
 *  leave the pill somewhere the card isn't. */
export function activityRangeSegIndex(range: ActivityRange, segments: ActivityRangeSegment[]): number {
  if (range.kind === "month") return segments.length - 1;
  return Math.max(0, segments.findIndex((s) => s.id === range.id));
}

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
