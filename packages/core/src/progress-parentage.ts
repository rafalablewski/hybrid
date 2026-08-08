/**
 * PROGRESS PARENTAGE — the figures the Progress cluster's rail heads quote
 * (consistency wave 3; see the "Progress, made consistent" design study).
 *
 * The This-week verdict card's columns are the PARENTS of the rails beneath
 * it: the volume column is what the exercises rail breaks down per movement,
 * the distance column is what the endurance lanes break down per discipline,
 * and the sports' share of the hours column is what the other-sports tiles
 * break down per sport. Wave 3 makes that parentage visible — each rail's
 * head meta quotes the figure it decomposes.
 *
 * THE RECONCILIATION RULE: a rail claiming 21.8 km under a column saying 21.6
 * would be worse than no parentage at all. So this module computes NOTHING of
 * its own — it calls the exact activitySummary the verdict card renders, over
 * the exact "week" range (Monday → Sunday), and returns the same canonical
 * units (kg / minutes / km, never formatted here). Both clients quote through
 * this one function, so the head meta and the column can never disagree.
 */
import { activitySummary, resolveActivityRange } from "./activity-window";
import type { BodyweightInput } from "./bodyweight";
import type { LoggedSession } from "./engines/session";

export interface ProgressParentage {
  /** This week's lifted tonnage in kg — the verdict's volume column. */
  tonnageKg: number;
  /** This week's total distance in km — the verdict's distance column. */
  distanceKm: number;
  /** This week's minutes attributed to `sport` groups (tennis, squash, …). */
  sportMinutes: number;
  /**
   * This week's minutes attributed to the whole ENDURANCE SECTION — every
   * `endurance` and `sport` group, which is what the endurance summary card
   * prints as its TIME figure.
   *
   * This is the denominator Other sports quotes against, and it changed when
   * the section split. Under the old single Progress cluster the sports tiles
   * sat beneath a card whose hours column WAS the whole week, so "3.1 of 5.2 h"
   * named its parent correctly. Inside an Endurance section headed by a card
   * reading "3.2 h", a denominator of 5.2 (lifting included) reads as that
   * card's total and contradicts it. The tiles' parent is now the block
   * directly above them.
   */
  enduranceMinutes: number;
  /** This week's total minutes — the verdict's hours column. */
  totalMinutes: number;
}

export function progressParentage(
  sessions: LoggedSession[],
  opts: { now?: number; bw?: BodyweightInput } = {},
): ProgressParentage {
  const sum = activitySummary(sessions, resolveActivityRange("week", opts.now), opts.bw);
  const sportMinutes = sum.details.hours.groups
    .filter((g) => g.kind === "sport")
    .reduce((n, g) => n + g.value, 0);
  const enduranceMinutes = sum.details.hours.groups
    .filter((g) => g.kind === "sport" || g.kind === "endurance")
    .reduce((n, g) => n + g.value, 0);
  return {
    tonnageKg: sum.totals.tonnage,
    distanceKm: sum.totals.distance,
    sportMinutes,
    enduranceMinutes,
    totalMinutes: sum.totals.hours,
  };
}

/** Canonical minutes → the one-decimal hours figure the clients print. */
export const parentageHours = (minutes: number): number => Math.round(minutes / 6) / 10;
