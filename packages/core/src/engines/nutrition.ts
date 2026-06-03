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

const DAY = 86_400_000;
const KCAL_PER_KG = 7700; // ~energy in 1 kg of body mass
const dayKey = (iso: string) => iso.slice(0, 10);

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
  const today = new Date(now).toISOString().slice(0, 10);
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

export interface MacroTargets {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  maintenance: number;
  goal: NutritionGoal;
  basis: string;
}

/**
 * Goal-aware macro targets built on the maintenance estimate: a ~20% deficit for
 * fat loss (capped at −600 kcal), maintenance, or a ~10% surplus (capped +400)
 * for gaining. Protein is set from bodyweight (1.8–2.2 g/kg), fat at ~25% of
 * energy, carbohydrate fills the remainder.
 */
export function adaptiveTargets(
  signals: Signal[],
  opts: { goal?: NutritionGoal; bodyMassKg?: number; now?: number; days?: number } = {},
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
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    kcal, protein, carbs, fat, maintenance,
    goal,
    basis: est.kcal != null ? est.basis : "default (log intake + weight to personalize)",
  };
}
