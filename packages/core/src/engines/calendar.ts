/**
 * Calendar — turn logged sessions into a month grid with per-day training load.
 *
 * Pure date + aggregation math behind the training calendar: group sessions by
 * day (count, sRPE load, tonnage, titles) and build a 6×7 month matrix the UI
 * paints. No timezone surprises — everything keys off the UTC calendar day the
 * rest of the engines already use.
 */

import type { LoggedSession } from "./session";
import { sessionVolume } from "./session";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { sessionLoad } from "./load";

const DAY = 86_400_000;

/** The app's canonical UTC day key for a session timestamp (YYYY-MM-DD).
 *  Shared with the history views so every surface shades the same day. */
export const utcDayKey = (iso: string) => iso.slice(0, 10);
/** UTC day key for a millisecond timestamp. */
export const utcDayKeyOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** UTC midnight of the Monday of the week containing `ms`. */
export const utcMondayOf = (ms: number) => {
  const d = new Date(ms);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return base - ((d.getUTCDay() + 6) % 7) * DAY;
};
/** Bucket a day's sRPE load into the calendar's 0–4 shading levels (0 = rest),
 *  relative to the athlete's busiest day. One source of truth for the heatmap,
 *  the journal grid and the agenda/timeline dots. */
export const loadLevel = (load: number, maxLoad: number): 0 | 1 | 2 | 3 | 4 => {
  if (load <= 0) return 0;
  const frac = load / Math.max(1, maxLoad);
  return frac > 0.75 ? 4 : frac > 0.5 ? 3 : frac > 0.25 ? 2 : 1;
};

const dayKey = utcDayKey;
const fmt = utcDayKeyOfMs;

export interface DaySummary {
  date: string; // YYYY-MM-DD
  count: number;
  load: number; // summed sRPE load
  volume: number; // summed tonnage
  titles: string[];
}

/** Group sessions by UTC day with summed load, volume and titles. */
export function sessionsByDay(sessions: LoggedSession[], bw?: BodyweightInput): Record<string, DaySummary> {
  const out: Record<string, DaySummary> = {};
  for (const s of sessions) {
    const d = dayKey(s.startedAt);
    const row = out[d] ?? { date: d, count: 0, load: 0, volume: 0, titles: [] };
    row.count += 1;
    row.load += sessionLoad(s);
    row.volume += sessionVolume(s.blocks, false, bwAt(bw, s.startedAt));
    row.titles.push(s.title);
    out[d] = row;
  }
  return out;
}

export interface MonthCell {
  date: string; // YYYY-MM-DD
  inMonth: boolean; // false for leading/trailing days from adjacent months
}

/**
 * A 6×7 matrix of calendar days covering `monthIndex0` (0=Jan), padded with the
 * adjacent months' days so every week is full. Week starts Monday by default.
 */
export function monthMatrix(year: number, monthIndex0: number, weekStartsMonday = true): MonthCell[][] {
  const firstMs = Date.UTC(year, monthIndex0, 1);
  const weekday = new Date(firstMs).getUTCDay(); // 0=Sun..6=Sat
  const offset = weekStartsMonday ? (weekday + 6) % 7 : weekday;
  const startMs = firstMs - offset * DAY;

  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = startMs + (w * 7 + d) * DAY;
      row.push({ date: fmt(ms), inMonth: new Date(ms).getUTCMonth() === monthIndex0 });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Relative load intensity 0..1 across a set of days (for heat shading). */
export function loadIntensity(days: Record<string, DaySummary>): (date: string) => number {
  const max = Math.max(1, ...Object.values(days).map((d) => d.load));
  return (date: string) => {
    const d = days[date];
    return d ? Math.min(1, d.load / max) : 0;
  };
}

export interface HeatCell {
  date: string; // YYYY-MM-DD
  /** 0 = rest, 1..4 = increasing training load that day */
  level: 0 | 1 | 2 | 3 | 4;
  count: number; // sessions that day
  load: number; // summed sRPE load
}

/**
 * GitHub-style training heatmap: the last `weeks` calendar weeks as COLUMNS,
 * each a Monday→Sunday array of 7 day cells. Each cell carries a 0..4 intensity
 * level from that day's sRPE load relative to the athlete's busiest day in the
 * window, so the grid reads as a "year of training" at a glance. The final
 * column is the week containing `now` (future days simply read as level 0).
 */
export function trainingHeatmap(sessions: LoggedSession[], weeks = 26, now = Date.now()): HeatCell[][] {
  const days = sessionsByDay(sessions);
  const maxLoad = Math.max(1, ...Object.values(days).map((d) => d.load));
  const startMs = utcMondayOf(now) - (weeks - 1) * 7 * DAY;
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = fmt(startMs + (w * 7 + d) * DAY);
      const summary = days[key];
      const load = summary?.load ?? 0;
      col.push({ date: key, level: loadLevel(load, maxLoad), count: summary?.count ?? 0, load });
    }
    cols.push(col);
  }
  return cols;
}
