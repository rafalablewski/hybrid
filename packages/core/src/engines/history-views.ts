/**
 * History views — the data behind the merged History × Calendar screen.
 *
 * The History screen offers five switchable layouts (agenda, journal, weeks,
 * timeline, blocks — the classic list and the heatmap were trialled and
 * retired; the list survives only as the archived-management surface). Every
 * layout is a different PROJECTION of the same logged sessions (+ optionally
 * the date-anchored plan schedule), so all the grouping/aggregation math lives
 * here — pure and client-agnostic — and web + mobile only render.
 *
 * Day keys follow the app's canonical LOCAL calendar-day convention
 * (day-key.ts) — the same keys the plan schedule and the calendar engine use,
 * so every surface on the screen agrees on which day a session belongs to.
 */

import type { LoggedSession } from "./session";
import { sessionVolume, sessionShape } from "./session";
import { sessionLoad } from "./load";
import { prsForSession } from "./records";
import { sessionsByDay, monthMatrix, loadLevel, type MonthCell } from "./calendar";
import { localDayKey, localTodayKey, localMondayMs, addLocalDays, dayKeyDiff } from "../day-key";
import { bwAt, type BodyweightInput } from "../bodyweight";
import type { PlanScheduleResult } from "../plan-schedule";

const dayKey = localDayKey;
const todayKeyOf = (now: number) => localTodayKey(now);
const mondayOf = localMondayMs;

/** A per-session PR-count lookup. Both clients memoize one map of these; every
 *  view function accepts it so PR detection (O(n) per session) never re-runs. */
export type PrLookup = (id: string) => number;

/** The seven weekday-header i18n keys (Mon→Sun), shared by the week strip,
 *  the journal grid and the weeks sparkline so the clients can't drift. */
export const WEEKDAY_LABEL_KEYS = [
  "w.analyze.cal.weekdayMon",
  "w.analyze.cal.weekdayTue",
  "w.analyze.cal.weekdayWed",
  "w.analyze.cal.weekdayThu",
  "w.analyze.cal.weekdayFri",
  "w.analyze.cal.weekdaySat",
  "w.analyze.cal.weekdaySun",
] as const;

/** Newest-first copy of the sessions (the order every view renders in).
 *  startedAt is a uniform ISO-8601 string, so lexicographic order IS
 *  chronological order — no Date allocation in the comparator. */
const desc = (sessions: LoggedSession[]) =>
  [...sessions].sort((a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0));

// ============================================================
//  View registry
// ============================================================

/** The five switchable History layouts. */
export type HistoryViewId = "agenda" | "journal" | "weeks" | "timeline" | "blocks";

/** Switcher entries, in display order. `labelKey` resolves via i18n `t()`. */
export const HISTORY_VIEWS: ReadonlyArray<{ id: HistoryViewId; labelKey: string }> = [
  { id: "agenda", labelKey: "histview.agenda" },
  { id: "journal", labelKey: "histview.journal" },
  { id: "weeks", labelKey: "histview.weeks" },
  { id: "timeline", labelKey: "histview.timeline" },
  { id: "blocks", labelKey: "histview.blocks" },
];

/** Normalize a persisted view id. Unknown values — including the retired
 *  "list" and "heatmap" ids a device may still have stored — fall back to
 *  the agenda. */
export const normalizeHistoryView = (v: unknown): HistoryViewId =>
  HISTORY_VIEWS.some((x) => x.id === v) ? (v as HistoryViewId) : "agenda";

// ============================================================
//  Day stream — training days + rest gaps (agenda + timeline)
// ============================================================

export interface HistoryDayGroup {
  kind: "day";
  dateKey: string;
  isToday: boolean;
  /** newest first within the day. */
  sessions: LoggedSession[];
  /** summed sRPE load + tonnage that day. */
  load: number;
  volume: number;
  /** PR count across the day's sessions. */
  prs: number;
  /** the day's dominant discipline (drives the accent: teal for cardio). */
  shape: "strength" | "cardio" | "mixed";
  /** 1..4 load level relative to the athlete's busiest day (dot size / shading). */
  level: 1 | 2 | 3 | 4;
}

export interface HistoryRestGap {
  kind: "gap";
  /** whole rest days between the surrounding training days (≥ 1). */
  days: number;
}

export type HistoryStreamItem = HistoryDayGroup | HistoryRestGap;

/**
 * The training story as a stream: one group per training day (newest first)
 * with an explicit rest-gap entry between non-adjacent days — the agenda and
 * timeline views render this directly.
 */
export function historyStream(
  sessions: LoggedSession[],
  opts?: { now?: number; bw?: BodyweightInput; prs?: PrLookup },
): HistoryStreamItem[] {
  const now = opts?.now ?? Date.now();
  const today = todayKeyOf(now);
  const prsOf = opts?.prs ?? ((id: string) => prsForSession(sessions, id, opts?.bw).length);

  const byDay = new Map<string, LoggedSession[]>();
  for (const s of desc(sessions)) {
    const k = dayKey(s.startedAt);
    const arr = byDay.get(k);
    if (arr) arr.push(s);
    else byDay.set(k, [s]);
  }

  const keys = [...byDay.keys()].sort().reverse();
  const loads = new Map<string, number>();
  for (const [k, group] of byDay) loads.set(k, group.reduce((sum, s) => sum + sessionLoad(s), 0));
  const maxLoad = Math.max(1, ...loads.values());

  const out: HistoryStreamItem[] = [];
  keys.forEach((k, i) => {
    if (i > 0) {
      const gapDays = dayKeyDiff(k, keys[i - 1]!) - 1;
      if (gapDays > 0) out.push({ kind: "gap", days: gapDays });
    }
    const group = byDay.get(k)!;
    const load = loads.get(k)!;
    const shapes = new Set(group.map((s) => sessionShape(s)));
    out.push({
      kind: "day",
      dateKey: k,
      isToday: k === today,
      sessions: group,
      load,
      volume: group.reduce((sum, s) => sum + sessionVolume(s.blocks, false, bwAt(opts?.bw, s.startedAt)), 0),
      prs: group.reduce((sum, s) => sum + prsOf(s.id), 0),
      shape: shapes.size > 1 ? "mixed" : shapes.has("cardio") ? "cardio" : "strength",
      level: (loadLevel(load, maxLoad) || 1) as HistoryDayGroup["level"], // a training day is never level 0
    });
  });
  return out;
}

// ============================================================
//  Upcoming plan ghosts (agenda view)
// ============================================================

export interface UpcomingPlanDay {
  /** LOCAL date key (the plan schedule's convention). */
  dateKey: string;
  /** the plan week (1-based), or null for single-week plans — the client
   *  composes the localized "Week N, {title}" label. */
  week: number | null;
  /** the day's title as authored ("Day 4"). */
  title: string;
  planName: string;
  /** block names to preview (already capped by the caller's taste). */
  blockNames: string[];
  /** true when this is TODAY's still-open plan session (due, nothing logged). */
  isToday: boolean;
}

/** Today's still-open plan session plus the next `limit` upcoming training days
 *  from the date-anchored schedule — rendered as dashed "planned" ghosts at the
 *  top of the agenda view. */
export function upcomingPlanDays(
  schedule: PlanScheduleResult | null | undefined,
  limit = 2,
): UpcomingPlanDay[] {
  if (!schedule) return [];
  const multiWeek = schedule.days.some((d) => d.week > 1);
  const open = schedule.days.filter((d) => (d.status === "today" || d.status === "upcoming") && !d.isRest);
  // Always keep a due-today session; the limit caps the future ones.
  const today = open.filter((d) => d.status === "today");
  const upcoming = open.filter((d) => d.status === "upcoming").slice(0, Math.max(0, limit));
  return [...today, ...upcoming].map((d) => ({
    dateKey: d.dateKey,
    week: multiWeek ? d.week : null,
    title: d.title,
    planName: schedule.planName,
    blockNames: d.blocks.map((b) => b.name),
    isToday: d.status === "today",
  }));
}

// ============================================================
//  Month journal (journal view)
// ============================================================

export interface JournalDay {
  count: number;
  /** 0 rest, 1..4 relative load (cell shading). */
  level: 0 | 1 | 2 | 3 | 4;
  /** one tick per session (capped at 3 by the UI): its discipline. */
  ticks: ("strength" | "cardio" | "mixed")[];
  /** any PR set that day. */
  pr: boolean;
}

export interface JournalMonth {
  matrix: MonthCell[][];
  days: Record<string, JournalDay>;
}

/** The month grid enriched with per-day discipline ticks, PR flags and load
 *  levels — the whole-screen calendar of the journal view. */
export function journalMonth(
  all: LoggedSession[],
  year: number,
  monthIndex0: number,
  opts?: { bw?: BodyweightInput; prs?: PrLookup },
): JournalMonth {
  const matrix = monthMatrix(year, monthIndex0);
  const summaries = sessionsByDay(all, opts?.bw);
  const maxLoad = Math.max(1, ...Object.values(summaries).map((d) => d.load));
  const prsOf = opts?.prs ?? ((id: string) => prsForSession(all, id, opts?.bw).length);

  const days: Record<string, JournalDay> = {};
  for (const s of desc(all)) {
    const k = dayKey(s.startedAt);
    const row = (days[k] ??= { count: 0, level: 0, ticks: [], pr: false });
    row.count++;
    row.ticks.push(sessionShape(s));
    if (!row.pr && prsOf(s.id) > 0) row.pr = true;
  }
  for (const [k, row] of Object.entries(days)) {
    row.level = loadLevel(summaries[k]?.load ?? 0, maxLoad) as JournalDay["level"];
  }
  return { matrix, days };
}

/** The most recent day key that has sessions (the journal's default selection),
 *  or today when history is empty. */
export function latestTrainingDayKey(all: LoggedSession[], now = Date.now()): string {
  let best: string | null = null;
  for (const s of all) {
    const k = dayKey(s.startedAt);
    if (!best || k > best) best = k;
  }
  return best ?? todayKeyOf(now);
}

// ============================================================
//  Week chapters (weeks view)
// ============================================================

export interface WeekChapterDay {
  dateKey: string;
  /** summed sRPE load (sparkline bar height, 0 = rest). */
  load: number;
  hasStrength: boolean;
  hasCardio: boolean;
}

export interface WeekChapter {
  /** Monday / Sunday of the week (UTC day keys). */
  startKey: string;
  endKey: string;
  isCurrent: boolean;
  /** Mon..Sun, always 7 entries. */
  days: WeekChapterDay[];
  totals: { sessions: number; volume: number; prs: number };
  /** newest first. */
  sessions: LoggedSession[];
}

/** Group history into calendar weeks (Mon–Sun, newest first) with per-day
 *  sparkline loads + weekly totals. Empty weeks are skipped — rest weeks read
 *  from the date range jump, not from empty cards. */
export function weekChapters(
  all: LoggedSession[],
  opts?: { now?: number; bw?: BodyweightInput; prs?: PrLookup },
): WeekChapter[] {
  const now = opts?.now ?? Date.now();
  const prsOf = opts?.prs ?? ((id: string) => prsForSession(all, id, opts?.bw).length);
  const currentMonday = mondayOf(now);

  const byWeek = new Map<number, LoggedSession[]>();
  for (const s of desc(all)) {
    const monday = mondayOf(new Date(s.startedAt).getTime());
    const arr = byWeek.get(monday);
    if (arr) arr.push(s);
    else byWeek.set(monday, [s]);
  }

  return [...byWeek.keys()]
    .sort((a, b) => b - a)
    .map((monday) => {
      const group = byWeek.get(monday)!;
      const days: WeekChapterDay[] = [];
      for (let i = 0; i < 7; i++) {
        const k = dayKey(addLocalDays(monday, i));
        const daySessions = group.filter((s) => dayKey(s.startedAt) === k);
        days.push({
          dateKey: k,
          load: daySessions.reduce((sum, s) => sum + sessionLoad(s), 0),
          hasStrength: daySessions.some((s) => sessionShape(s) !== "cardio"),
          hasCardio: daySessions.some((s) => sessionShape(s) === "cardio"),
        });
      }
      return {
        startKey: dayKey(monday),
        endKey: dayKey(addLocalDays(monday, 6)),
        isCurrent: monday === currentMonday,
        days,
        totals: {
          sessions: group.length,
          volume: Math.round(group.reduce((sum, s) => sum + sessionVolume(s.blocks, false, bwAt(opts?.bw, s.startedAt)), 0)),
          prs: group.reduce((sum, s) => sum + prsOf(s.id), 0),
        },
        sessions: group,
      };
    });
}

// ============================================================
//  Block chapters (blocks view)
// ============================================================

export interface BlockChapterRow {
  key: string;
  /** "Day 2" for plan rows; the session title for freestyle rows. */
  title: string;
  dateKey: string | null;
  status: "done" | "missed" | "skipped" | "postponed" | "today" | "upcoming";
  /** the logged session fulfilling the row (tap → session detail), if any. */
  sessionId: string | null;
}

export interface BlockChapter {
  kind: "plan" | "free";
  /** plan name, or null for the freestyle chapter (caller localizes the label). */
  planName: string | null;
  week: number | null;
  /** progress ring numbers — for freestyle, done === total === session count. */
  done: number;
  total: number;
  complete: boolean;
  rows: BlockChapterRow[];
  /** sort anchor (newest chapter first): latest activity/scheduled day in it. */
  sortKey: string;
}

/** Matches the client-composed plan-session title "<plan> – Week N, <day>"
 *  (the workout screens set `${planName} – ${day}`, day from planProgramToday).
 *  Known limit: single-week plans compose "<plan> – <day>" with no "Week N,"
 *  segment, so their sessions fall into Freestyle on this fallback path — the
 *  primary, schedule-based path (sessionId matching) is unaffected. */
const PLAN_TITLE_RE = /^(.+) – Week (\d+), (.+)$/;

/**
 * Group history by training block ("plan — week N" chapters with a done/total
 * ring; plan days still ahead appear as unchecked rows), plus one "freestyle"
 * chapter for sessions logged outside any plan.
 *
 * With the date-anchored `schedule` the chapters come straight from it
 * (statuses, dateKeys, fulfilled sessionIds). Without one, plan-titled sessions
 * ("<plan> – Week N, <day>") are parsed from their titles, so the view still
 * works for un-enrolled or historical plans.
 */
export function blockChapters(
  all: LoggedSession[],
  opts?: { schedule?: PlanScheduleResult | null },
): BlockChapter[] {
  const chapters: BlockChapter[] = [];
  const claimed = new Set<string>();
  const sorted = desc(all);

  const schedule = opts?.schedule ?? null;
  if (schedule) {
    // Claim EVERY session the schedule recognised as plan-fulfilling — not just
    // each day's first (sessionId) — so the second session of an AM/PM day
    // can't fall through to the Freestyle chapter while Today counts it as plan.
    for (const id of schedule.fulfilledSessionIds) claimed.add(id);
    const weeks = new Map<number, typeof schedule.days>();
    for (const d of schedule.days) {
      if (d.isRest) continue;
      const arr = weeks.get(d.week);
      if (arr) arr.push(d);
      else weeks.set(d.week, [d]);
    }
    for (const [week, days] of weeks) {
      // Only weeks that have started (or produced a session) tell a story here.
      const started = days.some((d) => d.status !== "upcoming");
      if (!started) continue;
      const rows: BlockChapterRow[] = days.map((d) => {
        if (d.sessionId) claimed.add(d.sessionId);
        return {
          key: d.dateKey,
          title: d.title,
          dateKey: d.dateKey,
          status: d.status as BlockChapterRow["status"], // rest days filtered above, so "rest" can't reach here
          sessionId: d.sessionId,
        };
      });
      const done = rows.filter((r) => r.status === "done").length;
      chapters.push({
        kind: "plan",
        planName: schedule.planName,
        week,
        done,
        total: rows.length,
        complete: done === rows.length,
        rows,
        sortKey: days[days.length - 1]!.dateKey,
      });
    }
  } else {
    // Title-parse fallback: "<plan> – Week N, <day>".
    const groups = new Map<string, { planName: string; week: number; sessions: LoggedSession[] }>();
    for (const s of sorted) {
      const m = PLAN_TITLE_RE.exec(s.title);
      if (!m) continue;
      const key = `${m[1]}#${m[2]}`;
      const g = groups.get(key) ?? { planName: m[1]!, week: Number(m[2]), sessions: [] };
      g.sessions.push(s);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const rows: BlockChapterRow[] = g.sessions.map((s) => {
        claimed.add(s.id);
        return {
          key: s.id,
          title: PLAN_TITLE_RE.exec(s.title)?.[3] ?? s.title,
          dateKey: dayKey(s.startedAt),
          status: "done" as const,
          sessionId: s.id,
        };
      });
      chapters.push({
        kind: "plan",
        planName: g.planName,
        week: g.week,
        done: rows.length,
        total: rows.length,
        complete: true,
        rows,
        sortKey: rows[0]?.dateKey ?? "",
      });
    }
  }

  // With a schedule, every unclaimed session is freestyle regardless of title;
  // on the title-parse path, plan-titled sessions were already grouped above.
  const free = sorted.filter((s) => !claimed.has(s.id) && (!!schedule || !PLAN_TITLE_RE.test(s.title)));
  if (free.length) {
    chapters.push({
      kind: "free",
      planName: null,
      week: null,
      done: free.length,
      total: free.length,
      complete: true,
      rows: free.map((s) => ({
        key: s.id,
        title: s.title,
        dateKey: dayKey(s.startedAt),
        status: "done" as const,
        sessionId: s.id,
      })),
      sortKey: free[0] ? dayKey(free[0].startedAt) : "",
    });
  }

  return chapters.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
}
