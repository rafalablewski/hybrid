import type { TrainingLog, Biometrics } from "./types";

/** A structured training log used for demos, tests, and the seeded dashboard
 *  before a user has logged real sessions. Ported from the prototype. */
export const SAMPLE_TRAINING_LOG: TrainingLog = [
  {
    daysAgo: 1,
    items: [
      { move: "Back Squat", e1rm: 154, topRpe: 9.0, hardSets: 5 },
      { move: "Row Intervals", system: "threshold", minutes: 16, rpe: 8 },
    ],
  },
  {
    daysAgo: 2,
    items: [
      { move: "Bench Press", e1rm: 122, topRpe: 8.5, hardSets: 4 },
      { move: "Assault Bike", system: "anaerobic", minutes: 9, rpe: 9 },
    ],
  },
  {
    daysAgo: 4,
    items: [
      { move: "Back Squat", e1rm: 151, topRpe: 8.0, hardSets: 4 },
      { move: "Easy Run", system: "aerobic", minutes: 35, rpe: 5 },
    ],
  },
  {
    daysAgo: 6,
    items: [{ move: "Deadlift", e1rm: 188, topRpe: 8.5, hardSets: 3 }],
  },
  {
    daysAgo: 7,
    items: [
      { move: "Bench Press", e1rm: 120, topRpe: 8.0, hardSets: 4 },
      { move: "Mixed Metcon", system: "anaerobic", minutes: 12, rpe: 9 },
    ],
  },
  {
    daysAgo: 9,
    items: [{ move: "Back Squat", e1rm: 145, topRpe: 7.5, hardSets: 4 }],
  },
];

/** Today's wearable reading vs the athlete's rolling baseline. */
export const SAMPLE_BIOMETRICS: Biometrics = {
  hrv: { today: 68, baseline: 62, unit: "ms", better: "high" },
  restingHr: { today: 52, baseline: 54, unit: "bpm", better: "low" },
  sleep: { today: 7.2, baseline: 7.5, unit: "h", better: "high" },
  sleepScore: { today: 81, baseline: 78, unit: "", better: "high" },
};

/**
 * A sample heat log — one sitting last night, so the Engine Room's heat panel
 * has something to show before an operator picks a real athlete.
 *
 * A FUNCTION, not a constant, because the credit decays against the clock: a
 * frozen ISO string would drift out of the 48-hour window a couple of days
 * after it was written and the sample would quietly go blank.
 */
export function sampleHeatSignals(now: number = Date.now()): { kind: string; value: number; source: string; ts: string }[] {
  const ts = new Date(now - 9.5 * 3_600_000).toISOString();
  return [
    { kind: "sauna", value: 22, source: "manual", ts },
    { kind: "saunaTemp", value: 90, source: "manual", ts },
  ];
}
