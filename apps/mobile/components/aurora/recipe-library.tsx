import { View, Text, ScrollView, StyleSheet, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  RECIPES, isHighProtein, recipeCardStats, recipeCookView, recipeCoverView, recipeTileView,
  type Recipe, type RecipeCollection, type RecipeCookView,
 colors,
  ALPHA,} from "@hybrid/core";
import { F, FIXED_FONT_SCALE, PressScale, PressScale as Pressable, fs, leading, space, tracking, ty} from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { DockRail, DockChip, RADIUS, ACard, ASection } from "./kit";
import RailTail from "./rail-tail";
import { withAlpha } from "./field";
import { HeroNav } from "./hero";
import { COVER_GUTTER } from "../plan-hero";
import { Mark } from "./mark";

/**
 * THE RECIPE LIBRARY (mobile) — the curated, read-only shelves.
 *
 * These are the READ-ONLY half; the athlete's own recipes live in aurora/user-
 * recipes.tsx and share no model with them.
 */

export function collectionTitle(key: RecipeCollection, t: (k: string) => string): string {
  return key === "highProtein" ? t("w.recovery.nutrition.recipeFilter.highProtein") : t(`w.recovery.nutrition.meal.${key}`);
}

/** One recipe tile — cover ink in both themes, like the covers they expand into. */
export const TILE_INK = colors.ink;
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

/**
 * One collection = one full-bleed shelf.
 *
 * THE HEAD IS NOT THE EXIT, and it used to be: the whole row was pressable and
 * its right slot read "3 RECIPES →", which is precisely the pattern
 * aurora/rail-tail.tsx was written to retire — "every rail used to carry a
 * 'See all ›' up in its section head … it spends the head's right slot, which
 * per the SectionHead standard is for the section's META". The arrow also put
 * the door at the top-left of a rail you read left-to-right, so the way in was
 * behind you by the time you had run out of cards. The Nutrition HUB's own
 * recipes rail has ended in a `RailTail` since it shipped, so the library
 * screen and the hub disagreed about the same object.
 *
 * Now: the head is the shared `ASection` — title, and the count as meta, saying
 * how long the shelf is so a two-card peek is never mistaken for the whole of
 * it — and the way in is the chromeless tail at the END of the scroller, where
 * the thumb already is.
 */
export function RecipeShelf({ shelf, openCollection, openRecipe, onLayout, savedIds = [] }: {
  shelf: { key: RecipeCollection; recipes: Recipe[] };
  openCollection: (key: RecipeCollection) => void;
  openRecipe: (r: Recipe) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  /** Which of these the athlete has kept — the tile marks them. The SAVED
   *  shelf itself passes nothing: there, the shelf is the statement. */
  savedIds?: string[];
}) {
  const { t } = useLang();
  const n = shelf.recipes.length;
  return (
    <View onLayout={onLayout} style={{ marginTop: 20 }}>
      <ASection
        title={collectionTitle(shelf.key, t)}
        meta={`${n} ${n === 1 ? t("w.recovery.nutrition.recipeCount") : t("w.recovery.nutrition.recipesCount")}`}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The snap grid the app's other rails run on. It is why the tail takes
        // the tile's own width: an odd-width final child puts the content end
        // off the grid and leaves the exit half-cut at the last snap.
        snapToInterval={TILE_W + 12}
        decelerationRate="fast"
        style={{ marginHorizontal: -COVER_GUTTER }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: COVER_GUTTER }}
      >
        {shelf.recipes.map((r) => <RecipeTile key={r.id} recipe={r} onOpen={() => openRecipe(r)} saved={savedIds.includes(r.id)} />)}
        <RailTail
          onOpen={() => openCollection(shelf.key)}
          a11y={`${t("w.explore.seeAll")} – ${collectionTitle(shelf.key, t)}`}
          w={TILE_W}
          minHeight={TILE_H}
        />
      </ScrollView>
    </View>
  );
}

/** THE SAVED SHELF — the library dishes the athlete kept, above the curated
 *  collections and below their own recipes, in that order: what you wrote,
 *  what you kept, then what we wrote.
 *
 *  It is the same full-bleed shelf of the same tiles as a collection — the head
 *  is the shared ASection rather than a second head anatomy, and it carries NO
 *  arrow, because there is no "all saved" screen to go to: the shelf already
 *  holds every one. */
export function SavedRecipeShelf({ recipes, openRecipe }: { recipes: Recipe[]; openRecipe: (r: Recipe) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (recipes.length === 0) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <ASection title={t("w.recovery.nutrition.savedRecipesHead")} meta={String(recipes.length)} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: space.ms }}>
        {t("w.recovery.nutrition.savedRecipesSub")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TILE_W + 12}
        decelerationRate="fast"
        style={{ marginHorizontal: -COVER_GUTTER }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: COVER_GUTTER }}
      >
        {recipes.map((r) => <RecipeTile key={r.id} recipe={r} onOpen={() => openRecipe(r)} />)}
      </ScrollView>
    </View>
  );
}

/** A recipe as a COVER, not a card — the tile the Plans shelves carry, so
 *  tapping one expands it into the same poster at screen scale. The dish emoji
 *  stays FULL COLOUR (a ghosted emoji is a grey smudge, not a dish), which is
 *  the one thing separating a recipe tile from a goal tile.
 *
 *  IT STATES PROTEIN, and that is new. The tile carried time and energy while
 *  the rail above it offered HIGH PROTEIN as one of four shelves — the library
 *  could sort by a figure it never showed you, on the axis this app is actually
 *  about. The two figures sit in a ROW with a gap rather than joined by a
 *  separator: real layout, per the house rule, and no middot. A dish that
 *  clears the bar (core's isHighProtein) prints its protein in the accent, the
 *  same signal the collection card already uses, so the shelf's membership is
 *  legible from the shelf. */
export function RecipeTile({ recipe, onOpen, width = TILE_W, saved = false }: { recipe: Recipe; onOpen: () => void; width?: number; saved?: boolean }) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const tile = recipeTileView(recipe, {
    mins: (n) => `${n} ${t("w.recovery.nutrition.min")}`,
    kcal: (n) => `${n} kcal`,
    protein: (n) => `${n} g`,
  });
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${tile.title} – ${tile.meta}, ${tile.protein} ${t("w.recovery.nutrition.protein")}`}
      style={{ width, height: TILE_H, borderRadius: RADIUS.card, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: TILE_INK, padding: 12, justifyContent: "space-between" }}
    >
      {/* alpha-over-ink stops matching web's color-mix wash (52% → 0x85,
          15% @ 46% → 0x26, then ink) — web parity: nutrition.tsx RecipeTile */}
      <LinearGradient pointerEvents="none" colors={[withAlpha(tile.accent, 0.52), withAlpha(tile.accent, 0.15), withAlpha(tile.accent, 0.0)]} locations={[0, 0.46, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={{ position: "absolute", top: -4, right: -6 }}><Mark mark={tile.mark} size={78} color={withAlpha(tile.accent, ALPHA.rim)} /></View>
      <LinearGradient pointerEvents="none" colors={[withAlpha(TILE_INK, 0), withAlpha(TILE_INK, 0.66), TILE_INK]} locations={[0.34, 0.78, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* KEPT — the one thing a shelf of tiles could not say. Saving shipped
            before the tile knew about it, so a dish you had kept looked exactly
            like one you had not, on the very screen that lists both. */}
        {saved ? <Mark mark={{ kind: "glyph", name: "bookmark" }} size={fs.body} color="rgba(255,255,255,0.85)" /> : <View />}
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: "rgba(255,255,255,0.85)" }}>{tile.count}</Text>
      </View>
      <View>
        <Text numberOfLines={2} style={{ fontFamily: F.black, fontSize: fs.subtitle, lineHeight: leading(16, "tight"), letterSpacing: tracking(fs.subtitle), color: "#fff" }}>{tile.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 5 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: "rgba(255,255,255,0.7)" }}>{tile.meta}</Text>
          <Text style={{ fontFamily: tile.highProtein ? F.monoBold : F.mono, fontSize: fs.nano, color: tile.highProtein ? txt(C, C.lime) : "rgba(255,255,255,0.7)" }}>
            {tile.protein}
          </Text>
        </View>
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
      <LinearGradient pointerEvents="none" colors={[withAlpha(cook.accent, 0.52), withAlpha(cook.accent, 0.15), withAlpha(cook.accent, 0.0)]} locations={[0, 0.46, 1]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.95 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={{ position: "absolute", top: -16, right: -10 }}><Mark mark={cook.mark} size={118} color={withAlpha(cook.accent, ALPHA.rim)} /></View>
      <LinearGradient pointerEvents="none" colors={[withAlpha(TILE_INK, 0), withAlpha(TILE_INK, 0.55), TILE_INK]} locations={[0.38, 0.8, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", top: 10, left: 10, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <HeroNav onPress={onBack} fromLabel={cook.title} material="glass" />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>{cook.count}</Text>
      </View>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: 14 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: C.onAccent }}>{cook.chip}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontFamily: F.takeover, fontSize: fs.display, lineHeight: leading(fs.display, "tight"), letterSpacing: tracking(fs.display), color: "#fff", marginTop: 6 }}>{cook.title}</Text>
      </View>
      {/* One tick per step — the method's length, stated by the plate itself.
          NOT the kit's `AStepRail`, and this is the one rail that genuinely
          differs: it is drawn OVER A PHOTOGRAPH, where the rail's `line` track
          (a near-black hairline) would vanish. Its unfilled tick is chalk at a
          tint-scale alpha instead of the raw rgba it carried. */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 2 }}>
        {Array.from({ length: cook.steps }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 3, backgroundColor: i <= cook.index ? C.lime : withAlpha(C.chalk, ALPHA.solid) }} />
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: C.ash }}>{t(`w.recovery.nutrition.meal.${recipe.meal}`)}</Text>
          {isHighProtein(recipe) && (
            <View style={{ backgroundColor: withAlpha(C.lime, ALPHA.fill), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.recipeFilter.highProtein")}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
          <Mark mark={recipe.mark} size={fs.display} color={C.ash} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{recipe.name}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 12, marginBottom: 10 }}>
          {stats.map((st) => (
            <View key={st.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, ALPHA.solid), paddingTop: 8 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.headline, lineHeight: leading(fs.headline, "tight"), letterSpacing: tracking(fs.headline), color: C.chalk, fontVariant: ["tabular-nums"] }}>
                {st.value}
                {!!st.unit && <Text style={{ fontSize: fs.caption, color: C.ash }}>{st.unit}</Text>}
              </Text>
              <Text style={{ ...ty(C, "kicker"), marginTop: 4  }}>{st.label}</Text>
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
