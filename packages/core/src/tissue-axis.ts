/**
 * TISSUE AXIS — the shared geometry behind the injury card's one graphic.
 *
 * The injury engine defines overall risk as `Math.max` of the per-tissue
 * scores (see engines/injury.ts), so the headline number IS one of the
 * tissues. That lets the card draw a single object at two zoom levels:
 *
 *   collapsed — one 0..100 axis carrying a tick per tissue, the heaviest
 *               tick being the overall score (the same number);
 *   open      — the same tissues as rows on the SAME scale, each with its
 *               own risk, calibrated probability and ACWR.
 *
 * Because both views share this module, the flag line and every tick/bar sit
 * at identical positions on web and mobile — neither client rounds its own.
 *
 * Pure: no formatting, no copy. Clients format the numbers and resolve the
 * i18n keys; this decides WHERE things sit and WHAT counts as flagged.
 */

import type { MuscleGroup } from "./engines/types";
import type { InjuryRisk, RiskBand, RiskDriverKind } from "./engines/injury";

/**
 * The FLAG LINE. A tissue at or above this score is on the coach's worklist —
 * it is exactly the `elevated` band's floor in engines/injury.ts, so
 * `flagged.length > 0` and "the marker sits right of the line" can never
 * disagree. Drawn as a rule through the axis and down the rows.
 */
export const FLAG_THRESHOLD = 50;

/** A band's stretch of the 0..100 axis. Mirrors `band()` in engines/injury.ts;
 *  if those thresholds move, these move with them (guarded by the tests). */
export interface RiskZone {
  band: RiskBand;
  /** inclusive lower bound of the band, 0..100 */
  from: number;
  /** exclusive upper bound (100 for the top band) */
  to: number;
  /** the zone's share of the axis, in percent — the width to draw */
  widthPct: number;
}

export const RISK_ZONES: readonly RiskZone[] = [
  { band: "low", from: 0, to: 30, widthPct: 30 },
  { band: "moderate", from: 30, to: 50, widthPct: 20 },
  { band: "elevated", from: 50, to: 70, widthPct: 20 },
  { band: "high", from: 70, to: 100, widthPct: 30 },
];

/** One tissue, positioned. Collapsed the card draws these as ticks; open it
 *  draws the same objects as rows, so a tissue never moves between views. */
export interface TissueRow {
  tissue: MuscleGroup;
  /** 0..100 */
  risk: number;
  band: RiskBand;
  /** where the tick / the end of the bar sits, 0..100 (percent of the axis) */
  leftPct: number;
  /** at or above FLAG_THRESHOLD — on the worklist */
  flagged: boolean;
  /** carries the card's headline score (risk === overall). At most one row. */
  top: boolean;
  /** calibrated injury probability as a PERCENT (0..100), unrounded */
  probPct: number;
  /** this tissue's own acute:chronic ratio, or null when it has no trusted
   *  baseline yet — the "—" case, explained by `awaitingBaseline`. NOT the
   *  whole-body ACWR from computeLoad; they are different numbers. */
  acwr: number | null;
  /** the heaviest driver behind this tissue's score, if any */
  driver: RiskDriverKind | null;
}

export interface TissueAxis {
  /** the engine's overall score — the highest tissue's */
  overall: number;
  band: RiskBand;
  /** the tissue carrying `overall`, or null with no data */
  topTissue: MuscleGroup | null;
  flaggedCount: number;
  total: number;
  /** where the flag line sits, in percent of the axis */
  flagLeftPct: number;
  zones: readonly RiskZone[];
  /** every tissue, highest risk first */
  rows: TissueRow[];
  /** tissues trained recently with no chronic baseline — they read "—" */
  awaitingBaseline: MuscleGroup[];
  modelVersion: string;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Project an InjuryRisk onto the axis. Rows are sorted highest-first here
 * rather than trusting the engine's order, so the two clients cannot disagree
 * about row order even if that order ever changes upstream.
 */
export function tissueAxis(risk: InjuryRisk): TissueAxis {
  const sorted = [...risk.tissues].sort((a, b) => b.risk - a.risk);
  // The top row is the one carrying the headline score. Only the FIRST match
  // is marked: with ties (two tissues at the same max) a single heavy tick is
  // the honest drawing — the score belongs to one number, not two.
  let topTaken = false;
  const rows: TissueRow[] = sorted.map((ti) => {
    const top = !topTaken && ti.risk === risk.overall && ti.risk > 0;
    if (top) topTaken = true;
    return {
      tissue: ti.tissue,
      risk: ti.risk,
      band: ti.band,
      leftPct: clampPct(ti.risk),
      flagged: ti.risk >= FLAG_THRESHOLD,
      top,
      probPct: ti.prob * 100,
      acwr: ti.enoughHistory ? ti.acwr : null,
      driver: ti.drivers[0]?.kind ?? null,
    };
  });

  return {
    overall: risk.overall,
    band: risk.band,
    topTissue: rows.find((r) => r.top)?.tissue ?? null,
    flaggedCount: rows.filter((r) => r.flagged).length,
    total: rows.length,
    flagLeftPct: FLAG_THRESHOLD,
    zones: RISK_ZONES,
    rows,
    awaitingBaseline: risk.awaitingBaseline,
    modelVersion: risk.modelVersion,
  };
}

/**
 * The card's headline sentence — an i18n key, so web and mobile speak with
 * ONE voice and a translator edits one string.
 *
 * Keyed off the band rather than the flagged count: `overall` is the max of
 * the tissues, so "something is flagged" and "the band is elevated or high"
 * are the same fact, and a count-free sentence stays grammatical in every
 * language (no singular/plural agreement to get wrong in pl/de).
 */
export function injuryHeadlineKey(axis: Pick<TissueAxis, "band" | "flaggedCount">): string {
  if (axis.flaggedCount === 0) return "w.injury.line.clear";
  return axis.band === "high" ? "w.injury.line.high" : "w.injury.line.elevated";
}
