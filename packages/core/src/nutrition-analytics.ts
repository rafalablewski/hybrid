/**
 * NUTRITION ANALYTICS — every nutrient, over a real window, with findings.
 *
 * `nutritionSummary` already averaged a window, but it read exactly two
 * nutrients (kcal and protein) and produced no sentences, so the Insights
 * screen could show adherence and a macro split and then had nothing to say
 * about the fibre, sugar and salt the label panel had been collecting for
 * months. This is the widening: nine nutrients, three windows, and findings
 * ranked by how much they matter.
 *
 * ── THE HARD PART IS NOT THE AVERAGING. IT IS THE ZEROS ───────────────────
 * A NutritionDay sums its Signals, and `foodLogSignals` writes NO Signal for a
 * field the food never stated. So a day where nothing declared its fibre sums
 * to fibre: 0 — which is indistinguishable, in the stored day, from a day that
 * genuinely contained no fibre.
 *
 * Averaging naively across thirty such days would under-report fibre by
 * whatever share of days lacked the data, and would do it CONFIDENTLY: a real
 * number, badly wrong, with nothing on screen to suggest it. That is worse than
 * no figure at all, and it is exactly the failure the not-stated rule exists to
 * prevent everywhere else in this app.
 *
 * So a panel nutrient is averaged over the days that STATE it — taken here as
 * the days whose total is above zero — and every stat carries `statedDays`
 * beside `loggedDays` so the UI can say "from 18 of 30 days". Treating a
 * whole-day zero as "not stated" is a deliberate approximation, and a safe one:
 * a day containing food but genuinely zero salt or zero sugar essentially does
 * not exist, while a day with no panel data is common. The four REQUIRED macros
 * have no such ambiguity and are averaged over every logged day.
 *
 * ── A FINDING IS A SHAPE, NOT A SENTENCE ──────────────────────────────────
 * Insights come back as typed objects with numbers — `{ kind: "protein-short",
 * value: 22, weight: … }` — and the clients localize them, exactly as
 * `nutritionNudge` already works. Core ships no English. It also ships no
 * advice it cannot support: every finding is derived from a comparison in this
 * file, and the ones that need training data are simply absent when no sessions
 * are passed rather than guessing.
 *
 * Pure + unit-tested, and shared, so the phone and the browser reach the same
 * findings from the same window (parity rule).
 */

import type { Signal } from "./engines/signals";
import type { LoggedSession } from "./engines/session";
import {
  adaptiveTargets,
  dailyNutrition,
  emptyNutritionDay,
  referenceIntakes,
  type MacroTargets,
  type NutritionDay,
  type NutritionGoal,
} from "./engines/nutrition";
import { hydrationTarget } from "./engines/hydration";
import { trainingEnergyOnDay } from "./engines/load";
import { addLocalDays, localDayKey, localMidnightMs } from "./day-key";

/** The windows the Insights screen offers. "Today" is the hero on the home
 *  screen, not an analytics window — a single day has no trend and no average. */
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export type NutrientKey =
  | "kcal" | "protein" | "carbs" | "fat"   // the required four
  | "fiber" | "sugar" | "satFat" | "salt"  // the label panel
  | "water";

export const NUTRIENT_KEYS: NutrientKey[] = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "satFat", "salt", "water"];

/** Which nutrients are only known when a food bothered to state them. */
const PANEL_KEYS: NutrientKey[] = ["fiber", "sugar", "satFat", "salt"];

/**
 * What the target MEANS, which decides how the UI colours a miss.
 *  - `target`  — a personal figure to land on (kcal, the macros, water)
 *  - `ceiling` — a population reference NOT to exceed (sugar, saturates, salt)
 *  - `floor`   — a population reference to reach (fibre)
 * A ceiling and a target are not the same thing and must never share a colour:
 * being under a ceiling is good, being under a target is not.
 */
export type TargetKind = "target" | "ceiling" | "floor";

export interface NutrientTrend {
  direction: "up" | "down" | "flat";
  /** signed % change from the window's first half to its second */
  pct: number;
}

export interface NutrientStat {
  key: NutrientKey;
  /** average over the days that state it; null when nothing does */
  avg: number | null;
  /** the figure it is measured against; null when there isn't one */
  target: number | null;
  kind: TargetKind;
  /** avg ÷ target as a percentage; null without both */
  pctOfTarget: number | null;
  /** days in the window that state this nutrient */
  statedDays: number;
  /** the per-day series, oldest first — null on a day that states nothing */
  series: (number | null)[];
  trend: NutrientTrend | null;
}

export type NutritionInsightKind =
  | "logging-sparse" //       too few days logged to say much
  | "kcal-under" //           averaging materially below the calorie target
  | "kcal-over" //            averaging materially above it
  | "kcal-on-track" //        landing inside the band
  | "protein-short" //        protein averaging below target
  | "protein-rest-gap" //     protein notably worse on REST days than training days
  | "fiber-short" //          under the fibre floor
  | "salt-high" //            over the salt ceiling
  | "sugar-high" //           over the sugar ceiling
  | "trend-up" //             a nutrient rising across the window
  | "trend-down" //           a nutrient falling
  | "coverage-low"; //        a panel nutrient known for too few days to trust

export interface NutritionInsight {
  kind: NutritionInsightKind;
  /** which nutrient the finding is about, where that varies */
  nutrient?: NutrientKey;
  /** the figure the copy references (a %, or grams — per kind) */
  value: number;
  /** a second figure some kinds need (rest-day vs training-day protein) */
  value2?: number;
  /** ranking weight; the clients show the top few */
  weight: number;
}

export interface NutritionAnalytics {
  windowDays: number;
  /** the day keys in the window, oldest first */
  days: string[];
  /** days carrying any intake at all */
  loggedDays: number;
  /** the targets every stat was measured against */
  targets: MacroTargets;
  nutrients: Record<NutrientKey, NutrientStat>;
  /** ranked, most important first */
  insights: NutritionInsight[];
}

/** Below this many logged days, a window cannot support a finding about habits. */
export const MIN_DAYS_FOR_INSIGHT = 4;
/** A panel nutrient known for less than this share of logged days is reported
 *  as thin data rather than as a figure. */
const COVERAGE_FLOOR = 0.5;
/** Inside this band of the calorie target, a window counts as on track. */
const KCAL_BAND = 0.05;
/** A trend under this magnitude is noise, not a direction. */
const TREND_FLAT = 5;
/** How many findings a caller should expect at most. */
export const MAX_INSIGHTS = 4;

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Read one nutrient off a rolled-up day. */
const valueOf = (d: NutritionDay, key: NutrientKey): number => {
  switch (key) {
    case "kcal": return d.kcal;
    case "protein": return d.protein;
    case "carbs": return d.carbs;
    case "fat": return d.fat;
    case "fiber": return d.fiber;
    case "sugar": return d.sugar;
    case "satFat": return d.satFat;
    case "salt": return d.salt;
    case "water": return d.water;
  }
};

/**
 * First half vs second half of the STATED days. Halves rather than a regression
 * because the answer has to survive being explained in one sentence — "your
 * fibre is up 18%" is checkable against the chart beside it, where a slope
 * coefficient is not.
 */
function trendOf(series: (number | null)[]): NutrientTrend | null {
  const stated = series.filter((v): v is number => v != null);
  if (stated.length < MIN_DAYS_FOR_INSIGHT) return null;
  const half = Math.floor(stated.length / 2);
  const first = mean(stated.slice(0, half));
  const second = mean(stated.slice(stated.length - half));
  if (first <= 0) return null;
  const pct = Math.round(((second - first) / first) * 100);
  return { direction: Math.abs(pct) < TREND_FLAT ? "flat" : pct > 0 ? "up" : "down", pct };
}

/**
 * The window's analysis.
 *
 * `sessions` is optional and its absence is honest rather than fatal: the
 * training-vs-rest findings simply do not appear, instead of being guessed from
 * calorie intake.
 */
export function nutritionAnalytics(
  signals: Signal[],
  opts: {
    sessions?: LoggedSession[];
    goal?: NutritionGoal;
    bodyMassKg?: number;
    windowDays?: AnalyticsWindow | number;
    now?: number;
  } = {},
): NutritionAnalytics {
  const now = opts.now ?? Date.now();
  const windowDays = Math.max(1, Math.round(opts.windowDays ?? 30));
  const bodyMassKg = opts.bodyMassKg;
  const sessions = opts.sessions ?? [];

  // Targets WITHOUT today's training bump: this is a window average, and adding
  // one day's session fuel to the yardstick every other day is measured against
  // would make the whole comparison lean.
  const targets = adaptiveTargets(signals, { goal: opts.goal, bodyMassKg, trainingKcal: 0, now });
  const refs = referenceIntakes(targets.kcal);

  const byDate = new Map(dailyNutrition(signals).map((d) => [d.date, d]));
  const midnight = localMidnightMs(now);

  const days: string[] = [];
  const rows: NutritionDay[] = [];
  const trainingKcalByDay: number[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const ms = addLocalDays(midnight, -i);
    const date = localDayKey(ms);
    days.push(date);
    rows.push(byDate.get(date) ?? emptyNutritionDay(date));
    // Mid-day for the lookup: trainingEnergyOnDay keys off the calendar day of
    // `now`, and local midnight is the worst hour to stand on.
    trainingKcalByDay.push(Math.max(0, Math.round(trainingEnergyOnDay(sessions, bodyMassKg ?? 75, ms + 12 * 3_600_000))));
  }

  const loggedDays = rows.filter((d) => d.kcal > 0).length;

  const targetFor = (key: NutrientKey): { target: number | null; kind: TargetKind } => {
    switch (key) {
      case "kcal": return { target: targets.kcal || null, kind: "target" };
      case "protein": return { target: targets.protein || null, kind: "target" };
      case "carbs": return { target: targets.carbs || null, kind: "target" };
      case "fat": return { target: targets.fat || null, kind: "target" };
      case "water": return { target: hydrationTarget({ bodyMassKg }), kind: "target" };
      case "fiber": return { target: refs.fiber, kind: "floor" };
      case "sugar": return { target: refs.sugar, kind: "ceiling" };
      case "satFat": return { target: refs.satFat, kind: "ceiling" };
      case "salt": return { target: refs.salt, kind: "ceiling" };
    }
  };

  const nutrients = {} as Record<NutrientKey, NutrientStat>;
  for (const key of NUTRIENT_KEYS) {
    const panel = PANEL_KEYS.includes(key);
    // A required macro is known on every LOGGED day; a panel field only on the
    // days that stated it (see the file note on zeros). Water is its own case:
    // a day with no water logged is a day nobody told us about, not a dry day.
    const series: (number | null)[] = rows.map((d) => {
      const v = valueOf(d, key);
      if (panel || key === "water") return v > 0 ? round1(v) : null;
      return d.kcal > 0 ? round1(v) : null;
    });
    const stated = series.filter((v): v is number => v != null);
    const { target, kind } = targetFor(key);
    const avg = stated.length ? Math.round(mean(stated) * (key === "kcal" || key === "water" ? 1 : 10)) / (key === "kcal" || key === "water" ? 1 : 10) : null;
    nutrients[key] = {
      key,
      avg,
      target,
      kind,
      pctOfTarget: avg != null && target ? Math.round((avg / target) * 100) : null,
      statedDays: stated.length,
      series,
      trend: trendOf(series),
    };
  }

  return {
    windowDays,
    days,
    loggedDays,
    targets,
    nutrients,
    insights: buildInsights({ nutrients, loggedDays, windowDays, rows, trainingKcalByDay, targets }),
  };
}

/* ── FINDINGS ─────────────────────────────────────────────────────────────── */

function buildInsights(ctx: {
  nutrients: Record<NutrientKey, NutrientStat>;
  loggedDays: number;
  windowDays: number;
  rows: NutritionDay[];
  trainingKcalByDay: number[];
  targets: MacroTargets;
}): NutritionInsight[] {
  const { nutrients, loggedDays, windowDays, rows, trainingKcalByDay } = ctx;
  const out: NutritionInsight[] = [];

  // Nothing else is trustworthy below this, so it is the only finding — saying
  // "your protein is 12% low" from two days would be a claim about a habit
  // built from an anecdote.
  if (loggedDays < MIN_DAYS_FOR_INSIGHT) {
    return [{ kind: "logging-sparse", value: loggedDays, weight: 100 }];
  }

  // ── Energy against the target. The headline finding when it is off.
  const kcal = nutrients.kcal;
  if (kcal.pctOfTarget != null) {
    const off = kcal.pctOfTarget - 100;
    if (Math.abs(off) <= KCAL_BAND * 100) out.push({ kind: "kcal-on-track", nutrient: "kcal", value: Math.abs(off), weight: 40 });
    else if (off < 0) out.push({ kind: "kcal-under", nutrient: "kcal", value: Math.abs(off), weight: 80 });
    else out.push({ kind: "kcal-over", nutrient: "kcal", value: off, weight: 78 });
  }

  // ── Protein, which is the macro an athlete actually misses.
  const protein = nutrients.protein;
  if (protein.avg != null && protein.target && protein.avg < protein.target * 0.9) {
    out.push({ kind: "protein-short", nutrient: "protein", value: Math.round(protein.target - protein.avg), weight: 85 });
  }

  // ── THE REST-DAY GAP. The finding the whole window exists to produce: an
  // athlete who eats for training and forgets to on the days between. Needs
  // real session data, so it is absent rather than guessed when there is none.
  const trainingDays: number[] = [];
  const restDays: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i]!;
    if (d.kcal <= 0) continue; // an unlogged day belongs to neither group
    (trainingKcalByDay[i]! > 0 ? trainingDays : restDays).push(d.protein);
  }
  if (trainingDays.length >= 2 && restDays.length >= 2) {
    const onTraining = mean(trainingDays);
    const onRest = mean(restDays);
    // A gap only counts when it is BOTH material in grams and a real share of
    // the target — 6 g on a 180 g target is noise wearing a percentage.
    const gap = onTraining - onRest;
    if (gap > 15 && protein.target && gap > protein.target * 0.08) {
      out.push({ kind: "protein-rest-gap", nutrient: "protein", value: Math.round(onRest), value2: Math.round(onTraining), weight: 90 });
    }
  }

  // ── The panel. A ceiling passed and a floor missed are different findings and
  // are ranked differently: salt over is a health note, fibre under is a nudge.
  const panelFinding = (key: NutrientKey, kind: NutritionInsightKind, weight: number, over: boolean) => {
    const s = nutrients[key];
    if (s.avg == null || !s.target) return;
    // Thin data gets its own finding rather than a confident number.
    if (s.statedDays < Math.max(MIN_DAYS_FOR_INSIGHT, loggedDays * COVERAGE_FLOOR)) {
      out.push({ kind: "coverage-low", nutrient: key, value: s.statedDays, value2: loggedDays, weight: 20 });
      return;
    }
    if (over ? s.avg > s.target : s.avg < s.target * 0.8) {
      out.push({ kind, nutrient: key, value: Math.abs(Math.round((s.avg - s.target) * 10) / 10), weight });
    }
  };
  panelFinding("salt", "salt-high", 70, true);
  panelFinding("sugar", "sugar-high", 60, true);
  panelFinding("fiber", "fiber-short", 55, false);

  // ── A direction worth naming. Only for the nutrients where a direction means
  // something to act on, and only over a window long enough to have one.
  if (windowDays >= 14) {
    for (const key of ["protein", "fiber", "kcal"] as NutrientKey[]) {
      const s = nutrients[key];
      if (!s.trend || s.trend.direction === "flat") continue;
      if (s.statedDays < MIN_DAYS_FOR_INSIGHT * 2) continue;
      out.push({
        kind: s.trend.direction === "up" ? "trend-up" : "trend-down",
        nutrient: key,
        value: Math.abs(s.trend.pct),
        weight: 35,
      });
    }
  }

  // Highest weight first; a stable sort keeps the order above as the tiebreak.
  return out.sort((a, b) => b.weight - a.weight);
}
