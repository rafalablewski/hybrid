/**
 * Adaptive nutrition — MacroFactor-style targets that learn from the data.
 *
 * Manual macro logging lands on the Signal ontology (energyIntake / protein /
 * carbs / fat / water — one reading per entry, summed per day). This engine
 * aggregates the daily intake and ESTIMATES maintenance energy from the
 * relationship between intake and bodyweight trend (energy balance), then sets
 * goal-aware macro targets. No food database here — that's a separate, blocked
 * layer; this is the pure math that makes the targets adapt. Pure + testable.
 */

import type { Signal } from "./signals";
import { localDayKey, localTodayKey } from "../day-key";

const DAY = 86_400_000;
const KCAL_PER_KG = 7700; // ~energy in 1 kg of body mass
const dayKey = localDayKey; // the athlete's LOCAL calendar day (day-key.ts)

export interface NutritionDay {
  date: string; // YYYY-MM-DD
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  water: number; // ml
}

const FIELD: Partial<Record<Signal["kind"], keyof Omit<NutritionDay, "date">>> = {
  energyIntake: "kcal",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  water: "water",
};

/** Aggregate nutrition signals into per-day totals, newest day first. */
export function dailyNutrition(signals: Signal[]): NutritionDay[] {
  const map = new Map<string, NutritionDay>();
  for (const s of signals) {
    const field = FIELD[s.kind];
    if (!field) continue;
    const d = dayKey(s.ts);
    const row = map.get(d) ?? { date: d, kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
    row[field] += s.value;
    map.set(d, row);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Today's running totals (zeros if nothing logged yet). */
export function todayNutrition(signals: Signal[], now = Date.now()): NutritionDay {
  const today = localTodayKey(now);
  return (
    dailyNutrition(signals).find((d) => d.date === today) ?? {
      date: today, kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0,
    }
  );
}

export interface MaintenanceEstimate {
  /** estimated maintenance energy (kcal/day), or null if not enough data */
  kcal: number | null;
  basis: string;
  /** fitted bodyweight change over the window (kg) */
  weightChangeKg: number | null;
  /** mean logged intake over the window (kcal/day) */
  avgIntake: number | null;
}

/**
 * Estimate maintenance from energy balance over a window: if you ate `avgIntake`
 * and your weight changed by Δkg, then maintenance ≈ avgIntake − (Δkg·7700)/days.
 * Falls back to a bodyweight heuristic (≈31 kcal/kg) when intake/weight history
 * is too thin, and null when there's nothing to go on.
 */
export function estimateMaintenance(
  signals: Signal[],
  opts: { bodyMassKg?: number; days?: number; now?: number } = {},
): MaintenanceEstimate {
  const now = opts.now ?? Date.now();
  const days = opts.days ?? 28;
  const since = now - days * DAY;

  const intakeDays = dailyNutrition(signals.filter((s) => s.kind === "energyIntake" && Date.parse(s.ts) >= since))
    .filter((d) => d.kcal > 0);
  const avgIntake = intakeDays.length ? intakeDays.reduce((a, b) => a + b.kcal, 0) / intakeDays.length : null;

  const weights = signals
    .filter((s) => s.kind === "bodyMass" && Date.parse(s.ts) >= since)
    .map((s) => ({ t: Date.parse(s.ts), v: s.value }))
    .sort((a, b) => a.t - b.t);

  let weightChangeKg: number | null = null;
  if (weights.length >= 2) {
    const first = weights[0]!;
    const last = weights[weights.length - 1]!;
    const spanDays = (last.t - first.t) / DAY;
    if (spanDays > 0) weightChangeKg = ((last.v - first.v) / spanDays) * days;
  }

  if (avgIntake != null && weightChangeKg != null) {
    const kcal = Math.round(avgIntake - (weightChangeKg * KCAL_PER_KG) / days);
    return { kcal, basis: "energy balance (intake vs weight trend)", weightChangeKg, avgIntake: Math.round(avgIntake) };
  }

  const bw = opts.bodyMassKg ?? (weights.length ? weights[weights.length - 1]!.v : undefined);
  if (bw) return { kcal: Math.round(bw * 31), basis: "bodyweight estimate (~31 kcal/kg)", weightChangeKg, avgIntake: avgIntake != null ? Math.round(avgIntake) : null };

  return { kcal: null, basis: "not enough data", weightChangeKg, avgIntake: avgIntake != null ? Math.round(avgIntake) : null };
}

export type NutritionGoal = "lose" | "maintain" | "gain";

// ── Parts of the day ───────────────────────────────────────────────────────
// A log is attributed to a "part of the day" via Signal.source. The four
// built-ins are shared by every client; a Full user may append their OWN parts
// (e.g. "Pre-workout"), persisted in the nutrition prefs. Kept here so web +
// mobile render ONE list from one source of truth (parity rule).
export const DEFAULT_MEAL_PART_KEYS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type DefaultMealPart = (typeof DEFAULT_MEAL_PART_KEYS)[number];
/** A custom part a Full user added: a stable slug `key` + a display `label`. */
export type NutritionMealPart = { key: string; label: string };
/** How many custom parts a user may keep (mirrored client + server). */
export const MAX_CUSTOM_MEAL_PARTS = 8;
/** A resolved part for rendering: built-in key (label via t) or a custom part. */
export type MealPartDef = { key: string; label: string; custom: boolean };

/**
 * The full ordered list of parts to render: the four built-ins (labels resolved
 * by the caller's translator) followed by the user's custom parts. Custom parts
 * that collide with a built-in key are dropped so a slot never appears twice.
 */
export function resolveMealParts(
  custom: NutritionMealPart[] | undefined,
  tMeal: (key: DefaultMealPart) => string,
): MealPartDef[] {
  const base: MealPartDef[] = DEFAULT_MEAL_PART_KEYS.map((k) => ({ key: k, label: tMeal(k), custom: false }));
  const seen = new Set<string>(DEFAULT_MEAL_PART_KEYS);
  const extra: MealPartDef[] = [];
  for (const p of custom ?? []) {
    if (!p || !p.key || !p.label || seen.has(p.key)) continue;
    seen.add(p.key);
    extra.push({ key: p.key, label: p.label, custom: true });
    if (extra.length >= MAX_CUSTOM_MEAL_PARTS) break;
  }
  return [...base, ...extra];
}

/** Normalize a user-typed part name into a stable slug key. */
export function mealPartKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export interface MacroTargets {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  maintenance: number;
  goal: NutritionGoal;
  basis: string;
  /** training fuel added to today's target (kcal), 0 on a rest day */
  trainingKcal: number;
}

/**
 * Goal-aware macro targets built on the maintenance estimate: a ~20% deficit for
 * fat loss (capped at −600 kcal), maintenance, or a ~10% surplus (capped +400)
 * for gaining. Protein is set from bodyweight (1.8–2.2 g/kg), fat at ~25% of
 * energy, carbohydrate fills the remainder.
 *
 * Training-aware: pass `trainingKcal` (today's estimated training expenditure,
 * from load.trainingEnergyOnDay) to FUEL the day — the extra energy is added on
 * top of the goal target and routed entirely to carbohydrate (the fuel that
 * matters for the work), so a hard training day earns a higher carb + calorie
 * target while protein and fat hold. A rest day (0) leaves the target untouched.
 */
export function adaptiveTargets(
  signals: Signal[],
  opts: { goal?: NutritionGoal; bodyMassKg?: number; trainingKcal?: number; now?: number; days?: number } = {},
): MacroTargets {
  const goal = opts.goal ?? "maintain";
  const est = estimateMaintenance(signals, opts);
  const maintenance = est.kcal ?? 2200; // sensible default when truly cold-start

  const latestBw =
    opts.bodyMassKg ??
    (() => {
      const w = signals.filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
      return w?.value;
    })();

  let kcal = maintenance;
  if (goal === "lose") kcal = maintenance - Math.min(600, Math.round(maintenance * 0.2));
  else if (goal === "gain") kcal = maintenance + Math.min(400, Math.round(maintenance * 0.1));
  kcal = Math.max(1200, Math.round(kcal));

  const proteinPerKg = goal === "lose" ? 2.2 : goal === "gain" ? 1.8 : 1.8;
  const protein = latestBw ? Math.round(latestBw * proteinPerKg) : Math.round((kcal * 0.3) / 4);
  const fat = Math.round((kcal * 0.25) / 9);
  let carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  // Training fuel — add today's estimated expenditure on top, all as carbs.
  const trainingKcal = Math.max(0, Math.round(opts.trainingKcal ?? 0));
  if (trainingKcal > 0) {
    kcal += trainingKcal;
    carbs += Math.round(trainingKcal / 4);
  }

  return {
    kcal, protein, carbs, fat, maintenance,
    goal,
    basis: est.kcal != null ? est.basis : "default (log intake + weight to personalize)",
    trainingKcal,
  };
}

/**
 * A rolling summary of intake over the last `windowDays` (default 30) — the
 * numbers behind the Nutrition SUMMARY dashboard on both clients. Computed once
 * here so web + mobile show identical figures (parity rule). "Logged days" are
 * days that recorded any energy intake; averages + adherence are over those.
 */
export interface NutritionSummary {
  windowDays: number;
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** % of logged days whose kcal landed within ±10% of the target (null if no target/logs) */
  adherencePct: number | null;
  /** logged days that met ≥90% of the protein target */
  proteinHitDays: number;
  /** average energy split as whole-number percentages (null when nothing logged) */
  macroSplit: { protein: number; carbs: number; fat: number } | null;
}

export function nutritionSummary(
  signals: Signal[],
  opts: { targets?: MacroTargets; windowDays?: number; now?: number } = {},
): NutritionSummary {
  const now = opts.now ?? Date.now();
  const windowDays = opts.windowDays ?? 30;
  const since = now - windowDays * DAY;
  const days = dailyNutrition(signals).filter((d) => Date.parse(`${d.date}T00:00:00`) >= since && d.kcal > 0);
  const loggedDays = days.length;
  if (loggedDays === 0)
    return { windowDays, loggedDays: 0, avgKcal: null, avgProtein: null, adherencePct: null, proteinHitDays: 0, macroSplit: null };

  const avgKcal = Math.round(days.reduce((a, b) => a + b.kcal, 0) / loggedDays);
  const avgProtein = Math.round(days.reduce((a, b) => a + b.protein, 0) / loggedDays);
  const avgCarbs = days.reduce((a, b) => a + b.carbs, 0) / loggedDays;
  const avgFat = days.reduce((a, b) => a + b.fat, 0) / loggedDays;

  const pK = avgProtein * 4, cK = avgCarbs * 4, fK = avgFat * 9;
  const totalK = pK + cK + fK;
  const macroSplit = totalK > 0
    ? { protein: Math.round((pK / totalK) * 100), carbs: Math.round((cK / totalK) * 100), fat: Math.round((fK / totalK) * 100) }
    : null;

  const targets = opts.targets;
  let adherencePct: number | null = null;
  let proteinHitDays = 0;
  if (targets && targets.kcal > 0) {
    const within = days.filter((d) => d.kcal >= targets.kcal * 0.9 && d.kcal <= targets.kcal * 1.1).length;
    adherencePct = Math.round((within / loggedDays) * 100);
    proteinHitDays = days.filter((d) => d.protein >= targets.protein * 0.9).length;
  }
  return { windowDays, loggedDays, avgKcal, avgProtein, adherencePct, proteinHitDays, macroSplit };
}

/**
 * The single most useful "what now?" line for today — the coach-voiced nudge on
 * the Nutrition home. Pure + shared so both clients say the same thing. The
 * client maps `kind` to localized copy and shows `gap` where relevant.
 */
export type NutritionNudgeKind = "cold-start" | "protein" | "calories-left" | "over" | "on-track";
export interface NutritionNudge {
  kind: NutritionNudgeKind;
  /** grams (protein) or kcal (calories-left / over) the copy references; 0 otherwise */
  gap: number;
}

export function nutritionNudge(today: NutritionDay, targets: MacroTargets): NutritionNudge {
  if (today.kcal <= 0 && today.protein <= 0) return { kind: "cold-start", gap: 0 };
  const proteinGap = Math.round(targets.protein - today.protein);
  const kcalLeft = Math.round(targets.kcal - today.kcal);
  // Protein first — it's the lever that matters most for a hybrid athlete.
  if (proteinGap >= 20) return { kind: "protein", gap: proteinGap };
  if (today.kcal > targets.kcal * 1.1) return { kind: "over", gap: Math.round(today.kcal - targets.kcal) };
  if (kcalLeft >= 150) return { kind: "calories-left", gap: kcalLeft };
  return { kind: "on-track", gap: Math.max(0, kcalLeft) };
}

/**
 * FUEL — the Today-screen nutrition widget's state, in ONE place so web + mobile
 * render the same surface (parity rule). Like the week rail, it's a single
 * stateful object: the client reads meaning from the ring + a headline, not a
 * different card per case. Composes todayNutrition + adaptiveTargets (pass the
 * caller's trainingKcal from load.trainingEnergyOnDay so a trained day fuels the
 * target and flips the state to "refuel"). Pure + testable.
 */
export type FuelStateKind =
  | "empty" //     nothing logged today yet
  | "refuel" //    trained today and still short — recovery emphasis
  | "protein" //   rest day, but protein still ≥20 g short
  | "on-track" //  logging in progress, within range, no urgent gap
  | "over" //      over the calorie target by >10%
  | "goal-hit"; // every macro essentially met

export interface FuelMacro {
  key: "protein" | "carbs" | "fat";
  value: number; // logged grams
  target: number; // target grams
  pct: number; // value / target, 0–100 clamped
  hit: boolean; // value ≥ 95% of target
  over: boolean; // value strictly past 100% of target (surpassed)
  overBy: number; // grams past target (0 unless over)
}

export interface FuelToday {
  state: FuelStateKind;
  /** did the athlete train today (trainingKcal > 0) — drives the refuel framing */
  trained: boolean;
  trainingKcal: number;
  today: NutritionDay;
  targets: MacroTargets;
  /** targets.kcal − today.kcal (negative once over) */
  kcalLeft: number;
  /** eaten ÷ target as a 0–100 ring fill */
  kcalPct: number;
  /** grams of protein still to go (≥ 0) */
  proteinGap: number;
  macros: { protein: FuelMacro; carbs: FuelMacro; fat: FuelMacro };
  allMacrosHit: boolean;
}

// A macro counts as "hit" at ≥95% of target; protein nudges from 20 g short;
// calories read "left" from 150 kcal down; "over" past 110% of target. The
// thresholds mirror nutritionNudge so the two never disagree.
const MACRO_HIT = 0.95;
const PROTEIN_NUDGE_G = 20;
const KCAL_LEFT_MIN = 150;
const OVER_FACTOR = 1.1;

function fuelMacro(key: FuelMacro["key"], value: number, target: number): FuelMacro {
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : 0;
  const over = target > 0 && value > target;
  return { key, value: Math.round(value), target, pct, hit: target > 0 && value >= target * MACRO_HIT, over, overBy: over ? Math.round(value - target) : 0 };
}

export function fuelToday(
  signals: Signal[],
  opts: { goal?: NutritionGoal; trainingKcal?: number; bodyMassKg?: number; now?: number } = {},
): FuelToday {
  const trainingKcal = Math.max(0, Math.round(opts.trainingKcal ?? 0));
  const today = todayNutrition(signals, opts.now);
  const targets = adaptiveTargets(signals, opts);

  const protein = fuelMacro("protein", today.protein, targets.protein);
  const carbs = fuelMacro("carbs", today.carbs, targets.carbs);
  const fat = fuelMacro("fat", today.fat, targets.fat);
  const macros = { protein, carbs, fat };
  const allMacrosHit = protein.hit && carbs.hit && fat.hit;

  const kcalLeft = Math.round(targets.kcal - today.kcal);
  const kcalPct = targets.kcal > 0 ? Math.max(0, Math.min(100, Math.round((today.kcal / targets.kcal) * 100))) : 0;
  const proteinGap = Math.max(0, Math.round(targets.protein - today.protein));
  const trained = trainingKcal > 0;

  const state: FuelStateKind =
    today.kcal <= 0 && today.protein <= 0
      ? "empty"
      : allMacrosHit
        ? "goal-hit"
        : trained && (proteinGap >= PROTEIN_NUDGE_G || kcalLeft >= KCAL_LEFT_MIN)
          ? "refuel"
          : proteinGap >= PROTEIN_NUDGE_G
            ? "protein"
            : today.kcal > targets.kcal * OVER_FACTOR
              ? "over"
              : "on-track";

  return { state, trained, trainingKcal, today, targets, kcalLeft, kcalPct, proteinGap, macros, allMacrosHit };
}

/**
 * A premade meal preset — a saved, reusable meal a Full user can log with ONE
 * tap. The manual macro path (kcal/protein/carbs/fat inputs) stays free for
 * everyone; logging reusable premade meals is a Full feature, gated on
 * access.canSaveMealsAndProducts so web + mobile match (parity rule). Macros are
 * approximate and single-number (per the app's no-range convention). Names are
 * i18n keys so both clients resolve them through t().
 */
export interface MealPreset {
  id: string;
  labelKey: string;
  emoji: string;
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export const MEAL_PRESETS: MealPreset[] = [
  { id: "breakfast-oats-eggs", labelKey: "w.recovery.nutrition.preset.breakfast", emoji: "🍳", kcal: 520, protein: 32, carbs: 55, fat: 18 },
  { id: "lunch-chicken-rice", labelKey: "w.recovery.nutrition.preset.lunch", emoji: "🥗", kcal: 680, protein: 52, carbs: 78, fat: 16 },
  { id: "dinner-salmon-potato", labelKey: "w.recovery.nutrition.preset.dinner", emoji: "🍽️", kcal: 740, protein: 46, carbs: 60, fat: 30 },
  { id: "snack-yogurt-berries", labelKey: "w.recovery.nutrition.preset.snack", emoji: "🥤", kcal: 210, protein: 20, carbs: 22, fat: 4 },
];

/** The four macro signals a premade meal writes when logged — the SAME Signal
 *  kinds the manual quick-add uses, so a preset log and a manual log are
 *  indistinguishable downstream. */
export function mealPresetSignals(p: MealPreset): { kind: Signal["kind"]; value: number; unit: string }[] {
  return [
    { kind: "energyIntake", value: p.kcal, unit: "kcal" },
    { kind: "protein", value: p.protein, unit: "g" },
    { kind: "carbs", value: p.carbs, unit: "g" },
    { kind: "fat", value: p.fat, unit: "g" },
  ];
}

/**
 * One component of a meal being composed from saved products — a product's
 * single-serving macros plus how many servings of it the meal includes. Shared
 * by both clients so the "create a meal FROM products" builder sums identically.
 */
export interface MealComponent {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  /** number of servings of this product in the meal (≥ 1) */
  qty: number;
}

/** Sum a meal's product components into single-number macros (each product's
 *  macros × its serving count), rounded — the totals a "meal of products" saves
 *  and later logs. A non-positive qty counts as one serving. */
export function sumMealComponents(items: MealComponent[]): { kcal: number; protein: number; carbs: number; fat: number } {
  const total = items.reduce(
    (acc, it) => {
      const q = it.qty > 0 ? it.qty : 1;
      acc.kcal += it.kcal * q;
      acc.protein += it.protein * q;
      acc.carbs += it.carbs * q;
      acc.fat += it.fat * q;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    kcal: Math.round(total.kcal),
    protein: Math.round(total.protein),
    carbs: Math.round(total.carbs),
    fat: Math.round(total.fat),
  };
}
