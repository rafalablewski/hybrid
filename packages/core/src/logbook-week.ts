import { localDayKey, localMidnightMs, addLocalDays } from "./day-key";
import type { LoggedSession } from "./engines/session";
import type { DoneReceipt } from "./done-receipt";

// ============================================================
//  Logbook week — the plan-less athlete's week rail ("The Constant").
//
//  A free logger with no enrolled program used to see the first-run chooser
//  forever: five workouts by Friday and still no calendar. This engine gives
//  that athlete the SAME week-rail object plan users get, in LOGBOOK MODE —
//  the last seven local calendar days ending today, each day reconciled
//  against the logged sessions. A logbook makes no promises, so there is no
//  "missed" state: a day either holds training (✓, chalk) or it stays quiet
//  greyscale — never terracotta guilt.
//
//  Pure and client-agnostic: web + mobile render the same rail from the same
//  result (mirrors plan-schedule.ts, which owns the enrolled variant).
// ============================================================

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Days the logbook rail shows at once — the trailing window ending today. */
export const LOGBOOK_WINDOW = 7;

/** One calendar day of the logbook rail. Field names match ScheduledDay so the
 *  Today screen can scope its day-following cards (Also-today / feeling) to a
 *  lifted day from EITHER rail without caring which one it came from. */
export interface LogbookDay {
  /** position in the window (0-based; the last entry is today). */
  index: number;
  /** local yyyy-mm-dd. */
  dateKey: string;
  /** local-midnight timestamp. */
  ts: number;
  weekdayShort: string; // "Mon"
  dayOfMonth: number; // 13
  monthShort: string; // "Jul"
  isToday: boolean;
  /** ids of the sessions logged on this local day, in logged order. */
  sessionIds: string[];
  /** ≥1 session logged on this day. */
  logged: boolean;
}

export interface LogbookWeekResult {
  /** the trailing LOGBOOK_WINDOW days, oldest first; the last one is today. */
  days: LogbookDay[];
  /** index of today in `days` (always the last entry). */
  todayIndex: number;
  /** how many of the window's days hold at least one session. */
  loggedDayCount: number;
}

/** Build the trailing seven-day logbook week from the logged sessions. */
export function logbookWeek(
  sessions: LoggedSession[],
  opts: { now?: number; windowDays?: number } = {},
): LogbookWeekResult {
  const now = opts.now ?? Date.now();
  const windowDays = Math.max(1, opts.windowDays ?? LOGBOOK_WINDOW);

  // Sessions grouped by their LOCAL day key, preserving logged order.
  const byDate = new Map<string, string[]>();
  for (const s of sessions) {
    const ts = Date.parse(s.startedAt);
    if (!Number.isFinite(ts)) continue;
    const k = localDayKey(ts);
    const ids = byDate.get(k);
    if (ids) ids.push(s.id);
    else byDate.set(k, [s.id]);
  }

  const todayMidnight = localMidnightMs(now);
  const todayKey = localDayKey(now);
  const days: LogbookDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const ts = addLocalDays(todayMidnight, i - (windowDays - 1));
    const dt = new Date(ts);
    const dateKey = localDayKey(ts);
    const sessionIds = byDate.get(dateKey) ?? [];
    days.push({
      index: i,
      dateKey,
      ts,
      weekdayShort: WEEKDAY[dt.getDay()]!,
      dayOfMonth: dt.getDate(),
      monthShort: MONTH[dt.getMonth()]!,
      isToday: dateKey === todayKey,
      sessionIds,
      logged: sessionIds.length > 0,
    });
  }

  return {
    days,
    todayIndex: days.length - 1,
    loggedDayCount: days.filter((d) => d.logged).length,
  };
}

/**
 * Merge same-day receipts into one honest summary for the logbook rail's
 * done state: sums only what every figure can vouch for (doneReceipt already
 * dropped untrustworthy durations per session), keeps the LAST finish clock
 * (the day ended when its final session did). Null for an empty day.
 */
export function mergeDoneReceipts(receipts: DoneReceipt[]): DoneReceipt | null {
  if (!receipts.length) return null;
  let finishedClock: string | null = null;
  let durationMin = 0;
  let hasDuration = false;
  // Seconds only add up while EVERY measured session brought them; a day mixing
  // a second-accurate recording with a typed session has no honest second total.
  let durationSec = 0;
  let allSec = true;
  let tonnageKg = 0;
  let sets = 0;
  let strengthSets = 0;
  let distanceKm = 0;
  let elevationM = 0;
  // The day counts as measured when ANY of its sessions was matched to a device
  // — that part of the day's totals came off a wrist.
  let measured = false;
  for (const r of receipts) {
    if (r.finishedClock) finishedClock = r.finishedClock;
    if (r.durationMin != null) {
      durationMin += r.durationMin;
      hasDuration = true;
      if (r.durationSec != null) durationSec += r.durationSec;
      else allSec = false;
    }
    tonnageKg += r.tonnageKg;
    sets += r.sets;
    strengthSets += r.strengthSets;
    distanceKm += r.distanceKm;
    elevationM += r.elevationM;
    measured = measured || r.measured;
  }
  return {
    finishedClock,
    durationMin: hasDuration ? durationMin : null,
    durationSec: hasDuration && allSec && durationSec > 0 ? durationSec : null,
    tonnageKg,
    sets,
    strengthSets,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    elevationM: Math.round(elevationM),
    measured,
  };
}
