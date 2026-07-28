// Body & progress — the shared trend maths behind Profile → Private → Body &
// progress. ONE source of truth for both clients (web + mobile): which metrics
// exist, how a dated history collapses into per-metric trends + sparkline bars,
// and the weekly "body report" (weight delta, logging cadence, narrative
// verdict). Pure + unit-tested; the clients only render what these return.

import { kgToUnit, isPlausibleHeightCm, type WeightUnit } from "./units";
import { localDayKey } from "./day-key";

/** A dated body measurement, as returned newest-first by GET /api/body. Every
 *  metric is optional — an entry logs whichever fields the athlete filled. */
export type BodyMetric = {
  id: string;
  measuredAt: string;
  weightKg?: number | null;
  /** Standing height. Deliberately NOT one of BODY_METRIC_DEFS: those are the
   *  things an athlete watches move, and height isn't one of them. It rides on
   *  the same dated row (a growing athlete's does change) but it is read as a
   *  standing fact via `latestHeightCm`, not charted as a trend. */
  heightCm?: number | null;
  bodyFatPct?: number | null;
  neckCm?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  thighCm?: number | null;
  armCm?: number | null;
  calfCm?: number | null;
};

export type BodyMetricKey =
  | "weightKg" | "bodyFatPct" | "neckCm" | "chestCm"
  | "waistCm" | "hipsCm" | "thighCm" | "armCm" | "calfCm";

export type BodyMetricUnit = "weight" | "pct" | "cm";

export type BodyMetricDef = {
  key: BodyMetricKey;
  /** i18n key for the metric's short label. */
  labelKey: string;
  unit: BodyMetricUnit;
  /** Sane upper bound (mirrors the /api/body guard) — keeps a fat-finger out. */
  max: number;
};

// Ordered for the log form + the trends grid: scale first, then the tape lines
// most athletes actually track, down to the rarely-used ones.
// `as const satisfies` keeps a fixed-length tuple (so BODY_METRIC_DEFS[0] — the
// weight def — is never `undefined` under noUncheckedIndexedAccess) while still
// checking each entry against BodyMetricDef.
export const BODY_METRIC_DEFS = [
  { key: "weightKg",   labelKey: "w.account.profile.priv-m-weight",  unit: "weight", max: 500 },
  { key: "bodyFatPct", labelKey: "w.account.profile.priv-m-bodyfat", unit: "pct",    max: 75 },
  { key: "waistCm",    labelKey: "w.account.profile.priv-m-waist",   unit: "cm",     max: 250 },
  { key: "chestCm",    labelKey: "w.account.profile.priv-m-chest",   unit: "cm",     max: 250 },
  { key: "armCm",      labelKey: "w.account.profile.priv-m-arm",     unit: "cm",     max: 100 },
  { key: "thighCm",    labelKey: "w.account.profile.priv-m-thigh",   unit: "cm",     max: 150 },
  { key: "hipsCm",     labelKey: "w.account.profile.priv-m-hips",    unit: "cm",     max: 250 },
  { key: "neckCm",     labelKey: "w.account.profile.priv-m-neck",    unit: "cm",     max: 100 },
  { key: "calfCm",     labelKey: "w.account.profile.priv-m-calf",    unit: "cm",     max: 100 },
] as const satisfies readonly BodyMetricDef[];

/**
 * The athlete's height, from the most recent entry that carries one.
 *
 * NOT `metrics[0].heightCm`: height is entered once and every later weigh-in
 * leaves it blank, so the newest ROW almost never holds it. Reads newest-first
 * as the API returns it, but sorts defensively rather than trusting the order,
 * and ignores implausible values so one fat-fingered "18" can't become the
 * height every downstream model then reasons about.
 */
export function latestHeightCm(metrics: BodyMetric[]): number | null {
  let best: { ts: number; cm: number } | null = null;
  for (const m of metrics) {
    const cm = m.heightCm;
    if (!isPlausibleHeightCm(cm)) continue;
    const ts = Date.parse(m.measuredAt);
    if (!Number.isFinite(ts)) continue;
    if (!best || ts > best.ts) best = { ts, cm };
  }
  return best?.cm ?? null;
}

export type TrendDirection = "up" | "down" | "flat";

export type MetricTrend = {
  def: BodyMetricDef;
  /** Newest value, in stored units (kg / cm / %). */
  latest: number;
  /** Previous logged value, or null when there's only one. */
  previous: number | null;
  /** latest − previous, stored units; null when there's only one entry. */
  delta: number | null;
  direction: TrendDirection;
  /** Chronological values (oldest → newest), up to `window` points. */
  series: number[];
};

const numOf = (m: BodyMetric, k: BodyMetricKey): number | null => {
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// Below this, a change reads as "flat" — avoids a jittery arrow on rounding noise.
const FLAT_EPS = 0.05;

/**
 * Collapse a newest-first history into per-metric trends. Only metrics that
 * have at least one logged value are returned, in BODY_METRIC_DEFS order.
 */
export function metricTrends(metrics: BodyMetric[], window = 8): MetricTrend[] {
  const out: MetricTrend[] = [];
  for (const def of BODY_METRIC_DEFS) {
    const vals: number[] = [];
    for (const m of metrics) {
      const v = numOf(m, def.key);
      if (v != null) vals.push(v); // newest-first
    }
    if (vals.length === 0) continue;
    const latest = vals[0]!;
    const previous = vals.length > 1 ? vals[1]! : null;
    const delta = previous == null ? null : latest - previous;
    const direction: TrendDirection =
      delta == null || Math.abs(delta) < FLAT_EPS ? "flat" : delta > 0 ? "up" : "down";
    out.push({ def, latest, previous, delta, direction, series: vals.slice(0, window).reverse() });
  }
  return out;
}

/**
 * Normalise a series to 0..1 bar heights for a dependency-free column
 * sparkline (min → 0.18 so the shortest bar is still visible, max → 1, a flat
 * series → 0.5). Works identically on web (divs) and mobile (Views).
 */
export function sparkHeights(series: number[]): number[] {
  if (series.length === 0) return [];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  if (span < 1e-9) return series.map(() => 0.5);
  return series.map((v) => 0.18 + 0.82 * ((v - min) / span));
}

export type BodyVerdict = "lean" | "down" | "build" | "up" | "steady" | "baseline";

/** i18n key for each narrative verdict headline. */
export const BODY_VERDICT_KEY: Record<BodyVerdict, string> = {
  lean:     "w.account.profile.priv-verdict-lean",
  down:     "w.account.profile.priv-verdict-down",
  build:    "w.account.profile.priv-verdict-build",
  up:       "w.account.profile.priv-verdict-up",
  steady:   "w.account.profile.priv-verdict-steady",
  baseline: "w.account.profile.priv-verdict-baseline",
};

export type WeeklyReport = {
  hasData: boolean;
  latestWeightKg: number | null;
  /** Latest weight minus a ~week-ago reference weigh-in (stored kg). */
  weightDeltaKg: number | null;
  /** Distinct calendar days with an entry in the last 7 days (0..7). */
  cadence: number;
  cadenceOf: number;
  verdict: BodyVerdict;
};

const DAY = 86_400_000;

/**
 * The weekly body report: latest weight, its ~7-day delta, logging cadence, and
 * a narrative verdict that reads the weight move together with the tape/body-fat
 * direction (down + leaner tape → "lean"; up + bigger tape → "build").
 */
export function weeklyReport(metrics: BodyMetric[], nowMs: number): WeeklyReport {
  if (metrics.length === 0)
    return { hasData: false, latestWeightKg: null, weightDeltaKg: null, cadence: 0, cadenceOf: 7, verdict: "baseline" };

  // Cadence — distinct UTC calendar days logged within the last 7 days.
  const days = new Set<string>();
  for (const m of metrics) {
    const ts = Date.parse(m.measuredAt);
    if (Number.isFinite(ts) && ts >= nowMs - 7 * DAY) days.add(localDayKey(ts));
  }
  const cadence = Math.min(7, days.size);

  // Weight trend — reference is the oldest weigh-in still within 7 days of the
  // latest (so it reads as "over the past week"); falls back to the previous one.
  const ws = metrics.filter((m) => numOf(m, "weightKg") != null);
  const latestWeightKg = ws.length ? (numOf(ws[0]!, "weightKg") as number) : null;
  let weightDeltaKg: number | null = null;
  if (ws.length >= 2) {
    const latestTs = Date.parse(ws[0]!.measuredAt);
    let ref = ws[1]!;
    for (let i = ws.length - 1; i >= 1; i--) {
      if (Date.parse(ws[i]!.measuredAt) >= latestTs - 7 * DAY) { ref = ws[i]!; break; }
    }
    weightDeltaKg = (numOf(ws[0]!, "weightKg") as number) - (numOf(ref, "weightKg") as number);
  }

  // Verdict — weight move, coloured by supporting tape / body-fat direction.
  const trends = metricTrends(metrics);
  const dirOf = (k: BodyMetricKey): TrendDirection => trends.find((tr) => tr.def.key === k)?.direction ?? "flat";
  const leaner = dirOf("waistCm") === "down" || dirOf("bodyFatPct") === "down";
  const bigger = dirOf("chestCm") === "up" || dirOf("armCm") === "up" || dirOf("thighCm") === "up";

  let verdict: BodyVerdict;
  if (weightDeltaKg == null) verdict = "baseline";
  else if (weightDeltaKg < -0.2) verdict = leaner ? "lean" : "down";
  else if (weightDeltaKg > 0.2) verdict = bigger ? "build" : "up";
  else verdict = "steady";

  return { hasData: true, latestWeightKg, weightDeltaKg, cadence, cadenceOf: 7, verdict };
}

/** Format a metric's stored value for display (weight converts kg → the chosen
 *  unit; tape stays cm; body-fat stays %). Returns the number and its suffix
 *  separately so the UI can size them independently. */
export function fmtMetricValue(def: BodyMetricDef, stored: number, units: WeightUnit): { value: string; unit: string } {
  if (def.unit === "weight") {
    const v = kgToUnit(stored, units);
    return { value: Number(v.toFixed(v % 1 === 0 ? 0 : 1)).toLocaleString(), unit: units };
  }
  if (def.unit === "pct") return { value: Number(stored.toFixed(1)).toString(), unit: "%" };
  return { value: Number(stored.toFixed(1)).toString(), unit: "cm" };
}

/** Guard for the measurement inputs: accept only a partial decimal number
 *  (digits, one optional `.`/`,` separator) or empty. `inputMode`/`keyboardType`
 *  only hint the on-screen keyboard — they don't stop a paste or a desktop
 *  keystroke — so callers gate `onChange` through this to keep the field from
 *  holding characters that would be silently dropped on save. */
export function isDecimalInput(v: string): boolean {
  return v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v);
}

/** The magnitude of a delta for the arrow pill (weight in display units), as a
 *  bare string — the caller supplies the ▲/▼ and colour from `direction`. */
export function fmtMetricDelta(def: BodyMetricDef, deltaStored: number, units: WeightUnit): string {
  const v = def.unit === "weight" ? kgToUnit(deltaStored, units) : deltaStored;
  return Number(Math.abs(v).toFixed(1)).toString();
}
