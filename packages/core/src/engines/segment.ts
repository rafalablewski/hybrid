/**
 * Auto-segmentation — the coach's "who needs me today" triage, computed (not
 * manually tagged). Buckets an athlete from the squad signals the monitor
 * already has, so a 100-athlete roster sorts itself into action groups.
 */

export type AthleteSegment = "needs-attention" | "dormant" | "new" | "on-track";

export interface SegmentInputs {
  readiness?: number | null;
  acwrBand?: string;
  flagged?: boolean;
  daysSinceLast?: number | null;
  sessions?: number;
}

export const SEGMENT_LABELS: Record<AthleteSegment, string> = {
  "needs-attention": "Needs attention",
  dormant: "Dormant",
  new: "New",
  "on-track": "On track",
};

/** Bucket an athlete into an action segment (priority order). */
export function athleteSegment(x: SegmentInputs): AthleteSegment {
  if (x.daysSinceLast != null && x.daysSinceLast > 14) return "dormant";
  const lowReadiness = x.readiness != null && x.readiness < 55;
  const loadFlag = x.acwrBand === "caution" || x.acwrBand === "danger";
  if (lowReadiness || loadFlag || x.flagged) return "needs-attention";
  if (x.sessions != null && x.sessions <= 3) return "new";
  return "on-track";
}
