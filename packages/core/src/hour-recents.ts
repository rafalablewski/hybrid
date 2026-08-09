/**
 * WHAT YOU EAT AT THIS HOUR.
 *
 * The picker used to open on a blank field at 21:12 with the meal already set
 * to Snacks — asking a question it mostly knew the answer to. An athlete does
 * not eat a database at 21:12; they eat one of about four things, and the app
 * has watched them do it for months.
 *
 * ── IT IS MEMORY, NOT PREDICTION ──────────────────────────────────────────
 * This is a count of what actually happened, ranked, with the count kept so the
 * screen can SAY why a row is near the top ("9× at this hour"). Nothing is
 * modelled, nothing is smoothed, and a food with too little history simply does
 * not qualify — the list then falls back to the plain recents order rather than
 * dressing up a single coincidence as a habit.
 *
 * ── THE DATA ALREADY EXISTS ───────────────────────────────────────────────
 * The recents MRU is a per-device list of (food, serving) pairs, and every log
 * writes to it. All this adds is WHEN: a capped list of timestamps per entry.
 * No model, no network, no schema change — and because an MRU key is the food
 * PLUS its serving, an entry already carries the portion it was last logged at,
 * which is what makes one-tap re-logging honest.
 *
 * ── THE WINDOW IS CIRCULAR ────────────────────────────────────────────────
 * 23:45 and 00:15 are half an hour apart, not twenty-three and a half hours.
 * A late-night snack must not fall out of its own habit because the clock
 * happened to roll over.
 *
 * Pure + unit-tested, and shared, so the phone and the browser rank the hour
 * the same way (parity rule).
 */

import { localDayKey } from "./day-key";

/** How many timestamps an entry keeps. Enough to see a habit across a couple of
 *  months of a food eaten most days, small enough to stay a per-device list. */
export const HOUR_LOG_CAP = 40;

/** Anything the picker can rank by hour — the recents MRU entry, in practice. */
export interface HourLogged {
  /** epoch ms of each time this exact (food, serving) was logged, oldest first */
  logs?: number[] | null;
}

/**
 * Record that this entry was logged now.
 *
 * Appends rather than replaces, and caps from the FRONT so the oldest stamps
 * fall off — a habit is what you have been doing lately, and an entry that kept
 * every stamp forever would let a routine you abandoned in March outrank one you
 * started last week.
 */
export function recordLog(logs: number[] | null | undefined, at: number, cap = HOUR_LOG_CAP): number[] {
  const next = [...(logs ?? []).filter((n) => Number.isFinite(n)), at];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Minutes since local midnight. */
const minutesOfDay = (ms: number): number => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** Distance between two times of day, the short way round the clock. */
export const clockDistance = (aMinutes: number, bMinutes: number): number => {
  const raw = Math.abs(aMinutes - bMinutes) % 1440;
  return Math.min(raw, 1440 - raw);
};

export interface UsualOptions {
  /** how far either side of now still counts as "this hour" */
  windowMinutes?: number;
  /** how many distinct DAYS inside that window before this counts as a habit.
   *  Two, because once is a coincidence. */
  minDays?: number;
  /** how many to surface — this is a greeting, not a search result */
  limit?: number;
}

export interface UsualHit<T> {
  item: T;
  /** distinct days this was logged inside the window — the figure the row shows */
  days: number;
  /** total logs inside the window (days ≤ hits) */
  hits: number;
}

/**
 * What this athlete usually eats at the given time of day.
 *
 * Ranked by DISTINCT DAYS first and total logs second: something eaten once a
 * day for nine days is a stronger habit than something eaten nine times in one
 * evening, and the row's own label says "days" for exactly that reason. Ties
 * break on recency, which is also the order the caller's list already carries.
 *
 * Returns an empty array when nothing qualifies — a cold start, a new hour, or
 * an athlete who simply eats differently every day. The caller falls back to the
 * plain recents order and says nothing, rather than showing a "habit" of one.
 */
export function usualAtHour<T extends HourLogged>(
  items: readonly T[],
  now: number,
  opts: UsualOptions = {},
): UsualHit<T>[] {
  const windowMinutes = opts.windowMinutes ?? 90;
  const minDays = opts.minDays ?? 2;
  const limit = opts.limit ?? 4;
  const target = minutesOfDay(now);

  const hits: (UsualHit<T> & { last: number; order: number })[] = [];
  items.forEach((item, order) => {
    const logs = (item.logs ?? []).filter((n) => Number.isFinite(n));
    if (!logs.length) return;
    const inWindow = logs.filter((ms) => clockDistance(minutesOfDay(ms), target) <= windowMinutes);
    if (!inWindow.length) return;
    const days = new Set(inWindow.map((ms) => localDayKey(ms))).size;
    if (days < minDays) return;
    hits.push({ item, days, hits: inWindow.length, last: Math.max(...inWindow), order });
  });

  hits.sort((a, b) =>
    b.days - a.days ||
    b.hits - a.hits ||
    b.last - a.last ||
    a.order - b.order);

  return hits.slice(0, limit).map(({ item, days, hits: n }) => ({ item, days, hits: n }));
}
