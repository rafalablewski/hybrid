/**
 * History views — the data behind the merged History × Calendar screen.
 *
 * The History screen offers three switchable layouts (agenda, weeks,
 * timeline — the classic list, heatmap, journal and blocks layouts were
 * trialled and retired; the list survives only as the archived-management
 * surface). Every layout is a different PROJECTION of the same logged sessions
 * (+ optionally the date-anchored plan schedule), so all the grouping/
 * aggregation math lives here — pure and client-agnostic — and web + mobile
 * only render.
 *
 * Day keys follow the app's canonical LOCAL calendar-day convention
 * (day-key.ts) — the same keys the plan schedule and the calendar engine use,
 * so every surface on the screen agrees on which day a session belongs to.
 */

import type { LoggedSession } from "./session";
import { sessionVolume, sessionShape } from "./session";
import { sessionLoad } from "./load";
import { prsForSession } from "./records";
import { loadLevel } from "./calendar";
import { localDayKey, localTodayKey, localMondayMs, addLocalDays, dayKeyDiff } from "../day-key";
import { bwAt, type BodyweightInput } from "../bodyweight";
import type { PlanScheduleResult } from "../plan-schedule";

const dayKey = localDayKey;
const todayKeyOf = (now: number) => localTodayKey(now);
const mondayOf = localMondayMs;

/** A per-session PR-count lookup. Both clients memoize one map of these; every
 *  view function accepts it so PR detection (O(n) per session) never re-runs. */
export type PrLookup = (id: string) => number;

/** The seven weekday-header i18n keys (Mon→Sun), shared by the week strip
 *  and the weeks sparkline so the clients can't drift. */
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

/** The three switchable History layouts. */
export type HistoryViewId = "agenda" | "weeks" | "timeline";

/** Switcher entries, in display order. `labelKey` resolves via i18n `t()`. */
export const HISTORY_VIEWS: ReadonlyArray<{ id: HistoryViewId; labelKey: string }> = [
  { id: "agenda", labelKey: "histview.agenda" },
  { id: "weeks", labelKey: "histview.weeks" },
  { id: "timeline", labelKey: "histview.timeline" },
];

/** Normalize a persisted view id. Unknown values — including the retired
 *  "list", "heatmap", "journal" and "blocks" ids a device may still have
 *  stored — fall back to the agenda. */
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
