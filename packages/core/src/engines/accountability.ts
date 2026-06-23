/**
 * The Accountability Engine (v1) — predict the quit, intervene before it.
 *
 * People don't fail at workouts, they disappear. This engine scores
 * disengagement RISK from training cadence (gap since last session, week-over-
 * week frequency decline, target miss) BEFORE the user churns, classifies a
 * band, explains the drivers, and recommends the single best re-engagement
 * intervention for that state. Heuristic v0, documented; built so labeled
 * save/churn outcomes can later refit it through the data network.
 *
 * Pure data + math; reads only logged-session timestamps.
 */

import type { LoggedSession } from "./session";
import { streak, sessionsInWeek, type StreakInfo } from "./habits";

const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export type EngagementBand = "new" | "thriving" | "steady" | "wobbling" | "at-risk" | "dormant";

export type InterventionType = "onboard" | "celebrate" | "nudge" | "ease" | "winback";
export type Urgency = "none" | "low" | "medium" | "high";

export interface Intervention {
  type: InterventionType;
  urgency: Urgency;
  headline: string;
  message: string;
}

export interface AccountabilityDriver {
  label: string;
  weight: number; // contribution to risk
}

export interface AccountabilityState {
  /** disengagement risk, 0..100 (higher = more likely to lapse) */
  risk: number;
  band: EngagementBand;
  daysSinceLast: number | null;
  sessionsLast7: number;
  sessionsPrev7: number;
  /** signed % change in weekly frequency (positive = trending up) */
  frequencyTrend: number;
  streak: StreakInfo;
  drivers: AccountabilityDriver[];
  intervention: Intervention;
}

export interface AccountabilityOptions {
  targetPerWeek?: number;
  now?: number;
}

/** Score an athlete's disengagement risk and pick a re-engagement intervention. */
export function computeAccountability(
  sessions: LoggedSession[],
  opts: AccountabilityOptions = {},
): AccountabilityState {
  const now = opts.now ?? Date.now();
  const target = Math.max(1, opts.targetPerWeek ?? 3);
  const str = streak(sessions, 1, now);

  const last7 = sessionsInWeek(sessions, 0, now);
  const prev7 = sessionsInWeek(sessions, 1, now);
  const frequencyTrend = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0;

  // No history yet — a distinct "getting started" state, not a lapse. A
  // brand-new user hasn't disengaged from anything, so risk is 0 and the band
  // is "new" (NOT "wobbling", which would wrongly imply they're slipping).
  if (sessions.length === 0) {
    return {
      risk: 0,
      band: "new",
      daysSinceLast: null,
      sessionsLast7: 0,
      sessionsPrev7: 0,
      frequencyTrend: 0,
      streak: str,
      drivers: [],
      intervention: {
        type: "onboard",
        urgency: "medium",
        headline: "Start strong",
        message: "Log your first session today to start your streak — momentum begins with one.",
      },
    };
  }

  const daysSinceLast = str.daysSinceLast ?? 0;
  const expectedInterval = 7 / target; // days between sessions at target cadence
  const overdue = daysSinceLast / expectedInterval;

  const gapRisk = clamp((overdue - 1) * 40, 0, 70);
  const declineRisk =
    prev7 > 0 ? clamp((1 - last7 / prev7) * 30, 0, 30) : last7 === 0 ? 20 : 0;
  const targetMiss = clamp(((target - last7) / target) * 15, 0, 15);
  const dormantBoost = daysSinceLast > 14 ? 25 : 0;
  const risk = Math.round(clamp(gapRisk + declineRisk + targetMiss + dormantBoost, 0, 100));

  // "dormant" is reserved for a genuine absence (>14d). A high risk score with
  // RECENT activity is "at-risk", not dormant — otherwise someone who trained a
  // few days ago gets the "it's been a while" win-back message.
  const band: EngagementBand =
    daysSinceLast > 14
      ? "dormant"
      : risk < 15
        ? "thriving"
        : risk < 35
          ? "steady"
          : risk < 55
            ? "wobbling"
            : "at-risk";

  const drivers: AccountabilityDriver[] = [];
  if (daysSinceLast >= 1) drivers.push({ label: `${daysSinceLast}d since last session`, weight: Math.round(gapRisk) });
  if (last7 < prev7) drivers.push({ label: `training down ${Math.round(-frequencyTrend)}% vs last week`, weight: Math.round(declineRisk) });
  if (last7 < target) drivers.push({ label: `${last7}/${target} sessions this week`, weight: Math.round(targetMiss) });
  drivers.sort((a, b) => b.weight - a.weight);

  return {
    risk,
    band,
    daysSinceLast,
    sessionsLast7: last7,
    sessionsPrev7: prev7,
    frequencyTrend: Math.round(frequencyTrend),
    streak: str,
    drivers: drivers.filter((d) => d.weight > 0),
    intervention: intervene(band, daysSinceLast, str),
  };
}

/** Map an engagement band to the single best re-engagement action. */
function intervene(band: EngagementBand, daysSinceLast: number, str: StreakInfo): Intervention {
  switch (band) {
    case "thriving":
      return {
        type: "celebrate",
        urgency: "none",
        headline: `${str.current}-day streak 🔥`,
        message: "You're on a roll — your consistency is doing the work. Keep it rolling.",
      };
    case "steady":
      return {
        type: "celebrate",
        urgency: "low",
        headline: "Right on track",
        message: "Solid week. Lock in your next session to keep the momentum.",
      };
    case "wobbling":
      return {
        type: "nudge",
        urgency: "medium",
        headline: "Keep your momentum",
        message: "One more session this week keeps your streak alive — even a short one counts.",
      };
    case "at-risk":
      return {
        type: "ease",
        urgency: "medium",
        headline: "Let's get back on track",
        message: `It's been ${daysSinceLast} days. Here's a quick 20-minute session to restart — small and done beats perfect and skipped.`,
      };
    case "dormant":
    default:
      return {
        type: "winback",
        urgency: "high",
        headline: "Your progress isn't lost",
        message: `It's been a while, but your ${str.longest}-day best is still yours. Restart with one easy session today — that's all it takes.`,
      };
  }
}
