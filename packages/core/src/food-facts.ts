/**
 * Food facts — the ONE nutrition shape every food in HYBRID is described with.
 *
 * Until now a food was four numbers (kcal / protein / carbs / fat). That is the
 * training-facing minimum, but it is NOT what a food label states and it is not
 * enough to answer the questions athletes actually ask ("how much of that fat is
 * saturated?", "how much of those carbs are sugar?", "am I over on salt?"). This
 * module adds the LABEL-COMPLETE panel — the EU/UK mandatory set — as OPTIONAL
 * fields, so:
 *
 *   - a food that states them carries them (HYBRID Verified items always do),
 *   - a food that doesn't stays exactly as valid as before (null ≠ zero),
 *   - nothing downstream breaks: the four macros are still required.
 *
 * `null`/`undefined` means NOT STATED. It must never render as "0 g" — an
 * unknown sugar content is not a sugar-free food. `unknown()` is the guard.
 *
 * Energy is stored ONCE, in kcal. Kilojoules are an exact unit conversion
 * (1 kcal = 4.184 kJ by definition), so storing kJ would be a second copy of the
 * same fact that can drift — `kj()` derives it at read time instead.
 *
 * Pure data + math. No UI, no I/O.
 */

// ── The panel ──────────────────────────────────────────────────────────────

/**
 * The optional, label-complete part of a food's nutrition — the fields a
 * packaged product or a chain's published table states beyond the four macros.
 * All in grams per the same serving as the macros they accompany.
 */
export interface MicroFacts {
  /** "of which saturates" (g) */
  satFat?: number | null;
  /** "of which sugars" (g) */
  sugar?: number | null;
  /** dietary fibre (g) */
  fiber?: number | null;
  /** salt (g) — the EU label unit. Sodium is derived (`sodiumMg`). */
  salt?: number | null;
}

/** A complete nutrition statement for ONE serving of something. */
export interface NutritionFacts extends MicroFacts {
  kcal: number;
  /** grams */
  protein: number;
  /** grams */
  carbs: number;
  /** grams */
  fat: number;
}

/** The keys of the optional panel, in label order. */
export const MICRO_KEYS = ["satFat", "sugar", "fiber", "salt"] as const;
export type MicroKey = (typeof MICRO_KEYS)[number];

/** A HYBRID-team attestation that a food's numbers were checked at source. */
export interface VerifiedStamp {
  /** the business/brand the item belongs to, e.g. "max-premium-burgers" */
  sourceId: string;
  /** display name, e.g. "Max Premium Burgers" */
  sourceName: string;
  /** ISO date (YYYY-MM-DD) the numbers were last checked */
  verifiedOn: string;
}

// ── Unit math ──────────────────────────────────────────────────────────────

/** 1 kcal = 4.184 kJ (the thermochemical calorie — the EU labelling definition). */
export const KJ_PER_KCAL = 4.184;
/** Salt (g) → sodium (g): salt is NaCl, sodium is 39.34 % of it by mass (1 / 2.5). */
export const SODIUM_PER_SALT = 0.4;

/** Energy in kilojoules, derived from kcal — never stored separately. */
export function kj(kcal: number): number {
  return Math.round(kcal * KJ_PER_KCAL);
}

/** Kilojoules → kcal, for a label that only states kJ. */
export function kcalFromKj(kilojoules: number): number {
  return Math.round(kilojoules / KJ_PER_KCAL);
}

/** Salt (g) → sodium (mg), the US-label unit. null in, null out. */
export function sodiumMg(saltG: number | null | undefined): number | null {
  if (saltG == null || !Number.isFinite(saltG)) return null;
  return Math.round(saltG * SODIUM_PER_SALT * 1000);
}

/** Sodium (mg) → salt (g), for importing a US label into the EU field. */
export function saltFromSodiumMg(mg: number): number {
  return Math.round((mg / 1000 / SODIUM_PER_SALT) * 100) / 100;
}

/** Atwater energy from the macros (4·4·9) — the fallback when kcal is absent. */
export function atwaterKcal(f: Pick<NutritionFacts, "protein" | "carbs" | "fat">): number {
  return Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9);
}

// ── Guards + scaling ───────────────────────────────────────────────────────

/** True when a panel field was NOT STATED (so the UI shows "—", never "0 g"). */
export function unknown(v: number | null | undefined): boolean {
  return v == null || !Number.isFinite(v);
}

/** Round to 1 dp — the precision food labels are stated at. */
const g1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Scale a whole panel by a serving count. Required macros scale; optional
 * fields scale ONLY if stated (an unknown stays unknown at any quantity — a
 * scaled unknown is still an unknown, not a zero).
 */
export function scaleFacts(f: NutritionFacts, qty: number): NutritionFacts {
  const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const opt = (v: number | null | undefined) => (unknown(v) ? null : g1(v as number * q));
  return {
    kcal: Math.round(f.kcal * q),
    protein: g1(f.protein * q),
    carbs: g1(f.carbs * q),
    fat: g1(f.fat * q),
    satFat: opt(f.satFat),
    sugar: opt(f.sugar),
    fiber: opt(f.fiber),
    salt: opt(f.salt),
  };
}

/**
 * Sum panels (a meal built from products, a day built from entries). A field is
 * stated in the total only when EVERY contributor states it — otherwise the sum
 * would silently under-report (three foods with sugar + one unknown is not a
 * known sugar total). `partial` names the fields that had to be dropped, so a
 * caller can say WHY a total is missing instead of showing a wrong number.
 */
export function sumFacts(list: NutritionFacts[]): { total: NutritionFacts; partial: MicroKey[] } {
  const total: NutritionFacts = { kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, sugar: 0, fiber: 0, salt: 0 };
  const partial: MicroKey[] = [];
  for (const f of list) {
    total.kcal += f.kcal;
    total.protein += f.protein;
    total.carbs += f.carbs;
    total.fat += f.fat;
    for (const k of MICRO_KEYS) {
      if (total[k] == null) continue; // already dropped
      if (unknown(f[k])) { total[k] = null; partial.push(k); continue; }
      total[k] = (total[k] as number) + (f[k] as number);
    }
  }
  total.protein = g1(total.protein);
  total.carbs = g1(total.carbs);
  total.fat = g1(total.fat);
  total.kcal = Math.round(total.kcal);
  for (const k of MICRO_KEYS) if (total[k] != null) total[k] = g1(total[k] as number);
  return { total, partial };
}

/**
 * How label-complete a food is: 0 → macros only, 1 → the full panel. Drives the
 * "verified data" readout, and lets the picker rank a fully-stated food above a
 * sparse one when everything else is equal.
 */
export function factsCompleteness(f: NutritionFacts): number {
  const stated = MICRO_KEYS.filter((k) => !unknown(f[k])).length;
  return stated / MICRO_KEYS.length;
}

/**
 * Sanity-check a stated panel against arithmetic. Returns human-readable
 * problems, empty when the numbers hang together. This is the check the HYBRID
 * team runs before stamping an item Verified — a label whose macros don't
 * reconcile with its energy has been mis-transcribed.
 */
export function auditFacts(f: NutritionFacts, tolerance = 0.06): string[] {
  const out: string[] = [];
  const derived = atwaterKcal(f);
  if (f.kcal > 0 && derived > 0 && Math.abs(derived - f.kcal) / f.kcal > tolerance)
    out.push(`energy ${f.kcal} kcal disagrees with 4·4·9 from the macros (${derived} kcal)`);
  if (!unknown(f.satFat) && (f.satFat as number) > f.fat + 0.05)
    out.push("saturates exceed total fat");
  if (!unknown(f.sugar) && (f.sugar as number) > f.carbs + 0.05)
    out.push("sugars exceed total carbohydrate");
  if (!unknown(f.fiber) && (f.fiber as number) > f.carbs + 0.05)
    out.push("fibre exceeds total carbohydrate");
  for (const [k, v] of Object.entries(f)) if (typeof v === "number" && v < 0) out.push(`${k} is negative`);
  return out;
}

// ── The rendered panel ─────────────────────────────────────────────────────

/** One line of the nutrition-facts panel, ready to render. */
export interface PanelRow {
  key: "energy" | "fat" | "satFat" | "carbs" | "sugar" | "fiber" | "protein" | "salt";
  /** i18n key for the label (w.recovery.nutrition.facts.*) */
  labelKey: string;
  /** the formatted amount, or null when the food never stated it */
  value: string | null;
  /** true for an indented "of which …" line under its parent */
  sub: boolean;
  /** a quieter second value on the same line (kJ, sodium) */
  note: string | null;
}

const gram = (v: number): string => `${Math.round(v * 10) / 10} g`;

/**
 * The label panel in EU order — energy, fat (of which saturates), carbohydrate
 * (of which sugars), fibre, protein, salt — as rows both clients render
 * identically. Ordering and which rows exist are decided ONCE, here, so the two
 * clients can never show a different panel for the same food (the parity rule).
 *
 * A row whose `value` is null was NOT STATED by the food: render it as "—" and
 * never as 0 g. Rows are always returned in full so the panel keeps its shape —
 * a food with gaps reads as a food with gaps, not as a shorter food.
 */
export function nutritionPanel(f: NutritionFacts): PanelRow[] {
  const row = (
    key: PanelRow["key"], labelKey: string, value: string | null, sub = false, note: string | null = null,
  ): PanelRow => ({ key, labelKey, value, sub, note });
  const opt = (v: number | null | undefined) => (unknown(v) ? null : gram(v as number));
  // Fat / carbs / protein reuse the macro labels the rest of the surface already
  // says, so the panel never renames a word the user just read on the ring.
  return [
    row("energy", "w.recovery.nutrition.facts.energy", `${Math.round(f.kcal)} kcal`, false, `${kj(f.kcal)} kJ`),
    row("fat", "w.recovery.nutrition.fat", gram(f.fat)),
    row("satFat", "w.recovery.nutrition.facts.satFat", opt(f.satFat), true),
    row("carbs", "w.recovery.nutrition.carbs", gram(f.carbs)),
    row("sugar", "w.recovery.nutrition.facts.sugar", opt(f.sugar), true),
    row("fiber", "w.recovery.nutrition.facts.fiber", opt(f.fiber)),
    row("protein", "w.recovery.nutrition.protein", gram(f.protein)),
    row("salt", "w.recovery.nutrition.facts.salt", opt(f.salt), false, unknown(f.salt) ? null : `${sodiumMg(f.salt)} mg sodium`),
  ];
}

/**
 * Per-100 g values from a stated serving — the only honest way to compare two
 * foods with different serving sizes (the comparison EU labels mandate). null
 * when the serving weight isn't known.
 */
export function per100g(f: NutritionFacts, servingGrams: number | null | undefined): NutritionFacts | null {
  if (servingGrams == null || !Number.isFinite(servingGrams) || servingGrams <= 0) return null;
  return scaleFacts(f, 100 / servingGrams);
}
