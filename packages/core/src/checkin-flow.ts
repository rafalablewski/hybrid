/**
 * Daily check-in — the shared step model behind the GUIDED check-in flow on both
 * clients (web wizard + mobile wizard). The flow walks one metric per card, in a
 * fixed order, with a 1–5 scale whose selected value maps to the SAME readiness
 * face the quick picker draws (via feelingFromRating). Keeping the metric order,
 * i18n keys and value→face mapping here is the single source of truth so web and
 * mobile can't drift.
 */
import { feelingFromRating, type ReadinessFeeling } from "./readiness-feeling";

export type CheckinMetricKey = "energy" | "sleep" | "soreness" | "mood";

/** The metrics the guided flow steps through, in order, with their i18n keys.
 *  `questionKey` is the big one-per-card prompt; `labelKey` names the metric.
 *  Soreness is phrased as "how fresh" so a higher rating always reads as better
 *  (5 = best), matching how every metric is scored (5 = lime). */
export const CHECKIN_METRICS: {
  key: CheckinMetricKey;
  labelKey: string;
  questionKey: string;
}[] = [
  { key: "energy", labelKey: "w.recovery.checkins.energy", questionKey: "w.recovery.checkins.qEnergy" },
  { key: "sleep", labelKey: "w.recovery.checkins.sleep", questionKey: "w.recovery.checkins.qSleep" },
  { key: "soreness", labelKey: "w.recovery.checkins.soreness", questionKey: "w.recovery.checkins.qSoreness" },
  { key: "mood", labelKey: "w.recovery.checkins.mood", questionKey: "w.recovery.checkins.qMood" },
];

/** Total steps in the flow: one per metric, plus the final details/submit card. */
export const CHECKIN_STEP_COUNT = CHECKIN_METRICS.length + 1;

/** The 1–5 rating options each metric step offers. */
export const CHECKIN_SCALE = [1, 2, 3, 4, 5] as const;

/** i18n key for the reactive word describing a 1–5 rating (Very low … Great). */
export function checkinScaleWordKey(value: number): string {
  const v = Math.max(1, Math.min(5, Math.round(value)));
  return `w.recovery.checkins.scale${v}`;
}

/** The readiness face a 1–5 rating maps to — shared with the quick picker so the
 *  same value always draws the same expression + accent on both clients. */
export function checkinScaleFeeling(value: number): ReadinessFeeling {
  return feelingFromRating(value);
}

/** Re-log cadence: a feeling must be logged at least once a day, and may be
 *  re-logged at most once every 6 hours. This is the shared window both clients
 *  read to show "next in …" on the home feeling card. */
export const CHECKIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Milliseconds left in the 6h re-log window (0 once it's open again). */
export function checkinCooldownRemainingMs(lastLoggedMs: number, nowMs = Date.now()): number {
  return Math.max(0, CHECKIN_COOLDOWN_MS - (nowMs - lastLoggedMs));
}
