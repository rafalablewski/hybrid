import type { LogItem, ProgressionSignal, TrainingLog } from "./types";

/**
 * Per-movement progression signal from the e1RM trend and the last top-set RPE.
 *  - rising e1RM at RPE ≤ 8 → progress
 *  - RPE ≥ 9 → deload (accumulating fatigue)
 *  - stalled e1RM → hold and consolidate
 * Confidence grows with how much history exists for the movement.
 */
export function progressionSignal(
  log: TrainingLog,
  move: string,
): ProgressionSignal {
  const hits = log
    .filter((s) => s.items.some((i) => i.move === move))
    // Sort newest-first by daysAgo so the trend never inverts when a caller
    // passes an unsorted or oldest-first log (previously this trusted input
    // order and only worked because the live API happens to return desc).
    .slice()
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .map((s) => s.items.find((i) => i.move === move))
    .filter((i): i is LogItem => !!i && i.e1rm !== undefined);

  if (hits.length < 2)
    return { action: "hold", reason: "not enough history", confidence: 0.3 };

  const latest = hits[0]!;
  const prev = hits[1]!;
  const trendUp = latest.e1rm! >= prev.e1rm!;
  const lastRpe = latest.topRpe ?? 7;

  if (trendUp && lastRpe <= 8.0)
    return {
      action: "progress",
      reason: "e1RM rising, RPE in range",
      confidence: 0.85,
    };
  if (lastRpe >= 9.0)
    return {
      action: "deload",
      reason: "RPE 9+ — accumulating fatigue",
      confidence: 0.8,
    };
  if (!trendUp)
    return {
      action: "hold",
      reason: "e1RM stalled — repeat to consolidate",
      confidence: 0.7,
    };
  return { action: "progress", reason: "steady progress", confidence: 0.75 };
}
