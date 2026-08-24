/**
 * History views — the data behind the merged History × Calendar screen.
 *
 * The History screen is ONE layout: calendar-week chapters, each of which opens
 * its own week summary. The switchable layouts it used to carry (agenda,
 * timeline, trend — and earlier the classic list, heatmap, journal and blocks)
 * were retired in Aug 2026: four projections of one set of sessions is four
 * places for the same fact to be stated differently, and the week is the grain
 * the athlete actually reviews in. The list markup survives only as the
 * archived-management surface.
 *
 * The grouping/aggregation math lives here — pure and client-agnostic — and the
 * client only renders.
 *
 * Day keys follow the app's canonical LOCAL calendar-day convention
 * (day-key.ts) — the same keys the plan schedule and the calendar engine use,
 * so every surface on the screen agrees on which day a session belongs to.
 */

import type { LoggedSession } from "./session";
import { sessionVolume, sessionShape, sessionCardioTotals, cardioPace } from "./session";
import { sessionLoad } from "./load";
import { kgToUnit, type WeightUnit } from "../units";
import { displaySportDistance, sportDistanceUnit } from "../olympic-sports";
import { kmValue, roundKm } from "../distance";
import { prsForSession } from "./records";
import { localDayKey, localMondayMs, addLocalDays } from "../day-key";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { deviceTrueSession } from "../device-truth";

const dayKey = localDayKey;
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
//  Session headline — the ONE number a session leads with
// ============================================================

/**
 * The "headline number" card treatment: every session card leads with a single
 * large figure — tonnage for lifting, distance for cardio, minutes for a timed
 * sport — and everything else (title, lift count, minutes, pace, PRs) drops to
 * one mono meta line beneath it. Each fact appears exactly ONCE per card: the
 * old title-chip-blockline layout said "Tennis, 75 min" twice and restated a
 * swim's distance/time in two unit systems.
 */
export interface SessionHeadline {
  /** what the figure measures — drives the fallback chain below. */
  kind: "tonnage" | "distance" | "minutes" | "blocks";
  /** the pre-formatted figure ("7.4", "612", "75"). */
  value: string;
  /** its small unit label ("t" | "lb" | "m" | "km" | "min"); empty for the
   *  `blocks` fallback — the client renders its localized block label. */
  unit: string;
  /** the session's discipline accent (same encoding as the timeline dots). */
  accent: "strength" | "cardio";
  /** sport-split pace ("5:04 /100m") when the session is a single distance
   *  activity — null otherwise (a summed pace across blocks would lie). */
  pace: string | null;
  /** summed non-strength minutes — meta-line material unless minutes IS the
   *  headline (kind === "minutes"), in which case repeating it is forbidden. */
  minutes: number;
  /** strength-block count — the meta line's "4 lifts". */
  lifts: number;
}

/**
 * Pick a session's headline figure. Lifting/mixed sessions lead with tonnage
 * (bodyweight-aware when `bwKg` is passed); cardio leads with distance in the
 * sport's natural unit (metres for swimming/rowing, km otherwise) or minutes
 * when untracked; the block count is the last honest resort. Shared by both
 * clients so the card and the weeks-view rows can't drift.
 */
export function sessionHeadline(session: LoggedSession, units: WeightUnit, bwKg?: number | null): SessionHeadline {
  // The row an athlete scans reads what their device measured (94 min, not the
  // 90 they typed) wherever one recorded the session — see device-truth.ts.
  const s = deviceTrueSession(session);
  const lifts = s.blocks.reduce((n, b) => n + (b.kind === "strength" ? 1 : 0), 0);
  const minutes = s.blocks.reduce((sum, b) => sum + (b.kind !== "strength" ? (b.minutes ?? 0) : 0), 0);
  if (sessionShape(s) === "cardio") {
    const ct = sessionCardioTotals(s.blocks);
    if (ct.distanceKm > 0) {
      const dist = s.blocks.filter((b) => b.kind === "cardio" && (b.distance ?? 0) > 0);
      const solo = dist.length === 1 ? dist[0]! : null;
      return {
        kind: "distance",
        value: solo ? displaySportDistance(ct.distanceKm, solo.name) : kmValue(ct.distanceKm),
        unit: solo ? sportDistanceUnit(solo.name) : "km",
        accent: "cardio",
        pace: solo ? cardioPace(solo) : null,
        minutes,
        lifts,
      };
    }
    if (minutes > 0) return { kind: "minutes", value: String(minutes), unit: "min", accent: "cardio", pace: null, minutes, lifts };
    return { kind: "blocks", value: String(s.blocks.length), unit: "", accent: "cardio", pace: null, minutes, lifts };
  }
  const vol = sessionVolume(s.blocks, false, bwKg);
  if (vol > 0)
    return {
      kind: "tonnage",
      value: units === "kg" ? (vol / 1000).toFixed(1) : Math.round(kgToUnit(vol, "lb")).toLocaleString(),
      unit: units === "kg" ? "t" : "lb",
      accent: "strength",
      pace: null,
      minutes,
      lifts,
    };
  if (minutes > 0) return { kind: "minutes", value: String(minutes), unit: "min", accent: "strength", pace: null, minutes, lifts };
  return { kind: "blocks", value: String(s.blocks.length), unit: "", accent: "strength", pace: null, minutes, lifts };
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
  /** figure-order.ts's reading order, same as the chips that render them.
   *
   *  DISTANCE IS HERE because this is a hybrid-athlete app and the index was
   *  gym-only: a week of four runs and one squat session summarised as "0.5 t,
   *  5 sessions" and never mentioned the 40 km. The chip renders only when the
   *  week covered ground, so a pure lifter's chapter is unchanged. */
  totals: { volume: number; sessions: number; prs: number; distanceKm: number };
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
          // Read through device-truth like every other distance the app prints:
          // the ground a watch measured outranks the ground that was typed.
          distanceKm: roundKm(
            group.reduce(
              (sum, s) =>
                sum +
                deviceTrueSession(s).blocks.reduce((n, b) => n + (b.kind === "cardio" && b.distance ? b.distance : 0), 0),
              0,
            ),
          ),
        },
        sessions: group,
      };
    });
}
