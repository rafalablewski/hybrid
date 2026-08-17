import { acwrRole, type SemanticRole } from "../semantic";
import type { AcwrBand, LoadState } from "./load";

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

/**
 * The figure's short mono label.
 *
 * Three of the four are the labels the old four-up grid used, because the
 * vocabulary an athlete has already learned is worth keeping. The fourth is
 * not: "s-RPE 7d" is an ACRONYM FOR A THING rather than the thing's name, and
 * on a block whose whole purpose is to stop stating numbers nobody can read it
 * was the one label that needed no defending. ACWR stays — it IS the metric's
 * name, the sentence above now carries the meaning, and an athlete who wants to
 * look it up needs the real term to look up.
 */
export const LOAD_METRIC_LABEL_KEY: Record<LoadMetric, string> = {
  acwr: "w.home.cockpit.acwr",
  acute: "w.injury.load.label.acute",
  monotony: "w.home.cockpit.monotony",
  strain: "w.home.cockpit.strain",
};

/** One measured input behind a figure — a day of the week, or a week of the month. */
export interface LoadInput {
  /** i18n key for the label; `{n}` is substituted with `arg` when present. */
  key: string;
  arg: number | null;
  /** The raw figure, for anything that needs to compute with the row. */
  value: number;
  /**
   * The figure AS PRINTED — grouped here, not on the client, for the same
   * reason `LoadStep.value` is. The sheet's headline came through this module
   * and its input rows called `toLocaleString()` themselves, so on a Polish or
   * German phone the same number appeared as "2 546" at the top of the sheet
   * and "2.546" three lines below it.
   */
  text: string;
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
  /**
   * Formatted here, not on the client, so both clients print it identically.
   * NULL for a line that states the method rather than a figure ("each session:
   * minutes × RPE") — the client renders the label alone.
   */
  value: string | null;
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
export type MonotonyBand = "varied" | "watch" | "same";

const MONOTONY_BANDS: { band: MonotonyBand; key: string; range: string; role: SemanticRole; max: number }[] = [
  { band: "varied", key: "w.injury.load.mono.varied", range: "< 1.5", role: "go", max: 1.5 },
  { band: "watch", key: "w.injury.load.mono.watch", range: "1.5–2.0", role: "caution", max: 2 },
  { band: "same", key: "w.injury.load.mono.same", range: "> 2.0", role: "danger", max: Infinity },
];

/** Which monotony rung a figure sits on. Exported because the verdict sentence
 *  bands on it too, and two callers banding the same number by hand is how the
 *  edges drift. */
export function monotonyBand(monotony: number): MonotonyBand {
  return (MONOTONY_BANDS.find((b) => monotony < b.max) ?? MONOTONY_BANDS[2]!).band;
}

/** Whole-percent share of the block's largest row, safe when nothing loaded. */
const shareOfMax = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0);

/**
 * A figure as this module prints it. Integers group in thousands with a
 * NO-BREAK space; ratios keep their decimal places.
 *
 * The grouping is deliberately NOT the device's locale. These are arbitrary
 * load units sitting inches from two ratios, and a German or Polish phone
 * renders `toLocaleString()` as "2.546" — which beside "0.94" reads as a
 * decimal, not as two and a half thousand. A space groups unambiguously in
 * every language the app ships; NO-BREAK, so a tile can never wrap a figure
 * across two lines.
 */
const int = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
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
      text: int(v),
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
      text: int(w.load),
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
        { key: "w.injury.load.step.perSession", value: null, total: false },
        { key: "w.injury.load.step.sumDays", value: int(load.acute), total: true },
      ],
      bands: [],
    };
  }

  if (metric === "monotony") {
    const band = monotonyBand(load.monotony);
    const stop = MONOTONY_BANDS.find((b) => b.band === band)!;
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE VERDICT — the sentence that replaced the four-up readout.
 *
 * The block used to be four bare figures, and the fix that first shipped was to
 * make each figure BIGGER and give each one a door. That treated the symptom.
 * The grid's real problem was that it was UNACCOMPANIED: four numerals doing
 * the work of a sentence, with nothing above them saying what they meant
 * together. Four ⓘ buttons in a row are four admissions of the same thing.
 *
 * So the block leads with a sentence now, and the figures go back to being
 * small — they are no longer the ones explaining, they are the receipts you can
 * check. This is the grammar the card already speaks: `injuryHeadlineKey` puts
 * one display-face sentence over the risk axis for exactly the same reason.
 *
 * IT IS TWO READINGS, NOT FOUR. The sentence has two clauses because the block
 * has two independent questions in it:
 *
 *   HOW MUCH — ACWR: is this week above or below what you normally do?
 *   WHAT SHAPE — monotony: did the week have hard days and easy days, or did
 *                every day look the same?
 *
 * The other two figures are not dropped from the sentence out of brevity —
 * they carry no independent claim. `acute` is one side of the ACWR ratio, and
 * `strain` is LITERALLY acute × monotony, so a clause about strain would be
 * the first two clauses said a third time.
 *
 * A FULL MATRIX, NOT COMPOSED HALVES. Twelve whole sentences rather than two
 * fragments joined by a conjunction: Polish and German inflect the second
 * clause against the first, and a `${a} ${b}` sentence is how an app ends up
 * speaking English grammar in three languages. The cost is 12 keys × 3
 * languages, paid once.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LoadVerdict {
  /** i18n key for the whole sentence. */
  key: string;
  /** The two readings the sentence was composed from, so a surface can point at
   *  the figure behind each clause without re-banding anything. */
  acwrBand: AcwrBand;
  monotonyBand: MonotonyBand;
  /** The heavier of the two readings — one severity, for anything that needs
   *  exactly one. The sentence itself is NOT painted from it: the card's own
   *  headline is chalk, and a coloured paragraph would out-shout it. */
  role: SemanticRole;
}

/** The ACWR half of the sentence, as a key fragment. `insufficient` never
 *  reaches here — `loadVerdict` returns null before it can. */
const VERDICT_ACWR: Record<Exclude<AcwrBand, "insufficient">, string> = {
  detraining: "under",
  "sweet-spot": "usual",
  caution: "up",
  danger: "spike",
};

/** Rank a role so two readings can be compared without a second table. */
const SEVERITY: Record<SemanticRole, number> = {
  go: 0, info: 1, premium: 1, neutral: 1, caution: 2, danger: 3,
};

const MONOTONY_ROLE: Record<MonotonyBand, SemanticRole> = {
  varied: "go", watch: "caution", same: "danger",
};

/**
 * The one-sentence read of the week's whole-body load.
 *
 * NULL while the ratio is still building. That is the honest answer, not a
 * hedge: without ~2 weeks of history there is no "what you normally do" to
 * compare against, so half the sentence would be invented. The card already
 * has a state for this — it prints what it is waiting for instead.
 */
export function loadVerdict(load: LoadState): LoadVerdict | null {
  if (!load.enoughHistory || load.band === "insufficient") return null;
  const mono = monotonyBand(load.monotony);
  const acwrRoleValue = acwrRole(load.band);
  const monoRole = MONOTONY_ROLE[mono];
  return {
    key: `w.injury.load.verdict.${VERDICT_ACWR[load.band]}.${mono}`,
    acwrBand: load.band,
    monotonyBand: mono,
    role: SEVERITY[monoRole] > SEVERITY[acwrRoleValue] ? monoRole : acwrRoleValue,
  };
}

/** Every sentence key the verdict can produce — so a test can prove all twelve
 *  resolve in every language without constructing twelve logs. */
export const LOAD_VERDICT_KEYS: string[] = Object.values(VERDICT_ACWR).flatMap((a) =>
  (["varied", "watch", "same"] as MonotonyBand[]).map((m) => `w.injury.load.verdict.${a}.${m}`),
);
