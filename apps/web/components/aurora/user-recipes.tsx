"use client";

import { useMemo, useState } from "react";
import {
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_SERVINGS,
  formatIngredientQty,
  recipeTotals,
  refreshIngredients,
  scaleRecipeTo,
  staleIngredients,
  type NutritionFacts,
  type RecipeSource,
  type UserRecipe,
  type UserRecipeIngredient,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * YOUR RECIPES (web) — the twin of apps/mobile/components/aurora/user-recipes.tsx.
 *
 * Deliberately its OWN module rather than another thousand lines inside
 * nutrition.tsx, which is already 3 200 lines holding sixteen views. Every
 * feature added to that file makes the next one harder; this one starts outside.
 *
 * A user recipe is an ARITHMETIC OBJECT, and the screen is shaped by that: there
 * is no macro form anywhere in it. You add foods and quantities, and the numbers
 * follow. Every figure comes from @hybrid/core's recipeTotals, so the total
 * under the ingredient list, the per-serving strip and the entry that lands in
 * the diary are the same computation rather than three.
 *
 * THE EDITOR IS THE DETAIL VIEW. There is no read-only recipe page with an
 * "edit" button that reveals the same fields again — a recipe is a document you
 * keep amending ("a bit less pasta next time"), and a separate read mode would
 * be one navigation layer whose only job is to hide a pencil.
 */

/** One recipe as the API returns it: flat ingredient rows, panel fields nullable. */
export type RecipeRow = {
  id: string;
  name: string;
  note?: string | null;
  emoji?: string | null;
  servings: number;
  timeMins?: number | null;
  ingredients: {
    id: string;
    name: string;
    qty: number;
    servingLabel: string;
    kcal: number; protein: number; carbs: number; fat: number;
    satFat?: number | null; sugar?: number | null; fiber?: number | null; salt?: number | null;
    productId?: string | null;
    verifiedId?: string | null;
    position: number;
  }[];
};

/** API row → the engine's shape. The engine takes a `facts` object so it can
 *  hand ingredients straight to food-facts.ts; the wire keeps them flat. */
export const toUserRecipe = (r: RecipeRow): UserRecipe => ({
  id: r.id,
  name: r.name,
  note: r.note ?? null,
  emoji: r.emoji ?? null,
  servings: r.servings,
  timeMins: r.timeMins ?? null,
  ingredients: r.ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    qty: i.qty,
    servingLabel: i.servingLabel,
    facts: {
      kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat,
      satFat: i.satFat ?? null, sugar: i.sugar ?? null, fiber: i.fiber ?? null, salt: i.salt ?? null,
    },
    productId: i.productId ?? null,
    verifiedId: i.verifiedId ?? null,
    position: i.position,
  })),
});

/** The engine's shape → the wire. */
export const toRecipeBody = (r: UserRecipe) => ({
  name: r.name,
  note: r.note,
  emoji: r.emoji,
  servings: r.servings,
  timeMins: r.timeMins,
  ingredients: r.ingredients.map((i) => ({
    name: i.name,
    qty: i.qty,
    servingLabel: i.servingLabel,
    ...i.facts,
    productId: i.productId,
    verifiedId: i.verifiedId,
  })),
});

const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: fs.nano,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: C("ash"),
  ...extra,
});

/** kcal + the three macros, as real layout rather than a joined string. */
function MacroLine({ f, big }: { f: NutritionFacts; big?: boolean }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: big ? 14 : 10, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: big ? 28 : fs.body, letterSpacing: "-.02em", color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
        {f.kcal}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginLeft: 4 }}>kcal</span>
      </span>
      {([[t("w.recovery.nutrition.protein"), f.protein, "var(--blue-text)"], [t("w.recovery.nutrition.carbs"), f.carbs, "var(--amber-text)"], [t("w.recovery.nutrition.fat"), f.fat, "var(--violet-text)"]] as const).map(([label, v, col]) => (
        <span key={label} style={{ fontFamily: "var(--font-mono)", fontSize: big ? fs.caption : fs.nano, color: col, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(v * 10) / 10}<span style={{ opacity: .75 }}>g</span> {label.slice(0, 1)}
        </span>
      ))}
    </div>
  );
}

/* ── THE SHELF — your recipes, on the Recipes root ────────────────────────── */

export function UserRecipeShelf({
  recipes,
  onOpen,
  onNew,
  canAdd,
  onUpgrade,
}: {
  recipes: RecipeRow[];
  onOpen: (r: RecipeRow) => void;
  onNew: () => void;
  canAdd: boolean;
  onUpgrade: () => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: 24 }}>
      {/* Head — title left, count right. No marker on the left. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "0 2px 4px" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>
          {t("w.recovery.nutrition.myRecipes")}
        </div>
        {recipes.length > 0 && <span style={mono()}>{recipes.length}</span>}
      </div>

      {recipes.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.6, margin: "6px 2px 0" }}>
          {t("w.recovery.nutrition.myRecipesSub")}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {recipes.map((r) => {
            const { perServing, servings, ingredientCount } = recipeTotals(toUserRecipe(r));
            return (
              <button
                key={r.id}
                className="pressable"
                onClick={() => onOpen(r)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "14px 16px", marginTop: 10, cursor: "pointer", color: C("chalk") }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 12, background: C("ink"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 19 }}>
                  {r.emoji ?? "🍲"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
                      {perServing.kcal} kcal
                    </span>
                    <span style={mono({ letterSpacing: 0, textTransform: "none" })}>
                      {t("w.recovery.nutrition.recipePerServing").toLowerCase()}
                    </span>
                    <span style={mono({ letterSpacing: 0, textTransform: "none", marginLeft: "auto" })}>
                      {ingredientCount} / {servings}
                    </span>
                  </div>
                </div>
                <AuroraIcon name="chevron-down" size={16} color={C("ash")} style={{ transform: "rotate(-90deg)" }} />
              </button>
            );
          })}
        </div>
      )}

      {/* The way in. A DOOR ROW — list hairline, ringed glyph, no fill and no
          border: it leaves for the editor, so it wears a ring; it carries no
          recipe, so it is not a card and is not counted as one. */}
      <button
        className="pressable"
        onClick={canAdd ? onNew : onUpgrade}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "14px 2px", marginTop: 14, cursor: "pointer", color: C("chalk") }}
      >
        <span style={{ width: 32, height: 32, borderRadius: 999, border: `1.4px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AuroraIcon name="add" size={15} color={C("ash")} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>
            {canAdd ? t("w.recovery.nutrition.newRecipe") : t("w.recovery.nutrition.unlockMoreRecipes")}
          </span>
          <span style={{ ...mono({ textTransform: "none", letterSpacing: 0 }), display: "block", marginTop: 2 }}>
            {t("w.recovery.nutrition.myRecipesSub")}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ── THE EDITOR — which is also the detail view ───────────────────────────── */

export function UserRecipeEditor({
  recipe,
  products,
  onChange,
  onSave,
  onDelete,
  onLog,
  saving,
  message,
}: {
  recipe: UserRecipe;
  /** The saved products an ingredient can be picked from — and the sources
   *  staleness is checked against. */
  products: RecipeSource[];
  onChange: (next: UserRecipe) => void;
  onSave: () => void;
  /** Absent for a recipe that has never been saved. */
  onDelete?: () => void;
  /** Absent until the recipe has something in it worth logging. */
  onLog?: (qty: number) => void;
  saving?: boolean;
  message?: string;
}) {
  const { t } = useLang();
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totals = useMemo(() => recipeTotals(recipe), [recipe]);
  const stale = useMemo(() => staleIngredients(recipe, products), [recipe, products]);

  const setQty = (id: string, qty: number) =>
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((i) => (i.id === id ? { ...i, qty: Math.max(0.05, Math.round(qty * 100) / 100) } : i)),
    });

  const removeIngredient = (id: string) =>
    onChange({ ...recipe, ingredients: recipe.ingredients.filter((i) => i.id !== id).map((i, n) => ({ ...i, position: n })) });

  const addFromProduct = (p: RecipeSource) => {
    if (recipe.ingredients.length >= MAX_RECIPE_INGREDIENTS) return;
    const ing: UserRecipeIngredient = {
      // A client-side id until the server assigns one — the editor keys rows by
      // it, so it must be stable for the life of the edit.
      id: `new:${p.id}:${recipe.ingredients.length}`,
      name: p.name,
      qty: 1,
      servingLabel: p.servingLabel,
      facts: p.facts,
      productId: p.id,
      verifiedId: null,
      position: recipe.ingredients.length,
    };
    onChange({ ...recipe, ingredients: [...recipe.ingredients, ing] });
    setPicker(false);
    setQuery("");
  };

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: C("ink"), color: C("chalk"),
    border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none",
    fontFamily: "var(--font-display)", fontSize: fs.bodyLg,
  };
  const card: React.CSSProperties = {
    background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28,
    boxShadow: "var(--shadow-card)", padding: CARD_PAD, marginTop: 16,
  };

  const list = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : products;

  return (
    <div>
      {/* NAME + NOTE — the title plate. No macro fields anywhere on this
          screen: the numbers are derived, and a field to type them would
          invite an answer that disagrees with the ingredients. */}
      <div style={card}>
        <input
          value={recipe.name}
          onChange={(e) => onChange({ ...recipe, name: e.target.value })}
          placeholder={t("w.recovery.nutrition.recipeNamePh")}
          aria-label={t("w.recovery.nutrition.recipeName")}
          style={{ ...field, fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" }}
        />
        <input
          value={recipe.note ?? ""}
          onChange={(e) => onChange({ ...recipe, note: e.target.value || null })}
          placeholder={t("w.recovery.nutrition.recipeNotePh")}
          aria-label={t("w.recovery.nutrition.recipeNote")}
          style={{ ...field, marginTop: 10, fontSize: fs.body, color: C("ash") }}
        />

        {/* SERVINGS — a stepper that rescales the ingredients, because a yield
            changed without its ingredients silently halves every serving. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
          <div>
            <div style={mono()}>{t("w.recovery.nutrition.recipeServings")}</div>
            <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.nano }), marginTop: 3, maxWidth: "34ch", lineHeight: 1.5 }}>
              {t("w.recovery.nutrition.recipeScaleNote")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <StepButton label="−" onClick={() => onChange(scaleRecipeTo(recipe, totals.servings - 1))} disabled={totals.servings <= 1} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {totals.servings}
            </span>
            <StepButton label="+" onClick={() => onChange(scaleRecipeTo(recipe, totals.servings + 1))} disabled={totals.servings >= MAX_RECIPE_SERVINGS} />
          </div>
        </div>
      </div>

      {/* INGREDIENTS */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.recipeIngredients")}</b>
          {recipe.ingredients.length > 0 && <span style={mono()}>{recipe.ingredients.length}</span>}
        </div>

        {recipe.ingredients.length === 0 ? (
          <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), marginTop: 10, lineHeight: 1.6 }}>
            {t("w.recovery.nutrition.recipeNoIngredients")}
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {recipe.ingredients.map((ing, i) => (
                <div key={ing.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ing.name}
                    </div>
                    <div style={{ ...mono({ textTransform: "none", letterSpacing: 0 }), marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                      {formatIngredientQty(ing)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <StepButton label="−" small onClick={() => setQty(ing.id, ing.qty - stepFor(ing.qty))} />
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, minWidth: 34, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(ing.qty * 100) / 100}
                    </span>
                    <StepButton label="+" small onClick={() => setQty(ing.id, ing.qty + stepFor(ing.qty))} />
                  </div>
                  <button
                    className="pressable"
                    onClick={() => removeIngredient(ing.id)}
                    aria-label={`${t("w.recovery.nutrition.recipeIngredients")}: ${ing.name}`}
                    style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 4, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
            ))}
          </div>
        )}

        {/* Add — a door row of THIS list, taking the list's own hairline. */}
        {recipe.ingredients.length < MAX_RECIPE_INGREDIENTS && (
          <button
            className="pressable"
            onClick={() => setPicker(true)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "14px 0 4px", marginTop: recipe.ingredients.length ? 0 : 14, cursor: "pointer", color: C("chalk") }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 999, border: `1.4px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <AuroraIcon name="add" size={15} color={C("ash")} />
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>
              {t("w.recovery.nutrition.recipeAddIngredient")}
            </span>
          </button>
        )}
      </div>

      {/* STALE — reported, never applied. See user-recipes.ts. */}
      {stale.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "0 2px" }}>
          <span style={{ ...mono({ color: "var(--amber-text)", textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), flex: 1, lineHeight: 1.5 }}>
            {t("w.recovery.nutrition.recipeStale").replace("{n}", String(stale.length))}
          </span>
          <button
            className="pressable"
            onClick={() => onChange(refreshIngredients(recipe, products, stale.map((s) => s.ingredientId)))}
            style={{ background: "none", border: "none", cursor: "pointer", ...mono({ color: "var(--lime-text)" }), flexShrink: 0 }}
          >
            {t("w.recovery.nutrition.recipeRefresh")}
          </button>
        </div>
      )}

      {/* TOTALS — derived, twice: the whole tray and one serving. */}
      {recipe.ingredients.length > 0 && (
        <div style={card}>
          <div style={mono()}>{t("w.recovery.nutrition.recipePerServing")}</div>
          <div style={{ marginTop: 8 }}><MacroLine f={totals.perServing} big /></div>
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
            <div style={mono()}>{t("w.recovery.nutrition.recipeTotal")}</div>
            <div style={{ marginTop: 8 }}><MacroLine f={totals.total} /></div>
          </div>
          {/* WHY a panel field is missing, rather than a silent zero. */}
          {totals.partial.length > 0 && (
            <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.nano }), marginTop: 14, lineHeight: 1.6 }}>
              {t("w.recovery.nutrition.recipePartial").replace("{v}", [...new Set(totals.partial)].map((k) => t(`w.recovery.nutrition.facts.${k}`)).join(", "))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div style={{ ...mono({ color: "var(--lime-text)", textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), marginTop: 14, padding: "0 2px" }}>
          {message}
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {onLog && recipe.ingredients.length > 0 && (
          <button
            className="pressable"
            onClick={() => onLog(1)}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 14, cursor: "pointer" }}
          >
            {t("w.recovery.nutrition.recipeLog")}
          </button>
        )}
        <button
          className="pressable"
          onClick={onSave}
          disabled={saving}
          style={{ width: "100%", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 13, cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1 }}
        >
          {t("w.recovery.nutrition.recipeSave")}
        </button>
        {onDelete && (
          <button
            className="pressable"
            onClick={() => setConfirmDelete(true)}
            style={{ width: "100%", background: "none", border: "none", padding: 8, cursor: "pointer", ...mono({ color: "var(--red-text)" }) }}
          >
            {t("w.recovery.nutrition.recipeDelete")}
          </button>
        )}
      </div>

      {/* PICK AN INGREDIENT — from the products library. */}
      <Sheet open={picker} onClose={() => setPicker(false)} title={t("w.recovery.nutrition.recipeFromProducts")}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
          <AuroraIcon name="search" size={18} color={C("ash")} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("w.recovery.nutrition.searchProducts")}
            aria-label={t("w.recovery.nutrition.searchProducts")}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.bodyLg }}
          />
        </div>
        {products.length === 0 ? (
          <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), padding: "16px 2px", lineHeight: 1.6 }}>
            {t("w.recovery.nutrition.recipeNoProducts")}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {list.map((p, i) => (
              <button
                key={p.id}
                className="pressable"
                onClick={() => addFromProduct(p)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: i ? `1px solid ${C("line")}` : "none", padding: "12px 2px", cursor: "pointer", color: C("chalk") }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 999, border: "1.6px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <AuroraIcon name="add" size={15} color="var(--lime-text)" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
                    <span style={mono({ letterSpacing: 0, textTransform: "none" })}>{p.servingLabel}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
                      {p.facts.kcal} kcal
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t("w.recovery.nutrition.recipeDelete")}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), margin: 0 }}>
          {t("w.recovery.nutrition.recipeDeleteConfirm")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
          <button className="pressable" onClick={() => setConfirmDelete(false)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            {t("w.recovery.nutrition.cancel")}
          </button>
          <button className="pressable" onClick={() => { setConfirmDelete(false); onDelete?.(); }} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("red"), color: "#fff", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>
            {t("w.recovery.nutrition.recipeDelete")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** The stepper's increment follows the magnitude: a 0.5-scoop ingredient steps
 *  in halves, a 3 × 100 g one steps in whole servings. One rule, so no
 *  ingredient needs a bespoke stepper. */
const stepFor = (qty: number) => (qty < 1 ? 0.25 : qty < 3 ? 0.5 : 1);

function StepButton({ label, onClick, disabled, small }: { label: string; onClick: () => void; disabled?: boolean; small?: boolean }) {
  const d = small ? 30 : 36;
  return (
    <button
      className="pressable"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "increase" : "decrease"}
      style={{
        width: d, height: d, borderRadius: 999,
        border: `1px solid ${C("line")}`, background: "transparent",
        color: disabled ? C("line") : C("chalk"),
        display: "grid", placeItems: "center", flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "var(--font-mono)", fontSize: small ? 15 : 17, lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
