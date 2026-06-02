import type { Biometrics } from "./engines/types";

/** A stored biometric reading (manual entry today; HealthKit/WHOOP later). */
export interface BiometricEntry {
  date: string;
  hrv?: number | null;
  restingHr?: number | null;
  sleepH?: number | null;
}

/**
 * Build the engine's Biometrics (today vs. baseline) from stored readings.
 * Today = the latest entry; baseline = the mean of earlier entries (so a single
 * reading yields a neutral adjustment). Returns null when there are no entries.
 */
export function buildBiometrics(entries: BiometricEntry[]): Biometrics | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const today = sorted[0]!;
  const rest = sorted.slice(1);

  const metric = (
    key: "hrv" | "restingHr" | "sleepH",
    fallback: number,
    better: "high" | "low",
    unit: string,
  ) => {
    const todayVal = today[key] ?? fallback;
    const prior = rest.map((e) => e[key]).filter((v): v is number => v != null);
    const baseline = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : todayVal;
    return { today: todayVal, baseline, unit, better };
  };

  return {
    hrv: metric("hrv", 60, "high", "ms"),
    restingHr: metric("restingHr", 55, "low", "bpm"),
    sleep: metric("sleepH", 7.5, "high", "h"),
  };
}
