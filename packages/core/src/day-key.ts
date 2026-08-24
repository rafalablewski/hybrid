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

/**
 * Local midnight for a day KEY — the inverse of `localDayKey`.
 *
 * A key is a calendar-date LABEL, so reading it back is not `Date.parse`:
 * `Date.parse("2026-08-17")` is UTC midnight, which is the previous day for
 * every athlete west of Greenwich. It exists because a key now travels as a
 * ROUTE PARAM (the week summary is `/week/2026-08-17`), and a screen that has
 * to turn one back into a moment must not each invent its own parse.
 *
 * `NaN` for anything that is not a well-formed key, so a caller can tell a
 * typo'd deep link from a real week.
 */
export const dayKeyMs = (key: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
};

/** Whole days from day-key `a` to day-key `b` (b − a). Pure label math. */
export const dayKeyDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY);

/**
 * Milliseconds from `now` until the next LOCAL midnight — i.e. how long the
 * current day key stays valid.
 *
 * "Today" is not a pure function of the data: a screen mounted at 23:59 is
 * showing yesterday one minute later, and phones sit backgrounded overnight far
 * more often than they're closed. Anything that renders a day-scoped claim
 * (today's check-in, today's prescription, the masthead date, the week rail's
 * anchor) has to re-derive when this elapses, not only when its data changes —
 * that's what `useToday()` on each client schedules against.
 *
 * DST-safe: it steps a whole local calendar day from local midnight, so the
 * 23- and 25-hour days land on midnight like every other day. Always ≥ 1 so a
 * caller can't schedule a zero-delay timer and spin.
 */
export const msUntilNextLocalDay = (now: number = Date.now()): number =>
  Math.max(1, addLocalDays(localMidnightMs(now), 1) - now);

/** Storage key for DECLARED REST DAYS — the athlete saying a day was for
 *  recovering. Shared so the clients and the synced-prefs allowlist name the
 *  same setting; it was a private const in the mobile store until these
 *  preferences started following the account. */
export const REST_DAYS_KEY = "hybrid.restDays.v1";
