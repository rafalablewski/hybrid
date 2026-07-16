import { programCalendarDays, type PlanProgramTodayRow, type PlanDaySession } from "./plan-day";
import { localDayKey, localMidnightMs, addLocalDays } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";

// ============================================================
//  Plan schedule — the date-anchored week rail.
//
//  The classic "Your plan today" advances by a COUNT (sessions logged % training
//  days), so finishing a workout instantly rolls the card to the next day and no
//  day can ever be "missed" or "skipped". This engine replaces the count with a
//  CALENDAR: it pins the program's days onto consecutive dates from the plan's
//  start, then reconciles each date against the athlete's logged sessions and
//  their explicit skip overrides to give every day a readable STATUS.
//
//  Pure and client-agnostic: web + mobile render the same rail from the same
//  result. Persistence of the start date lives on the Macrocycle (`startedAt`);
//  skip overrides are supplied by the caller (localStorage today, a table later).
// ============================================================

/** The state a single plan day can be in — drives the rail chip + the detail card. */
export type PlanDayStatus =
  | "done" // a session was logged on this date
  | "missed" // a training day in the past with nothing logged and not skipped
  | "skipped" // the athlete explicitly skipped it (no adherence penalty)
  | "postponed" // the athlete moved this day's session to a later date (no penalty)
  | "today" // this date is today and it's still open (not yet done/skipped)
  | "upcoming" // a future training day
  | "rest"; // a rest / active-rest day (never counts against adherence)

/** A per-day override the athlete sets by hand: skip it, or postpone it to a
 *  later date (which relocates its session onto that date's card). */
export type PlanOverride =
  | { status: "skipped" }
  | { status: "postponed"; toDateKey: string };

/** Overrides keyed by the day's local date key (yyyy-mm-dd). */
export type PlanOverrides = Record<string, PlanOverride>;

/** A session that was postponed FROM another date onto this one — surfaced on the
 *  target day's card so a moved workout is visible where it now lives. */
export interface PostponedItem {
  fromDateKey: string;
  title: string;
  rows: PlanProgramTodayRow[];
  blocks: SessionBlock[];
  /** the moved day's content grouped by session (mirrors ScheduledDay.sessions). */
  sessions: PlanDaySession[];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Local yyyy-mm-dd for a timestamp — the stable key we reconcile dates on
 *  (avoids UTC drift so a session logged at 11pm lands on the right day).
 *  Delegates to the app-wide canonical helper (day-key.ts). */
export const dateKeyOf = (ts: number): string => localDayKey(ts);

const localMidnight = localMidnightMs;
const addDays = addLocalDays;

export interface ScheduledDay {
  /** position in the schedule (0-based, includes rest days). */
  index: number;
  /** local yyyy-mm-dd — the reconcile + override key. */
  dateKey: string;
  /** local-midnight timestamp. */
  ts: number;
  weekdayShort: string; // "Mon"
  dayOfMonth: number; // 13
  monthShort: string; // "Jul"
  isToday: boolean;
  isRest: boolean;
  status: PlanDayStatus;
  /** 1-based number among TRAINING days (the "11" in "day 11 / 37"); null for rest. */
  trainingDayNumber: number | null;
  totalTrainingDays: number;
  week: number;
  title: string;
  kindLabel: string | null;
  rows: PlanProgramTodayRow[];
  blocks: SessionBlock[];
  /** the day's content grouped by session (AM/PM or untimed trainings) — drives
   *  the week rail's session tabs. One entry for a single-session day. */
  sessions: PlanDaySession[];
  /** the logged session that fulfilled a done day (first on that date), else null. */
  sessionId: string | null;
  /** when THIS day was postponed, the date its session moved to; else null. */
  postponedTo: string | null;
  /** sessions postponed FROM other dates onto THIS date (surfaced as catch-up). */
  postponedIn: PostponedItem[];
}

export interface PlanScheduleResult {
  planId: string;
  planName: string;
  totalTrainingDays: number;
  /** every program day mapped to a calendar date, in order. */
  days: ScheduledDay[];
  /** index into `days` for today (exact match); else the next upcoming day; else
   *  the last day. The rail opens focused here. */
  todayIndex: number;
}

/**
 * Build the date-anchored schedule for an enrolled program. Returns null unless
 * `planId` resolves to a real PlanProgram AND a `startedAt` anchor is known — the
 * classic count-based "today" stays the fallback otherwise.
 */
export function planSchedule(opts: {
  planId: string | null | undefined;
  /** the plan's start date (Macrocycle.startedAt). Day 1 lands on this date. */
  startedAt: string | number | Date | null | undefined;
  sessions: LoggedSession[];
  overrides?: PlanOverrides;
  maxes?: Record<string, number>;
  /** injectable clock for tests; defaults to now. */
  now?: number;
}): PlanScheduleResult | null {
  const cal = programCalendarDays(opts.planId, opts.maxes);
  if (!cal || opts.startedAt == null) return null;

  const startRaw = new Date(opts.startedAt).getTime();
  if (!Number.isFinite(startRaw)) return null;
  const startTs = localMidnight(startRaw);

  const now = opts.now ?? Date.now();
  const todayTs = localMidnight(now);
  const todayKey = dateKeyOf(todayTs);
  const overrides = opts.overrides ?? {};

  // Dates that carry at least one logged session → "done". First id per date wins
  // (the session that fulfilled the day).
  const doneByDate = new Map<string, string>();
  for (const s of opts.sessions) {
    const k = dateKeyOf(new Date(s.startedAt).getTime());
    if (!doneByDate.has(k)) doneByDate.set(k, s.id);
  }

  const totalTrainingDays = cal.trainingCount;
  let trainingSeen = 0;

  const days: ScheduledDay[] = cal.days.map((d, i) => {
    const ts = addDays(startTs, i);
    const dateKey = dateKeyOf(ts);
    const dt = new Date(ts);
    const isToday = dateKey === todayKey;
    const isRest = !d.isTraining;
    if (d.isTraining) trainingSeen++;

    const doneId = doneByDate.get(dateKey) ?? null;
    const ov = overrides[dateKey];

    // Actual completion beats an explicit override — if a session was logged that
    // date, the day is done even if it was earlier skipped/postponed.
    let status: PlanDayStatus;
    if (isRest) status = "rest";
    else if (doneId) status = "done";
    else if (ov?.status === "skipped") status = "skipped";
    else if (ov?.status === "postponed") status = "postponed";
    else if (ts < todayTs) status = "missed";
    else if (isToday) status = "today";
    else status = "upcoming";

    return {
      index: i,
      dateKey,
      ts,
      weekdayShort: WEEKDAY[dt.getDay()]!,
      dayOfMonth: dt.getDate(),
      monthShort: MONTH[dt.getMonth()]!,
      isToday,
      isRest,
      status,
      trainingDayNumber: d.isTraining ? trainingSeen : null,
      totalTrainingDays,
      week: d.week,
      title: d.title,
      kindLabel: d.kindLabel,
      rows: d.rows,
      blocks: d.blocks,
      sessions: d.sessions,
      sessionId: d.isTraining ? doneId : null,
      postponedTo: status === "postponed" && ov?.status === "postponed" ? ov.toDateKey : null,
      postponedIn: [],
    };
  });

  // Second pass: relocate each postponed day's session onto its target date's
  // card (only when the target is within the schedule window and the source
  // wasn't since completed). Keyed by dateKey for an O(days) attach.
  const byKey = new Map<string, ScheduledDay>();
  for (const d of days) byKey.set(d.dateKey, d);
  for (const d of days) {
    if (d.status !== "postponed" || !d.postponedTo) continue;
    const target = byKey.get(d.postponedTo);
    if (target) target.postponedIn.push({ fromDateKey: d.dateKey, title: d.title, rows: d.rows, blocks: d.blocks, sessions: d.sessions });
  }

  let todayIndex = days.findIndex((d) => d.isToday);
  if (todayIndex < 0) todayIndex = days.findIndex((d) => d.ts > todayTs);
  if (todayIndex < 0) todayIndex = days.length - 1;

  return {
    planId: cal.planId,
    planName: cal.planName,
    totalTrainingDays,
    days,
    todayIndex: Math.max(0, todayIndex),
  };
}

/** A count of each status across the schedule + an adherence %. Powers the
 *  "78% adherence" readout and any progress summary; shared so web + mobile agree. */
export interface PlanAdherence {
  done: number;
  missed: number;
  skipped: number;
  postponed: number;
  /** training days still ahead (today + upcoming). */
  remaining: number;
  /** done / (done + missed) as a 0-100 int; 100 when nothing is due yet.
   *  Skipped + postponed are deliberate choices and never count against it. */
  percent: number;
}

export function planAdherence(result: PlanScheduleResult): PlanAdherence {
  let done = 0;
  let missed = 0;
  let skipped = 0;
  let postponed = 0;
  let remaining = 0;
  for (const d of result.days) {
    if (d.isRest) continue;
    if (d.status === "done") done++;
    else if (d.status === "missed") missed++;
    else if (d.status === "skipped") skipped++;
    else if (d.status === "postponed") postponed++;
    else remaining++; // today + upcoming
  }
  const due = done + missed;
  const percent = due === 0 ? 100 : Math.round((done / due) * 100);
  return { done, missed, skipped, postponed, remaining, percent };
}
