/**
 * RPE reference — the single source of truth for the "how hard did that feel?"
 * cheatsheet shown next to the RPE field in both loggers (web + mobile).
 *
 * RPE (Rate of Perceived Exertion) rates a set 1–10. The practical way to judge
 * it is Reps In Reserve (RIR): how many more reps you could have done before
 * failure. RPE = 10 − RIR. Kept here so the explanation can't drift between the
 * two clients (the surrounding UI chrome is localized; this reference text is
 * source-language, like the plan/sport content).
 */

export interface RpeStep {
  /** The RPE value (or top of its half-point band). */
  rpe: number;
  /** Reps in reserve at this effort. */
  rir: string;
  /** What that effort feels like on the last rep. */
  meaning: string;
}

/** The 10-point scale, hardest first. */
export const RPE_SCALE: RpeStep[] = [
  { rpe: 10, rir: "0", meaning: "Max effort — could not do another rep" },
  { rpe: 9.5, rir: "0–1", meaning: "No more reps, maybe a touch more load" },
  { rpe: 9, rir: "1", meaning: "One solid rep left in the tank" },
  { rpe: 8, rir: "2", meaning: "Two reps left — hard but bar speed holds" },
  { rpe: 7, rir: "3", meaning: "Three reps left — a strong working set" },
  { rpe: 6, rir: "4+", meaning: "Snappy and easy — speed or technique work" },
  { rpe: 5, rir: "5+", meaning: "Warm-up effort, very light" },
];

/** One-paragraph plain-language explainer for the top of the cheatsheet. */
export const RPE_INTRO =
  "RPE (Rate of Perceived Exertion) is how hard a set felt, on a 1–10 scale. The easiest way to judge it: count your Reps In Reserve (RIR) — how many more reps you could have done before failing. RPE = 10 − RIR. So a set you stop with 2 good reps still in the tank is an RPE 8.";

/** Nudge for logging conditioning effort on the same 1–10 feel. */
export const RPE_CARDIO_NOTE =
  "For cardio, rate the whole effort the same way: RPE 6 is a conversational easy run, RPE 8 is comfortably hard / threshold, RPE 10 is an all-out finish.";

/** Nearest scale step for a logged RPE value (for inline hints). */
export function rpeStepFor(value: number | string | undefined): RpeStep | undefined {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return undefined;
  return RPE_SCALE.reduce<RpeStep | undefined>((best, step) => {
    if (!best) return step;
    return Math.abs(step.rpe - n) < Math.abs(best.rpe - n) ? step : best;
  }, undefined);
}
