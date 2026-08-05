import type { Biometrics, BiometricMetric } from "./engines/types";
import { BIOMETRIC_FRESH_DAYS, signalAgeDays } from "./engines/signals";

/** A stored biometric reading (manual entry today; HealthKit/WHOOP later). */
export interface BiometricEntry {
  date: string;
  hrv?: number | null;
  restingHr?: number | null;
  sleepH?: number | null;
}

/**
 * A metric with no usable reading. today === baseline, so its deviation is
 * exactly 0 and it cannot move the score.
 *
 * THIS REPLACES A FABRICATION. The old code substituted a HARDCODED value for
 * any field the latest entry lacked — HRV 60ms, resting HR 55bpm, sleep 7.5h —
 * and then compared that invented number against the athlete's REAL baseline.
 * An athlete whose true resting HR sits at 50 and whose latest row simply had
 * no resting-HR field was handed an invented 55, a fabricated +10% deviation,
 * and −4 points of "recovery" that no measurement supports. The Signal path
 * (engines/signals.ts `toBiometrics`) always neutralised correctly; this one
 * did not, and web falls back to it.
 */
const neutral = (better: "high" | "low"): BiometricMetric => ({
  today: 1,
  baseline: 1,
  unit: "",
  better,
  measured: false,
});

/**
 * Build the engine's Biometrics (today vs. baseline) from stored readings.
 *
 * Today = the latest entry, PROVIDED it is recent enough to be a statement
 * about today (BIOMETRIC_FRESH_DAYS — the same window the Signal path uses, so
 * the two sources can't disagree about what "today" means). Baseline = the mean
 * of earlier entries, so a single reading yields a neutral adjustment.
 *
 * Returns null when there are no entries, when the latest is stale, or when it
 * carries no usable field — in every one of those cases there is nothing to
 * say about today, and the card's wearable line disappears rather than
 * asserting a measurement that wasn't taken.
 */
export function buildBiometrics(entries: BiometricEntry[], now: number = Date.now()): Biometrics | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const today = sorted[0]!;
  const rest = sorted.slice(1);

  const age = signalAgeDays(today.date, now);
  if (age === null || age > BIOMETRIC_FRESH_DAYS) return null;

  const metric = (
    key: "hrv" | "restingHr" | "sleepH",
    better: "high" | "low",
    unit: string,
  ): BiometricMetric => {
    const todayVal = today[key];
    if (todayVal == null) return neutral(better);
    const prior = rest.map((e) => e[key]).filter((v): v is number => v != null);
    const baseline = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : todayVal;
    return { today: todayVal, baseline, unit, better, source: "manual", ts: today.date, measured: true };
  };

  const bio: Biometrics = {
    hrv: metric("hrv", "high", "ms"),
    restingHr: metric("restingHr", "low", "bpm"),
    sleep: metric("sleepH", "high", "h"),
  };
  // Every field empty is the same as no entry at all — say nothing rather than
  // returning three neutrals that render as a measured all-quiet.
  if (!bio.hrv.measured && !bio.restingHr.measured && !bio.sleep.measured) return null;
  return bio;
}
