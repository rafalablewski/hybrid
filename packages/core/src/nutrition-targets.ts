/**
 * MANUAL TARGETS — the escape hatch for an athlete who knows their numbers.
 *
 * Every calorie and macro figure in this app is DERIVED: `adaptiveTargets`
 * estimates maintenance from the athlete's own weight trend, applies the goal,
 * and adds the day's training fuel. That is the right default and it is what
 * makes this a performance tool rather than a calculator. But an athlete on a
 * coached protocol, or one peaking for a weight class, has numbers of their own,
 * and until now the goal picker was the only lever they had.
 *
 * ── THE OVERRIDE IS PER FIELD, AND THAT IS THE WHOLE DESIGN ───────────────
 * You can fix protein at 180 g and let calories keep adapting. Each field is
 * independently overridden or not, because the realistic case is not "I have
 * four numbers" — it is "my coach gave me a protein floor" or "I hold calories
 * flat and let the macros move".
 *
 * A field that is not overridden is left EXACTLY as the engine computed it. It
 * is not rescaled to fit an overridden neighbour: rescaling would quietly
 * change a number the athlete did not touch in order to satisfy one they did,
 * and the whole point of the override is that the athlete's arithmetic wins.
 *
 * ── AND SO THE FOUR NUMBERS CAN DISAGREE, VISIBLY ─────────────────────────
 * Override calories to 2 000 while the adaptive macros still describe 2 600 and
 * the four figures no longer reconcile. That is a real state and it is the
 * athlete's own doing, so `targetMismatch` MEASURES it and the clients say it
 * in one line. Hiding it would leave a screen whose own numbers contradict each
 * other with nothing to explain why; silently fixing it would undo an explicit
 * choice. Stating it is the only honest option.
 *
 * ── TRAINING FUEL SURVIVES BY DEFAULT ─────────────────────────────────────
 * A manual target replaces the BASE, and the day's training fuel is still added
 * on top unless the athlete turns that off. The app's whole thesis is eating
 * for the work done; an override that silently discarded the bump would leave a
 * hard day under-fuelled with nothing on screen to say why. The opt-out exists
 * because "2 800 kcal, every day, no exceptions" is also a legitimate protocol.
 *
 * Pure + unit-tested, and shared, so an overridden target reads the same on
 * both clients (parity rule).
 */

import { atwaterKcal } from "./food-facts";
import type { MacroTargets } from "./engines/nutrition";

export type TargetField = "kcal" | "protein" | "carbs" | "fat";
export const TARGET_FIELDS: TargetField[] = ["kcal", "protein", "carbs", "fat"];

/** What the athlete typed. A field absent or null is NOT overridden. */
export interface TargetOverride {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  /** keep adding the day's training fuel on top of the manual figure */
  trainingFuel?: boolean;
}

/** Sane bounds. Not opinions about what an athlete should eat — guards against
 *  a typo turning 250 g of carbs into 2 500 and the ring rendering nonsense. */
export const TARGET_LIMITS: Record<TargetField, { min: number; max: number }> = {
  kcal: { min: 800, max: 12_000 },
  protein: { min: 0, max: 600 },
  carbs: { min: 0, max: 1_500 },
  fat: { min: 0, max: 500 },
};

/** True when anything at all has been overridden. */
export const hasOverride = (ov: TargetOverride | null | undefined): boolean =>
  !!ov && TARGET_FIELDS.some((f) => ov[f] != null);

/** Clamp and round one typed figure, or null it when it is not a number. */
export function cleanTargetField(field: TargetField, value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(String(value).replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const { min, max } = TARGET_LIMITS[field];
  return Math.round(Math.min(max, Math.max(min, n)));
}

/** Coerce a whole override from anything (a form, a JSON blob, a wire body). */
export function cleanTargetOverride(raw: unknown): TargetOverride {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: TargetOverride = {};
  for (const f of TARGET_FIELDS) {
    const v = cleanTargetField(f, o[f]);
    if (v != null) out[f] = v;
  }
  // Defaults to ON — see the file note on why the bump survives.
  out.trainingFuel = o.trainingFuel !== false;
  return out;
}

export interface ResolvedTargets extends MacroTargets {
  /** which fields the athlete set by hand */
  overridden: TargetField[];
}

/**
 * The targets the app should show and measure against.
 *
 * `base` is whatever `adaptiveTargets` produced WITHOUT the training bump — the
 * caller passes `trainingKcal: 0` and hands the bump here separately, so this
 * function is the single place that decides whether it applies.
 */
export function resolveTargets(
  base: MacroTargets,
  override: TargetOverride | null | undefined,
  trainingKcal = 0,
): ResolvedTargets {
  const bump = Math.max(0, Math.round(trainingKcal));
  const ov = override ?? {};
  const overridden = TARGET_FIELDS.filter((f) => ov[f] != null);

  // No override at all: the engine's own numbers, with the bump where the
  // engine already puts it (energy, and the carbs that carry it).
  if (overridden.length === 0) {
    return { ...withFuel(base, bump), overridden: [] };
  }

  const fuelOn = ov.trainingFuel !== false;
  const addFuel = fuelOn ? bump : 0;

  // An overridden field is taken EXACTLY as typed; an untouched one keeps the
  // engine's figure, unrescaled. See the file note. Spreading `base` keeps
  // maintenance/goal/basis — the PROVENANCE of the adaptive figures — intact,
  // so a screen can still say where the untouched numbers came from.
  const out: MacroTargets = {
    ...base,
    kcal: ov.kcal != null ? ov.kcal : base.kcal,
    protein: ov.protein != null ? ov.protein : base.protein,
    carbs: ov.carbs != null ? ov.carbs : base.carbs,
    fat: ov.fat != null ? ov.fat : base.fat,
  };
  return { ...withFuel(out, addFuel), overridden };
}

/** Training fuel is energy, and energy on a training day is carried by carbs —
 *  the same composition `adaptiveTargets` performs, kept here so the manual and
 *  the adaptive path cannot add the bump two different ways. */
function withFuel(t: MacroTargets, bump: number): MacroTargets {
  // `trainingKcal` is set either way: it is the record of what WAS added, and
  // a rest day recording 0 is as meaningful as a hard day recording 500.
  if (bump <= 0) return { ...t, trainingKcal: 0 };
  return { ...t, kcal: t.kcal + bump, carbs: t.carbs + Math.round(bump / 4), trainingKcal: bump };
}

export interface TargetMismatch {
  /** what the three macros actually describe, in kcal (4·4·9, fibre-free) */
  macroKcal: number;
  /** the calorie target being shown */
  kcal: number;
  /** macroKcal − kcal; negative means the macros describe LESS food */
  deltaKcal: number;
  /** |delta| as a share of the calorie target, 0–100 */
  pct: number;
  /** true once the gap is large enough that the screen is contradicting itself */
  material: boolean;
}

/** Anything under this share of the target is rounding, not a contradiction. */
const MISMATCH_TOLERANCE = 0.05;

/**
 * Do the four numbers agree?
 *
 * Always computed, never enforced. A mismatch is a fact about what the athlete
 * asked for, and the client's job is to say it once, quietly, not to correct it.
 */
export function targetMismatch(t: MacroTargets): TargetMismatch {
  const macroKcal = atwaterKcal({ protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: null });
  const deltaKcal = macroKcal - t.kcal;
  const pct = t.kcal > 0 ? Math.round((Math.abs(deltaKcal) / t.kcal) * 100) : 0;
  return {
    macroKcal,
    kcal: t.kcal,
    deltaKcal,
    pct,
    material: t.kcal > 0 && Math.abs(deltaKcal) > t.kcal * MISMATCH_TOLERANCE,
  };
}
