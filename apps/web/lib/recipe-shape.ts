import { MAX_RECIPE_INGREDIENTS, MAX_RECIPE_SERVINGS } from "@hybrid/core";

/**
 * Coercion for the user-recipe routes — shared by POST /api/nutrition/recipes
 * and PATCH /api/nutrition/recipes/[id] so a field cannot be validated one way
 * on create and another on edit.
 *
 * THE ONE RULE THAT MATTERS: a panel field (saturates / sugars / fibre / salt)
 * that is absent stays NULL, and is never coerced to 0. An unstated sugar
 * content is not a sugar-free food, and the whole recipe-total discipline
 * (sumFacts drops a field no ingredient states) collapses the moment a route
 * quietly writes zeros into it.
 */

/** A required macro — absent, negative or unparseable becomes 0. */
const req = (v: unknown, max: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 10) / 10, max);
};

/** A PANEL field. Absence survives as null — see the note above. */
const panel = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, 1000) : null;
};

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** The recipe's own scalar fields (it carries NO nutrition of its own). */
export function recipeFields(b: Record<string, unknown>) {
  const servingsRaw = typeof b.servings === "number" ? b.servings : parseFloat(String(b.servings));
  const timeRaw = typeof b.timeMins === "number" ? b.timeMins : parseFloat(String(b.timeMins));
  return {
    name: String(b.name ?? "").trim().slice(0, 80),
    note: str(b.note, 400),
    // One glyph, not a paragraph of them.
    emoji: typeof b.emoji === "string" && b.emoji ? [...b.emoji][0]! : null,
    servings: Number.isFinite(servingsRaw) ? Math.max(1, Math.min(MAX_RECIPE_SERVINGS, Math.round(servingsRaw))) : 1,
    timeMins: Number.isFinite(timeRaw) && timeRaw > 0 ? Math.min(Math.round(timeRaw), 24 * 60) : null,
  };
}

/** The ingredient lines, coerced and positioned. Unnamed lines are dropped
 *  rather than written as blanks — a nameless row is not an ingredient. */
export function ingredientRows(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_RECIPE_INGREDIENTS)
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const name = str(o.name, 80);
      if (!name) return null;
      const qtyRaw = typeof o.qty === "number" ? o.qty : parseFloat(String(o.qty));
      return {
        name,
        qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(Math.round(qtyRaw * 100) / 100, 1000) : 1,
        servingLabel: str(o.servingLabel, 40) ?? "1 serving",
        kcal: req(o.kcal, 10_000),
        protein: req(o.protein, 1_000),
        carbs: req(o.carbs, 2_000),
        fat: req(o.fat, 1_000),
        satFat: panel(o.satFat),
        sugar: panel(o.sugar),
        fiber: panel(o.fiber),
        salt: panel(o.salt),
        productId: str(o.productId, 40),
        verifiedId: str(o.verifiedId, 60),
        position: i,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
