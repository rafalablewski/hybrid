/**
 * Planned-vs-actual compliance — the online-coaching adherence view.
 *
 * Compares what was planned (a weekly session target) against what was actually
 * logged: this week's completion %, a status, a streak of compliant weeks, and a
 * 4-week history. The heart of remote coaching — did the work get done? Pure.
 */

import type { LoggedSession } from "./session";
import { sessionsInWeek } from "./habits";

export type ComplianceStatus = "on-plan" | "under" | "over" | "no-plan";

export interface WeekCompliance {
  weeksAgo: number;
  completed: number;
  target: number;
  met: boolean;
}

export interface ComplianceState {
  target: number;
  completedThisWeek: number;
  /** completed ÷ target as a percentage (can exceed 100) */
  pct: number;
  status: ComplianceStatus;
  /** consecutive recent weeks (incl. this one) that met ≥80% of target */
  compliantWeeks: number;
  weekly: WeekCompliance[];
}

/** Weekly planned-vs-actual compliance from logged sessions. */
export function computeCompliance(
  sessions: LoggedSession[],
  opts: { targetPerWeek?: number; weeks?: number; now?: number } = {},
): ComplianceState {
  const target = Math.max(0, opts.targetPerWeek ?? 3);
  const weeks = opts.weeks ?? 4;
  const now = opts.now ?? Date.now();
  const metThreshold = Math.max(1, Math.ceil(target * 0.8));

  const completedThisWeek = sessionsInWeek(sessions, 0, now);
  const pct = target > 0 ? Math.round((completedThisWeek / target) * 100) : 0;

  const status: ComplianceStatus =
    target <= 0
      ? "no-plan"
      : completedThisWeek > target * 1.5
        ? "over"
        : completedThisWeek >= target
          ? "on-plan"
          : "under";

  const weekly: WeekCompliance[] = [];
  for (let w = 0; w < weeks; w++) {
    const completed = sessionsInWeek(sessions, w, now);
    weekly.push({ weeksAgo: w, completed, target, met: target > 0 && completed >= metThreshold });
  }

  // current streak of compliant weeks, counting back from this week
  let compliantWeeks = 0;
  for (const wk of weekly) {
    if (wk.met) compliantWeeks++;
    else break;
  }

  return { target, completedThisWeek, pct, status, compliantWeeks, weekly };
}
