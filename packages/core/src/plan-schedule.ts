import { programCalendarDays, type PlanProgramTodayRow, type PlanDaySession } from "./plan-day";
import { localDayKey, localMidnightMs, addLocalDays } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";
import type { PlanDiscipline } from "./plan-program";

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
  /** every logged-session id recognised as fulfilling SOME plan day — the
   *  complement (sessions logged but never claimed) is the off-plan set. */
  fulfilledSessionIds: string[];
}

/** The plan-composed title the clients write: "<plan name>" (the week-rail
 *  handoff) or "<plan name> – …" (the plan-prefilled logger). */
const titleMatches = (session: LoggedSession, planName: string): boolean =>
  session.title === planName || session.title.startsWith(`${planName} – `);

/** Run-plan reconcile: a run program day (endurance discipline, or any day
 *  prescribing a cardio "…run…" block) is satisfied by a cardio-only session
 *  that is itself a run — the quick sport log's natural output ("Running").
 *  A racket/team sport stays off-plan: cardio-shaped, but not a run. */
const RUN_RE = /\b(run|jog)/i;
function runMatches(session: LoggedSession, dayBlocks: SessionBlock[], discipline: PlanDiscipline): boolean {
  const runDay = discipline === "endurance" || dayBlocks.some((b) => b.kind === "cardio" && RUN_RE.test(b.name));
  if (!runDay) return false;
  return session.blocks.length > 0 && session.blocks.every((b) => b.kind === "cardio") && session.blocks.some((b) => RUN_RE.test(b.name));
}

/** Prescription-content match: the session shares enough exercise/block names
 *  with the day's prescription — covers loggers that auto-title ("Evening
 *  workout") and renamed sessions that still carry the plan's exercises. Needs
 *  at least TWO shared names when the day prescribes two or more blocks, so a
 *  freestyle session that merely contains one common lift (Back Squat) can't
 *  silently swallow the plan day. */
function blocksMatch(session: LoggedSession, dayBlocks: SessionBlock[], discipline: PlanDiscipline): boolean {
  if (runMatches(session, dayBlocks, discipline)) return true;
  const names = new Set(dayBlocks.map((b) => b.name.trim().toLowerCase()).filter(Boolean));
  if (names.size === 0) return false;
  const required = Math.min(2, names.size);
  const shared = new Set(session.blocks.map((b) => b.name.trim().toLowerCase()).filter((n) => names.has(n)));
  return shared.size >= required;
}

/**
 * Whether a logged session is recognisably THIS plan day's workout: the
 * client-composed plan title, a prescription-content match, or (for run days)
 * a logged run. A quick sport log (e.g. "Tennis") on a lifting or intervals day
 * matches none of these, so it can no longer swallow the plan day — it surfaces
 * as an off-plan extra instead. NOTE: inside planSchedule the arms apply in
 * claim ORDER (content first, plan-generic title as a fallback) so a catch-up
 * session can't be stolen by the wrong day; this predicate is the OR of both.
 */
export function sessionMatchesPlanDay(
  session: LoggedSession,
  planName: string,
  dayBlocks: SessionBlock[],
  discipline: PlanDiscipline = "strength-percent",
): boolean {
  return titleMatches(session, planName) || blocksMatch(session, dayBlocks, discipline);
}

/**
 * Today's logged sessions that did NOT fulfil a plan day — the "Also today —
 * off-plan" list (quick sport logs, freestyle sessions). Newest first. Without
 * a schedule (not enrolled / no start date / non-library plan) every session
 * logged today is returned — the caller labels the card "Done today" then, not
 * "off-plan". Keyed on the same local day-key convention as the schedule.
 */
export function offPlanSessionsOnDay(
  sessions: LoggedSession[],
  schedule: PlanScheduleResult | null | undefined,
  now = Date.now(),
): LoggedSession[] {
  const todayKey = dateKeyOf(now);
  const claimed = new Set(schedule?.fulfilledSessionIds ?? []);
  return sessions
    .filter((s) => dateKeyOf(new Date(s.startedAt).getTime()) === todayKey && !claimed.has(s.id))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
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

  // Sessions grouped by local date; each training day then claims only the ones
  // that are recognisably ITS workout → "done". An unrelated session — a quick
  // sport log, a freestyle lift — never completes a plan day; it stays unclaimed
  // and surfaces as an off-plan extra on Today.
  const byDate = new Map<string, LoggedSession[]>();
  for (const s of opts.sessions) {
    const k = dateKeyOf(new Date(s.startedAt).getTime());
    const arr = byDate.get(k);
    if (arr) arr.push(s);
    else byDate.set(k, [s]);
  }
  const claimed = new Set<string>();
  // All unclaimed sessions on a date passing `pred` → claimed; first id returned.
  const claimAll = (dateKey: string, pred: (s: LoggedSession) => boolean): string | null => {
    let first: string | null = null;
    for (const s of byDate.get(dateKey) ?? []) {
      if (claimed.has(s.id) || !pred(s)) continue;
      claimed.add(s.id);
      if (first == null) first = s.id;
    }
    return first;
  };

  const totalTrainingDays = cal.trainingCount;
  let trainingSeen = 0;

  // First lay every program day onto its date (no statuses yet — claiming is
  // ordered across the WHOLE schedule, so it can't happen inside this map).
  const days: ScheduledDay[] = cal.days.map((d, i) => {
    const ts = addDays(startTs, i);
    const dt = new Date(ts);
    if (d.isTraining) trainingSeen++;
    return {
      index: i,
      dateKey: dateKeyOf(ts),
      ts,
      weekdayShort: WEEKDAY[dt.getDay()]!,
      dayOfMonth: dt.getDate(),
      monthShort: MONTH[dt.getMonth()]!,
      isToday: dateKeyOf(ts) === todayKey,
      isRest: !d.isTraining,
      status: "upcoming" as PlanDayStatus, // resolved below
      trainingDayNumber: d.isTraining ? trainingSeen : null,
      totalTrainingDays,
      week: d.week,
      title: d.title,
      kindLabel: d.kindLabel,
      rows: d.rows,
      blocks: d.blocks,
      sessions: d.sessions,
      sessionId: null,
      postponedTo: null,
      postponedIn: [],
    };
  });

  // CLAIM PASSES, most-specific first, so a session can't be credited to the
  // wrong day: (1) each day claims sessions on its own date whose CONTENT
  // matches its prescription; (2) a postponed day claims a content-match on its
  // TARGET date (the catch-up "Do it now" flow — the workout carries the moved
  // day's blocks, so it must credit the SOURCE day, not swallow the target's);
  // (3) plan-TITLED sessions ("<plan> – …") are a generic fallback for days
  // still open on their own date (covers sessions whose exercises were edited).
  const doneIds = new Map<number, string>();
  for (const day of days) {
    if (day.isRest) continue;
    const id = claimAll(day.dateKey, (s) => blocksMatch(s, day.blocks, cal.discipline));
    if (id) doneIds.set(day.index, id);
  }
  for (const day of days) {
    if (day.isRest || doneIds.has(day.index)) continue;
    const ov = overrides[day.dateKey];
    if (ov?.status !== "postponed") continue;
    const id = claimAll(ov.toDateKey, (s) => blocksMatch(s, day.blocks, cal.discipline));
    if (id) doneIds.set(day.index, id);
  }
  for (const day of days) {
    if (day.isRest || doneIds.has(day.index)) continue;
    const id = claimAll(day.dateKey, (s) => titleMatches(s, cal.planName));
    if (id) doneIds.set(day.index, id);
  }

  // Now resolve statuses. Actual completion beats an explicit override — a
  // claimed day is done even if it was earlier skipped/postponed.
  for (const day of days) {
    const doneId = doneIds.get(day.index) ?? null;
    const ov = overrides[day.dateKey];
    if (day.isRest) day.status = "rest";
    else if (doneId) {
      day.status = "done";
      day.sessionId = doneId;
    }
    else if (ov?.status === "skipped") day.status = "skipped";
    else if (ov?.status === "postponed") {
      day.status = "postponed";
      day.postponedTo = ov.toDateKey;
    }
    else if (day.ts < todayTs) day.status = "missed";
    else if (day.isToday) day.status = "today";
    else day.status = "upcoming";
  }

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
    fulfilledSessionIds: [...claimed],
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
