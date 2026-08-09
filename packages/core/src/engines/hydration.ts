/**
 * HYDRATION — the day's water, targeted the way every other figure in this app
 * is targeted: from the athlete's own body and the work they actually did.
 *
 * `water` has been a real SignalKind and a real field on NutritionDay since the
 * nutrition engine shipped. Nothing ever logged one and nothing ever rendered
 * one, so the column summed zeros forever. This engine is the missing middle.
 *
 * ── THE TARGET IS NOT A FLAT "8 GLASSES" ───────────────────────────────────
 * Eight glasses is folklore — it is neither a published intake nor scaled to
 * anybody. The target here is composed exactly like the calorie target:
 *
 *   baseline (bodyweight)  +  sweat allowance (today's training)
 *
 * The baseline is 35 ml per kg of bodyweight, which lands a 75 kg athlete at
 * about 2.6 L — consistent with the EFSA adequate intake for total water
 * (2.5 L/day for adult men, 2.0 L for women) once you account for the fact that
 * this app can only count what the athlete DRINKS. Food carries roughly a fifth
 * of total water intake and we have no way to measure it, so the figure is
 * deliberately a drinking target rather than a total-water one.
 *
 * The sweat allowance is 500 ml per training hour (the low end of the ACSM
 * replacement range — sweat rates run 0.5–2.0 L/h and vary enormously with heat
 * and the individual). We take the low end ON PURPOSE: this is a target the
 * athlete is measured against, and a target nobody can hit is a target that
 * gets ignored. When a caller has only training KCAL and not minutes, the
 * minutes are derived at a documented 600 kcal/h rather than being invented at
 * the call site in two different ways on two clients.
 *
 * ── THE STATE IS TIME-OF-DAY AWARE ─────────────────────────────────────────
 * "1.1 of 2.6 L" is a different sentence at 09:00 than at 21:00, and a screen
 * that shows the same bar for both is not telling the athlete anything they can
 * act on. `expectedMl` paces the target across the waking day, so "behind" means
 * behind FOR NOW, not behind for a day that hasn't happened yet.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * There is no "over-hydrated" state. Drinking too much water is a real risk,
 * but it is a risk of RATE (roughly a litre an hour sustained), and a day total
 * cannot distinguish 4 L drunk across sixteen hours — completely unremarkable
 * for a big training day — from 4 L drunk in three. Colouring a day total red
 * would be fake precision, so a met target simply stays met.
 *
 * Pure + unit-tested, and shared, so the figure on the phone and the figure in
 * the browser are the same figure (parity rule).
 */

import type { Signal } from "./signals";
import { todayNutrition, type NutritionDay } from "./nutrition";
import type { WeightUnit } from "../units";

/** Baseline drinking target, millilitres per kg of bodyweight. */
export const HYDRATION_ML_PER_KG = 35;
/** Replacement added per hour of training (ACSM's low end — see the file note). */
export const HYDRATION_SWEAT_ML_PER_HOUR = 500;
/** Used ONLY when a caller has training kcal but no minutes. */
export const HYDRATION_KCAL_PER_TRAINING_HOUR = 600;
/** The target is clamped into a range no body plausibly leaves. */
export const HYDRATION_MIN_ML = 1_500;
export const HYDRATION_MAX_ML = 6_000;
/** Bodyweight assumed when the athlete has never weighed in. */
const DEFAULT_BODY_MASS_KG = 75;

/** The waking window the day's drinking is paced across (local hours). */
export const HYDRATION_WAKE_HOUR = 7;
export const HYDRATION_SLEEP_HOUR = 22;

const ML_PER_FL_OZ = 29.5735295625;

/** Millilitres ⇄ US fluid ounces. Storage is ALWAYS millilitres. */
export const mlToFlOz = (ml: number): number => ml / ML_PER_FL_OZ;
export const flOzToMl = (oz: number): number => oz * ML_PER_FL_OZ;

/** The volume unit that goes with the athlete's chosen weight unit. */
export type VolumeUnit = "ml" | "floz";
export const volumeUnit = (u: WeightUnit): VolumeUnit => (u === "lb" ? "floz" : "ml");

/**
 * One tap on the water control. Presets are authored PER UNIT rather than
 * converted: 250 ml is a glass and 500 ml is a bottle, but "8.5 fl oz" is
 * nothing anybody has ever poured. An imperial athlete gets 8 / 16 / 32 fl oz,
 * which are the sizes actually printed on the vessels they own.
 */
export interface HydrationPreset {
  /** what is stored — always millilitres */
  ml: number;
  /** the figure to print on the chip, in the athlete's unit */
  amount: number;
  unit: VolumeUnit;
}

export function hydrationPresets(u: WeightUnit): HydrationPreset[] {
  if (volumeUnit(u) === "floz")
    return [8, 16, 32].map((amount) => ({ ml: Math.round(flOzToMl(amount)), amount, unit: "floz" as const }));
  return [250, 500, 750].map((ml) => ({ ml, amount: ml, unit: "ml" as const }));
}

/**
 * Format a stored millilitre figure in the athlete's unit.
 *
 * Metric crosses over to litres at 1 000 ml with one decimal, because "2600 ml"
 * is a number nobody says out loud. Imperial stays in fluid ounces throughout —
 * US quarts and gallons are not how anyone describes a day's drinking.
 * The unit suffix is a PARAMETER-FREE literal here (ml / L / fl oz are the same
 * three tokens in every language this app ships).
 */
export function formatVolume(ml: number, u: WeightUnit): string {
  const v = Math.max(0, Math.round(ml));
  if (volumeUnit(u) === "floz") return `${Math.round(mlToFlOz(v))} fl oz`;
  if (v < 1_000) return `${v} ml`;
  // Rounded through an integer rather than toFixed(1): 2 650 ml is exactly
  // 2.65 L, and toFixed rounds that DOWN because the binary double is a hair
  // under — so the target printed as "2.6 L" beside a bar filling to 2 650.
  const tenths = Math.round(v / 100);
  return `${Number((tenths / 10).toFixed(1))} L`;
}

/**
 * Today's drinking target in millilitres.
 *
 * `trainingMinutes` is the honest input; `trainingKcal` is the fallback for
 * callers that only have the energy figure (the nutrition screens already
 * compute `trainingEnergyOnDay` for the calorie bump and would otherwise each
 * invent their own kcal→minutes rule).
 */
export function hydrationTarget(
  opts: { bodyMassKg?: number; trainingMinutes?: number; trainingKcal?: number } = {},
): number {
  const kg = opts.bodyMassKg && opts.bodyMassKg > 0 ? opts.bodyMassKg : DEFAULT_BODY_MASS_KG;
  const minutes =
    opts.trainingMinutes != null && opts.trainingMinutes > 0
      ? opts.trainingMinutes
      : opts.trainingKcal && opts.trainingKcal > 0
        ? (opts.trainingKcal / HYDRATION_KCAL_PER_TRAINING_HOUR) * 60
        : 0;

  const base = kg * HYDRATION_ML_PER_KG;
  const sweat = (Math.max(0, minutes) / 60) * HYDRATION_SWEAT_ML_PER_HOUR;
  const raw = base + sweat;
  const clamped = Math.min(HYDRATION_MAX_ML, Math.max(HYDRATION_MIN_ML, raw));
  // To the nearest 50 ml — the target is an estimate and printing "2 627 ml"
  // claims a precision the 35 ml/kg rule does not have.
  return Math.round(clamped / 50) * 50;
}

/**
 * How much of the target the day should have covered by `now`, paced linearly
 * across the waking window. Before waking this is 0 (a day with nothing drunk
 * at 06:00 is not behind); after bedtime it is the whole target.
 */
export function expectedMl(target: number, now = Date.now()): number {
  const d = new Date(now);
  const hour = d.getHours() + d.getMinutes() / 60;
  const span = HYDRATION_SLEEP_HOUR - HYDRATION_WAKE_HOUR;
  const through = Math.max(0, Math.min(1, (hour - HYDRATION_WAKE_HOUR) / span));
  return Math.round(target * through);
}

export type HydrationStateKind =
  | "empty" //     nothing drunk today yet
  | "behind" //    materially short of where the hour says you should be
  | "on-track" //  keeping up with the day
  | "met"; //      the whole target is in

/** Below this share of the paced expectation, the day reads as "behind". */
const BEHIND_FACTOR = 0.8;

export interface Hydration {
  state: HydrationStateKind;
  /** millilitres logged today */
  ml: number;
  /** today's target, millilitres */
  target: number;
  /** ml ÷ target as a 0–100 fill */
  pct: number;
  /** millilitres still to drink (≥ 0) */
  leftMl: number;
  /** what the hour of day says should be in by now, millilitres */
  expected: number;
  /** how far behind that pace the athlete is (≥ 0; 0 once caught up) */
  behindMl: number;
  /** the sweat allowance inside `target` — 0 on a rest day */
  sweatMl: number;
  /** did the athlete train today */
  trained: boolean;
}

/**
 * The day's hydration, from the same Signal stream every other nutrition
 * figure reads. `day` may be passed in by a caller that has already rolled the
 * day up (the nutrition screens all hold a NutritionDay) so the roll-up is not
 * repeated once per card.
 */
export function hydrationToday(
  signals: Signal[],
  opts: {
    bodyMassKg?: number;
    trainingMinutes?: number;
    trainingKcal?: number;
    now?: number;
    /** an already-computed day, to avoid re-summing the whole stream */
    day?: NutritionDay;
  } = {},
): Hydration {
  const now = opts.now ?? Date.now();
  const day = opts.day ?? todayNutrition(signals, now);
  const ml = Math.max(0, Math.round(day.water));

  const target = hydrationTarget(opts);
  const base = hydrationTarget({ bodyMassKg: opts.bodyMassKg });
  const sweatMl = Math.max(0, target - base);

  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((ml / target) * 100))) : 0;
  const leftMl = Math.max(0, target - ml);
  const expected = expectedMl(target, now);
  const behindMl = Math.max(0, expected - ml);

  const state: HydrationStateKind =
    ml <= 0 ? "empty" : ml >= target ? "met" : ml < expected * BEHIND_FACTOR ? "behind" : "on-track";

  return {
    state,
    ml,
    target,
    pct,
    leftMl,
    expected,
    behindMl,
    sweatMl,
    trained: sweatMl > 0,
  };
}

/**
 * The day's water as whole vessels, for the glass-row rendering.
 *
 * The row is a picture of the target, so its length comes from the TARGET
 * rather than from what has been drunk — a row that grows as you drink would
 * make the goal move. Vessel size is the athlete's middle preset (500 ml /
 * 16 fl oz), and the count is capped so a 6 L target on a big day doesn't draw
 * a row that wraps three times.
 */
export const HYDRATION_MAX_VESSELS = 12;

export function hydrationVessels(h: Hydration, u: WeightUnit): { total: number; filled: number; vesselMl: number } {
  const presets = hydrationPresets(u);
  const vesselMl = presets[1]?.ml ?? 500;
  const ideal = Math.max(1, Math.round(h.target / vesselMl));
  const total = Math.min(HYDRATION_MAX_VESSELS, ideal);
  // When the target needs more vessels than the row can draw, each drawn vessel
  // stands for a proportional share rather than for one literal glass.
  const perVessel = h.target / total;
  const filled = Math.max(0, Math.min(total, Math.floor(h.ml / perVessel)));
  return { total, filled, vesselMl };
}
