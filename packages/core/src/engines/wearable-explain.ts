import type { Biometrics, BiometricMetric } from "./types";
import type { SemanticRole } from "../semantic";
import { biometricAdjustment, biometricDeviations, type BiometricDeviation } from "./readiness";
import { BIOMETRIC_FRESH_DAYS, signalAgeDays } from "./signals";
import { connectorSpec, type ProviderId } from "../connectors";

/**
 * WHERE THE ±15 CAME FROM.
 *
 * The state card printed "Includes −3 from your wearable" and stopped there.
 * Three things were wrong with that sentence and none of them were visible:
 *
 *   1. It named a WEARABLE regardless of what actually wrote the reading. The
 *      `Signal.source` column distinguishes apple / whoop / oura / manual /
 *      forceplate; the copy consulted none of it, so a hand-typed value was
 *      credited to a device the athlete may not own.
 *   2. It asserted the PRESENT TENSE over a reading of unknown age. Until
 *      BIOMETRIC_FRESH_DAYS existed there was no recency check anywhere in the
 *      path — `latest()` returns the newest row of a kind, ever — so a single
 *      sync months old was read as today's value, permanently.
 *   3. It could not be opened. Every other figure on that card has a
 *      derivation behind it; this one asked to be taken on faith.
 *
 * This module is the door. The arithmetic itself is `biometricDeviations`,
 * which already existed and was already exposed — to the ADMIN Engine Room, and
 * never to the athlete whose body it describes.
 */

/** One recovery metric's line in the sheet. */
export interface WearableRow {
  metric: BiometricDeviation["metric"];
  /** i18n key for the metric's name. */
  key: string;
  /** Whether a usable, recent reading exists. A false row states its absence. */
  measured: boolean;
  /** Today's reading and the athlete's own rolling baseline, in `unit`. */
  today: number;
  baseline: number;
  unit: string;
  /** Which direction is good — drives the copy, not the maths. */
  better: "high" | "low";
  /** Signed deviation from baseline, whole percent. */
  deviationPct: number;
  /** The metric's sensitivity weight (40 / 40 / 25). */
  weight: number;
  /** Signed points this metric contributed, to one decimal. */
  points: number;
  /** Resolved provider label ("Apple Watch / Health"), or the raw source. */
  sourceLabel: string | null;
  /** Raw `Signal.source`, for a client that wants to badge it. */
  source: string | null;
  /** How old the reading is, in whole days. 0 = today. */
  ageDays: number | null;
  /** Helped (`go`), hurt (`caution`), or contributed nothing (`neutral`). */
  role: SemanticRole;
}

export interface WearableExplain {
  /** The signed figure the card prints — `biometricAdjustment`, exactly. */
  total: number;
  /**
   * The UNROUNDED, unclamped sum of the measured contributions, so the ledger
   * can show the rounding as its own step. Deliberately full precision:
   * rounding it here to one decimal and then rounding again for the total is
   * how a ledger ends up printing "−10.5 → −11", which reads as an error. The
   * client formats it; `Math.round(raw) === total` holds exactly whenever the
   * bound wasn't hit.
   */
  raw: number;
  /** True when |raw| ran past the ±15 bound and the total is the bound. */
  clamped: boolean;
  rows: WearableRow[];
  /** How many of the three carry a real, recent reading. */
  measuredCount: number;
  /** The recency window, stated rather than hard-coded in copy. */
  freshDays: number;
  /**
   * The distinct sources behind the measured rows. Usually one; two when an
   * athlete has, say, Apple Health for HRV and a manual sleep entry — which is
   * exactly the case the old single-word "wearable" could not express.
   */
  sources: string[];
}

/** The ±15 bound `biometricAdjustment` clamps to. */
export const WEARABLE_BOUND = 15;

export const WEARABLE_METRIC_KEY: Record<BiometricDeviation["metric"], string> = {
  hrv: "w.home.wearable.hrv",
  restingHr: "w.home.wearable.restingHr",
  sleep: "w.home.wearable.sleep",
};

/**
 * A source id as something an athlete recognises. Connector ids resolve to
 * their own label; everything else keeps its raw id, which is honest — a
 * `manual` reading should say so rather than borrow a device's name.
 */
export function wearableSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return connectorSpec(source as ProviderId)?.label ?? source;
}

export const WEARABLE_SOURCE_MANUAL_KEY = "w.home.wearable.sourceManual";
export const WEARABLE_SOURCE_MANY_KEY = "w.home.wearable.sourceMany";

/**
 * How the CARD's one-line version names where the adjustment came from.
 *
 * A provider has a real name and should use it ("Apple Watch / Health"). A
 * `manual` reading must not borrow one — it gets a translated phrase of its
 * own. Two sources at once get a neutral phrase rather than picking a winner.
 * Returns either a key to translate or a literal label, never both.
 */
export function wearableSourcePhrase(e: WearableExplain): { key: string | null; label: string | null } {
  if (e.sources.length === 1) {
    const only = e.sources[0]!;
    if (connectorSpec(only as ProviderId)) return { key: null, label: wearableSourceLabel(only) };
    return { key: WEARABLE_SOURCE_MANUAL_KEY, label: null };
  }
  return { key: WEARABLE_SOURCE_MANY_KEY, label: null };
}

/** Round to one decimal, without `-0`. */
const dp1 = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * Explain the wearable adjustment on the athlete's own numbers.
 *
 * `total` is `biometricAdjustment(bio)` — the SAME call the card makes, not a
 * re-derivation. The rows carry the per-metric arithmetic behind it; because
 * each contribution is a float and the total is the rounded sum, the sheet
 * shows the sum and the rounding as their own ledger lines rather than
 * pretending three rounded rows add up to it.
 */
export function wearableExplain(bio: Biometrics, now: number = Date.now()): WearableExplain {
  const devs = biometricDeviations(bio);
  const byMetric: Record<BiometricDeviation["metric"], BiometricMetric> = {
    hrv: bio.hrv,
    restingHr: bio.restingHr,
    sleep: bio.sleep,
  };

  const rows: WearableRow[] = devs.map((d) => {
    const m = byMetric[d.metric];
    // `measured` is optional on the type for backwards compatibility; a metric
    // that never set it is treated as measured, which is what every caller
    // predating the flag meant.
    const measured = m.measured !== false;
    const age = m.ts ? signalAgeDays(m.ts, now) : null;
    const points = dp1(d.contribution);
    return {
      metric: d.metric,
      key: WEARABLE_METRIC_KEY[d.metric],
      measured,
      today: m.today,
      baseline: m.baseline,
      unit: m.unit,
      better: m.better,
      deviationPct: measured ? Math.round(d.dev * 100) : 0,
      weight: d.weight,
      points: measured ? points : 0,
      sourceLabel: measured ? wearableSourceLabel(m.source) : null,
      source: measured ? m.source ?? null : null,
      ageDays: age === null ? null : Math.max(0, Math.floor(age)),
      role: !measured || points === 0 ? "neutral" : points > 0 ? "go" : "caution",
    };
  });

  const raw = devs.reduce((a, d, i) => a + (rows[i]!.measured ? d.contribution : 0), 0);
  const total = biometricAdjustment(bio);
  const sources: string[] = [];
  for (const r of rows) if (r.source && !sources.includes(r.source)) sources.push(r.source);

  return {
    total,
    raw,
    clamped: Math.abs(Math.round(raw)) > WEARABLE_BOUND,
    rows,
    measuredCount: rows.filter((r) => r.measured).length,
    freshDays: BIOMETRIC_FRESH_DAYS,
    sources,
  };
}
