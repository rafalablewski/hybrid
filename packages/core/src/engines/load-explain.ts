import { acwrRole, type SemanticRole } from "../semantic";
import type { LoadState } from "./load";

/**
 * WHAT ACWR, S-RPE, MONOTONY AND STRAIN ACTUALLY MEAN.
 *
 * The Tissue card's whole-body block printed four bare numerals under four mono
 * labels — "0.94 / ACWR", "2546 / S-RPE 7D", "1.8 / MONOTONY", "4554 / STRAIN"
 * — with a single sentence underneath that explained only the FIRST of them.
 * Three of the four figures had no derivation, no units, no scale and no stated
 * limit: an athlete reading "4554 STRAIN" cannot tell whether that is good, bad
 * or merely large, and a number nobody can interpret is a number that trains
 * people to skip the block.
 *
 * This module is the contents of the door under each of them. It follows the
 * pattern freshness-explain.ts established, and for the same reasons:
 *
 *   WHAT IS IT     — in one paragraph, in the athlete's vocabulary.
 *   WHAT WENT IN   — the measured inputs, itemised (the seven days behind a
 *                    weekly total, the four weeks behind a ratio).
 *   HOW IT'S MADE  — the arithmetic, as a ledger ending on the printed figure.
 *   THE BANDS      — where the scale's edges are, and which one you're in.
 *   WHAT IT DOESN'T SAY — the caveat. ACWR is a CONTESTED metric; a figure
 *                    presented without that is a figure pretending to be a
 *                    diagnosis.
 *
 * THE LAW, same as the freshness explainer's: nothing here is recomputed. Every
 * figure is READ off the `LoadState` the card was drawn from, so the sheet and
 * the tile can never disagree. The ledgers print the engine's own rounded
 * fields, which is why a ratio line can land a hundredth off its two operands —
 * that is the rounding the card also shows, stated rather than hidden.
 *
 * KEYS, NOT PROSE — every label is an i18n key, so this speaks Polish and
 * German like the rest of the card.
 */

/** The four whole-body figures, in the order the rail carries them. */
export type LoadMetric = "acwr" | "acute" | "monotony" | "strain";

export const LOAD_METRICS: LoadMetric[] = ["acwr", "acute", "monotony", "strain"];

/** The tile's short mono label — the SAME keys the four columns used, so the
 *  vocabulary the athlete already learned survives the redesign. */
export const LOAD_METRIC_LABEL_KEY: Record<LoadMetric, string> = {
  acwr: "w.home.cockpit.acwr",
  acute: "w.home.cockpit.srpe",
  monotony: "w.home.cockpit.monotony",
  strain: "w.home.cockpit.strain",
};

/** One measured input behind a figure — a day of the week, or a week of the month. */
export interface LoadInput {
  /** i18n key for the label; `{n}` is substituted with `arg` when present. */
  key: string;
  arg: number | null;
  value: number;
  /** Share of the block's LARGEST row, whole percent — what the bar draws.
   *  Against the max rather than the total, because these rows are a shape to
   *  read (which day was heavy?), not a composition to divide up. */
  sharePct: number;
  /** The heaviest row. Exactly one, or none when nothing was logged. */
  top: boolean;
  /** Held back, for every row that isn't the heaviest — travels with the row so
   *  the rule reaches every surface (same device as FreshnessRow.dim). */
  dim: boolean;
}

/** One line of the arithmetic, in the order it is performed. */
export interface LoadStep {
  key: string;
  /** Formatted here, not on the client, so both clients print it identically. */
  value: string;
  /** The result line — the figure the tile prints. Exactly one step has it. */
  total: boolean;
}

/** One stop on the metric's scale. */
export interface LoadBandStop {
  key: string;
  /** The printable range, e.g. "0.8–1.3". An en dash, never a hyphen. */
  range: string;
  role: SemanticRole;
  /** The band the current figure sits in. */
  active: boolean;
}

export interface LoadExplain {
  metric: LoadMetric;
  /** THE FIGURE, formatted exactly as the tile prints it. */
  value: string;
  /** Its unit, or null where the figure is a pure ratio with a unit word of
   *  its own already in `unitKey`. */
  unitKey: string;
  /** The tile's one-line read under the figure — the band's name where the
   *  metric has bands, else a gloss of what it combines. */
  readKey: string;
  /** How the FIGURE is painted, on the tile and at the head of the sheet. The
   *  two unbanded figures are `neutral`: a colour on a number that carries no
   *  verdict is a verdict invented by the paint. */
  role: SemanticRole;
  /** The sheet's title — the metric's full name, not the tile's abbreviation. */
  titleKey: string;
  whatKey: string;
  howKey: string;
  limitKey: string;
  /** The itemised inputs. Empty for no metric — every one of the four has some. */
  inputs: LoadInput[];
  /** Which head the inputs sit under (days of this week vs the last 4 weeks). */
  inputsHeadKey: string;
  steps: LoadStep[];
  /** The scale, where the metric has one. Empty for the two that don't. */
  bands: LoadBandStop[];
  /** False while the ratio is still building — under ~2 weeks of history. */
  enoughHistory: boolean;
}

const COPY: Record<LoadMetric, { title: string; what: string; how: string; limit: string }> = {
  acwr: {
    title: "w.injury.load.acwr.title",
    what: "w.injury.load.acwr.what",
    how: "w.injury.load.acwr.how",
    limit: "w.injury.load.acwr.limit",
  },
  acute: {
    title: "w.injury.load.acute.title",
    what: "w.injury.load.acute.what",
    how: "w.injury.load.acute.how",
    limit: "w.injury.load.acute.limit",
  },
  monotony: {
    title: "w.injury.load.monotony.title",
    what: "w.injury.load.monotony.what",
    how: "w.injury.load.monotony.how",
    limit: "w.injury.load.monotony.limit",
  },
  strain: {
    title: "w.injury.load.strain.title",
    what: "w.injury.load.strain.what",
    how: "w.injury.load.strain.how",
    limit: "w.injury.load.strain.limit",
  },
};

/** The ACWR scale, in reading order. Edges match `computeLoad`'s own banding —
 *  changed in one place or they drift, which is the whole point of reading them
 *  off the same module the band comes from. */
const ACWR_BANDS: { band: string; key: string; range: string }[] = [
  { band: "detraining", key: "w.injury.load.band.detraining", range: "< 0.8" },
  { band: "sweet-spot", key: "w.injury.load.band.sweetSpot", range: "0.8–1.3" },
  { band: "caution", key: "w.injury.load.band.caution", range: "1.3–1.5" },
  { band: "danger", key: "w.injury.load.band.danger", range: "> 1.5" },
];

/**
 * The monotony scale (Foster's convention). Unlike ACWR's, this one is NOT in
 * `computeLoad` — the engine reports monotony without banding it, and nothing
 * in the app branches on these edges. They exist here so the sheet can say
 * where the figure sits; if a future engine ever bands monotony, it moves there
 * and this reads it, not the other way round.
 */
const MONOTONY_BANDS: { key: string; range: string; role: SemanticRole; max: number }[] = [
  { key: "w.injury.load.mono.varied", range: "< 1.5", role: "go", max: 1.5 },
  { key: "w.injury.load.mono.watch", range: "1.5–2.0", role: "caution", max: 2 },
  { key: "w.injury.load.mono.same", range: "> 2.0", role: "danger", max: Infinity },
];

/** Whole-percent share of the block's largest row, safe when nothing loaded. */
const shareOfMax = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0);

/** A figure the ledger prints. Integers stay integers; ratios keep their 2dp. */
const int = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
const dp = (n: number, places: number) => n.toFixed(places);

/**
 * THE OFFSET LABELS ARE NAMED, NOT COUNTED, AT 1.
 *
 * "{n} days ago" with n = 1 renders "1 days ago" — the same bug `exerciseCountKey`
 * exists to kill on the other side of the app. The counted forms here only ever
 * run 1–6 (days) and 1–3 (weeks), so rather than route a language through the
 * explainer for one plural rung, the ONE case that inflects gets its own word.
 * Every remaining n is ≥ 2, where English, Polish and German all take the same
 * form — which is why the {n} strings can stay single-form.
 */
const offsetKey = (n: number, one: string, many: string, zero: string) =>
  n === 0 ? zero : n === 1 ? one : many;

/** The seven days of this week as input rows, today first. */
function dailyInputs(load: LoadState): LoadInput[] {
  const max = Math.max(0, ...load.daily);
  const heaviest = load.daily.indexOf(max);
  return load.daily.map((v, i) => {
    const top = i === heaviest && max > 0;
    return {
      key: offsetKey(i, "w.injury.load.day.yesterday", "w.injury.load.day.n", "w.injury.load.day.today"),
      arg: i >= 2 ? i : null,
      value: v,
      sharePct: shareOfMax(v, max),
      top,
      dim: !top,
    };
  });
}

/** The last four weeks as input rows, this week first. */
function weeklyInputs(load: LoadState): LoadInput[] {
  const max = Math.max(0, ...load.weekly.map((w) => w.load));
  const heaviest = load.weekly.findIndex((w) => w.load === max);
  return load.weekly.map((w, i) => {
    const top = i === heaviest && max > 0;
    return {
      key: offsetKey(w.weeksAgo, "w.injury.load.week.last", "w.injury.load.week.n", "w.injury.load.week.this"),
      arg: w.weeksAgo >= 2 ? w.weeksAgo : null,
      value: w.load,
      sharePct: shareOfMax(w.load, max),
      top,
      dim: !top,
    };
  });
}

/**
 * Explain one whole-body load figure, from the SAME `LoadState` the card drew.
 *
 * Takes the computed state rather than the sessions deliberately: an explainer
 * that called `computeLoad` again could be handed a different `now` than the
 * card was and would then narrate a figure the athlete cannot see anywhere.
 */
export function loadExplain(metric: LoadMetric, load: LoadState): LoadExplain {
  const copy = COPY[metric];
  const base = {
    metric,
    titleKey: copy.title,
    whatKey: copy.what,
    howKey: copy.how,
    limitKey: copy.limit,
    enoughHistory: load.enoughHistory,
  };

  if (metric === "acwr") {
    const band = ACWR_BANDS.find((b) => b.band === load.band);
    return {
      ...base,
      value: dp(load.acwr, 2),
      unitKey: "w.injury.load.unit.ratio",
      // While the ratio is still building there is no band to name, so the tile
      // says THAT rather than borrowing a neighbouring band's word.
      readKey: load.enoughHistory && band ? band.key : "w.injury.load.band.building",
      role: acwrRole(load.band),
      inputs: weeklyInputs(load),
      inputsHeadKey: "w.injury.load.inputs.weeks",
      steps: [
        { key: "w.injury.load.step.acute", value: int(load.acute), total: false },
        { key: "w.injury.load.step.chronic", value: int(load.chronicWeekly), total: false },
        { key: "w.injury.load.step.ratio", value: dp(load.acwr, 2), total: true },
      ],
      bands: ACWR_BANDS.map((b) => ({
        key: b.key,
        range: b.range,
        role: acwrRole(b.band),
        active: load.enoughHistory && b.band === load.band,
      })),
    };
  }

  if (metric === "acute") {
    return {
      ...base,
      value: int(load.acute),
      unitKey: "w.injury.load.unit.au",
      readKey: "w.injury.load.acute.read",
      role: "neutral",
      inputs: dailyInputs(load),
      inputsHeadKey: "w.injury.load.inputs.days",
      steps: [
        { key: "w.injury.load.step.perSession", value: "", total: false },
        { key: "w.injury.load.step.sumDays", value: int(load.acute), total: true },
      ],
      bands: [],
    };
  }

  if (metric === "monotony") {
    const stop = MONOTONY_BANDS.find((b) => load.monotony < b.max) ?? MONOTONY_BANDS[2]!;
    return {
      ...base,
      value: dp(load.monotony, 2),
      unitKey: "w.injury.load.unit.ratio",
      readKey: stop.key,
      role: stop.role,
      inputs: dailyInputs(load),
      inputsHeadKey: "w.injury.load.inputs.days",
      steps: [
        { key: "w.injury.load.step.mean", value: int(load.dailyMean), total: false },
        { key: "w.injury.load.step.sd", value: int(load.dailySd), total: false },
        { key: "w.injury.load.step.monotony", value: dp(load.monotony, 2), total: true },
      ],
      bands: MONOTONY_BANDS.map((b) => ({
        key: b.key,
        range: b.range,
        role: b.role,
        active: b.key === stop.key,
      })),
    };
  }

  return {
    ...base,
    value: int(load.strain),
    unitKey: "w.injury.load.unit.au",
    readKey: "w.injury.load.strain.read",
    role: "neutral",
    inputs: weeklyInputs(load),
    inputsHeadKey: "w.injury.load.inputs.weeks",
    steps: [
      { key: "w.injury.load.step.acute", value: int(load.acute), total: false },
      { key: "w.injury.load.step.monotonyIn", value: dp(load.monotony, 2), total: false },
      { key: "w.injury.load.step.strain", value: int(load.strain), total: true },
    ],
    bands: [],
  };
}
