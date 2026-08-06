import { useMemo } from "react";
import {
  estimateFitnessLevel, nextThreshold, badgeFor, displayLevel,
  type FitnessLevelEstimate, type LevelReach, type LevelBadge, type FitnessLevel,
  type LoggedSession,
} from "@hybrid/core";
import { useLoggerPrefs } from "./logger-prefs";
import { useBodyweight } from "./use-bodyweight";

export interface FitnessLevelRead {
  estimate: FitnessLevelEstimate;
  /** The headline level, or null when the log could not measure one. Render
   *  THIS — never `estimate.level`, which reads "untrained" with no data. */
  level: FitnessLevel | null;
  /** What the next tier costs, in kilos or seconds per km. */
  reach: LevelReach | null;
  /** The public badge, or null when it has not been earned yet. */
  badge: LevelBadge | null;
}

/**
 * THE LEVEL, RESOLVED ONCE.
 *
 * Three surfaces now show the athlete's training level — the Performance card,
 * the Profile badge, and the working on the Volume screen — and they must never
 * be able to disagree. They cannot, because they all read this: one estimate
 * per screen load, from one set of inputs.
 *
 * Mirrors apps/web/lib/use-fitness-level.ts.
 */
export function useFitnessLevel(sessions: LoggedSession[]): FitnessLevelRead {
  const prefs = useLoggerPrefs();
  const bodyweight = useBodyweight();

  const estimate = useMemo(
    () => estimateFitnessLevel(sessions, {
      bodyweightKg: prefs.volumeProfile.bodyweightKg ?? bodyweight,
      ageYears: prefs.volumeProfile.ageYears ?? null,
    }),
    [sessions, prefs.volumeProfile.bodyweightKg, prefs.volumeProfile.ageYears, bodyweight],
  );

  return useMemo(
    () => ({
      estimate,
      level: displayLevel(estimate),
      reach: nextThreshold(estimate),
      badge: badgeFor(estimate),
    }),
    [estimate],
  );
}
