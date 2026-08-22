import { useMemo, useState } from "react";
import { View, Text, TextInput, type StyleProp, type ViewStyle } from "react-native";
import {
  FREE_RECIPE_LIMIT,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_SERVINGS,
  formatIngredientQty,
  recipeTotals,
  canLogRecipe,
  linkIngredient,
  refreshIngredients,
  scaleRecipeTo,
  staleIngredients,
  type NutritionFacts,
  type RecipeSource,
  type UserRecipe,
  type UserRecipeIngredient, FEEDBACK, STATE_OPACITY, ALPHA } from "@hybrid/core";
import { fs, space, tracking, F, leading, PressScale, FIXED_FONT_SCALE, MAX_FONT_SCALE, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { APill, ACard, ASection, RADIUS } from "./kit";
import { withAlpha } from "./field";
import { AuroraIcon, Glyph } from "./icons";
import Sheet from "./sheet";
import { useListMotion } from "../../lib/list-motion";

/**
 * YOUR RECIPES (mobile).
 *
 * See that file's note. In short: a user recipe is an ARITHMETIC OBJECT, so
 * there is no macro form anywhere on this screen — you add foods and quantities
 * and the numbers follow, all of them from @hybrid/core's recipeTotals. And the
 * editor IS the detail view, because a recipe is a document you keep amending
 * and a read-only mode would be a navigation layer whose only job is to hide a
 * pencil.
 *
 * Its own module rather than another thousand lines inside nutrition.tsx, which
 * is already ~3 000 lines holding sixteen views.
 */

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
    /** the line's numbers are not known — see @hybrid/core user-recipes.ts */
    unstated?: boolean;
    position: number;
  }[];
};

/** API row → the engine's shape (which nests `facts` so it can hand
 *  ingredients straight to food-facts.ts; the wire keeps them flat). */
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
    // An older row (or an un-migrated database) has no column, and an absent
    // flag means STATED — those rows are real measurements.
    unstated: i.unstated === true,
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
    unstated: i.unstated === true,
  })),
});

/* ── shared bits ──────────────────────────────────────────────────────────── */

function MacroLine({ f, big }: { f: NutritionFacts; big?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const macros = [
    [t("w.recovery.nutrition.protein"), f.protein, txt(C, C.blue)],
    [t("w.recovery.nutrition.carbs"), f.carbs, txt(C, C.amber)],
    [t("w.recovery.nutrition.fat"), f.fat, txt(C, C.red)],
  ] as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: big ? 14 : 10, flexWrap: "wrap" }}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: F.black, fontSize: big ? 28 : fs.body, color: C.chalk, fontVariant: ["tabular-nums"] }}
      >
        {f.kcal}
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}> kcal</Text>
      </Text>
      {macros.map(([label, v, col]) => (
        <Text
          key={label}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: big ? fs.caption : fs.nano, color: col, fontVariant: ["tabular-nums"] }}
        >
          {Math.round(v * 10) / 10}g {label.slice(0, 1)}
        </Text>
      ))}
    </View>
  );
}

/** The stepper's increment follows the magnitude — one rule, so no ingredient
 *  needs a bespoke stepper. */
const stepFor = (qty: number) => (qty < 1 ? 0.25 : qty < 3 ? 0.5 : 1);

function StepButton({ label, onPress, disabled, small }: { label: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  const { palette: C } = useTheme();
  const d = small ? 30 : 36;
  return (
    <PressScale
      onPress={disabled ? () => {} : onPress}
      accessibilityRole="button"
      accessibilityLabel={label === "+" ? "increase" : "decrease"}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={HIT_SLOP}
      style={{
        width: d, height: d, borderRadius: RADIUS.pill,
        borderWidth: 1, borderColor: C.line,
        alignItems: "center", justifyContent: "center",
        opacity: disabled ? STATE_OPACITY.disabled : 1,
      }}
    >
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: small ? 15 : 17, color: C.chalk }}>{label}</Text>
    </PressScale>
  );
}

/* ── THE SHELF ────────────────────────────────────────────────────────────── */

export function UserRecipeShelf({
  recipes,
  onOpen,
  onNew,
  canAdd = false,
  onUpgrade,
  emptyNote = true,
  style,
}: {
  recipes: RecipeRow[];
  onOpen: (r: RecipeRow) => void;
  /** The way in to the editor. ABSENT → no door row: while a search is running
   *  this shelf is a RESULT, and a "New recipe" row sitting among results reads
   *  as one of them. */
  onNew?: () => void;
  canAdd?: boolean;
  onUpgrade?: () => void;
  /** The empty state's explanation. Off while searching: "you have not written
   *  one yet" is not the answer to "nothing matched that". */
  emptyNote?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash } as const;

  return (
    <View style={[{ marginTop: space.xl }, style]}>
      {/* The shared head, so this shelf and the curated ones below it are one
          anatomy rather than two that happen to look similar. */}
      <ASection
        title={t("w.recovery.nutrition.myRecipes")}
        meta={recipes.length > 0 ? String(recipes.length) : undefined}
        style={{ marginHorizontal: 2 }}
      />

      {recipes.length === 0 ? (
        emptyNote ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption, "relaxed"), marginHorizontal: 2, marginTop: space.xs }}>
            {t("w.recovery.nutrition.myRecipesSub")}
          </Text>
        ) : null
      ) : (
        recipes.map((r) => {
          const { perServing, servings, ingredientCount } = recipeTotals(toUserRecipe(r));
          return (
            <PressScale
              key={r.id}
              onPress={() => onOpen(r)}
              accessibilityRole="button"
              accessibilityLabel={r.name}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, marginTop: space.sm }}
            >
              <View style={{ width: 40, height: 40, borderRadius: RADIUS.inner, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
                <Glyph name="bowl" size={19} color={C.ash} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{r.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 3 }}>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                    {perServing.kcal} kcal
                  </Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
                    {t("w.recovery.nutrition.recipePerServing").toLowerCase()}
                  </Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginLeft: "auto", fontVariant: ["tabular-nums"] }}>
                    {ingredientCount} / {servings}
                  </Text>
                </View>
              </View>
            </PressScale>
          );
        })
      )}

      {/* The way in — a DOOR ROW: list hairline, ringed glyph, no fill and no
          border. It leaves for the editor, so it wears a ring; it carries no
          recipe, so it is not a card and is not counted as one. */}
      {onNew ? (
      <PressScale
        onPress={canAdd ? onNew : onUpgrade}
        accessibilityRole="button"
        accessibilityLabel={canAdd ? t("w.recovery.nutrition.newRecipe") : t("w.recovery.nutrition.unlockMoreRecipes")}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 14, paddingHorizontal: 2, marginTop: space.lg }}
      >
        <View style={{ width: 32, height: 32, borderRadius: RADIUS.pill, borderWidth: 1.4, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="add" size={15} color={C.ash} />
        </View>
        {/* A DOOR ROW SAYS WHERE IT GOES, and nothing else. It used to carry the
            section's own sentence as a subtitle — which, on an empty shelf,
            printed "Build a dish once from real foods…" twice on one screen,
            sixty points apart, because the empty state says it too. The
            explanation belongs where the emptiness is; the door keeps its
            label. The one line worth adding is the one the section did NOT
            say: why the door is closed. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
            {canAdd ? t("w.recovery.nutrition.newRecipe") : t("w.recovery.nutrition.unlockMoreRecipes")}
          </Text>
          {!canAdd ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>
              {t("w.recovery.nutrition.recipeFreeCap").replace("{n}", String(FREE_RECIPE_LIMIT))}
            </Text>
          ) : null}
        </View>
      </PressScale>
      ) : null}
    </View>
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
  products: RecipeSource[];
  onChange: (next: UserRecipe) => void;
  onSave: () => void;
  onDelete?: () => void;
  onLog?: (qty: number) => void;
  saving?: boolean;
  message?: string;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // The picker either ADDS a line or gives an existing one its numbers. Holding
  // the target here (rather than mounting a second sheet) is what keeps the two
  // paths one list with one search — a "link" sheet that drifted from the "add"
  // sheet would be the same catalogue, twice.
  const [picker, setPicker] = useState<null | { link?: string }>(null);
  const [query, setQuery] = useState("");
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totals = useMemo(() => recipeTotals(recipe), [recipe]);
  const stale = useMemo(() => staleIngredients(recipe, products), [recipe, products]);

  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash } as const;
  const field = {
    backgroundColor: C.ink, color: C.chalk, borderWidth: 1, borderColor: C.line,
    borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12,
    fontFamily: F.reg, fontSize: fs.bodyLg,
  } as const;

  const setQty = (id: string, qty: number) =>
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((i) => (i.id === id ? { ...i, qty: Math.max(0.05, Math.round(qty * 100) / 100) } : i)),
    });

  const removeIngredient = (id: string) =>
    onChange({ ...recipe, ingredients: recipe.ingredients.filter((i) => i.id !== id).map((i, n) => ({ ...i, position: n })) });

  const addFromProduct = (p: RecipeSource) => {
    // Linking an unknown line: it KEEPS ITS NAME (the recipe's word for it) and
    // takes the food's serving, snapshot and provenance. Quantity starts at one
    // of that serving — the stepper beside the row is how you say how much, and
    // guessing it from a name would be the wrong kind of clever.
    const target = picker?.link;
    if (target) {
      onChange(linkIngredient(recipe, target, { id: p.id, servingLabel: p.servingLabel, facts: p.facts }, 1));
      setPicker(null);
      setQuery("");
      return;
    }
    if (recipe.ingredients.length >= MAX_RECIPE_INGREDIENTS) return;
    const ing: UserRecipeIngredient = {
      // Client-side until the server assigns one — the editor keys rows by it,
      // so it must be stable for the life of the edit.
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
    setPicker(null);
    setQuery("");
  };

  const list = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : products;

  return (
    <View>
      {/* NAME + NOTE + SERVINGS. No macro fields anywhere: the numbers are
          derived, and a field to type them would invite an answer that
          disagrees with the ingredients. */}
      <ACard style={{ marginTop: space.lg }}>
        <TextInput
          value={recipe.name}
          onChangeText={(v) => onChange({ ...recipe, name: v })}
          placeholder={t("w.recovery.nutrition.recipeNamePh")}
          placeholderTextColor={C.ash}
          accessibilityLabel={t("w.recovery.nutrition.recipeName")}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ ...field, fontFamily: F.black, fontSize: fs.headline }}
        />
        <TextInput
          value={recipe.note ?? ""}
          onChangeText={(v) => onChange({ ...recipe, note: v || null })}
          placeholder={t("w.recovery.nutrition.recipeNotePh")}
          placeholderTextColor={C.ash}
          accessibilityLabel={t("w.recovery.nutrition.recipeNote")}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ ...field, marginTop: space.sm, fontSize: fs.body, color: C.ash }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.lg }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>
              {t("w.recovery.nutrition.recipeServings")}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, lineHeight: leading(fs.nano, "relaxed") }}>
              {t("w.recovery.nutrition.recipeScaleNote")}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <StepButton label="−" onPress={() => onChange(scaleRecipeTo(recipe, totals.servings - 1))} disabled={totals.servings <= 1} />
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] }}>
              {totals.servings}
            </Text>
            <StepButton label="+" onPress={() => onChange(scaleRecipeTo(recipe, totals.servings + 1))} disabled={totals.servings >= MAX_RECIPE_SERVINGS} />
          </View>
        </View>
      </ACard>

      {/* INGREDIENTS */}
      <ACard style={{ marginTop: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>
            {t("w.recovery.nutrition.recipeIngredients")}
          </Text>
          {recipe.ingredients.length > 0 ? (
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>{recipe.ingredients.length}</Text>
          ) : null}
        </View>

        {recipe.ingredients.length === 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: space.sm, lineHeight: leading(fs.caption, "relaxed") }}>
            {t("w.recovery.nutrition.recipeNoIngredients")}
          </Text>
        ) : (
          recipe.ingredients.map((ing, i) => (
            <View
              key={ing.id}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{ing.name}</Text>
                {ing.unstated ? (
                  // The line's own measure, and then the honest part: this row
                  // is not a measurement, and the app says so where the numbers
                  // would be rather than printing a zero in their place.
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 3 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{ing.servingLabel}</Text>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: txt(C, C.amber) }}>
                      {t("w.recovery.nutrition.recipeUnstatedRow")}
                    </Text>
                  </View>
                ) : (
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, fontVariant: ["tabular-nums"] }}>
                    {formatIngredientQty(ing)}
                  </Text>
                )}
              </View>
              {ing.unstated ? (
                // No stepper: stepping a quantity whose numbers are unknown
                // changes nothing you could read. The way forward is to say
                // WHICH food it is, so that is the only control the row offers.
                <PressScale
                  onPress={() => setPicker({ link: ing.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("w.recovery.nutrition.recipeLinkFood")} – ${ing.name}`}
                  hitSlop={HIT_SLOP}
                  style={{ borderWidth: 1, borderColor: withAlpha(C.amber, ALPHA.line), borderRadius: RADIUS.pill, paddingVertical: 7, paddingHorizontal: 12 }}
                >
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: txt(C, C.amber) }}>
                    {t("w.recovery.nutrition.recipeLinkFood")}
                  </Text>
                </PressScale>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <StepButton label="−" small onPress={() => setQty(ing.id, ing.qty - stepFor(ing.qty))} />
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, minWidth: 34, textAlign: "center", fontVariant: ["tabular-nums"] }}>
                    {Math.round(ing.qty * 100) / 100}
                  </Text>
                  <StepButton label="+" small onPress={() => setQty(ing.id, ing.qty + stepFor(ing.qty))} />
                </View>
              )}
              <PressScale onPress={() => removeIngredient(ing.id)} accessibilityRole="button" accessibilityLabel={ing.name} hitSlop={HIT_SLOP} style={{ padding: 4 }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>×</Text>
              </PressScale>
            </View>
          ))
        )}

        {recipe.ingredients.length < MAX_RECIPE_INGREDIENTS ? (
          <PressScale
            onPress={() => setPicker({})}
            accessibilityRole="button"
            accessibilityLabel={t("w.recovery.nutrition.recipeAddIngredient")}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, paddingBottom: 4, marginTop: recipe.ingredients.length ? 0 : space.lg }}
          >
            <View style={{ width: 32, height: 32, borderRadius: RADIUS.pill, borderWidth: 1.4, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name="add" size={15} color={C.ash} />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>
              {t("w.recovery.nutrition.recipeAddIngredient")}
            </Text>
          </PressScale>
        ) : null}
      </ACard>

      {/* STALE — reported, never applied. See @hybrid/core user-recipes.ts. */}
      {stale.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, paddingHorizontal: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), lineHeight: leading(fs.caption, "snug") }}>
            {t("w.recovery.nutrition.recipeStale").replace("{n}", String(stale.length))}
          </Text>
          <PressScale
            onPress={() => onChange(refreshIngredients(recipe, products, stale.map((x) => x.ingredientId)))}
            accessibilityRole="button"
            accessibilityLabel={t("w.recovery.nutrition.recipeRefresh")}
            hitSlop={HIT_SLOP}
          >
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase", color: txt(C, C.lime) }}>
              {t("w.recovery.nutrition.recipeRefresh")}
            </Text>
          </PressScale>
        </View>
      ) : null}

      {/* TOTALS — derived, twice. */}
      {recipe.ingredients.length > 0 ? (
        <ACard style={{ marginTop: space.lg }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>
            {totals.unstated.length > 0 ? t("w.recovery.nutrition.recipePerServingFloor") : t("w.recovery.nutrition.recipePerServing")}
          </Text>
          <View style={{ marginTop: space.xs }}><MacroLine f={totals.perServing} big /></View>
          <View style={{ marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase" }}>{t("w.recovery.nutrition.recipeTotal")}</Text>
            <View style={{ marginTop: space.xs }}><MacroLine f={totals.total} /></View>
          </View>
          {/* WHICH lines are missing, by name — a count alone ("2 unknown")
              leaves you scrolling the list to find them. */}
          {totals.unstated.length > 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.amber), marginTop: space.md, lineHeight: leading(fs.nano, "relaxed") }}>
              {t("w.recovery.nutrition.recipeUnstatedNote").replace("{v}", totals.unstated.join(", "))}
            </Text>
          ) : null}
          {totals.partial.length > 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: space.md, lineHeight: leading(fs.nano, "relaxed") }}>
              {t("w.recovery.nutrition.recipePartial").replace("{v}", [...new Set(totals.partial)].map((k) => t(`w.recovery.nutrition.facts.${k}`)).join(", "))}
            </Text>
          ) : null}
        </ACard>
      ) : null}

      {message ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: space.lg, paddingHorizontal: 2 }}>
          {message}
        </Text>
      ) : null}

      {/* ACTIONS */}
      <View style={{ gap: space.sm, marginTop: space.xl }}>
        {/* LOGGING IS REFUSED while any line is unknown — the diary is the one
            place a floor is indefensible, because an entry that under-reports
            what was eaten is invisible to everything downstream. The button
            does not vanish (that would read as a missing feature); it states
            the condition. */}
        {onLog && recipe.ingredients.length > 0 ? (
          canLogRecipe(recipe) ? (
            <APill label={t("w.recovery.nutrition.recipeLog")} onPress={() => onLog(1)} />
          ) : (
            // NOT a bordered pill, and that is the point: this is a SENTENCE
            // explaining why the button is absent, not a control. Drawn as one
            // it would be a CTA-shaped thing that answers no press — which is
            // both the outline-pill ratchet's concern and a worse screen.
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", paddingVertical: 6, lineHeight: leading(fs.caption, "relaxed") }}
            >
              {t("w.recovery.nutrition.recipeCannotLog").replace("{n}", String(totals.unstated.length))}
            </Text>
          )
        ) : null}
        <PressScale
          onPress={saving ? () => {} : onSave}
          accessibilityRole="button"
          accessibilityLabel={t("w.recovery.nutrition.recipeSave")}
          accessibilityState={{ disabled: !!saving }}
          style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 13, alignItems: "center", opacity: saving ? STATE_OPACITY.busy : 1 }}
        >
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.body, color: txt(C, C.lime) }}>
            {t("w.recovery.nutrition.recipeSave")}
          </Text>
        </PressScale>
        {onDelete ? (
          <PressScale onPress={() => setConfirmDelete(true)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.recipeDelete")} style={{ paddingVertical: 8, alignItems: "center" }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...mono, textTransform: "uppercase", color: txt(C, C.red) }}>
              {t("w.recovery.nutrition.recipeDelete")}
            </Text>
          </PressScale>
        ) : null}
      </View>

      {/* PICK AN INGREDIENT — from the products library. */}
      <Sheet
        visible={picker != null}
        onClose={() => setPicker(null)}
        title={picker?.link ? t("w.recovery.nutrition.recipeLinkFood") : t("w.recovery.nutrition.recipeFromProducts")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 4 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput
            value={query}
            onChangeText={(v) => refilter(() => setQuery(v))}
            placeholder={t("w.recovery.nutrition.searchProducts")}
            placeholderTextColor={C.ash}
            accessibilityLabel={t("w.recovery.nutrition.searchProducts")}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ flex: 1, color: C.chalk, fontFamily: F.reg, fontSize: fs.bodyLg, paddingVertical: 10 }}
          />
        </View>
        {products.length === 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: space.lg, paddingHorizontal: 2, lineHeight: leading(fs.caption, "relaxed") }}>
            {t("w.recovery.nutrition.recipeNoProducts")}
          </Text>
        ) : (
          list.map((p, i) => (
            <PressScale
              key={p.id}
              onPress={() => addFromProduct(p)}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
            >
              <View style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                <AuroraIcon name="add" size={15} color={txt(C, C.lime)} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{p.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2 }}>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{p.servingLabel}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk, fontVariant: ["tabular-nums"] }}>{p.facts.kcal} kcal</Text>
                </View>
              </View>
            </PressScale>
          ))
        )}
      </Sheet>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t("w.recovery.nutrition.recipeDelete")} detents={["medium"]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body, "relaxed") }}>
          {t("w.recovery.nutrition.recipeDeleteConfirm")}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xl }}>
          <PressScale onPress={() => setConfirmDelete(false)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.cancel")} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text>
          </PressScale>
          <APill
            label={t("w.recovery.nutrition.recipeDelete")}
            color={FEEDBACK.error.fill}
            onPress={() => { setConfirmDelete(false); onDelete?.(); }}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
    </View>
  );
}
