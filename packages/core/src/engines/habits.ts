/**
 * Habits & streaks — the consistency layer.
 *
 * Everyday adherence, not physiology: forgiving day-streaks, weekly consistency,
 * and a 0..100 habit-strength score (how automatic the routine has become). Pure
 * data + math; reads only logged-session dates so it works for any client.
 */

import type { LoggedSession } from "./session";

const DAY = 86_400_000;

/** YYYY-MM-DD bucket for an ISO timestamp (UTC calendar day). */
const dayKey = (iso: string) => iso.slice(0, 10);
const dayNum = (iso: string) => Math.floor(Date.parse(`${dayKey(iso)}T00:00:00.000Z`) / DAY);
const todayNum = (now: number) => Math.floor(now / DAY);

/** Distinct active calendar days (UTC), newest-first. */
export function activeDays(sessions: LoggedSession[]): string[] {
  return [...new Set(sessions.map((s) => dayKey(s.startedAt)))].sort((a, b) => (a < b ? 1 : -1));
}

export interface StreakInfo {
  /** active days in the current run (0 once the streak has lapsed) */
  current: number;
  /** best run ever */
  longest: number;
  /** last active day (YYYY-MM-DD) or null */
  lastActive: string | null;
  /** whole days since the last active day (null if none) */
  daysSinceLast: number | null;
  /** the streak is still saveable today */
  alive: boolean;
}

/**
 * Forgiving day-streak: two active days stay in the same run as long as no more
 * than `graceDays` rest days fall between them. The current run stays "alive"
 * while today is within `graceDays` of the last active day — so a planned rest
 * day never punishes the user.
 */
export function streak(sessions: LoggedSession[], graceDays = 1, now = Date.now()): StreakInfo {
  const days = activeDays(sessions);
  if (days.length === 0) return { current: 0, longest: 0, lastActive: null, daysSinceLast: null, alive: false };

  // ascending day-numbers
  const nums = days.map((d) => Math.floor(Date.parse(`${d}T00:00:00.000Z`) / DAY)).sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i]! - nums[i - 1]! <= graceDays + 1) run++;
    else run = 1;
    if (run > longest) longest = run;
  }
  const lastNum = nums[nums.length - 1]!;
  const daysSinceLast = todayNum(now) - lastNum;
  const alive = daysSinceLast <= graceDays;
  return {
    current: alive ? run : 0,
    longest,
    lastActive: days[0]!,
    daysSinceLast,
    alive,
  };
}

/** Sessions in the 7-day window ending `weeksAgo*7` days before now. */
export function sessionsInWeek(sessions: LoggedSession[], weeksAgo: number, now = Date.now()): number {
  const end = now - weeksAgo * 7 * DAY;
  const start = end - 7 * DAY;
  return sessions.filter((s) => {
    const t = Date.parse(s.startedAt);
    return t > start && t <= end;
  }).length;
}

/** Fraction of the last `weeks` weeks that had ≥1 session (0..1). */
export function weeklyConsistency(sessions: LoggedSession[], weeks = 4, now = Date.now()): number {
  let hit = 0;
  for (let w = 0; w < weeks; w++) if (sessionsInWeek(sessions, w, now) >= 1) hit++;
  return weeks ? hit / weeks : 0;
}

/**
 * Habit-strength 0..100 — recency-weighted hit rate over the last 4 weeks
 * against a weekly target. Recent weeks count most (a strong habit is about what
 * you're doing now), so a comeback rebuilds the score quickly.
 */
export function habitStrength(sessions: LoggedSession[], targetPerWeek = 3, now = Date.now()): number {
  const weights = [0.4, 0.3, 0.2, 0.1];
  const target = Math.max(1, targetPerWeek);
  let score = 0;
  for (let w = 0; w < weights.length; w++) {
    const hit = Math.min(1, sessionsInWeek(sessions, w, now) / target);
    score += weights[w]! * hit;
  }
  return Math.round(score * 100);
}
