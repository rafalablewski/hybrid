// The athlete's bodyweight over time — the dated BodyMetric log distilled into
// a LOOKUP the engines can query per session date. Bodyweight-aware tonnage
// and e1RM must use the weight the athlete WAS at the time of each session
// (10 pull-ups at 70 kg three months ago is 700 kg, even if they're 75 kg
// today), so everything downstream takes a lookup, not a single number.

export interface BodyweightPoint {
  /** ISO date of the measurement. */
  date: string;
  weightKg: number;
}

/**
 * Resolve the athlete's bodyweight (kg) at a date — or the CURRENT weight when
 * called with no date. Null when nothing is known.
 */
export type BodyweightLookup = (isoDate?: string) => number | null;

/**
 * What the extended engines accept: a plain number (the current weight — fine
 * for live/now surfaces), a dated lookup (history surfaces), or nothing.
 */
export type BodyweightInput = number | BodyweightLookup | null | undefined;

/** Resolve a BodyweightInput at a date. */
export const bwAt = (bw: BodyweightInput, isoDate?: string): number | null =>
  typeof bw === "function" ? bw(isoDate) : bw ?? null;

/**
 * Build a lookup from measurement points: the most recent measurement at or
 * before the queried date; a session OLDER than every measurement uses the
 * earliest one (the best available guess); no date → the latest overall.
 */
export function bodyweightLookup(points: BodyweightPoint[]): BodyweightLookup {
  const sorted = points
    .filter((p) => Number.isFinite(p.weightKg) && p.weightKg > 0 && !Number.isNaN(Date.parse(p.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (sorted.length === 0) return () => null;
  return (isoDate?: string) => {
    if (isoDate == null) return sorted[sorted.length - 1]!.weightKg;
    const at = Date.parse(isoDate);
    if (Number.isNaN(at)) return sorted[sorted.length - 1]!.weightKg;
    let best = sorted[0]!;
    for (const p of sorted) {
      if (Date.parse(p.date) > at) break;
      best = p;
    }
    return best.weightKg;
  };
}
