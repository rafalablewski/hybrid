/**
 * Local day keys — the app's canonical calendar-day convention.
 *
 * A training day is the athlete's LOCAL calendar day: a session logged at
 * 23:30 belongs to that evening's date, not to the UTC date it can roll into.
 * Every day-grouping surface (calendar heat-grid, history views, streaks,
 * daily checklist, nutrition days, recap, plan schedule) keys through these
 * helpers so the whole app agrees on what "today" and "that day" mean.
 *
 * Keys are plain YYYY-MM-DD calendar-date LABELS. When two labels need
 * arithmetic (whole days between them), parse them as UTC midnights — label
 * math is timezone-free. Day iteration goes through `addLocalDays`, which
 * steps by calendar days (a local day may be 23 or 25 hours across DST).
 */

const DAY = 86_400_000;

/** The LOCAL calendar-day key (YYYY-MM-DD) for a timestamp / ISO string / Date. */
export const localDayKey = (input: string | number | Date): string => {
  const d = new Date(input);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Today's local day key. */
export const localTodayKey = (now: number | Date = Date.now()): string => localDayKey(now);

/** Local midnight (start of the local calendar day) for a timestamp. */
export const localMidnightMs = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Add whole LOCAL calendar days, preserving the clock time (DST-safe —
 *  midnight in → midnight out, even across a 23/25-hour day). */
export const addLocalDays = (ms: number, n: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
};

/** Local midnight of the Monday of the week containing `ms`. */
export const localMondayMs = (ms: number): number => {
  const mid = localMidnightMs(ms);
  const dow = (new Date(mid).getDay() + 6) % 7; // 0 = Monday
  return addLocalDays(mid, -dow);
};

/** Whole days from day-key `a` to day-key `b` (b − a). Pure label math. */
export const dayKeyDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY);
