/**
 * DAY STAMP — what the corner of a week rail says about the day on screen.
 *
 * That slot used to print the absolute date ("Fri 31 Jul"). Directly above it
 * the rail draws the same day as a chip — the weekday over the day-of-month,
 * highlighted — so the stamp was a second, smaller copy of something the eye
 * had already read, three rows up. And on the done state it sat beside a
 * headline that says "All done for **today**", so it managed to repeat the
 * week strip AND the headline in five words.
 *
 * The rule here: the corner reports the day's DISTANCE FROM NOW, not its name,
 * and it never says something the card has already said.
 *
 *   • inside the near window → "Yesterday", "3 days ago", "In 2 days"
 *   • today, nothing logged  → "Today"
 *   • today, already trained → the RUN ("6-day streak") — the headline has
 *     covered "today", so the slot spends itself on the one thing the card
 *     can't otherwise show. A first day is not a streak: it stays silent.
 *   • further out than the window → the absolute date, which is genuinely the
 *     useful answer once "in nine days" stops meaning anything.
 *
 * Pure label math on YYYY-MM-DD keys (timezone-free, per day-key.ts), so web
 * and mobile stamp every rail identically.
 */
import { localTodayKey } from "./day-key";

const DAY = 86_400_000;

/** Day-NUMBER of a YYYY-MM-DD label — parsed as UTC midnight, so the gap
 *  between two labels is whole days regardless of the athlete's zone. */
const labelNum = (key: string) => Math.floor(Date.parse(`${key}T00:00:00.000Z`) / DAY);

/**
 * How far a day can sit from today and still be described in words. A week is
 * the horizon of "soon": beyond it "in nine days" is a puzzle and the date is
 * the answer.
 */
export const DAY_STAMP_WINDOW = 6;

/** A streak is only a streak once it has something to continue. */
const MIN_STREAK = 2;

export type DayStamp =
  /** an i18n key; `n` substitutes into its {n} placeholder (0 when it has none) */
  | { kind: "label"; labelKey: string; n: number }
  /** out of the window — render the absolute date */
  | { kind: "date" }
  /** the card already said it — render nothing */
  | { kind: "silent" };

/**
 * The stamp for one rail day.
 *
 * `done` marks a fulfilled/logged day (the plan rail's done status, the
 * logbook's logged day); `streakDays` is the athlete's current day-streak
 * (engines/habits `streak().current`) and is read only for a done TODAY.
 */
export function dayStamp(opts: {
  dateKey: string;
  /** defaults to the athlete's local today. */
  todayKey?: string;
  done?: boolean;
  streakDays?: number;
}): DayStamp {
  const { dateKey, done = false, streakDays = 0 } = opts;
  const here = labelNum(dateKey);
  const now = labelNum(opts.todayKey ?? localTodayKey());
  if (!Number.isFinite(here) || !Number.isFinite(now)) return { kind: "date" };
  const delta = here - now;

  if (delta === 0) {
    if (!done) return { kind: "label", labelKey: "w.home.rail.stampToday", n: 0 };
    return streakDays >= MIN_STREAK
      ? { kind: "label", labelKey: "w.home.rail.stampStreak", n: streakDays }
      : { kind: "silent" };
  }
  if (delta === -1) return { kind: "label", labelKey: "w.home.rail.stampYesterday", n: 1 };
  if (delta === 1) return { kind: "label", labelKey: "w.home.rail.stampTomorrow", n: 1 };
  if (delta < 0 && delta >= -DAY_STAMP_WINDOW)
    return { kind: "label", labelKey: "w.home.rail.stampDaysAgo", n: -delta };
  if (delta > 0 && delta <= DAY_STAMP_WINDOW)
    return { kind: "label", labelKey: "w.home.rail.stampInDays", n: delta };
  return { kind: "date" };
}

/**
 * Render a stamp. `date` is the absolute fallback the rails already compose
 * from the day ("Fri 31 Jul"); null means the corner draws nothing at all.
 */
export function dayStampText(
  stamp: DayStamp,
  t: (k: string) => string,
  date: string,
): string | null {
  if (stamp.kind === "silent") return null;
  if (stamp.kind === "date") return date;
  return t(stamp.labelKey).replace("{n}", String(stamp.n));
}
