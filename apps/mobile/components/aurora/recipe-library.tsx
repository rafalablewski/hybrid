import { View, Text, ScrollView, StyleSheet, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  RECIPES, recipeCardStats, recipeCookView, recipeCoverView, recipeTileView,
  type Recipe, type RecipeCollection, type RecipeCookView,
} from "@hybrid/core";
import { fs, space, leading, tracking, F, PressScale, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { DockRail, DockChip, RADIUS, ACard } from "./kit";
import { withAlpha } from "./field";
import { HeroNav } from "./hero";
import { COVER_GUTTER } from "../plan-hero";

/**
 * THE RECIPE LIBRARY (mobile) — the curated, read-only shelves.
 *
 * The twin of apps/web/components/aurora/recipe-library.tsx. These are the
 * READ-ONLY half; the athlete's own recipes live in aurora/user-recipes.tsx and
 * share no model with them.
 */

export function collectionTitle(key: RecipeCollection, t: (k: string) => string): string {
  return key === "highProtein" ? t("w.recovery.nutrition.recipeFilter.highProtein") : t(`w.recovery.nutrition.meal.${key}`);
}

/** One recipe tile — cover ink in both themes, like the covers they expand into. */
export const TILE_INK = "#0c0d0c";
export const TILE_W = 172;
export const TILE_H = 140;

/** The collection chips, riding the scaffold's `rail` slot so they dock beneath
 *  the collapsed bar and stay reachable at any scroll position. They JUMP, they
 *  don't filter — the shelves already ARE the collections, so narrowing to one
 *  would just empty the screen, which is why they are `role="anchor"` chips
 *  that can never light up (packages/core/src/dock-rail.ts). Web twin: the
 *  same name. */
export function CollectionRail({ keys, onJump }: { keys: RecipeCollection[]; onJump: (key: RecipeCollection) => void }) {
  const { t } = useLang();
  return (
    // The gutter is the COVER scaffold's (16), not the app's GUTTER (12): a
    // resting chip has to line up with the shelf heads it sits above.
    <DockRail label={t("w.recovery.nutrition.jumpToCollection")} gutter={COVER_GUTTER}>
      {keys.map((k) => (
        <DockChip key={k} role="anchor" label={collectionTitle(k, t)} onPress={() => onJump(k)} />
      ))}
    </DockRail>
  );
}

/** One collection = one full-bleed shelf. The head is the way IN to the
 *  collection's own screen, and it states the COUNT so a two-card peek is never
 *  mistaken for the whole shelf. */
export function RecipeShelf({ shelf, openCollection, openRecipe, onLayout }: {
  shelf: { key: RecipeCollection; recipes: Recipe[] };
  openCollection: (key: RecipeCollection) => void;
  openRecipe: (r: Recipe) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const n = shelf.recipes.length;
  return (
    <View onLayout={onLayout} style={{ marginTop: 20 }}>
      <Pressable
        onPress={() => openCollection(shelf.key)}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 10, marginHorizontal: 2 }}
      >
        <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{collectionTitle(shelf.key, t)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
          {n} {n === 1 ? t("w.recovery.nutrition.recipeCount") : t("w.recovery.nutrition.recipesCount")} →
        </Text>
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -COVER_GUTTER }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: COVER_GUTTER }}
      >
        {shelf.recipes.map((r) => <RecipeTile key={r.id} recipe={r} onOpen={() => openRecipe(r)} />)}
      </ScrollView>
    </View>
  );
}

/** A recipe as a COVER, not a card — the tile the Plans shelves carry, so
 *  tapping one expands it into the same poster at screen scale. The dish emoji
 *  stays FULL COLOUR (a ghosted emoji is a grey smudge, not a dish), which is
 *  the one thing separating a recipe tile from a goal tile. */
export function RecipeTile({ recipe, onOpen, width = TILE_W }: { recipe: Recipe; onOpen: () => void; width?: number }) {
  const { t } = useLang();
  const tile = recipeTileView(recipe, { mins: (n) => `${n} ${t("w.recovery.nutrition.min")}`, kcal: (n) => `${n} kcal` });
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${tile.title} – ${tile.meta}`}
      style={{ width, height: TILE_H, borderRadius: RADIUS.card, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: TILE_INK, padding: 12, justifyContent: "space-between" }}
    >
      {/* alpha-over-ink stops matching web's color-mix wash (52% → 0x85,
          15% @ 46% → 0x26, then ink) — web parity: nutrition.tsx RecipeTile */}
      <LinearGradient pointerEvents="none" colors={[`${tile.accent}85`, `${tile.accent}26`, `${tile.accent}00`]} locations={[0, 0.46, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} />
      <Text pointerEvents="none" style={{ position: "absolute", top: -4, right: -6, fontSize: 78, lineHeight: 84 }}>{tile.glyph}</Text>
      <LinearGradient pointerEvents="none" colors={["#0c0d0c00", "#0c0d0ca8", "#0c0d0c"]} locations={[0.34, 0.78, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={{ alignSelf: "flex-end", fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking.label, color: "rgba(255,255,255,0.85)" }}>{tile.count}</Text>
      <View>
        <Text numberOfLines={2} style={{ fontFamily: F.black, fontSize: 16, lineHeight: leading(16, "tight"), letterSpacing: tracking.display, color: "#fff" }}>{tile.title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: "rgba(255,255,255,0.7)", marginTop: 5 }}>{tile.meta}</Text>
      </View>
    </Pressable>
  );
}

/** The cook screen's PLATE — the recipe cover compressed into a card: the same
 *  duotone wash and full-colour dish, the meal as the chip, the dish as the
 *  title, the step counter where the cover puts its time, and one tick per step
 *  along the bottom edge. The back button is the cover's own HeroNav, so the
 *  screen no longer carries a centred title that repeats the plate's. */
export function CookPlate({ cook, onBack }: { cook: RecipeCookView; onBack: () => void }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ height: 150, borderRadius: RADIUS.card, overflow: "hidden", backgroundColor: TILE_INK, marginTop: 2 }}>
      {/* alpha-over-ink stops matching web's color-mix wash — web parity */}
      <LinearGradient pointerEvents="none" colors={[`${cook.accent}85`, `${cook.accent}26`, `${cook.accent}00`]} locations={[0, 0.46, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} />
      <Text pointerEvents="none" style={{ position: "absolute", top: -16, right: -10, fontSize: 118, lineHeight: 126 }}>{cook.glyph}</Text>
      <LinearGradient pointerEvents="none" colors={["#0c0d0c00", "#0c0d0c8c", "#0c0d0c"]} locations={[0.38, 0.8, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", top: 10, left: 10, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <HeroNav onPress={onBack} fromLabel={cook.title} material="glass" />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: tracking.caps, textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>{cook.count}</Text>
      </View>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: 14 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.onAccent }}>{cook.chip}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontFamily: F.black, fontSize: fs.display, lineHeight: leading(fs.display, "tight"), letterSpacing: tracking.display, color: "#fff", marginTop: 6 }}>{cook.title}</Text>
      </View>
      {/* one tick per step — the method's length, stated by the plate itself */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 2 }}>
        {Array.from({ length: cook.steps }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 3, backgroundColor: i <= cook.index ? C.lime : "rgba(255,255,255,0.18)" }} />
        ))}
      </View>
    </View>
  );
}

/** A recipe on the COLLECTION screen — the plan card's anatomy: an eyebrow, the
 *  dish, its three differentiating numbers as a rule-topped hem, and the note. */
export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const stats = recipeCardStats(recipe, {
    energy: t("w.recovery.nutrition.energy"),
    protein: t("w.recovery.nutrition.protein"),
    time: t("w.recovery.nutrition.time"),
    min: t("w.recovery.nutrition.min"),
  });
  return (
    <Pressable onPress={onOpen} accessibilityRole="button">
      <ACard style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{t(`w.recovery.nutrition.meal.${recipe.meal}`)}</Text>
          {recipe.highProtein && (
            <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.recipeFilter.highProtein")}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
          <Text style={{ fontSize: 24 }}>{recipe.emoji}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, flexShrink: 1 }}>{recipe.name}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 12, marginBottom: 10 }}>
          {stats.map((st) => (
            <View key={st.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, 0.14), paddingTop: 8 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.heading, lineHeight: leading(fs.heading, "tight"), letterSpacing: tracking.display, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                {st.value}
                {!!st.unit && <Text style={{ fontSize: 12, color: C.ash }}>{st.unit}</Text>}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: 4 }}>{st.label}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{recipe.note}</Text>
      </ACard>
    </Pressable>
  );
}

// The head above a screen-level rail — the Explore SectionHead anatomy: a bold
// display-face title with the action as small mono uppercase on the RIGHT of
// the same row. No marker before the title (the no-decorative-dot rule).
// A food row in the picker — a lime add-circle, name + macro meta, and either a
// chevron (a DB hit), a favourite star, or a trash affordance (a personal item).
// The row body + the add-circle both open the portion editor.
// The Create Food form's blank state — one constant, so the reset paths can
// never fall out of step with the fields the form actually has.
