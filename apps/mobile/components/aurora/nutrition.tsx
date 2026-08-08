import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect, Circle, SvgXml } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HERO,
  HERO_INLINE_TITLE,
  todayNutrition,
  adaptiveTargets,
  fuelToday,
  estimateMaintenance,
  dailyNutrition,
  weightTrend,
  isFullAccess,
  canUseRecipes,
  MEAL_PRESETS,
  FREE_MEAL_LIMIT,
  FREE_PRODUCT_LIMIT,
  nutritionSummary,
  nutritionNudge,
  trainingEnergyOnDay,
  localDayKey,
  localTodayKey,
  NUTRITION_GLYPHS,
  sumMealComponents, recipeToMeal,
  nutritionHubSeries,
  RECIPES, formatIngredient, recipeById, recipeCoverView,
  recipeShelves, recipesInCollection, recipeLibraryCoverView, recipeCollectionCoverView, recipeTileView, recipeCardStats,
  resolveMealParts, mealPartKey, DEFAULT_MEAL_PART_KEYS, MAX_CUSTOM_MEAL_PARTS,
  type NutritionMealPart, type MealPartDef,
  type NutritionGoal,
  type MealPreset,
  type WeightPoint,
  type NutritionNudge,
  type NutritionSummary,
  type NutritionGlyphName,
  type FoodHit,
  type MicroFacts, type NutritionFacts, type VerifiedStamp,
  nutritionPanel, per100g, scaleFacts, emptyNutritionDay, panelStatus,
  VERIFIED_SOURCES, verifiedFoodsBySource as vfBySource,
  verifiedSource, verifiedFood, verifiedFoodToHit, verifiedFoodsBySource, relatedVerifiedFoods,
  sourceCheckedOn, kj, verifiedFreshness, type SourceMark, 
  type Recipe, type RecipeCollection,
} from "@hybrid/core";
import {
  logBodyweight, getAssignedDiet, scanNutritionLabel,
  fetchSavedMeals, createSavedMeal, deleteSavedMeal,
  fetchFoodProducts, createFoodProduct, deleteFoodProduct, searchFoods,
  getNutritionPrefs, saveNutritionPrefs as apiSaveNutritionPrefs,
  fetchFoodLogs, createFoodLog, updateFoodLogQty, scaleFoodLog, deleteFoodLog,
  type SavedMealRow, type FoodProductRow, type FoodLogRow,
} from "../../lib/api";
import { useSignalsQuery, useSessionsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { usePersona } from "../../lib/persona";
import { useTheme, txt } from "../../lib/theme";
import { CtaLabel } from "./cta-label";
import RailTail from "./rail-tail";
import { usePremiumAccent } from "../../lib/premium-accent";
import { leading, fs, space, F, serifIf, PressScale, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraScreen, ACard, AField, APill, AHeading, GUTTER, RADIUS, Ring, withAlpha, ASection } from "./kit";
import { HeroNav } from "./hero";
import { CoverScreen, type CoverScreenApi } from "../plan-hero";
import FetchError from "./fetch-error";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";
import { useConfirm } from "./confirm";
import { NutritionHubBento } from "./nutrition-hub";

const GOALS: { id: NutritionGoal; labelKey: string }[] = [
  { id: "lose", labelKey: "w.recovery.nutrition.goalLose" },
  { id: "maintain", labelKey: "w.recovery.nutrition.goalMaintain" },
  { id: "gain", labelKey: "w.recovery.nutrition.goalGain" },
];

// One monoline icon voice for the whole Nutrition surface (no emoji) — the shared
// 72×72 stroke paths as true vectors, at the same weight as AuroraSvgIcon so they
// sit beside the app's kit icons as one family.
function Glyph({ name, size = 22, color = "#fff", strokeWidth = 6 }: { name: NutritionGlyphName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {NUTRITION_GLYPHS[name].map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
// Meal presets read as times of day — the one place a glyph carries meaning.
const presetGlyph = (id: string): NutritionGlyphName => id.startsWith("breakfast") ? "sunrise" : id.startsWith("lunch") ? "sun" : id.startsWith("dinner") ? "moon" : "cup";
// kcal implied by protein/carbs/fat (4·4·9) — the live readout in the builders.
const macroKcal = (protein: string, carbs: string, fat: string) => Math.round((parseFloat(protein) || 0) * 4 + (parseFloat(carbs) || 0) * 4 + (parseFloat(fat) || 0) * 9);

// The Nutrition subpage is a HUB: a focused landing (view "home") + sub-screens
// reached from a menu, plus the redesigned add-to-meal / create-food / recipes
// flows. "add" is the meal-food picker, "create" the Create Food form, and
// recipes → recipe → cook is the read-only recipes library.
type NutView = "home" | "log" | "insights" | "diary" | "body" | "meals" | "foods" | "add" | "create" | "recipes" | "collection" | "recipe" | "cook" | "food" | "source" | "sources";
// The part of the day a log is attributed to, carried into the Signal `source`.
// The four built-ins plus any custom parts a Full user added — a plain key
// string, not a closed union.
type MealType = string;
const MEAL_TYPES = DEFAULT_MEAL_PART_KEYS;
// Over-target: the calorie ring and its number flip red past the SAME 5% grace
// band (web parity — one threshold, both surfaces).
const KCAL_OVER_THRESHOLD = 1.05;
const mealGlyph = (m: string): NutritionGlyphName => m === "breakfast" ? "sunrise" : m === "lunch" ? "sun" : m === "dinner" ? "moon" : m === "snack" ? "cup" : "bowl";
const UNIT_OPTIONS = ["gram", "ml", "oz", "piece", "serving"];
// A locally-persisted food the picker can re-log (Recent MRU + Favorites) — the
// same macro shape the portion editor writes, kept per-device so the two tabs
// work without a backend change.
type QuickFood = { key: string; name: string; subname?: string | null; serving: string; kcal: number; protein: number; carbs: number; fat: number } & MicroFacts & { verified?: VerifiedStamp; verifiedId?: string | null; servingGrams?: number | null };

// Small stroke icons for the redesigned flows (close, chevron, barcode, trash,
// restart, star, bolt, plus-box) — inline react-native-svg so the mockup chrome
// renders exactly, at the same monoline weight as the rest of the surface.
type IconProps = { size?: number; color?: string; strokeWidth?: number; fill?: boolean };
function SvgIcon({ size = 20, color = "#fff", strokeWidth = 2, d, fill = false }: IconProps & { d: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}><Path d={d} stroke={fill ? "none" : color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
const IClose = (p: IconProps) => <SvgIcon {...p} d="M6 6l12 12M18 6L6 18" strokeWidth={p.strokeWidth ?? 2.2} />;
const IChevDown = (p: IconProps) => <SvgIcon {...p} d="M6 9l6 6 6-6" strokeWidth={p.strokeWidth ?? 2.4} />;
const IChevRight = (p: IconProps) => <SvgIcon {...p} d="M9 6l6 6-6 6" strokeWidth={p.strokeWidth ?? 2.2} />;
const IPlus = (p: IconProps) => <SvgIcon {...p} d="M12 6v12M6 12h12" strokeWidth={p.strokeWidth ?? 2.2} />;
const IBarcode = (p: IconProps) => <SvgIcon {...p} d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16M6.5 12h11" strokeWidth={p.strokeWidth ?? 1.9} />;
const ITrash = (p: IconProps) => <SvgIcon {...p} d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" strokeWidth={p.strokeWidth ?? 1.9} />;
const IBolt = (p: IconProps) => <SvgIcon {...p} d="M13 2L4 14h7l-1 8 9-12h-7z" strokeWidth={p.strokeWidth ?? 2} />;
function IStar({ size = 20, color = "#fff", strokeWidth = 1.8, fill = false }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}><Path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function IClock({ size = 20, color = "#fff", strokeWidth = 2 }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx="12" cy="13" r="8" stroke={color} strokeWidth={strokeWidth} /><Path d="M12 9v4l2.5 2.5M9 2h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function IPlusBox({ size = 20, color = "#fff", strokeWidth = 2 }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth={strokeWidth} /><Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /></Svg>;
}

// Recipe hero — no photo assets, so a warm accent-tinted gradient over a dark
// base carries the card + detail hero, with the dish emoji on top (mirrors the
// web recipeHeroBg). Fixed dark base so it reads as a photo stand-in in either
// theme, with the brand accent (amber/blue/red/lime) glowing through low-alpha.
function RecipeHero({ tint, emoji, height, fontSize, style, children }: { tint: string; emoji: string; height: number; fontSize: number; style?: object; children?: ReactNode }) {
  const { palette: C } = useTheme();
  const accent = tint === "blue" ? C.blue : tint === "red" ? C.red : tint === "lime" ? C.lime : C.amber;
  return (
    <View style={[{ height, alignItems: "center", justifyContent: "center", backgroundColor: "#181a12", overflow: "hidden" }, style]}>
      <LinearGradient pointerEvents="none" colors={[`${accent}5c`, `${accent}12`, "transparent"]} start={{ x: 0.45, y: 0.35 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize }}>{emoji}</Text>
      {children}
    </View>
  );
}

// ── THE RECIPES LIBRARY — the Plans tab, on food ────────────────────────────
//
// Three levels, one object at three compressions, exactly as Plans does it:
// the library root (a soft cover + shelves of covers), a collection (its own
// cover + the recipes as cards), and the recipe itself. Web parity:
// apps/web/components/aurora/nutrition.tsx.

/** A collection's display name — the meals borrow the meal-part vocabulary the
 *  rest of nutrition uses, the cross-cut borrows the filter chip's. */
function collectionTitle(key: RecipeCollection, t: (k: string) => string): string {
  return key === "highProtein" ? t("w.recovery.nutrition.recipeFilter.highProtein") : t(`w.recovery.nutrition.meal.${key}`);
}

/** CoverScreen pads its children by 16 (not the screen GUTTER), so THIS is the
 *  number a rail inside it has to cancel to reach the true screen edge. */
const COVER_PAD = 16;
/** One recipe tile — cover ink in both themes, like the covers they expand into. */
const TILE_INK = "#0c0d0c";
const TILE_W = 172;
const TILE_H = 140;

/** The collection chips, riding the scaffold's `rail` slot so they dock beneath
 *  the collapsed bar and stay reachable at any scroll position. They JUMP, they
 *  don't filter — the shelves already ARE the collections, so narrowing to one
 *  would just empty the screen. */
function CollectionRail({ keys, onJump }: { keys: RecipeCollection[]; onJump: (key: RecipeCollection) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <ScrollView
      horizontal
      accessibilityLabel={t("w.recovery.nutrition.jumpToCollection")}
      showsHorizontalScrollIndicator={false}
      // The rail slot spans the full width and adds no padding of its own, so
      // this padding IS the screen gutter (aurora/plans.tsx CategoryRail).
      contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 8 }}
    >
      {keys.map((k) => (
        <Pressable
          key={k}
          onPress={() => onJump(k)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => ({ backgroundColor: pressed ? withAlpha(C.chalk, 0.1) : "transparent", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 })}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{collectionTitle(k, t)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** One collection = one full-bleed shelf. The head is the way IN to the
 *  collection's own screen, and it states the COUNT so a two-card peek is never
 *  mistaken for the whole shelf. */
function RecipeShelf({ shelf, openCollection, openRecipe, onLayout }: {
  shelf: { key: RecipeCollection; recipes: Recipe[] };
  openCollection: (key: RecipeCollection) => void;
  openRecipe: (r: Recipe) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const n = shelf.recipes.length;
  return (
    <View onLayout={onLayout} style={{ marginTop: 20 }}>
      <Pressable
        onPress={() => openCollection(shelf.key)}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 10, marginHorizontal: 2 }}
      >
        <Text accessibilityRole="header" style={{ fontFamily: serifIf(scheme, F.black), fontSize: 18, color: C.chalk }}>{collectionTitle(shelf.key, t)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
          {n} {n === 1 ? t("w.recovery.nutrition.recipeCount") : t("w.recovery.nutrition.recipesCount")} →
        </Text>
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -COVER_PAD }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: COVER_PAD }}
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
function RecipeTile({ recipe, onOpen, width = TILE_W }: { recipe: Recipe; onOpen: () => void; width?: number }) {
  const { scheme } = useTheme();
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
      <Text style={{ alignSelf: "flex-end", fontFamily: F.mono, fontSize: fs.nano, fontWeight: "600", letterSpacing: 0.9, color: "rgba(255,255,255,0.85)" }}>{tile.count}</Text>
      <View>
        <Text numberOfLines={2} style={{ fontFamily: serifIf(scheme, F.black), fontSize: 16, lineHeight: 18, letterSpacing: -0.5, color: "#fff" }}>{tile.title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: "rgba(255,255,255,0.7)", marginTop: 5 }}>{tile.meta}</Text>
      </View>
    </Pressable>
  );
}

/** A recipe on the COLLECTION screen — the plan card's anatomy: an eyebrow, the
 *  dish, its three differentiating numbers as a rule-topped hem, and the note. */
function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t(`w.recovery.nutrition.meal.${recipe.meal}`)}</Text>
          {recipe.highProtein && (
            <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.recipeFilter.highProtein")}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
          <Text style={{ fontSize: 24, lineHeight: 28 }}>{recipe.emoji}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, flexShrink: 1 }}>{recipe.name}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 12, marginBottom: 10 }}>
          {stats.map((st) => (
            <View key={st.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, 0.14), paddingTop: 8 }}>
              <Text style={{ fontFamily: F.black, fontSize: 20, lineHeight: 21, letterSpacing: -0.5, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                {st.value}
                {!!st.unit && <Text style={{ fontSize: 12, color: C.ash }}>{st.unit}</Text>}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 4 }}>{st.label}</Text>
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
const BLANK_CREATE_FORM = {
  name: "", subname: "", serving: "", unit: "gram",
  kcal: "", carbs: "", protein: "", fat: "",
  satFat: "", sugar: "", fiber: "", salt: "",
};

// The HYBRID Verified mark — the same quiet lime tick the verified-coach badge
// uses, so "checked by us" reads identically wherever it appears in the app.
function VerifiedMark({ C, size = 13 }: { C: ReturnType<typeof useTheme>["palette"]; size?: number }) {
  const { t } = useLang();
  return (
    <Text accessibilityLabel={t("w.recovery.nutrition.verified")} style={{ fontFamily: F.mono, fontSize: size, lineHeight: size + 2, color: txt(C, C.lime) }}>✓</Text>
  );
}

// The operator's mark, or — when we hold no artwork for them — their name set
// in OUR display face inside a hairline chip. The fallback is deliberately
// typographic: visibly ours, so it can never be taken for an approximation of
// somebody's logo. One renderer for the product page and the provenance card.
function SourceMarkView({ C, src, height }: {
  C: ReturnType<typeof useTheme>["palette"]; src: { name: string; mark?: SourceMark }; height: number;
}) {
  if (!src.mark) {
    return (
      <Text style={{ fontFamily: F.black, fontSize: Math.round(height * 0.48), letterSpacing: 0.9, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8 }}>
        {src.name}
      </Text>
    );
  }
  return <SvgXml xml={src.mark.svg} height={height} width={Math.min(168, height * src.mark.aspect)} accessibilityLabel={src.mark.alt} />;
}

/**
 * MARK PLATE — the operator's own logo on a card, given a field to sit on.
 *
 * A logo dropped straight onto the app's charcoal is at the mercy of whatever
 * the artwork assumes: MAX's wordmark is one evenodd path whose keylines are
 * true HOLES, so on ink they fill with ink and the letterforms close up. Real
 * brand sheets solve this the same way we do here — give the mark a neutral
 * plate and let it own that rectangle. The plate is a hairlined tile a touch
 * lighter than the card, deliberately NOT white: a white slab in a dark UI
 * reads as a broken image, and on the Kyoto Hour washi it would read as a
 * sticker. Parity with web aurora/nutrition.tsx MarkPlate.
 */
function MarkPlate({ C, src, height = 34, full }: {
  C: ReturnType<typeof useTheme>["palette"]; src: { name: string; mark?: SourceMark }; height?: number; full?: boolean;
}) {
  return (
    <View
      style={{
        alignSelf: full ? "stretch" : "flex-start",
        height: height + 22,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: withAlpha(C.chalk, 0.07),
        borderWidth: 1,
        borderColor: C.line,
        overflow: "hidden",
      }}
    >
      <SourceMarkView C={C} src={src} height={height} />
    </View>
  );
}

// The nutrition-facts panel — rendered from the SAME core function the web
// screen uses (nutritionPanel), so the two clients can never disagree about
// what a food says. A field the food never stated shows an em dash, NEVER
// "0 g": an unstated sugar content is not a sugar-free food.
function FactsPanel({ C, facts, per100, scale = 1 }: {
  C: ReturnType<typeof useTheme>["palette"]; facts: NutritionFacts; per100?: NutritionFacts | null; scale?: number;
}) {
  const { t } = useLang();
  // Scale through CORE, never by hand: scaleFacts is the one place that knows a
  // scaled unknown stays unknown, and a second copy of that rule here would be
  // free to drift from the one the log actually writes.
  const rows = nutritionPanel(scale === 1 ? facts : scaleFacts(facts, scale));
  const p100 = per100 ? nutritionPanel(per100) : null;
  return (
    <View style={{ marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.facts.title")}</Text>
        {p100 ? <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.facts.per100")}</Text> : null}
      </View>
      {rows.map((r, i) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: r.sub ? F.reg : F.bold, fontSize: r.sub ? fs.caption : fs.body, color: r.sub ? C.ash : C.chalk, paddingLeft: r.sub ? 14 : 0 }}>{t(r.labelKey)}</Text>
          {r.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{r.note}</Text> : null}
          <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: r.sub ? fs.caption : fs.body, color: r.value ? C.chalk : C.ash, minWidth: 64, textAlign: "right" }}>{r.value ?? "—"}</Text>
          {p100 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, minWidth: 62, textAlign: "right" }}>{p100[i]!.value ?? "—"}</Text> : null}
        </View>
      ))}
      {rows.some((r) => !r.value) ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, paddingTop: 8, lineHeight: leading(fs.nano) }}>{t("w.recovery.nutrition.facts.notStatedNote")}</Text>
      ) : null}
    </View>
  );
}

function FoodRow({ C, name, subname, meta, onAdd, onOpen, chevron, starred, onStar, onDelete, verified }: {
  C: ReturnType<typeof useTheme>["palette"]; name: string; subname?: string | null; meta: string; onAdd: () => void;
  /** tapping the row BODY, when that means something different from the ⊕ —
   *  a verified item opens its page; everything else just adds. */
  onOpen?: () => void;
  chevron?: boolean; starred?: boolean; onStar?: () => void; onDelete?: () => void; verified?: VerifiedStamp;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${name}`} style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
      <Pressable onPress={onOpen ?? onAdd} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{name}</Text>
          {verified ? <VerifiedMark C={C} /> : null}
          {subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }}>{subname}</Text> : null}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{meta}</Text>
      </Pressable>
      {onStar ? <Pressable onPress={onStar} accessibilityLabel="Favorite" hitSlop={8} style={{ padding: 4 }}><IStar size={19} color={starred ? C.gold : C.ash} fill={!!starred} /></Pressable> : null}
      {onDelete ? <Pressable onPress={onDelete} accessibilityLabel="Delete" hitSlop={8} style={{ padding: 4 }}><ITrash size={20} color={C.ash} /></Pressable> : null}
      {chevron ? <IChevRight size={18} color={C.ash} /> : null}
    </View>
  );
}

/** AURORA Nutrition (mobile) — the adaptive macro tracker on one restrained
 *  system, in parity with the web screen: the calorie tick-ring is the hero,
 *  macros read as hairline lines, iconography is one monoline voice, and colour
 *  appears only where it means something. Same engine + Signal logging + personal
 *  library. `compact` renders the focused Today "Add a meal" sheet. */
export default function AuroraNutrition({ compact = false, root = false, onNavigateFull, onUpgrade, openFood, openSource }: {
  compact?: boolean;
  /** Rendered as a BOTTOM-NAV tab root (app/(tabs)/nutrition.tsx) rather than a
   *  pushed screen: there is nothing beneath it in the stack, so the masthead
   *  drops its back button — a back arrow on a tab root is a dead control. */
  root?: boolean;
  onNavigateFull?: () => void;
  onUpgrade?: () => void;
  /** land directly on a verified product page — the deep-link entry (app/food/[id]) */
  openFood?: string;
  /** land directly on a verified source page (app/source/[id]) */
  openSource?: string;
} = {}) {
  const { notify } = useConfirm();
  const { palette: C, scheme } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const router = useRouter();
  // Free (casual) users log macros manually; scanning a label and saving
  // meals/products is a Full feature (see canScanFoodLabel / canSaveMealsAndProducts).
  const persona = usePersona();
  const full = isFullAccess(persona);
  // Recipes (browse / cook-along / build a meal from a recipe) are Full-only.
  const recipesUnlocked = canUseRecipes(persona);
  // Card widths for the two bottom-of-screen rails, so the next card always
  // peeks in from the right (the exercise-widget rail's proportions).
  const { width: winW } = useWindowDimensions();
  const recipeCardW = Math.min(196, Math.round(winW * 0.52));
  const sourceCardW = Math.min(268, Math.round(winW * 0.72));
  const { data: signals = [], isFetching: refreshing, refetch, isError: signalsError } = useSignalsQuery();
  const revalidate = useRevalidate();
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  // The goal is changed through a deliberate Sheet (opened from a card), never a
  // live top-of-screen toggle — switching it recomputes every target.
  const [goalPicker, setGoalPicker] = useState(false);
  const [view, setView] = useState<NutView>("home");
  // The meal the picker is adding to (drives the log `source` + the picker head).
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [mealPicker, setMealPicker] = useState(false); // the "Dinner ▾" chooser
  // The picker sources: Recent / Favorites (per-device MRU) and the two personal
  // libraries — full MEALS and single PRODUCTS — so any part of the day can be
  // filled with either a saved meal or a product.
  const [foodTab, setFoodTab] = useState<"recent" | "favorites" | "meals" | "personal">("personal");
  const [quickLog, setQuickLog] = useState(false); // the Quick Log sheet
  // Create form (blend: title plate + macro hero) — one form for a PRODUCT or a
  // MEAL. Name + the personal Subname on the plate; serving + unit (products
  // only) compose the stored servingLabel, e.g. 100 + "gram" → "100 gram".
  const [createMode, setCreateMode] = useState<"product" | "meal">("product");
  const [createForm, setCreateForm] = useState(BLANK_CREATE_FORM);
  // The label panel is OPTIONAL and folded away by default — most foods a user
  // types in have only the four macros (parity with web).
  const [showPanelFields, setShowPanelFields] = useState(false);
  const [unitPicker, setUnitPicker] = useState(false);
  // A meal can be composed FROM saved products: each component is a product with
  // a serving count; the meal's macros are the summed total (sumMealComponents).
  // Empty → the create-meal form falls back to manual macro entry.
  type MealComp = { productId: string; name: string; subname?: string | null; kcal: number; protein: number; carbs: number; fat: number; qty: number };
  const [mealComps, setMealComps] = useState<MealComp[]>([]);
  const [compPicker, setCompPicker] = useState(false); // the "Add product" sheet
  const [compQuery, setCompQuery] = useState("");
  const openCreate = (mode: "product" | "meal") => { setCreateMode(mode); setMealComps([]); setCreateForm(BLANK_CREATE_FORM); setView("create"); };
  // Add a saved product to the meal being composed (or bump its serving count if
  // already added); remove / re-count keep the summed macros in sync.
  const addMealComp = (p: FoodProductRow) => setMealComps((xs) => {
    const i = xs.findIndex((x) => x.productId === p.id);
    if (i >= 0) { const next = [...xs]; next[i] = { ...next[i]!, qty: next[i]!.qty + 1 }; return next; }
    return [...xs, { productId: p.id, name: p.name, subname: p.subname, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, qty: 1 }];
  });
  const setCompQty = (productId: string, qty: number) => setMealComps((xs) => xs.map((x) => x.productId === productId ? { ...x, qty: Math.max(1, qty) } : x));
  const removeMealComp = (productId: string) => setMealComps((xs) => xs.filter((x) => x.productId !== productId));
  const compTotals = useMemo(() => sumMealComponents(mealComps.map((c) => ({ kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, qty: c.qty }))), [mealComps]);
  // Recipes library (read-only) — the open recipe, its serving count, cook step.
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeServes, setRecipeServes] = useState(2);
  const [cookStep, setCookStep] = useState(0);
  // The library is three levels deep, exactly like Plans: root → collection →
  // recipe. `recipeFrom` remembers which of the two a recipe was opened from,
  // so its back button returns where you came from rather than always to the
  // root (the hub's rail opens one straight from home).
  const [collection, setCollection] = useState<RecipeCollection | null>(null);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeFrom, setRecipeFrom] = useState<"recipes" | "collection">("recipes");
  const recipeScroll = useRef<CoverScreenApi | null>(null);
  const shelfTops = useRef<Record<string, number>>({});
  const recipe = recipeId ? recipeById(recipeId) : undefined;
  const openRecipe = (r: Recipe, from: "recipes" | "collection" = "recipes") => { setRecipeFrom(from); setRecipeId(r.id); setRecipeServes(r.baseServes); setCookStep(0); setRecipeMsg(""); setView("recipe"); };
  const openCollection = (key: RecipeCollection) => { setCollection(key); setView("collection"); };
  const openAdd = (m: MealType) => { setMealType(m); setView("add"); };
  // Recent (MRU) + Favorites — persisted per-device (AsyncStorage) so the
  // picker's tabs work without a backend. Recent is written on every log;
  // Favorites toggles a star. Loaded once on mount, written on change.
  const [recent, setRecent] = useState<QuickFood[]>([]);
  const [favorites, setFavorites] = useState<QuickFood[]>([]);
  useEffect(() => {
    AsyncStorage.getItem("hybrid.nutrition.recent").then((r) => { if (r) try { setRecent(JSON.parse(r) as QuickFood[]); } catch { /* corrupt */ } }).catch(() => {});
    AsyncStorage.getItem("hybrid.nutrition.favorites").then((r) => { if (r) try { setFavorites(JSON.parse(r) as QuickFood[]); } catch { /* corrupt */ } }).catch(() => {});
  }, []);
  const pushRecent = (q: QuickFood) => setRecent((xs) => { const next = [q, ...xs.filter((x) => x.key !== q.key)].slice(0, 20); AsyncStorage.setItem("hybrid.nutrition.recent", JSON.stringify(next)).catch(() => {}); return next; });
  const isFavorite = (key: string) => favorites.some((x) => x.key === key);
  const toggleFavorite = (q: QuickFood) => setFavorites((xs) => { const next = xs.some((x) => x.key === q.key) ? xs.filter((x) => x.key !== q.key) : [q, ...xs]; AsyncStorage.setItem("hybrid.nutrition.favorites", JSON.stringify(next)).catch(() => {}); return next; });
  const [weighIn, setWeighIn] = useState("");
  const goalName = (id: NutritionGoal) => t(id === "lose" ? "w.recovery.nutrition.goalLose" : id === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  const goalSub = (id: NutritionGoal) => t(id === "lose" ? "w.recovery.nutrition.goalLoseSub" : id === "gain" ? "w.recovery.nutrition.goalGainSub" : "w.recovery.nutrition.goalMaintainSub");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mealMsg, setMealMsg] = useState("");
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { getAssignedDiet().then(setCoachDiet).catch(() => {}); }, []);

  // ── Personal library — the user's OWN saved meals + custom products.
  const [meals, setMeals] = useState<SavedMealRow[]>([]);
  const [products, setProducts] = useState<FoodProductRow[]>([]);
  const [mealForm, setMealForm] = useState({ name: "", emoji: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [prodForm, setProdForm] = useState({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showProdBuilder, setShowProdBuilder] = useState(false);
  const canSaveAnotherMeal = full || meals.length < FREE_MEAL_LIMIT;
  const canSaveAnotherProduct = full || products.length < FREE_PRODUCT_LIMIT;
  const loadLibrary = () => { fetchSavedMeals().then(setMeals).catch(() => {}); fetchFoodProducts().then(setProducts).catch(() => {}); };
  useEffect(() => { loadLibrary(); }, []);
  // First-run onboarding is a separate flow (see the early return). Completion is
  // persisted SERVER-SIDE (/api/nutrition/prefs) so the wizard appears exactly
  // once and survives a device change — the old per-device flag was only set on
  // "Continue on Free", so starting the trial or just weighing in re-showed it.
  // AsyncStorage stays as a local cache; `hasNutritionData` is the safety net.
  const [onboarded, setOnboarded] = useState(false);
  const saveNutritionPrefs = useCallback((patch: { onboarded?: boolean; goal?: NutritionGoal; mealParts?: NutritionMealPart[] }) => { apiSaveNutritionPrefs(patch); }, []);
  const finishOnboarding = useCallback(() => {
    AsyncStorage.setItem("hybrid.nutrition.onboarded", "1").catch(() => {});
    setOnboarded(true);
    saveNutritionPrefs({ onboarded: true, goal });
  }, [saveNutritionPrefs, goal]);
  // Choose the goal AND remember it (server + gate). A saved preference, not a
  // per-session default.
  const chooseGoal = useCallback((g: NutritionGoal) => { setGoal(g); saveNutritionPrefs({ goal: g }); }, [saveNutritionPrefs]);
  // Custom parts of the day (Full only) — persisted in prefs so they appear on
  // every device alongside the four built-ins.
  const [customParts, setCustomParts] = useState<NutritionMealPart[]>([]);
  const [partSheet, setPartSheet] = useState(false);
  const [newPart, setNewPart] = useState("");
  const persistParts = useCallback((next: NutritionMealPart[]) => { setCustomParts(next); saveNutritionPrefs({ mealParts: next }); }, [saveNutritionPrefs]);
  const addPart = () => {
    const label = newPart.trim(); if (!label) return;
    const key = mealPartKey(label);
    if (!key || (DEFAULT_MEAL_PART_KEYS as readonly string[]).includes(key) || customParts.some((p) => p.key === key) || customParts.length >= MAX_CUSTOM_MEAL_PARTS) { setNewPart(""); return; }
    persistParts([...customParts, { key, label }]);
    setNewPart("");
  };
  const removePart = (key: string) => persistParts(customParts.filter((p) => p.key !== key));
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem("hybrid.nutrition.onboarded").then((v) => { if (alive && v === "1") setOnboarded(true); }).catch(() => {});
    getNutritionPrefs().then((p) => {
      if (!alive) return;
      if (p.goal) setGoal(p.goal);
      if (Array.isArray(p.mealParts)) setCustomParts(p.mealParts);
      if (p.onboardedAt) { setOnboarded(true); AsyncStorage.setItem("hybrid.nutrition.onboarded", "1").catch(() => {}); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // The full ordered list of parts to render — built-ins (localized) + custom
  // (Full only). Free users always see just the four.
  const partList: MealPartDef[] = useMemo(
    () => resolveMealParts(full ? customParts : [], (k) => t(`w.recovery.nutrition.meal.${k}`)),
    [full, customParts, t],
  );
  const partLabel = useCallback((key: string) => partList.find((p) => p.key === key)?.label ?? t(`w.recovery.nutrition.meal.${key}`), [partList, t]);

  const load = () => { refetch(); loadLibrary(); };
  useRefreshOnFocus(refetch);

  // ── Editable food log — the per-entry records the Diary lists + edit/delete.
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const loadLogs = useCallback(() => { fetchFoodLogs().then(setLogs).catch(() => {}); }, []);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  // Log one food/meal → creates the editable entry AND the mirrored Signals the
  // engines read (one round-trip). Per-serving macros + qty so it stays editable.
  const logEntry = async (e: { name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; verifiedId?: string | null } & MicroFacts): Promise<boolean> => {
    const { ok } = await createFoodLog(e);
    if (!ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return false; }
    return true;
  };
  const editLogQty = async (id: string, qty: number) => {
    setLogs((xs) => xs.map((x) => x.id === id ? { ...x, qty } : x)); // optimistic
    await updateFoodLogQty(id, qty);
    loadLogs(); refetch(); revalidate.recovery();
  };
  const deleteLogEntry = async (id: string) => {
    setLogs((xs) => xs.filter((x) => x.id !== id)); // optimistic
    await deleteFoodLog(id);
    loadLogs(); refetch(); revalidate.recovery();
  };
  // A DERIVED entry (Signals only, no FoodLog row) has no per-serving base, so
  // its stepper is a relative multiplier: each press rescales the stored
  // readings by the ratio between the new multiplier and the previous one. The
  // multiplier is per-visit UI state — the amounts on screen are always the
  // server's own numbers.
  const [derivedScale, setDerivedScale] = useState<Record<string, number>>({});
  const stepEntry = async (l: FoodLogRow, next: number) => {
    if (!l.derived) { await editLogQty(l.id, next); return; }
    const prev = derivedScale[l.id] ?? 1;
    if (next === prev) return;
    setDerivedScale((m) => ({ ...m, [l.id]: next }));
    await scaleFoodLog(l.id, next / prev);
    loadLogs(); refetch(); revalidate.recovery();
  };

  // ── Portion & quantity — logging any food/meal opens a sheet where a
  //    serving × quantity stepper scales the macros LIVE before they're written.
  //    One editor for an OFF search hit (offers Save too), a saved food, or a
  //    saved meal, so scaling isn't just for the database.
  const [portion, setPortion] = useState<
    ({ name: string; subname?: string | null; subtitle?: string; serving: string; kcal: number; protein: number; carbs: number; fat: number; offFood?: FoodHit; servingGrams?: number | null; verified?: VerifiedStamp; verifiedId?: string | null } & MicroFacts) | null
  >(null);
  const [qty, setQty] = useState(1);
  const openPortion = (base: NonNullable<typeof portion>) => { setQty(1); setPortion(base); };

  // ── Product pages (parity with web). A verified item gets its OWN screen and
  //    its business gets one too. The portion SHEET stays the fast path to
  //    logging: a sheet is for adding a food you already trust, a page is for
  //    deciding whether to trust it. `pageBack` remembers where we came from.
  const [foodPageId, setFoodPageId] = useState<string | null>(null);
  const [sourcePageId, setSourcePageId] = useState<string | null>(null);
  const [pageBack, setPageBack] = useState<NutView>("add");
  const openFoodPage = (id: string, from: NutView) => { setFoodPageId(id); setPageBack(from); setView("food"); };
  const openSourcePage = (id: string, from: NutView) => { setSourcePageId(id); setPageBack(from); setView("source"); };

  // DEEP LINK ENTRY. `hybrid://food/<id>` (and the https universal-link twin,
  // once the entitlement ships) lands here via app/food/[id].tsx. An id that
  // isn't in the catalog falls through to the hub rather than showing a broken
  // page — a link from an older build must never dead-end.
  useEffect(() => {
    if (openFood && verifiedFood(openFood)) { setFoodPageId(openFood); setPageBack("home"); setView("food"); }
    else if (openSource && verifiedSource(openSource)) { setSourcePageId(openSource); setPageBack("home"); setView("source"); }
  }, [openFood, openSource]);

  // Log a saved meal → opens the portion editor (default 1×), scaled by quantity.
  const logMeal = (m: SavedMealRow) => openPortion({ name: m.name, subname: m.subname, subtitle: m.subname || t("w.recovery.nutrition.savedMeal"), serving: `1 ${t("w.recovery.nutrition.serving")}`, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, satFat: m.satFat, sugar: m.sugar, fiber: m.fiber, salt: m.salt });

  // Write the scaled macros for the open portion, then close. The log is
  // attributed to the current meal (source = mealType) so the hub can group
  // today's intake by meal, and the food is remembered in the Recent MRU.
  const commitPortion = async () => {
    if (!portion) return;
    const q = qty > 0 ? qty : 1;
    setMealMsg(""); setFoodMsg("");
    if (!(await logEntry({
      name: portion.name, subname: portion.subname ?? portion.subtitle ?? null, source: mealType,
      kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
      satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
      verifiedId: portion.verifiedId ?? null, qty: q,
    }))) return;
    pushRecent({
      key: `${portion.name}|${portion.serving}`, name: portion.name, subname: portion.subname ?? null, serving: portion.serving,
      kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
      satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
      servingGrams: portion.servingGrams, verified: portion.verified, verifiedId: portion.verifiedId ?? null,
    });
    setMealMsg(`${portion.name} +${Math.round(portion.kcal * q)} kcal`);
    setPortion(null);
    load(); loadLogs(); revalidate.recovery();
  };

  // Re-log a Recent/Favorite food → opens the portion editor (default 1×).
  const logQuickFood = (q: QuickFood) => openPortion({ name: q.name, subname: q.subname, subtitle: q.subname || q.serving, serving: q.serving, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, satFat: q.satFat, sugar: q.sugar, fiber: q.fiber, salt: q.salt, servingGrams: q.servingGrams, verified: q.verified, verifiedId: q.verifiedId });
  // One-tap re-log of a Recent food at 1× to the current meal (the Today sheet's
  // fast path — no portion editor). Same signals + meal attribution as the picker.
  const relogRecent = async (q: QuickFood) => {
    setMealMsg("");
    if (!(await logEntry({ name: q.name, subname: q.subname ?? null, source: mealType, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, satFat: q.satFat, sugar: q.sugar, fiber: q.fiber, salt: q.salt, verifiedId: q.verifiedId ?? null, qty: 1 }))) return;
    pushRecent(q);
    setMealMsg(`${q.name} +${Math.round(q.kcal)} kcal`);
    load(); loadLogs(); revalidate.recovery();
  };
  // Log a product (saved food) from the picker → portion editor.
  const logProduct = (p: FoodProductRow) => openPortion({ name: p.name, subname: p.subname, subtitle: p.subname || p.servingLabel, serving: p.servingLabel || `1 ${t("w.recovery.nutrition.serving")}`, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt, servingGrams: p.servingGrams, verifiedId: p.verifiedId });

  // Save the Create form → products OR meals API (one blend form, two targets),
  // carrying the personal subname, then return to the picker Personal tab.
  const submitCreateFood = async () => {
    if (!createForm.name.trim()) return;
    const isMeal = createMode === "meal";
    if (isMeal ? !canSaveAnotherMeal : !canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const subname = createForm.subname.trim() || undefined;
    // A meal composed from products takes its macros from the summed components;
    // otherwise (a manually-typed meal, or a product) from the macro fields.
    const useComps = isMeal && mealComps.length > 0;
    const macros = useComps
      ? { kcal: compTotals.kcal || undefined, protein: compTotals.protein, carbs: compTotals.carbs, fat: compTotals.fat }
      : { kcal: num(createForm.kcal) || undefined, protein: num(createForm.protein), carbs: num(createForm.carbs), fat: num(createForm.fat) };
    const serving = createForm.serving.trim();
    // A BLANK panel field stays undefined, not 0 — leaving "sugars" empty means
    // "I don't know", and writing a zero there would invent a fact.
    const opt = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : undefined; };
    const panelFields = { satFat: opt(createForm.satFat), sugar: opt(createForm.sugar), fiber: opt(createForm.fiber), salt: opt(createForm.salt) };
    const servingGrams = createForm.unit === "gram" ? opt(serving) : undefined;
    const res = isMeal
      ? await createSavedMeal({ name: createForm.name.trim(), subname, ...macros, ...panelFields })
      : await createFoodProduct({ name: createForm.name.trim(), subname, servingLabel: serving ? `${serving} ${createForm.unit}`.trim() : undefined, servingGrams, ...macros, ...panelFields });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setCreateForm(BLANK_CREATE_FORM);
    setShowPanelFields(false);
    setMealComps([]);
    loadLibrary();
    setFoodTab("personal"); setView("add");
  };

  // Scan a nutrition label into the Create Food form (Full) — pick a photo, send
  // it to the AI vision endpoint, and prefill the fields. Free → upgrade.
  const scanIntoCreate = async () => {
    if (scanning) return;
    if (!full) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.base64) return;
    setScanning(true);
    const out = await scanNutritionLabel(asset.base64, asset.mimeType ?? "image/jpeg");
    setScanning(false);
    if (!out.ok || !out.data) { notify(t("w.recovery.nutrition.scanLabel"), t("w.recovery.nutrition.scanFailed")); return; }
    const d = out.data;
    setCreateForm((s) => ({ ...s, name: d.name ?? s.name, kcal: d.kcal != null ? String(d.kcal) : s.kcal, protein: d.protein != null ? String(d.protein) : s.protein, carbs: d.carbs != null ? String(d.carbs) : s.carbs, fat: d.fat != null ? String(d.fat) : s.fat }));
  };

  const saveMeal = async () => {
    if (!mealForm.name.trim()) return;
    if (!canSaveAnotherMeal) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const res = await createSavedMeal({ name: mealForm.name.trim(), emoji: mealForm.emoji || undefined, kcal: num(mealForm.kcal) || undefined, protein: num(mealForm.protein), carbs: num(mealForm.carbs), fat: num(mealForm.fat) });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setMealForm({ name: "", emoji: "", kcal: "", protein: "", carbs: "", fat: "" });
    setShowMealBuilder(false);
    loadLibrary();
  };

  const removeMeal = async (id: string) => { setMeals((xs) => xs.filter((x) => x.id !== id)); await deleteSavedMeal(id); };

  // "Create meal" from a recipe → save its PER-SERVE macros (recipeToMeal) into
  // the personal meal library, so a Full user can one-tap log a favourite recipe
  // as a meal. Respects the free meal cap (recipes are Full-only anyway).
  const [recipeMsg, setRecipeMsg] = useState("");
  const saveRecipeAsMeal = async (r: Recipe) => {
    if (!canSaveAnotherMeal) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    setRecipeMsg("");
    const res = await createSavedMeal(recipeToMeal(r));
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    loadLibrary();
    setRecipeMsg(t("w.recovery.nutrition.recipeSavedMeal"));
  };

  const saveProduct = async () => {
    if (!prodForm.name.trim()) return;
    if (!canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const res = await createFoodProduct({ name: prodForm.name.trim(), servingLabel: prodForm.serving.trim() || undefined, kcal: num(prodForm.kcal) || undefined, protein: num(prodForm.protein), carbs: num(prodForm.carbs), fat: num(prodForm.fat) });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setProdForm({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
    setShowProdBuilder(false);
    loadLibrary();
  };

  const removeProduct = async (id: string) => { setProducts((xs) => xs.filter((x) => x.id !== id)); await deleteFoodProduct(id); };

  const addProductToMeal = (p: FoodProductRow) => {
    setShowMealBuilder(true);
    setMealForm((s) => {
      const addv = (a: string, b: number) => String((parseFloat(a) || 0) + b);
      return { ...s, name: s.name || p.name, kcal: addv(s.kcal, p.kcal), protein: addv(s.protein, p.protein), carbs: addv(s.carbs, p.carbs), fat: addv(s.fat, p.fat) };
    });
  };

  // ── Food search — Open Food Facts (free, no key) via searchFoods → the
  //    /api/nutrition/search proxy. One box takes text OR a barcode; debounced; a
  //    hit can be logged to today or saved to the library.
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<FoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [foodMsg, setFoodMsg] = useState("");
  useEffect(() => {
    const q = foodQuery.trim();
    if (q.length < 2) { setFoodResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      const foods = await searchFoods(q);
      setFoodResults(foods);
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [foodQuery]);

  // Log a database food → opens the portion editor (serving × quantity), which
  // also offers to save it into the library.
  const logFood = (food: FoodHit) => openPortion({
    name: food.name, subtitle: food.brand ?? undefined, serving: food.serving,
    kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
    satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
    servingGrams: food.servingGrams, verified: food.verified, verifiedId: food.id ?? null,
    offFood: food,
  });

  // Save a database food into the personal library (respects the free cap).
  const saveFood = async (food: FoodHit) => {
    if (!canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    setFoodMsg("");
    const res = await createFoodProduct({
      name: food.name, subname: food.brand, servingLabel: food.serving, servingGrams: food.servingGrams ?? undefined,
      kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
      satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
      verifiedId: food.id ?? null,
    });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setFoodMsg(`${food.name} ${t("w.recovery.nutrition.savedToFoods")}`);
    loadLibrary();
  };

  // Training-aware targets — today's sessions estimate a fuel bump (carbs) added
  // to the goal target, so a hard training day earns more food (see note #4).
  const { data: sessions = [] } = useSessionsQuery();
  const bodyMassKg = useMemo(() => {
    const w = signals.filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    return w?.value;
  }, [signals]);
  const trainingKcal = useMemo(() => trainingEnergyOnDay(sessions, bodyMassKg ?? 75), [sessions, bodyMassKg]);

  const sig = signals as unknown as Parameters<typeof todayNutrition>[0];
  const today = useMemo(() => todayNutrition(sig), [signals]);
  // Today's energy grouped by meal (source = meal type) for the hub sections.
  const mealTotals = useMemo(() => {
    const todayKey = localTodayKey();
    // Keyed by the log `source` (the part of the day). Reading by a part key
    // naturally ignores non-part sources like "manual"/"off".
    const totals: Record<string, number> = {};
    for (const s of sig) {
      if (s.kind !== "energyIntake") continue;
      if (localDayKey(s.ts) !== todayKey) continue;
      totals[s.source] = (totals[s.source] ?? 0) + s.value;
    }
    return totals;
  }, [signals]);
  // Diary day scope — which day's individual entries the Diary shows (default
  // today; the recent-days list can select a past day to edit/delete its records).
  const [diaryDay, setDiaryDay] = useState<string>(() => localTodayKey());
  const dayLogs = useMemo(() => logs.filter((l) => localDayKey(l.ts) === diaryDay).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)), [logs, diaryDay]);
  // Step a whole calendar day back/forward (never past today) — a proper date
  // picker so any day can be reviewed, not only the ones in the recent list.
  const shiftDiaryDay = useCallback((delta: number) => {
    setDiaryDay((cur) => {
      const [y, m, d] = cur.split("-").map(Number);
      const nd = new Date(y!, (m! - 1), d! + delta);
      const key = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
      return key > localTodayKey() ? cur : key;
    });
  }, []);
  // The selected day's TOTALS — read from the always-on Signals (dailyNutrition),
  // so the summary + per-part breakdown work for any past day even before the
  // FoodLog table exists (the per-entry edit/delete list still needs FoodLog).
  const daySummary = useMemo(() => dailyNutrition(sig).find((d) => d.date === diaryDay) ?? emptyNutritionDay(diaryDay), [signals, diaryDay]);
  const dayPartKcal = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of signals) {
      if (s.kind !== "energyIntake" || localDayKey(s.ts) !== diaryDay) continue;
      totals[s.source] = (totals[s.source] ?? 0) + s.value;
    }
    return totals;
  }, [signals, diaryDay]);
  const diaryDayLabel = useMemo(() => {
    const [y, m, d] = diaryDay.split("-").map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }, [diaryDay]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal, trainingKcal }), [signals, goal, trainingKcal]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recentDays = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(sig), [signals]);
  const personalized = maint.kcal != null;
  // Safety net for the "onboarding shows every time" bug: anyone who has already
  // logged intake or a weigh-in has finished first-run — never re-show the wizard.
  const hasNutritionData = useMemo(() => sig.some((s) => s.kind === "energyIntake" || s.kind === "bodyMass"), [signals]);
  const [summaryWindow, setSummaryWindow] = useState<7 | 30>(30);
  const summary = useMemo(() => nutritionSummary(sig, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  // The hub bento's Diary chart: seven days of target-vs-logged. The target is
  // per-day training-aware (the same composition `targets` uses for today), so
  // today's point on the chart and the hero ring above it agree by construction.
  const hubSeries = useMemo(() => nutritionHubSeries(sig, sessions, { goal, bodyMassKg }), [signals, sessions, goal, bodyMassKg]);
  // The Insights tile shows a fixed SEVEN-day average, never the dashboard's
  // 7/30 toggle — a tile whose number silently changes with a control on
  // another screen is a tile you can't trust.
  const weekSummary = useMemo(() => nutritionSummary(sig, { targets, windowDays: 7 }), [signals, targets]);
  const nudge = useMemo(() => nutritionNudge(today, targets), [today, targets]);

  // The one number you came for is what's LEFT, and it used to exist only at
  // the top of the hub: scroll into the picker or the libraries to choose food
  // and the budget was off screen. The rail keeps it there. It reads from
  // fuelToday() — the SAME composition the hero ring draws, with the same opts
  // as `targets` above — so the capsule and the ring cannot disagree.
  const insets = useSafeAreaInsets();
  const fuel = useMemo(() => fuelToday(sig, { goal, trainingKcal }), [signals, goal, trainingKcal]);
  // ONE name for the screen's subject, read by the hero on every view. The
  // greeting rides the hero's EYEBROW on the hub, where it used to be a
  // hand-rolled mono line above a hand-rolled AHeading.
  const [greeting, setGreeting] = useState("");
  useEffect(() => { const h = new Date().getHours(); setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening")); }, [t]);
  const viewTitle =
    view === "log" ? t("w.recovery.nutrition.logMealCta")
    : view === "insights" ? t("w.recovery.nutrition.menuInsights")
    : view === "diary" ? t("w.recovery.nutrition.menuDiary")
    : view === "body" ? t("w.recovery.nutrition.menuBody")
    : view === "meals" ? t("w.recovery.nutrition.yourMeals")
    : view === "foods" ? t("w.recovery.nutrition.yourProducts")
    : t("w.recovery.nutrition.title");
  const kcalRef = useRef<TextInput>(null);
  const week = useMemo(() => {
    const logged = new Set(dailyNutrition(sig).filter((d) => d.kcal > 0).map((d) => d.date));
    const L = ["S", "M", "T", "W", "T", "F", "S"]; const now = new Date(); const out: { label: string; on: boolean }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push({ label: L[d.getDay()]!, on: logged.has(key) }); }
    return out;
  }, [signals]);
  const streakDays = useMemo(() => week.filter((d) => d.on).length, [week]);
  // A weigh-in writes to the PROFILE (/api/body); the server mirrors it into the
  // bodyMass Signal, so nutrition's maintenance + trend read the one canonical
  // bodyweight the profile owns (see note #1 — "body weight derived from profile").
  const logWeighIn = async (kg: number) => { await logBodyweight(kg); revalidate.recovery(); load(); };

  // Returns true when the whole meal landed (so the Quick Log sheet closes only
  // on success and leaves the error Alert visible otherwise).
  const add = async (): Promise<boolean> => {
    setSaving(true);
    setMealMsg("");
    // One unified entry: kcal + macros. When kcal is left blank, derive it from
    // the macros (4·4·9) so the calorie total always moves — mirrors how a preset
    // stores an explicit kcal alongside its macros.
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const protein = num(f.protein), carbs = num(f.carbs), fat = num(f.fat);
    const kcal = num(f.kcal) || protein * 4 + carbs * 4 + fat * 9;
    if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) { setSaving(false); return false; }
    // A manual macro entry is still a real, editable/deletable log entry —
    // routed through the same endpoint so it appears in the Diary.
    const ok = await logEntry({ name: t("w.recovery.nutrition.quickEntry"), source: mealType, kcal, protein, carbs, fat, qty: 1 });
    if (ok) { setF({ kcal: "", protein: "", carbs: "", fat: "" }); setMealMsg(`+${Math.round(kcal)} kcal`); }
    setSaving(false);
    load(); loadLogs(); revalidate.recovery();
    return ok;
  };

  // Premade meal → a real, editable Diary entry (routes through /api/nutrition/log
  // like every other log, so it appears in the Diary with a name + edit/delete)
  // AND the mirrored Signals the engines read. Attributed to the preset's natural
  // part of the day (its id prefix: breakfast|lunch|dinner|snack). Free users
  // can't log presets (Full-only, per access.canSaveMealsAndProducts) — a tap
  // routes to the upgrade screen instead. Manual entry above stays free.
  const logPreset = async (p: MealPreset) => {
    if (!full) { router.push("/upgrade"); return; }
    setMealMsg("");
    const part = p.id.split("-")[0] || mealType;
    const name = t(p.labelKey).split(/ [·–] /)[0] || t(p.labelKey);
    if (!(await logEntry({ name, source: part, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, qty: 1 }))) return;
    setMealMsg(`${name} +${p.kcal} kcal`);
    load(); loadLogs(); revalidate.recovery();
  };

  // Scan a nutrition label (Full) — pick a photo, send it to the AI vision
  // endpoint, and prefill the macro fields. Free users are routed to upgrade.
  const scan = async () => {
    if (scanning) return;
    if (!full) { onUpgrade?.(); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.base64) return;
    setScanning(true);
    const out = await scanNutritionLabel(asset.base64, asset.mimeType ?? "image/jpeg");
    setScanning(false);
    if (!out.ok || !out.data) { notify(t("w.recovery.nutrition.scanLabel"), t("w.recovery.nutrition.scanFailed")); return; }
    const d = out.data;
    setF({ kcal: d.kcal != null ? String(d.kcal) : "", protein: d.protein != null ? String(d.protein) : "", carbs: d.carbs != null ? String(d.carbs) : "", fat: d.fat != null ? String(d.fat) : "" });
  };

  // The Today "Nutrition" sheet — a focused Add-a-meal, not the whole tracker.
  if (compact) {
    return (
      <View>
        <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.5, color: C.chalk }}>{t("w.recovery.nutrition.addMealTitle")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4 }}>{Math.round(today.kcal)} / {targets.kcal} {t("w.recovery.nutrition.kcalToday")}</Text>

        {/* Meal selector — the quick-add is attributed to the chosen meal,
            matching the full picker so today's intake groups the same way. */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {MEAL_TYPES.map((m) => {
            const on = mealType === m;
            return (
              <Pressable key={m} onPress={() => setMealType(m)} accessibilityLabel={t(`w.recovery.nutrition.meal.${m}`)} style={{ flex: 1, alignItems: "center", gap: 5, backgroundColor: on ? C.lime : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4 }}>
                <Glyph name={mealGlyph(m)} size={18} color={on ? C.onAccent : C.ash} strokeWidth={5} />
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: on ? "700" : "500", color: on ? C.onAccent : C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Recent — one-tap re-log of a recent food to the chosen meal. */}
        {recent.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 8 }}>{t("w.recovery.nutrition.tab.recent")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {recent.slice(0, 8).map((q) => (
                <Pressable key={q.key} onPress={() => relogRecent(q)} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 8, paddingLeft: 12, paddingRight: 16 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 999, borderWidth: 1.4, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={12} color={txt(C, C.lime)} strokeWidth={2.4} /></View>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{q.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{Math.round(q.kcal)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <CDivider label={t("w.recovery.nutrition.logManuallyFree")} tier={t("w.account.settings.free")} />
        {/* Quadrant — kcal + protein + carbs + fat, one unified entry. Each macro
            wears its own colour; calories stay lime. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <QuadTile field="kcal" label={t("w.recovery.nutrition.tabCalories")} unit="kcal" color={txt(C, C.lime)} value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} />
          <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} />
          <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} />
          <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.violet)} value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} />
        </View>
        {(() => {
          const macroKcal = Math.round((parseFloat(f.protein) || 0) * 4 + (parseFloat(f.carbs) || 0) * 4 + (parseFloat(f.fat) || 0) * 9);
          return macroKcal > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 12 }}>{t("w.recovery.nutrition.macrosApprox")} {macroKcal} kcal</Text> : null;
        })()}
        {/* Add meal + Scan label — side-by-side rounded pills (Scan is AI vision, Full only → upgrade) */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable onPress={add} disabled={saving} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.addMeal")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 12, opacity: saving ? 0.6 : 1 }}>
            <AuroraIcon name="add" size={15} color={C.onAccent} />
            <Text style={{ color: C.onAccent, fontFamily: F.mono, fontSize: fs.body, fontWeight: "700" }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text>
          </Pressable>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: `${pa.fill}73`, backgroundColor: "transparent", opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color={pa.text} strokeWidth={5} />
            <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.caption, color: C.chalk }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: 11 }}>✦</Text>}
          </Pressable>
        </View>
        {mealMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{mealMsg}</Text></View> : null}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => (!full && onUpgrade ? onUpgrade() : logPreset(p))}
              accessibilityRole="button"
              accessibilityLabel={t(p.labelKey)}
              style={{ flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: full ? C.line : `${pa.fill}47`, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Glyph name={presetGlyph(p.id)} size={20} color={full ? C.ash : pa.text} strokeWidth={5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.9, marginTop: 2 }}>{p.kcal} kcal</Text>
              </View>
              {!full && <AuroraIcon name="lock" size={13} color={pa.text} />}
            </Pressable>
          ))}
        </View>

        {onNavigateFull ? (
          <Pressable onPress={onNavigateFull} style={{ marginTop: 16, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6 }} hitSlop={6}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.fullTracker")}</Text>
            <Glyph name="chevron" size={13} color={C.ash} strokeWidth={6} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Cold start (no maintenance estimate yet) → onboarding is its OWN focused
  // flow, not stacked above the tracker. A weigh-in in the wizard personalizes
  // the estimate and drops the user into the full screen below.
  if (!personalized && !onboarded && !hasNutritionData) {
    return (
      <AuroraScreen
        refreshing={refreshing}
        onRefresh={load}
        hero={{ rank: "title", title: t("w.recovery.nutrition.title") }}
        back={root ? false : undefined}
      >
        <OnboardingGoal goal={goal} setGoal={chooseGoal} onUpgrade={() => { finishOnboarding(); (onUpgrade ? onUpgrade() : router.push("/upgrade")); }} onWeighIn={(kg) => { logWeighIn(kg); finishOnboarding(); }} onContinueFree={finishOnboarding} currentWeightKg={bodyMassKg} />
      </AuroraScreen>
    );
  }

  // The portion editor — one Sheet reused by the hub, the picker and the saved
  // library. Attributed to the current meal + remembered in Recent on commit.
  // Manage custom parts of the day (Full) — shared by the hub + the picker's
  // chooser so "Add a part" works from either place.
  const renderPartSheet = () => (
    <Sheet visible={partSheet} onClose={() => { setPartSheet(false); setNewPart(""); }} title={t("w.recovery.nutrition.addPart")} sub={t("w.recovery.nutrition.addPartSub")} scroll={false}>
      <View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={newPart} onChangeText={setNewPart} maxLength={32} placeholder={t("w.recovery.nutrition.partNamePh")} placeholderTextColor={C.ash} onSubmitEditing={addPart} accessibilityLabel={t("w.recovery.nutrition.addPart")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12 }} />
          <Pressable onPress={addPart} disabled={!newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 16, justifyContent: "center", opacity: !newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS ? 0.5 : 1 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addPartCta")}</Text></Pressable>
        </View>
        {customParts.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            {customParts.map((p) => (
              <View key={p.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <Glyph name="bowl" size={18} color={C.ash} strokeWidth={5} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{p.label}</Text>
                <Pressable onPress={() => removePart(p.key)} accessibilityLabel={t("w.recovery.nutrition.removePart")} hitSlop={8} style={{ padding: 4 }}><ITrash size={18} color={C.ash} /></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 12 }}>{customParts.length}/{MAX_CUSTOM_MEAL_PARTS}</Text>
      </View>
    </Sheet>
  );

  const renderPortionSheet = () => (
    // Scrollable: the sheet now carries the full label panel under the macro
    // tiles, which is taller than a small phone's sheet on its own.
    <Sheet visible={!!portion} onClose={() => setPortion(null)} title={portion?.name} sub={portion?.subtitle}>
      {portion ? (() => {
        const q = qty > 0 ? qty : 1;
        const sc = (v: number) => Math.round(v * q);
        const step = (d: number) => setQty((x) => Math.max(0.5, Math.min(50, Math.round((x + d) * 2) / 2)));
        return (
          <View>
            {portion.verified ? (() => {
              const src = verifiedSource(portion.verified!.sourceId);
              return (
                <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: `${C.lime}4d`, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginTop: 12 }}>
                  {/* WHO PUBLISHED THE NUMBERS. The operator's mark (or, until we
                      hold artwork, their name set in OUR type — visibly ours, so
                      it can never pass as an approximation of their logo). It
                      sits under a "published by" label and above the trademark
                      line: this is attribution, not a partnership badge. */}
                  <Pressable
                    onPress={() => { const id = portion.verifiedId; setPortion(null); if (id) openFoodPage(id, view); else if (src) openSourcePage(src.id, view); }}
                    accessibilityRole="button"
                    style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                  >
                    {src ? <MarkPlate C={C} src={src} height={24} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.publishedBy")}</Text>
                      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 2 }}>{portion.verified!.sourceName}</Text>
                    </View>
                    <IChevRight size={16} color={C.ash} />
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: `${C.lime}38` }}>
                    <VerifiedMark C={C} size={14} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.verified")}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3, lineHeight: leading(fs.nano) }}>
                        {t("w.recovery.nutrition.verifiedSub").replace("{source}", portion.verified!.sourceName).replace("{date}", portion.verified!.verifiedOn)}
                      </Text>
                    </View>
                  </View>
                  {src?.trademark ? (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, lineHeight: leading(fs.nano), opacity: 0.85 }}>{src.trademark}</Text>
                  ) : null}
                </View>
              );
            })() : null}
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{t("w.recovery.nutrition.perLabel")} {portion.serving}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginTop: 16 }}>
              <Pressable onPress={() => step(-0.5)} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 24, fontWeight: "700", lineHeight: 26, color: txt(C, C.lime) }}>–</Text></Pressable>
              <View style={{ alignItems: "center" }}>
                <TextInput value={String(qty)} onChangeText={(v) => { const n = parseFloat(v); setQty(Number.isFinite(n) && n >= 0 ? n : 0); }} keyboardType="decimal-pad" accessibilityLabel={t("w.recovery.nutrition.quantity")} style={{ minWidth: 96, textAlign: "center", fontFamily: F.black, fontSize: 30, letterSpacing: -1, color: C.chalk, padding: 0 }} />
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.servings")}</Text>
              </View>
              <Pressable onPress={() => step(0.5)} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 22, fontWeight: "700", lineHeight: 24, color: txt(C, C.lime) }}>+</Text></Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <Text style={{ fontFamily: F.black, fontSize: 48, letterSpacing: -1.6, color: C.chalk }}>{sc(portion.kcal)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>kcal</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              {([["w.recovery.nutrition.protein", txt(C, C.blue), portion.protein], ["w.recovery.nutrition.carbs", txt(C, C.amber), portion.carbs], ["w.recovery.nutrition.fat", txt(C, C.violet), portion.fat]] as const).map(([lab, col, base]) => (
                <View key={lab} style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: col }}>{t(lab)}</Text>
                  <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.5, color: C.chalk, marginTop: 4 }}>{sc(base)}<Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}> g</Text></Text>
                </View>
              ))}
            </View>
            {/* The label panel — saturates, sugars, fibre, salt and the kJ figure
                the three macro tiles above can't carry. Same core function as
                the web screen, scaled by the same quantity. */}
            <FactsPanel
              C={C}
              scale={q}
              facts={{ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }}
              per100={per100g({ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }, portion.servingGrams)}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              {portion.offFood ? <Pressable onPress={() => { const ff = portion.offFood; setPortion(null); if (ff) saveFood(ff); }} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.saveToFoods")}</Text></Pressable> : null}
              <Pressable onPress={commitPortion} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.logToMeal").replace("{meal}", partLabel(mealType))}</Text></Pressable>
            </View>
          </View>
        );
      })() : null}
    </Sheet>
  );

  // Quick Log — the fast kcal + macro entry, opened from the picker.
  const renderQuickLog = () => (
    <Sheet visible={quickLog} onClose={() => setQuickLog(false)} title={t("w.recovery.nutrition.quickLog")} sub={t("w.recovery.nutrition.quickLogSub")} scroll={false}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {([
          { k: "kcal" as const, label: t("w.recovery.nutrition.calorie"), color: txt(C, C.lime), unit: "kcal" },
          { k: "protein" as const, label: t("w.recovery.nutrition.protein"), color: txt(C, C.blue), unit: "g" },
          { k: "carbs" as const, label: t("w.recovery.nutrition.carbs"), color: txt(C, C.amber), unit: "g" },
          { k: "fat" as const, label: t("w.recovery.nutrition.fat"), color: txt(C, C.violet), unit: "g" },
        ]).map((tile) => (
          <View key={tile.k} style={{ width: "47.5%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: tile.color }}>{tile.label}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 4 }}>
              <TextInput value={f[tile.k]} onChangeText={(v) => setF((s) => ({ ...s, [tile.k]: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={C.line} accessibilityLabel={tile.label} style={{ flex: 1, fontFamily: F.black, fontSize: 27, letterSpacing: -1, color: C.chalk, padding: 0 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{tile.unit}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Pressable onPress={async () => { if (await add()) setQuickLog(false); }} disabled={saving} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, opacity: saving ? 0.6 : 1 }}><IPlus size={16} color={C.onAccent} strokeWidth={2.4} /><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text></Pressable>
        <Pressable onPress={scan} disabled={scanning} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: `${pa.fill}73`, borderRadius: 999, paddingVertical: 16 }}><Glyph name="scan" size={16} color={pa.text} strokeWidth={5} /><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: pa.text }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}{!full ? " ✦" : ""}</Text></Pressable>
      </View>
    </Sheet>
  );

  // Full-screen chrome for the redesigned modal screens (Add / Create / Cook) —
  // an X (or back) at the left, a centred title, an optional right slot.
  /** THE HERO SYSTEM'S `bar` RANK, rendered in content. These sub-views are
   *  presented over the hub rather than pushed, so their head rides with the
   *  content instead of pinning — but every measurement is the system's: a
   *  44pt row, the 40pt circular control, the inline-title type, and one
   *  trailing slot. See reference/hero-system.md. */
  const screenHead = (title: ReactNode, onBack: () => void, opts?: { icon?: "x" | "back"; right?: ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, height: HERO.rail.height, marginBottom: HERO.rail.bottom }}>
      <HeroNav onPress={onBack} mode={opts?.icon === "back" ? "page" : "takeover"} onDark={false} material="clear" />
      <View style={{ flex: 1, alignItems: "center" }}>
        {typeof title === "string" ? (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.bold), fontSize: HERO_INLINE_TITLE.size, lineHeight: HERO_INLINE_TITLE.lineHeight, letterSpacing: HERO_INLINE_TITLE.tracking * HERO_INLINE_TITLE.size, color: C.chalk }}>{title}</Text>
        ) : (
          title
        )}
      </View>
      <View style={{ width: HERO.nav.hit, alignItems: "center" }}>{opts?.right}</View>
    </View>
  );

  // ============ ADD TO MEAL — the food picker ============
  if (view === "add") {
    const foods: QuickFood[] =
      foodTab === "recent" ? recent
      : foodTab === "favorites" ? favorites
      : products.map((p) => ({ key: `p:${p.id}`, name: p.name, subname: p.subname, serving: p.servingLabel, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat }));
    const q = foodQuery.trim();
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(
          <Pressable onPress={() => setMealPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: 19, color: C.chalk }}>{partLabel(mealType)}</Text><IChevDown size={16} color={C.chalk} />
          </Pressable>,
          () => setView("home"),
        )}

        <Sheet visible={mealPicker} onClose={() => setMealPicker(false)} title={t("w.recovery.nutrition.chooseMeal")} scroll={false}>
          <View style={{ gap: 8 }}>
            {partList.map((p) => (
              <Pressable key={p.key} onPress={() => { setMealType(p.key); setMealPicker(false); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: mealType === p.key ? C.lime : C.line, borderRadius: 16, padding: 16 }}>
                <Glyph name={mealGlyph(p.key)} size={20} color={mealType === p.key ? txt(C, C.lime) : C.ash} strokeWidth={5} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{p.label}</Text>
                {mealType === p.key ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : null}
              </Pressable>
            ))}
            {full ? (
              <Pressable onPress={() => { setMealPicker(false); setPartSheet(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: 16, padding: 16 }}>
                <IPlus size={18} color={C.ash} strokeWidth={2.2} />
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}>{t("w.recovery.nutrition.addPart")}</Text>
              </Pressable>
            ) : null}
          </View>
        </Sheet>

        {/* Search — text or barcode */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput value={foodQuery} onChangeText={setFoodQuery} placeholder={t("w.recovery.nutrition.searchPh")} placeholderTextColor={C.ash} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.subtitle, color: C.chalk, padding: 0 }} />
          {q ? <Pressable onPress={() => setFoodQuery("")} accessibilityLabel={t("w.recovery.nutrition.clear")}><IClose size={18} color={C.ash} /></Pressable> : <IBarcode size={20} color={C.ash} />}
        </View>

        {/* Quick Log + Create Food */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <Pressable onPress={() => setQuickLog(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16 }}><IBolt size={18} color={C.chalk} /><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.quickLog")}</Text></Pressable>
          <Pressable onPress={() => openCreate("product")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16 }}><IPlusBox size={18} color={C.chalk} /><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.createFood")}</Text></Pressable>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 4, gap: 4, marginTop: 16 }}>
          {(["recent", "favorites", "meals", "personal"] as const).map((tab) => (
            <Pressable key={tab} onPress={() => setFoodTab(tab)} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: foodTab === tab ? C.lime : "transparent" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: foodTab === tab ? C.onAccent : C.ash }}>{t(`w.recovery.nutrition.tab.${tab}`)}</Text>
            </Pressable>
          ))}
        </View>

        {q.length >= 2 ? (
          <View style={{ marginTop: 8 }}>
            {searching ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16 }}>{t("w.recovery.nutrition.searching")}</Text>
            ) : foodResults.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16, lineHeight: leading(fs.caption) }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
            ) : foodResults.map((food, i) => (
              <FoodRow
                key={`${food.id || food.code}-${i}`} C={C}
                name={food.name}
                subname={food.brand}
                meta={`${Math.round(food.kcal)} kcal  –  ${food.serving}`}
                onAdd={() => logFood(food)}
                onOpen={food.verified && food.id ? () => openFoodPage(food.id!, "add") : undefined}
                verified={food.verified}
                chevron
              />
            ))}
          </View>
        ) : foodTab === "meals" ? (
          /* Full saved MEALS — log one to the current part of the day, or swipe
             to delete. The counterpart to the Products (personal) tab. */
          <View style={{ marginTop: 8 }}>
            {meals.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16, lineHeight: leading(fs.caption, "relaxed") }}>{t("w.recovery.nutrition.mealsEmptyPicker")}</Text>
            ) : meals.map((m) => (
              <FoodRow
                key={m.id} C={C}
                name={m.name}
                subname={m.subname}
                meta={`${Math.round(m.kcal)} kcal  –  ${Math.round(m.protein)}P ${Math.round(m.carbs)}C ${Math.round(m.fat)}F`}
                onAdd={() => logMeal(m)}
                onDelete={() => removeMeal(m.id)}
              />
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            {foods.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16, lineHeight: leading(fs.caption, "relaxed") }}>{t(foodTab === "personal" ? "w.recovery.nutrition.personalEmpty" : foodTab === "favorites" ? "w.recovery.nutrition.favoritesEmpty" : "w.recovery.nutrition.recentEmptyPicker")}</Text>
            ) : foods.map((food) => {
              const prodId = food.key.startsWith("p:") ? food.key.slice(2) : null;
              return (
                <FoodRow
                  key={food.key} C={C}
                  name={food.name}
                  subname={food.subname}
                  meta={`${Math.round(food.kcal)} kcal  –  ${food.serving || t("w.recovery.nutrition.serving")}`}
                  onAdd={() => { const p = prodId ? products.find((x) => x.id === prodId) : null; p ? logProduct(p) : logQuickFood(food); }}
                  starred={isFavorite(food.key)}
                  onStar={() => toggleFavorite(food)}
                  onDelete={prodId ? () => removeProduct(prodId) : undefined}
                />
              );
            })}
          </View>
        )}

        {renderPortionSheet()}
        {renderQuickLog()}
        {renderPartSheet()}
      </AuroraScreen>
    );
  }

  // ============ CREATE FOOD ============
  if (view === "create") {
    const isMeal = createMode === "meal";
    const setCF = (patch: Partial<typeof createForm>) => setCreateForm((s) => ({ ...s, ...patch }));
    // When a meal is composed from products, the macros are DERIVED from the
    // summed components (read-only); otherwise they're typed in.
    const fromComps = isMeal && mealComps.length > 0;
    const tile = (label: string, color: string, value: string, onChange: (v: string) => void, fixed?: number) => (
      <View style={{ flex: 1, backgroundColor: C.ink2, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 8 }}>
          {fixed != null
            ? <Text style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -0.5, color: C.chalk }}>{fixed}</Text>
            : <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={label} style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -0.5, color: C.chalk, padding: 0 }} />}
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>g</Text>
        </View>
      </View>
    );
    const approx = macroKcal(createForm.protein, createForm.carbs, createForm.fat);
    const compList = compQuery.trim() ? products.filter((p) => p.name.toLowerCase().includes(compQuery.trim().toLowerCase()) || (p.subname ?? "").toLowerCase().includes(compQuery.trim().toLowerCase())) : products;
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(isMeal ? t("w.recovery.nutrition.createMeal") : t("w.recovery.nutrition.createFood"), () => setView("add"), {
          right: (
            <Pressable onPress={scanIntoCreate} accessibilityLabel={t("w.recovery.nutrition.scanLabel")} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Glyph name="scan" size={19} color={pa.text} strokeWidth={5} />
            </Pressable>
          ),
        })}

        {/* Title plate — Name + the personal Subname, one surface. */}
        <LinearGradient colors={[`${C.lime}12`, C.ink2]} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 8 }}>{t("w.recovery.nutrition.foodName")}</Text>
          <TextInput value={createForm.name} onChangeText={(v) => setCF({ name: v })} placeholder={t("w.recovery.nutrition.foodNamePh")} placeholderTextColor="#3a3d34" accessibilityLabel={t("w.recovery.nutrition.foodName")} style={{ fontFamily: F.black, fontSize: 27, letterSpacing: -0.5, color: C.chalk, padding: 0 }} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />
          <TextInput value={createForm.subname} onChangeText={(v) => setCF({ subname: v })} placeholder={t("w.recovery.nutrition.subnamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.subname")} style={{ fontFamily: F.reg, fontSize: 16, color: C.ash, padding: 0 }} />
        </LinearGradient>

        {/* Macro hero — calories as the big number, P/C/F as three tiles. When
            the meal is built from products these show the summed total. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {fromComps
            ? <Text style={{ width: 172, textAlign: "center", fontFamily: F.black, fontSize: 60, letterSpacing: -2, color: C.chalk }}>{compTotals.kcal}</Text>
            : <TextInput value={createForm.kcal} onChangeText={(v) => setCF({ kcal: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.calorie")} style={{ width: 172, textAlign: "center", fontFamily: F.black, fontSize: 60, letterSpacing: -2, color: C.chalk, padding: 0 }} />}
          <Text style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>kcal</Text>
        </View>
        <Text style={{ textAlign: "center", fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.calorie")}</Text>
        {!fromComps && approx > 0 && !createForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 8 }}>{t("w.recovery.nutrition.macrosApprox")} {approx} kcal</Text> : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
          {tile(t("w.recovery.nutrition.protein"), txt(C, C.blue), createForm.protein, (v) => setCF({ protein: v }), fromComps ? compTotals.protein : undefined)}
          {tile(t("w.recovery.nutrition.carbs"), txt(C, C.amber), createForm.carbs, (v) => setCF({ carbs: v }), fromComps ? compTotals.carbs : undefined)}
          {tile(t("w.recovery.nutrition.fat"), txt(C, C.violet), createForm.fat, (v) => setCF({ fat: v }), fromComps ? compTotals.fat : undefined)}
        </View>

        {/* The label panel — optional, folded away. Anything left blank stays
            NOT STATED rather than becoming a zero the diary would believe. */}
        <Pressable
          onPress={() => setShowPanelFields((x) => !x)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showPanelFields }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingVertical: 6, paddingHorizontal: 2 }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.facts.moreDetail")}</Text>
          <IChevDown size={13} color={C.ash} />
        </Pressable>
        {showPanelFields ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {([["satFat", "w.recovery.nutrition.facts.satFat"], ["sugar", "w.recovery.nutrition.facts.sugar"], ["fiber", "w.recovery.nutrition.facts.fiber"], ["salt", "w.recovery.nutrition.facts.salt"]] as const).map(([key, lab]) => (
              <View key={key} style={{ width: "47.5%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t(lab)}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <TextInput
                    value={createForm[key]}
                    onChangeText={(v) => setCF({ [key]: v } as Partial<typeof createForm>)}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={C.line}
                    accessibilityLabel={t(lab)}
                    style={{ flex: 1, fontFamily: F.black, fontSize: 20, color: C.chalk, padding: 0, paddingTop: 3 }}
                  />
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>g</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Products — compose a meal from your saved products (meal only). Each
            component carries a serving count; the macros above are their sum. */}
        {isMeal ? (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.mealProducts")}</Text>
              {mealComps.length > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{mealComps.length}</Text> : null}
            </View>
            {mealComps.map((c) => (
              <View key={c.productId} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}><Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{c.name}</Text>{c.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{c.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{Math.round(c.kcal * c.qty)} kcal — {Math.round(c.protein * c.qty)}P {Math.round(c.carbs * c.qty)}C {Math.round(c.fat * c.qty)}F</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
                  <Pressable onPress={() => setCompQty(c.productId, c.qty - 1)} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 32, height: 32, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18, color: txt(C, C.lime) }}>–</Text></Pressable>
                  <Text style={{ minWidth: 26, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{c.qty}</Text>
                  <Pressable onPress={() => setCompQty(c.productId, c.qty + 1)} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 32, height: 32, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 18, color: txt(C, C.lime) }}>+</Text></Pressable>
                </View>
                <Pressable onPress={() => removeMealComp(c.productId)} accessibilityLabel={t("w.recovery.nutrition.remove")} hitSlop={8} style={{ padding: 2 }}><Text style={{ fontSize: 16, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
            <Pressable onPress={() => { setCompQuery(""); setCompPicker(true); }} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
              <IPlus size={15} color={txt(C, C.lime)} strokeWidth={2.2} /><Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addProduct")}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Serving — one quiet line (products only; a meal logs as one serving). */}
        {!isMeal ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.recovery.nutrition.per")}</Text>
            <TextInput value={createForm.serving} onChangeText={(v) => setCF({ serving: v })} keyboardType="numeric" placeholder="1" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.servingLabel2")} style={{ width: 44, textAlign: "right", fontFamily: F.mono, fontSize: 15, color: C.chalk, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 2 }} />
            <Pressable onPress={() => setUnitPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{t(`w.recovery.nutrition.unitOpt.${createForm.unit}`)}</Text><IChevDown size={13} color={C.ash} />
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={submitCreateFood} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, marginTop: 28 }}>
          <IPlus size={18} color={C.onAccent} strokeWidth={2.4} /><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{isMeal ? t("w.recovery.nutrition.saveMeal") : t("w.recovery.nutrition.saveProduct")}</Text>
        </Pressable>

        <Sheet visible={unitPicker} onClose={() => setUnitPicker(false)} title={t("w.recovery.nutrition.unit")} scroll={false}>
          <View style={{ gap: 8 }}>
            {UNIT_OPTIONS.map((u) => (
              <Pressable key={u} onPress={() => { setCreateForm((s) => ({ ...s, unit: u })); setUnitPicker(false); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.ink, borderWidth: 1, borderColor: createForm.unit === u ? C.lime : C.line, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{t(`w.recovery.nutrition.unitOpt.${u}`)}</Text>
                {createForm.unit === u ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : null}
              </Pressable>
            ))}
          </View>
        </Sheet>

        {/* Add product — pick from the saved-products library to compose the meal. */}
        <Sheet visible={compPicker} onClose={() => setCompPicker(false)} title={t("w.recovery.nutrition.addProduct")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 10 }}>
            <AuroraIcon name="search" size={17} color={C.ash} />
            <TextInput value={compQuery} onChangeText={setCompQuery} placeholder={t("w.recovery.nutrition.searchProducts")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, padding: 0 }} />
          </View>
          {products.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16, lineHeight: leading(fs.caption, "relaxed") }}>{t("w.recovery.nutrition.noProductsYet")}</Text>
          ) : compList.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16 }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
          ) : compList.map((p) => {
            const added = mealComps.find((c) => c.productId === p.id);
            return (
              <Pressable key={p.id} onPress={() => addMealComp(p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.2} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}><Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{p.name}</Text>{p.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{p.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel || t("w.recovery.nutrition.serving")} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                {added ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>×{added.qty}</Text> : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setCompPicker(false)} style={{ marginTop: 10, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.recovery.nutrition.done")}</Text></Pressable>
        </Sheet>
      </AuroraScreen>
    );
  }

  // ============ FOOD — a verified product's own page ============
  // A page, not a sheet. The sheet exists to log a food you already trust; this
  // exists to decide whether to trust it — so it leads with WHO published the
  // numbers, states them in full (both energy units, per-100 g where the serving
  // weight is known), and ends with what we did and when. Scoped to VERIFIED
  // items: a community hit has no stable id, no provenance and no sibling menu,
  // so a page for one would be an empty frame around four numbers. Parity: the
  // web screen is the same surface in the same order.
  // Guard on the RESOLVED item, not just the id: an id that no longer matches a
  // catalog entry (an app update dropped it) must fall through to the hub, not
  // set state during render.
  const foodPage = foodPageId ? verifiedFood(foodPageId) : null;
  if (view === "food" && foodPage) {
    const f = foodPage;
    const src = verifiedSource(f.sourceId);
    const related = relatedVerifiedFoods(f.id);
    const p100 = per100g(f.facts, f.servingGrams);
    const hit = verifiedFoodToHit(f);
    // Every item was already dated and NOTHING acted on the date, so a
    // five-year-old transcription looked exactly as confident as this morning's.
    const fresh = verifiedFreshness(f);
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(src?.name ?? t("w.recovery.nutrition.verified"), () => setView(pageBack), {
          icon: "back",
          right: (
            <Pressable
              onPress={() => {
                // The https form, not hybrid:// — a link is only worth sharing
                // if it opens for someone who hasn't installed the app. The
                // universal-link entitlement is what makes it open IN the app;
                // until that ships it lands on the web page, which is the right
                // fallback rather than a dead scheme.
                Share.share({ message: `https://hybrid.app/app?s=nutrition&food=${f.id}` }).catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel={t("w.recovery.nutrition.shareLink")}
              hitSlop={8}
              style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
            >
              <AuroraIcon name="share" size={17} color={C.ash} />
            </Pressable>
          ),
        })}

        {/* WHOSE FOOD THIS IS — the mark leads, under its "published by" label. */}
        {src ? (
          <Pressable onPress={() => openSourcePage(src.id, "food")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginTop: 6 }}>
            <MarkPlate C={C} src={src} height={26} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.publishedBy")}</Text>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 2 }}>{src.name}</Text>
            </View>
            <IChevRight size={17} color={C.ash} />
          </Pressable>
        ) : null}

        {/* ONE name. The operator's own-language name is a search alias only —
            printing it under the English name put a second name on screen for a
            food we had already named, which read as clutter, not help. */}
        <Text style={{ fontFamily: F.black, fontSize: 32, letterSpacing: -1, lineHeight: 35, color: C.chalk, marginTop: 24 }}>{f.name}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>{t("w.recovery.nutrition.perLabel")} {f.servingLabel}</Text>

        {/* Energy hero — both units, because a label states both and we finally can. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 20 }}>
          <Text style={{ fontFamily: F.black, fontSize: 56, letterSpacing: -2.4, lineHeight: 58, color: C.chalk }}>{f.facts.kcal}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>kcal</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{kj(f.facts.kcal)} kJ</Text>
        </View>

        {/* Macro strip — the same idiom the recipe detail uses. */}
        <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingVertical: 16, paddingHorizontal: 6, marginTop: 16 }}>
          {([["w.recovery.nutrition.protein", f.facts.protein, C.blue], ["w.recovery.nutrition.carbs", f.facts.carbs, C.amber], ["w.recovery.nutrition.fat", f.facts.fat, C.violet]] as const).map(([lab, val, col]) => (
            <View key={lab} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 21, color: C.chalk }}>{val}<Text style={{ fontSize: 12, color: C.ash }}>g</Text></Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", marginTop: 5, color: txt(C, col) }}>{t(lab)}</Text>
            </View>
          ))}
        </View>

        <FactsPanel C={C} facts={f.facts} per100={p100} />
        {!p100 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, lineHeight: leading(fs.nano) }}>{t("w.recovery.nutrition.noServingWeight")}</Text>
        ) : null}

        {/* FROM THE PACK — what a shelf item declares beyond the numbers. A
            restaurant dish publishes none of this, so the whole card is absent
            rather than rendered empty. */}
        {f.packSize || f.ingredients || f.mayContain ? (
          <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginTop: 16 }}>
            {f.packSize ? (
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.packSize")}</Text>
                <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{f.packSize}</Text>
              </View>
            ) : null}
            {f.ingredients ? (
              <View style={f.packSize ? { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line } : null}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.ingredients")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: leading(fs.body, "relaxed") }}>{f.ingredients}</Text>
              </View>
            ) : null}
            {f.mayContain ? (
              <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.mayContain")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: leading(fs.body, "relaxed") }}>{f.mayContain}</Text>
              </View>
            ) : null}
            {/* Say out loud that this is OUR translation of someone else's pack —
                an allergen line is the last place to imply we quoted verbatim. */}
            {f.nativeName && (f.ingredients || f.mayContain) ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 12, lineHeight: leading(fs.nano), opacity: 0.85 }}>{t("w.recovery.nutrition.labelTranslated")}</Text>
            ) : null}
          </View>
        ) : null}

        {/* WHAT WE DID, AND WHEN. */}
        <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: `${C.lime}4d`, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginTop: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <VerifiedMark C={C} size={15} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.verified")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4, lineHeight: leading(fs.nano, "relaxed") }}>
                {t("w.recovery.nutrition.verifiedSub").replace("{source}", src?.name ?? "").replace("{date}", f.verifiedOn)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, lineHeight: leading(fs.nano, "relaxed") }}>{f.provenance}</Text>
              {/* A stale item KEEPS its tick — the numbers were true when we
                  checked. It says out loud that it is due another look. */}
              {fresh.stale ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.amber), marginTop: 8, lineHeight: leading(fs.nano, "relaxed") }}>{t("w.recovery.nutrition.verifiedStale")}</Text>
              ) : null}
            </View>
          </View>
          {src?.trademark ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 10, lineHeight: leading(fs.nano), opacity: 0.85 }}>{src.trademark}</Text> : null}
        </View>

        {/* MORE FROM THIS BUSINESS — a checked item is a way into a checked menu. */}
        {related.length > 0 ? (
          <View style={{ marginTop: 24 }}>
            {/* Title only — the exit is the LAST ROW of the list, below. Same
                rule as a rail's tail card in the shape this block actually
                has: a vertical list ends in a door, not a header link. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", paddingBottom: 8 }}>
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.moreFrom").replace("{source}", src?.name ?? "")}</Text>
            </View>
            {related.map((r) => (
              <Pressable key={r.id} onPress={() => openFoodPage(r.id, "food")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12, paddingHorizontal: 2 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{r.name}</Text>
                    <VerifiedMark C={C} size={11} />
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{r.facts.kcal} kcal  –  {r.servingLabel}</Text>
                </View>
                <IChevRight size={16} color={C.ash} />
              </Pressable>
            ))}
            {/* THE DOOR — the list's own last row, carrying on to the whole
                menu. Same hairline and chevron as the rows above it, mono
                uppercase in ash so it reads as the way out rather than one
                more food. */}
            {src ? (
              <Pressable onPress={() => openSourcePage(src.id, "food")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 14, paddingHorizontal: 2 }}>
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.explore.seeAll")}</Text>
                <IChevRight size={16} color={C.ash} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {mealMsg ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
            <AuroraIcon name="check" size={13} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{mealMsg}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12, marginTop: 24, marginBottom: 12 }}>
          <Pressable onPress={() => saveFood(hit)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 20 }}>
            <IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.2} />
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.saveToFoods")}</Text>
          </Pressable>
          <Pressable onPress={() => logFood(hit)} accessibilityRole="button" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.recovery.nutrition.logThis")}</Text>
          </Pressable>
        </View>
        {renderPortionSheet()}
      </AuroraScreen>
    );
  }

  // ============ SOURCES — every business we've checked ============
  // The source page used to be reachable ONLY by opening one of its foods,
  // which made the verified tier something you stumbled into rather than
  // something you could look at. This is the way in.
  if (view === "sources") {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(t("w.recovery.nutrition.verifiedFoods"), () => setView("home"), { icon: "back" })}
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg, "relaxed"), marginTop: 6 }}>{t("w.recovery.nutrition.verifiedIntro")}</Text>
        <View style={{ marginTop: 20 }}>
          {VERIFIED_SOURCES.map((src) => {
            const n = vfBySource(src.id).length;
            return (
              <Pressable key={src.id} onPress={() => openSourcePage(src.id, "sources")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 }}>
                <MarkPlate C={C} src={src} height={28} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{src.name}</Text>
                    <VerifiedMark C={C} size={12} />
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>
                    {t("w.recovery.nutrition.itemsCheckedN").replace("{n}", String(n))}
                  </Text>
                </View>
                <IChevRight size={17} color={C.ash} />
              </Pressable>
            );
          })}
        </View>
      </AuroraScreen>
    );
  }

  // ============ SOURCE — the business's own page ============
  const sourcePage = sourcePageId ? verifiedSource(sourcePageId) : null;
  if (view === "source" && sourcePage) {
    const src = sourcePage;
    const items = verifiedFoodsBySource(src.id);
    const checked = sourceCheckedOn(src.id);
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(t("w.recovery.nutrition.verifiedSourceTitle"), () => setView(pageBack === "food" ? "add" : pageBack), { icon: "back" })}

        <View style={{ marginTop: 6 }}>
          <MarkPlate C={C} src={src} height={52} full />
        </View>

        <Text style={{ fontFamily: F.black, fontSize: 27, letterSpacing: -1, color: C.chalk, marginTop: 20 }}>{src.name}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg, "relaxed"), marginTop: 8 }}>{src.note}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {([[t("w.recovery.nutrition.itemsChecked"), String(items.length)], [t("w.recovery.nutrition.lastChecked"), checked ?? "—"]] as const).map(([lab, val]) => (
            <View key={lab} style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{lab}</Text>
              <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.bodyLg, color: C.chalk, marginTop: 5 }}>{val}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginBottom: 6 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.checkedItems")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{items.length}</Text>
        </View>
        {items.map((f) => (
          <Pressable key={f.id} onPress={() => openFoodPage(f.id, "source")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 16, paddingHorizontal: 2 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{f.name}</Text>
                <VerifiedMark C={C} size={12} />
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{f.facts.kcal} kcal  –  {f.servingLabel}</Text>
            </View>
            <IChevRight size={17} color={C.ash} />
          </Pressable>
        ))}

        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 20, lineHeight: leading(fs.nano, "relaxed"), opacity: 0.85 }}>{src.trademark}</Text>
        {/* Where the artwork came from — sourceMarkCredits() had no surface at
            all until now. */}
        {src.mark ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, lineHeight: leading(fs.nano, "relaxed"), opacity: 0.7, marginTop: 8, marginBottom: 20 }}>
            {t("w.recovery.nutrition.markCredit")} {src.mark.credit}
          </Text>
        ) : <View style={{ marginBottom: 20 }} />}
      </AuroraScreen>
    );
  }

  // ============ RECIPES — the library root ============
  // The PLANS TAB's root, not a lookalike: the same collapsing cover, the same
  // docked jump rail, the same search field and the same full-bleed shelves of
  // covers (aurora/plans.tsx). A recipe library and a plan library are the same
  // object — a shelf of things you open and then follow — and they were
  // arriving as two unrelated screens (a chip filter over a two-column grid).
  if (view === "recipes") {
    const shelves = recipeShelves(recipeQuery);
    // The meta line names what the library HOLDS, so it lists every collection
    // — not just the ones that survived the search, which would make the cover
    // twitch as you type.
    const lib = recipeLibraryCoverView(RECIPES.length, recipeShelves().map((sh) => collectionTitle(sh.key, t)), {
      chip: t("w.recovery.nutrition.recipesLibraryChip"),
      title: t("w.recovery.nutrition.recipes"),
      recipe: t("w.recovery.nutrition.recipeCount"),
      recipes: t("w.recovery.nutrition.recipesCount"),
    });
    return (
      <CoverScreen
        cover={{ accent: C.lime, glyph: lib.glyph, chip: lib.chip, duration: lib.count, title: lib.title, metaParts: lib.metaParts, stats: [], blurb: "", variant: "library" }}
        backLabel={t("w.recovery.nutrition.title")}
        back={() => setView("home")}
        scrollApi={recipeScroll}
        rail={shelves.length > 0 ? <CollectionRail keys={shelves.map((sh) => sh.key)} onJump={(k) => { const y = shelfTops.current[k]; if (y != null) recipeScroll.current?.scrollToChild(y); }} /> : undefined}
      >
        <View style={{ marginTop: 16 }}>
          <AField value={recipeQuery} onChange={setRecipeQuery} placeholder={t("w.recovery.nutrition.searchRecipes")} icon="search" />
        </View>
        {shelves.length === 0 ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 16 }}>{t("w.recovery.nutrition.noRecipeMatches")}</Text>
        ) : (
          shelves.map((shelf) => (
            <RecipeShelf
              key={shelf.key}
              shelf={shelf}
              onLayout={(e) => { shelfTops.current[shelf.key] = e.nativeEvent.layout.y; }}
              openCollection={openCollection}
              openRecipe={(r) => openRecipe(r, "recipes")}
            />
          ))
        )}
      </CoverScreen>
    );
  }

  // ============ RECIPES — one collection ("Breakfast") ============
  // Every collection gets a hero of its own, the way a goal does in Plans. NO
  // aggregate hem: macros averaged over a shelf say nothing, so each recipe
  // card carries its own three numbers instead (recipeCardStats).
  if (view === "collection" && collection) {
    const list = recipesInCollection(collection);
    const cover = recipeCollectionCoverView(collection, list, {
      chip: t("w.recovery.nutrition.recipes"),
      title: collectionTitle(collection, t),
      recipe: t("w.recovery.nutrition.recipeCount"),
      recipes: t("w.recovery.nutrition.recipesCount"),
      fastest: (n) => t("w.recovery.nutrition.fromMins").replace("{n}", String(n)),
      upToProtein: (g) => t("w.recovery.nutrition.upToProtein").replace("{n}", String(g)),
    });
    return (
      <CoverScreen cover={{ ...cover, duration: cover.count, stats: [] }} backLabel={t("w.recovery.nutrition.recipes")} back={() => setView("recipes")}>
        <View style={{ marginTop: 10 }}>
          {list.map((r) => (
            <RecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r, "collection")} />
          ))}
        </View>
      </CoverScreen>
    );
  }

  // ============ RECIPE — detail ============
  // Opens with the PLAN DETAIL'S COVER (components/plan-hero.tsx CoverScreen),
  // not a lookalike — one scaffold, driven by core's recipeCoverView, so the
  // two covers can't drift. The old boxed macro strip is now the cover's HEM,
  // and the METHOD moved onto this page: you could previously read a recipe end
  // to end without seeing how it's made, which made Start cooking a decision
  // taken blind. Parity with web aurora/nutrition.tsx RecipeDetail.
  if (view === "recipe" && recipe) {
    const rc = recipe;
    return (
      <CoverScreen
        cover={recipeCoverView(rc, {
          meal: (m) => t(`w.recovery.nutrition.meal.${m}`),
          mins: (n) => `${n} ${t("w.recovery.nutrition.min")}`,
          serves: (n) => `${n} ${t("w.recovery.nutrition.serves")}`,
          ingredients: (n) => t("w.recovery.nutrition.ingredientsN").replace("{n}", String(n)),
          highProtein: t("w.recovery.nutrition.recipeFilter.highProtein"),
          energy: t("w.recovery.nutrition.energy"),
          protein: t("w.recovery.nutrition.protein"),
          carbs: t("w.recovery.nutrition.carbs"),
          fat: t("w.recovery.nutrition.fat"),
        })}
        backLabel={recipeFrom === "collection" && collection ? collectionTitle(collection, t) : t("w.recovery.nutrition.recipes")}
        back={() => setView(recipeFrom === "collection" && collection ? "collection" : "recipes")}
      >
        {/* Ingredients — the stepper scales every quantity live. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 2 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.ingredients")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
            <Pressable onPress={() => setRecipeServes((x) => Math.max(1, x - 1))} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20, color: txt(C, C.lime) }}>–</Text></Pressable>
            <Text style={{ width: 52, textAlign: "center", fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line, lineHeight: 38 }}>{recipeServes}</Text>
            <Pressable onPress={() => setRecipeServes((x) => Math.min(12, x + 1))} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20, color: txt(C, C.lime) }}>+</Text></Pressable>
          </View>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginBottom: 4 }}>{recipeServes} {t("w.recovery.nutrition.serves")}</Text>
        {rc.ingredients.map((ing, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.note, color: ing.optional ? C.ash : C.chalk }}>{ing.name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}>{formatIngredient(ing, rc.baseServes, recipeServes)}</Text>
          </View>
        ))}

        {/* METHOD — readable before you commit, not only once you're cooking.
            The cook view is still the hands-free step-through; this is the read. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 24, marginBottom: 2 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.method")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepsN").replace("{n}", String(rc.steps.length))}</Text>
        </View>
        {rc.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line }}>
            {/* The number is the STEP ORDER — method is genuinely a sequence, so
                this encodes something true rather than decorating the list. */}
            {/* The number shares the STEP BODY's leading (not its own), so the
                digit sits on the first line of the text beside it. */}
            <Text style={{ width: 20, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.note) }}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.note, lineHeight: leading(fs.note), color: C.chalk }}>{s.text}</Text>
              {s.timerSec != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <IClock size={12} color={txt(C, C.amber)} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.amber) }}>{Math.floor(s.timerSec / 60)}:{String(s.timerSec % 60).padStart(2, "0")}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}

        {recipeMsg ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{recipeMsg}</Text></View> : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
          <Pressable onPress={() => saveRecipeAsMeal(rc)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 20 }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.2} /><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.createMeal")}</Text></Pressable>
          <Pressable onPress={() => { setCookStep(0); setView("cook"); }} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.recovery.nutrition.startCooking")}</Text></Pressable>
        </View>
      </CoverScreen>
    );
  }

  // ============ COOK — step-through ============
  if (view === "cook" && recipe) {
    const cstep = recipe.steps[cookStep]!;
    const last = cookStep >= recipe.steps.length - 1;
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(recipe.name, () => setView("recipe"))}
        <RecipeHero tint={recipe.tint} emoji={recipe.emoji} height={150} fontSize={64} style={{ borderRadius: RADIUS.card, marginTop: 2, marginBottom: 20 }} />
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
          {recipe.steps.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= cookStep ? C.lime : C.line }} />)}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepXofY").replace("{x}", String(cookStep + 1)).replace("{y}", String(recipe.steps.length))}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 23, lineHeight: 31, letterSpacing: -0.3, color: C.chalk, marginTop: 12 }}>{cstep.text}</Text>
        {cstep.timerSec != null ? (
          <View style={{ flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8, marginTop: 20, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 }}>
            <IClock size={15} color={txt(C, C.amber)} /><Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.amber) }}>{Math.floor(cstep.timerSec / 60)}:{String(cstep.timerSec % 60).padStart(2, "0")} {t("w.recovery.nutrition.timer")}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
          {cookStep > 0 ? <Pressable onPress={() => setCookStep((s) => s - 1)} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 24, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.stepBack")}</Text></Pressable> : null}
          <Pressable onPress={() => last ? setView("recipe") : setCookStep((s) => s + 1)} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{last ? t("w.recovery.nutrition.finishCooking") : t("w.recovery.nutrition.nextStep")}</Text></Pressable>
        </View>
      </AuroraScreen>
    );
  }

  const body = (
    <>
      {/* The head — hub masthead or sub-screen title — is the HERO's now (see
          the AuroraScreen below). Nothing renders here. */}

      {view === "home" && (signalsError && signals.length === 0 ? (
        /* SIGNALS FAILED TO LOAD — with no cached intake the day summary would
           read "0 eaten / full target remaining" as if nothing were logged yet,
           masking an offline / 500. Show the honest retry card instead. */
        <FetchError onRetry={() => refetch()} style={{ marginTop: 16 }} />
      ) : (<>
      {/* Goal — a card you OPEN (never a live toggle): switching the goal
          recomputes every target, so it must take a deliberate tap. */}
      <PressScale onPress={() => setGoalPicker(true)} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.goalLabel")}: ${goalName(goal)}`} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Glyph name="target" size={20} color={C.ash} strokeWidth={5} />
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.goalLabel")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk, marginTop: 2 }}>{goalName(goal)}</Text>
          </View>
        </View>
        <Glyph name="chevron" size={16} color={C.ash} strokeWidth={6} />
      </PressScale>

      {coachDiet?.diet && (
        <ACard solid style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} ({t("w.recovery.nutrition.readOnly")})
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, " kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <View key={label}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{val}{unit === "g" ? "g" : ""}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t(label)}{unit === " kcal" ? " (kcal)" : ""}</Text>
                </View>
              ) : null),
            )}
          </View>
          {coachDiet.diet.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 10, lineHeight: leading(fs.body, "snug") }}>{coachDiet.diet.note}</Text> : null}
        </ACard>
      )}

          {/* CALORIE RING + MACROS — the hero, ONE card: ring on top, the three
              macro hairlines beneath. The whole card presses into the Diary
              (web parity). */}
          <View style={{ marginTop: 16 }}>
          <PressScale onPress={() => setView("diary")} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.menuDiary")}>
          <ACard solid style={{ paddingVertical: 24, alignItems: "center" }}>
            <View style={{ alignSelf: "stretch", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.caloriesLeft")}</Text>
              <View style={{ marginTop: 16 }}>
                {/* One over-target threshold for BOTH the ring and the number (web parity: 1.05). */}
                <Ring value={targets.kcal > 0 ? (today.kcal / targets.kcal) * 100 : 0} size={190} ticks={52} color={today.kcal > targets.kcal * KCAL_OVER_THRESHOLD ? C.red : C.lime} track={C.line}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontFamily: F.black, fontSize: 44, letterSpacing: -1, color: today.kcal > targets.kcal * KCAL_OVER_THRESHOLD ? txt(C, C.red) : C.chalk }}>{Math.round(targets.kcal - today.kcal)}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{Math.round(today.kcal)} / {targets.kcal}</Text>
                  </View>
                </Ring>
              </View>
              {maint.kcal != null ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 16, textAlign: "center" }}>{t("w.recovery.nutrition.maintenance")} {maint.kcal} kcal{maint.weightChangeKg != null ? ` — ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}</Text> : null}
              {trainingKcal > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: `${C.lime}47`, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Glyph name="spark" size={13} color={txt(C, C.lime)} strokeWidth={5} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: txt(C, C.lime) }}>+{trainingKcal} {t("w.recovery.nutrition.trainingFuel")}</Text>
                </View>
              ) : null}
            </View>
            {/* Macros — hairline lines beneath the hero, same card. */}
            <View style={{ alignSelf: "stretch", marginTop: 24 }}>
              {([["w.recovery.nutrition.protein", today.protein, targets.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", today.carbs, targets.carbs, C.amber, txt(C, C.amber)], ["w.recovery.nutrition.fat", today.fat, targets.fat, C.violet, txt(C, C.violet)]] as const).map(([label, cur, tgt, col, colT], i) => (
                <View key={label} style={{ marginTop: i ? 18 : 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: colT }}>{t(label)}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{Math.round(cur)} / {tgt} g</Text>
                  </View>
                  <View style={{ height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}><View style={{ width: `${Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0)}%`, height: 4, borderRadius: RADIUS.pill, backgroundColor: col }} /></View>
                </View>
              ))}
            </View>
          </ACard>
          </PressScale>
          </View>

          {/* One plain-spoken nudge — a quiet line, not a boxed card. */}
          <NutritionNudge nudge={nudge} />

          {/* Today's meals — Breakfast / Lunch / Dinner / Snacks. Each opens the
              picker attributed to that meal; the kcal already logged is shown. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginHorizontal: 2 }}>
            <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.todaysMeals")}</Text>
            <Pressable onPress={() => setView("diary")}><CtaLabel label={`${t("w.recovery.nutrition.menuDiary")} →`} color={C.ash} fontSize={fs.micro} font={F.mono} style={{ letterSpacing: 0.9, textTransform: "uppercase" }} /></Pressable>
          </View>
          {partList.map((p) => { const kcal = mealTotals[p.key] ?? 0; return (
            <PressScale key={p.key} onPress={() => openAdd(p.key)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginTop: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Glyph name={mealGlyph(p.key)} size={19} color={C.ash} strokeWidth={5} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{p.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: kcal > 0 ? C.ash : txt(C, C.lime), marginTop: 2 }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : t("w.recovery.nutrition.addFirstFood")}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.4} /></View>
            </PressScale>
          ); })}
          {full ? (
            <PressScale onPress={() => setPartSheet(true)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginTop: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}><IPlus size={18} color={C.ash} strokeWidth={2.2} /></View>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.subtitle, color: C.ash }}>{t("w.recovery.nutrition.addPart")}</Text>
            </PressScale>
          ) : null}

          {/* The five deep destinations, as a BENTO — Diary leads with a real
              chart (its target vs what was logged, seven days), the other four
              follow as stat tiles. This replaced a wrapping row of bare
              mono-uppercase words that had no surface, no glyph, no arrow and
              no data: five links dressed as a caption, with the destination
              opened daily sitting at the same weight as the one opened
              monthly. Recipes and the verified tier are NOT here: both are
              libraries you browse, so they ride their own rails at the very
              bottom of this screen. */}
          <NutritionHubBento
            series={hubSeries}
            avgKcal={weekSummary.avgKcal}
            weightKg={weight.smoothedLatest ?? weight.latest}
            ratePerWeek={weight.ratePerWeek}
            mealCount={meals.length}
            productCount={products.length}
            onOpen={setView}
          />

          {/* ── The two libraries, at the very bottom, as left/right rails —
              the "Train your way" idiom. A list of recipes and a list of the
              businesses we've verified are things you BROWSE, so they read as
              cards you swipe through rather than two more menu rows that hide
              their contents behind a chevron. Both are FULL-BLEED like every
              screen-level rail: negative margins the width of AuroraScreen's
              12dp gutter pull the scroll clip to the true screen edge, with
              matching internal padding so resting cards stay on the column. */}
          {/* Title only — a rail's "see all" lives at the END OF THE RAIL as a
              tail card (aurora/rail-tail.tsx), where the thumb already is once
              the cards run out. Mirrors web. */}
          <ASection flat title={t("w.recovery.nutrition.recipes")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={recipeCardW + 12} decelerationRate="fast" style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: GUTTER }}>
            {/* the SAME tile the library shelves carry — a recipe reads as one
                object wherever you meet it, and the hub is where most people
                meet it first. */}
            {RECIPES.map((r) => (
              <RecipeTile key={r.id} recipe={r} width={recipeCardW} onOpen={() => (recipesUnlocked ? openRecipe(r) : (onUpgrade ? onUpgrade() : router.push("/upgrade")))} />
            ))}
            {/* The rail's exit, at its end — where the thumb lands once the
                cards run out. Behind Full, so it carries the ✦ and the premium
                accent the head's link used to. */}
            <RailTail
              onOpen={() => (recipesUnlocked ? setView("recipes") : (onUpgrade ? onUpgrade() : router.push("/upgrade")))}
              a11y={`${t("w.explore.seeAll")} – ${t("w.recovery.nutrition.recipes")}`}
              premium={!recipesUnlocked} w={recipeCardW} radius={RADIUS.card}
            />
          </ScrollView>

          {/* Verified foods — the BUSINESSES, one card each. The verified tier
              was previously only reachable by stumbling into one of its foods
              through search; the rail puts the companies themselves on the
              screen. */}
          <ASection flat title={t("w.recovery.nutrition.verifiedFoods")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={sourceCardW + 12} decelerationRate="fast" style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: GUTTER }}>
            {VERIFIED_SOURCES.map((src) => {
              const n = vfBySource(src.id).length;
              return (
                <PressScale key={src.id} onPress={() => openSourcePage(src.id, "home")} accessibilityRole="button" accessibilityLabel={src.name} style={{ width: sourceCardW, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, backgroundColor: C.ink2, padding: 16 }}>
                  {/* The business's own logo leads the card — this rail IS the
                      businesses, so recognising one at a glance is its whole job. */}
                  <MarkPlate C={C} src={src} height={34} full />
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12, paddingHorizontal: 2 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{src.name}</Text>
                    <VerifiedMark C={C} size={12} />
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4, paddingHorizontal: 2 }}>{t("w.recovery.nutrition.itemsCheckedN").replace("{n}", String(n))}</Text>
                </PressScale>
              );
            })}
            <RailTail
              onOpen={() => setView("sources")}
              a11y={`${t("w.explore.seeAll")} – ${t("w.recovery.nutrition.verifiedFoods")}`}
              w={sourceCardW} radius={RADIUS.card}
            />
          </ScrollView>
      </>
      ))}

      {view === "insights" && (
        <View style={{ marginTop: 16 }}>
          <SummaryDashboard summary={summary} window={summaryWindow} onWindow={setSummaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} full={full} />
        </View>
      )}

      {view === "body" && (
        <ACard solid style={{ marginTop: 16 }}>
          {/* Weight is a PROFILE attribute — one canonical source. This reads the
              latest profile weigh-in; updating here writes straight to the
              profile (no separate nutrition weight silo). */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.currentWeight")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.recovery.nutrition.weightFromProfile")}</Text>
          </View>
          {bodyMassKg != null ? (
            <Text style={{ fontFamily: F.black, fontSize: 30, letterSpacing: -0.5, color: C.chalk, marginTop: 6 }}>{bodyMassKg}<Text style={{ fontFamily: F.mono, fontSize: 15, color: C.ash }}> kg</Text></Text>
          ) : (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{t("w.recovery.nutrition.noWeightYet")}</Text>
          )}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{t("w.recovery.nutrition.weightProfileSub")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TextInput value={weighIn} onChangeText={setWeighIn} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.updateWeight")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12, textAlign: "center" }} />
            <Pressable onPress={() => { const kg = parseFloat(weighIn); if (Number.isFinite(kg) && kg > 0) { logWeighIn(kg); setWeighIn(""); } }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 16, justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.updateWeight")}</Text></Pressable>
          </View>
        </ACard>
      )}

      {/* Bodyweight trend — EWMA-smoothed weight line + weekly rate. */}
      {view === "body" && weight.points.length > 0 && (
        <ACard solid style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.bodyweightTrend")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, weight.ratePerWeek <= 0 ? C.lime : C.amber) }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</Text>
          </View>
          <WeightTrend points={weight.points} color={C.lime} />
        </ACard>
      )}

      {/* LOG — the unified manual entry + scan + one-tap premade meals. */}
      {view === "log" && (
      <ACard solid style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <AuroraIcon name="add" size={20} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
          </View>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color={pa.text} strokeWidth={5} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: pa.text }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: 11 }}>✦</Text>}
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 16 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" inputRef={kcalRef} />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")} onPress={add} disabled={saving} style={{ marginTop: 16 }} />
        {/* QUICK MEALS — one-tap premade meals as time-of-day rows. Full users log
            on tap; free users see them locked and a tap routes to upgrade. */}
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.quickMeals")}</Text>
            {!full && <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: pa.text }}>✦ Full</Text>}
          </View>
          <View style={{ marginTop: 12 }}>
            {MEAL_PRESETS.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => logPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={t(p.labelKey)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
              >
                <Glyph name={presetGlyph(p.id)} size={22} color={full ? C.ash : pa.text} strokeWidth={5} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{p.kcal}</Text>
                {!full && <AuroraIcon name="lock" size={13} color={pa.text} />}
              </Pressable>
            ))}
          </View>
          {mealMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.mealLogged")} — {mealMsg}</Text></View> : null}
        </View>
      </ACard>

      )}

      {/* MY MEALS — the user's own saved-meal library. */}
      {view === "meals" && (
      <ACard solid style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourMeals")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`}</Text>
        </View>
        {meals.length === 0 && !showMealBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 10, lineHeight: leading(fs.caption, "snug") }}>{t("w.recovery.nutrition.yourMealsEmpty")}</Text>
        ) : null}
        {meals.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {meals.map((m, i) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                {m.emoji ? <Text style={{ fontSize: 20, width: 22, textAlign: "center" }}>{m.emoji}</Text> : <Glyph name="bowl" size={22} color={C.ash} strokeWidth={5} />}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{m.name}</Text>
                    {m.subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }} numberOfLines={1}>{m.subname}</Text> : null}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{m.kcal} kcal — {m.protein}P {m.carbs}C {m.fat}F</Text>
                </View>
                <Pressable onPress={() => logMeal(m)} accessibilityRole="button" style={{ borderRadius: 999, backgroundColor: C.lime, paddingVertical: 8, paddingHorizontal: 16 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: C.onAccent }}>{t("w.recovery.nutrition.log")}</Text>
                </Pressable>
                <Pressable onPress={() => removeMeal(m.id)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.deleteMeal")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showMealBuilder ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.newMeal")}</Text>
            <TextInput value={mealForm.name} onChangeText={(v) => setMealForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.mealNameHint")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.mealName")} style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <QuadTile field="kcal" label="kcal" unit="kcal" color={txt(C, C.lime)} value={mealForm.kcal} onChange={(v) => setMealForm((s) => ({ ...s, kcal: v }))} />
              <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={mealForm.protein} onChange={(v) => setMealForm((s) => ({ ...s, protein: v }))} />
              <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={mealForm.carbs} onChange={(v) => setMealForm((s) => ({ ...s, carbs: v }))} />
              <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.violet)} value={mealForm.fat} onChange={(v) => setMealForm((s) => ({ ...s, fat: v }))} />
            </View>
            {(() => { const mk = macroKcal(mealForm.protein, mealForm.carbs, mealForm.fat); return mk > 0 && !mealForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</Text> : null; })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setShowMealBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveMeal} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.saveMeal")}</Text></Pressable>
            </View>
          </View>
        ) : canSaveAnotherMeal ? (
          <Pressable onPress={() => openCreate("meal")} accessibilityRole="button" style={{ marginTop: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.createMeal")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 16, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: `${pa.fill}1f`, borderWidth: 1, borderColor: `${pa.fill}66`, borderRadius: 999, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreMeals")}</Text>
          </Pressable>
        )}
      </ACard>

      )}

      {/* MY FOODS — search-first. The box queries Open Food Facts (free, no key)
          for any food or barcode; a hit can be logged to today or saved to the
          library. Below sits your own saved foods + a manual builder. */}
      {view === "foods" && (
      <ACard solid style={{ marginTop: 16 }}>
        {/* Search — text or barcode */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput value={foodQuery} onChangeText={setFoodQuery} placeholder={t("w.recovery.nutrition.foodSearchPh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.foodSearchPh")} autoCorrect={false} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, padding: 0 }} />
          {foodQuery ? <Pressable onPress={() => setFoodQuery("")} accessibilityLabel={t("w.recovery.nutrition.clear")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 17, color: C.ash }}>×</Text></Pressable> : <Glyph name="scan" size={17} color={C.ash} strokeWidth={4} />}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, letterSpacing: 0.9 }}>{t("w.recovery.nutrition.foodSearchHint")}</Text>
        {foodMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{foodMsg}</Text></View> : null}

        {/* Database results */}
        {foodQuery.trim().length >= 2 ? (
          <View style={{ marginTop: 16 }}>
            {searching ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 6 }}>{t("w.recovery.nutrition.searching")}</Text>
            ) : foodResults.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 6, lineHeight: leading(fs.caption, "snug") }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
            ) : foodResults.map((food, i) => (
              <View key={`${food.id || food.code}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                {/* A verified row opens its page from the name, exactly as in the
                    picker — the same food must not be a dead end on one screen
                    and a doorway on another. */}
                <Pressable
                  onPress={food.verified && food.id ? () => openFoodPage(food.id!, "foods") : () => logFood(food)}
                  style={{ flex: 1 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{food.name}</Text>
                    {food.verified ? <VerifiedMark C={C} size={12} /> : null}
                  </View>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>{food.brand ? `${food.brand} — ` : ""}{food.serving} — {food.kcal} kcal — {food.protein}P {food.carbs}C {food.fat}F</Text>
                </Pressable>
                <Pressable onPress={() => saveFood(food)} accessibilityLabel={t("w.recovery.nutrition.saveToFoods")} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="bookmark" size={15} color={C.ash} /></Pressable>
                <Pressable onPress={() => logFood(food)} accessibilityRole="button" style={{ borderRadius: 999, backgroundColor: C.lime, paddingVertical: 8, paddingHorizontal: 16 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: C.onAccent }}>{t("w.recovery.nutrition.log")}</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Your saved foods */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: foodQuery.trim().length >= 2 ? 16 : 0, borderTopWidth: foodQuery.trim().length >= 2 ? 1 : 0, borderTopColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourProducts")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${products.length} / ${FREE_PRODUCT_LIMIT}`}</Text>
        </View>
        {products.length === 0 && !showProdBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, lineHeight: leading(fs.caption, "snug") }}>{t("w.recovery.nutrition.yourProductsSub")}</Text>
        ) : null}
        {products.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            {products.map((p, i) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{p.name}</Text>
                    {p.subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }} numberOfLines={1}>{p.subname}</Text> : null}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                <Pressable onPress={() => addProductToMeal(p)} accessibilityLabel={t("w.recovery.nutrition.addToMeal")} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="add" size={14} color={txt(C, C.lime)} /></Pressable>
                <Pressable onPress={() => removeProduct(p.id)} accessibilityLabel={t("w.recovery.nutrition.deleteProduct")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showProdBuilder ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.newProduct")}</Text>
            <TextInput value={prodForm.name} onChangeText={(v) => setProdForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.productNamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.productName")} style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }} />
            <TextInput value={prodForm.serving} onChangeText={(v) => setProdForm((s) => ({ ...s, serving: v }))} placeholder={t("w.recovery.nutrition.servingPh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.servingPh")} style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <QuadTile field="kcal" label="kcal" unit="kcal" color={txt(C, C.lime)} value={prodForm.kcal} onChange={(v) => setProdForm((s) => ({ ...s, kcal: v }))} />
              <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={prodForm.protein} onChange={(v) => setProdForm((s) => ({ ...s, protein: v }))} />
              <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={prodForm.carbs} onChange={(v) => setProdForm((s) => ({ ...s, carbs: v }))} />
              <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.violet)} value={prodForm.fat} onChange={(v) => setProdForm((s) => ({ ...s, fat: v }))} />
            </View>
            {(() => { const mk = macroKcal(prodForm.protein, prodForm.carbs, prodForm.fat); return mk > 0 && !prodForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</Text> : null; })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setShowProdBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveProduct} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.saveProduct")}</Text></Pressable>
            </View>
          </View>
        ) : null}
        {showProdBuilder ? null : canSaveAnotherProduct ? (
          <Pressable onPress={() => openCreate("product")} accessibilityRole="button" style={{ marginTop: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addManually")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 16, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: `${pa.fill}1f`, borderWidth: 1, borderColor: `${pa.fill}66`, borderRadius: 999, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreProducts")}</Text>
          </Pressable>
        )}
      </ACard>

      )}

      {/* DIARY — the selected day's individual entries, grouped by part, each
          editable (quantity) and deletable. Defaults to today; pick a past day
          in the record below. Then the week strip + recent days. */}
      {view === "diary" && (() => { const isToday = diaryDay === localTodayKey(); const macros: [string, number, number, string][] = [["P", daySummary.protein, targets.protein ?? 0, C.blue], ["C", daySummary.carbs, targets.carbs ?? 0, C.amber], ["F", daySummary.fat, targets.fat ?? 0, C.violet]];
      // One logged item: what it was, what it cost, a stepper to rescale it and
      // a bin to remove it. A derived entry (no FoodLog row) has no name of its
      // own, so it's labelled by its time of day and scales by a multiplier.
      const entryRow = (l: FoodLogRow) => {
        const mult = derivedScale[l.id] ?? 1;
        const shown = l.derived ? mult : l.qty;
        const d = new Date(l.ts);
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return (
        <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 31, paddingRight: 2 }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{l.name || t("w.recovery.nutrition.loggedEntry")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.derived ? `${time} — ` : ""}{Math.round(l.kcal * l.qty)} kcal — {Math.round(l.protein * l.qty)}P {Math.round(l.carbs * l.qty)}C {Math.round(l.fat * l.qty)}F</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable onPress={() => stepEntry(l, Math.max(0.5, Math.round((shown - 0.5) * 2) / 2))} accessibilityLabel={t("w.recovery.nutrition.decrease")} hitSlop={6} style={{ width: 26, height: 26, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 15, lineHeight: 17, color: C.chalk }}>−</Text></Pressable>
            <Text style={{ minWidth: 26, textAlign: "center", fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{l.derived ? `×${shown}` : shown}</Text>
            <Pressable onPress={() => stepEntry(l, Math.min(50, Math.round((shown + 0.5) * 2) / 2))} accessibilityLabel={t("w.recovery.nutrition.increase")} hitSlop={6} style={{ width: 26, height: 26, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 15, lineHeight: 17, color: C.chalk }}>+</Text></Pressable>
          </View>
          <Pressable onPress={() => deleteLogEntry(l.id)} accessibilityLabel={t("w.recovery.nutrition.deleteEntry")} hitSlop={6} style={{ padding: 4 }}><ITrash size={17} color={C.ash} /></Pressable>
        </View>
        );
      };
      // Entries whose source isn't one of the parts (a quick log, a food-search
      // hit, a preset) still belong to the day — they get their own group so
      // nothing logged is ever unreachable.
      const otherEntries = dayLogs.filter((l) => !partList.some((p) => p.key === l.source));
      return (
      <>
      {/* DAY SUMMARY — pick any date with ‹ ›, see the whole day's totals vs
          target. Read from Signals so it works for every day, migrated or not. */}
      <ACard solid style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Pressable onPress={() => shiftDiaryDay(-1)} accessibilityLabel={t("w.recovery.nutrition.prevDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><View style={{ transform: [{ rotate: "180deg" }] }}><IChevRight size={16} color={C.chalk} /></View></Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{isToday ? t("w.recovery.nutrition.todaysMeals") : diaryDayLabel}</Text>
            {!isToday ? <Pressable onPress={() => setDiaryDay(localTodayKey())}><CtaLabel label={`${t("w.recovery.nutrition.backToToday")} →`} color={txt(C, C.lime)} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: 0.9, marginTop: 2 }} /></Pressable> : null}
          </View>
          <Pressable onPress={() => shiftDiaryDay(1)} disabled={isToday} accessibilityLabel={t("w.recovery.nutrition.nextDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><IChevRight size={16} color={isToday ? C.line : C.chalk} /></Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 34, fontWeight: "700", color: C.chalk }}>{Math.round(daySummary.kcal)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>kcal{targets.kcal ? ` / ${Math.round(targets.kcal)}` : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {macros.map(([lab, val, tgt, tint]) => (
            <View key={lab} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, tint) }}>{lab}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>{Math.round(val)}{tgt ? `/${Math.round(tgt)}` : ""}g</Text>
              </View>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: C.line, overflow: "hidden" }}>
                <View style={{ width: `${tgt ? Math.min(100, (val / tgt) * 100) : 0}%`, height: "100%", backgroundColor: tint, borderRadius: 999 }} />
              </View>
            </View>
          ))}
        </View>
        {/* The label panel for the whole day. It is a FLOOR, not a total — only
            the foods that stated a value contribute one, so the caption says so
            rather than letting a partial number read as a complete one. */}
        {daySummary.satFat > 0 || daySummary.sugar > 0 || daySummary.salt > 0 || daySummary.fiber > 0 ? (
          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
            {/* Measured against WHO/EFSA REFERENCE intakes, not a personal
                target — saturates and sugars scale with the athlete's energy,
                salt doesn't, and fibre is a floor to reach. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
              {panelStatus(daySummary, targets.kcal ?? 2000)
                .filter((r) => r.value > 0)
                .map((r) => (
                  <View key={r.key} style={{ minWidth: 74 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(`w.recovery.nutrition.facts.${r.key}`)}</Text>
                    <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: r.over ? txt(C, C.red) : C.chalk, marginTop: 3 }}>
                      {r.value} g<Text style={{ fontWeight: "400", fontSize: fs.nano, color: C.ash }}> {r.floor ? "/" : "of"} {r.reference}</Text>
                    </Text>
                    <View style={{ height: 3, borderRadius: 999, backgroundColor: C.line, overflow: "hidden", marginTop: 5 }}>
                      <View style={{ width: `${Math.min(100, r.pct * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: r.over ? C.red : r.floor ? C.lime : C.ash }} />
                    </View>
                  </View>
                ))}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 12, lineHeight: leading(fs.nano, "relaxed") }}>
              {t("w.recovery.nutrition.facts.dayPartial")} {t("w.recovery.nutrition.facts.referenceNote")}
            </Text>
          </View>
        ) : null}
      </ACard>

      {/* PER-PART BREAKDOWN — each part's total, then its individual editable
          entries (from FoodLog when present). */}
      <ACard solid style={{ marginTop: 12 }}>
        <View style={{ marginTop: 0 }}>
          {partList.map((p, i) => {
            const entries = dayLogs.filter((l) => l.source === p.key);
            const kcal = entries.length ? entries.reduce((s, l) => s + l.kcal * l.qty, 0) : (dayPartKcal[p.key] ?? 0);
            return (
            <View key={p.key} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: 12, paddingBottom: entries.length ? 6 : 12 }}>
              <Pressable onPress={() => isToday && openAdd(p.key)} disabled={!isToday} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 2 }}>
                <Glyph name={mealGlyph(p.key)} size={19} color={C.ash} strokeWidth={5} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{p.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: kcal > 0 ? C.chalk : C.ash }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : "—"}</Text>
                {isToday ? <View style={{ width: 26, height: 26, borderRadius: 999, borderWidth: 1.4, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={13} color={txt(C, C.lime)} strokeWidth={2.4} /></View> : null}
              </Pressable>
              {entries.map(entryRow)}
            </View>
            );
          })}
          {otherEntries.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, paddingBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 2 }}>
                <Glyph name={mealGlyph("snack")} size={19} color={C.ash} strokeWidth={5} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.otherEntries")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(otherEntries.reduce((s, l) => s + l.kcal * l.qty, 0))} kcal</Text>
              </View>
              {otherEntries.map(entryRow)}
            </View>
          ) : null}
        </View>
        {dayLogs.length === 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 12, lineHeight: leading(fs.nano, "relaxed") }}>{daySummary.kcal > 0 ? t("w.recovery.nutrition.diaryTotalsOnly") : t("w.recovery.nutrition.diaryEntriesHint")}</Text> : null}
      </ACard>
      </>
      ); })()}

      {view === "diary" && (
      <ACard solid style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.recentDays")}</Text>
          {streakDays > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{streakDays}/7</Text> : null}
        </View>
        {/* week strip — last 7 days, lit when intake was logged */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 16 }}>
          {week.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: d.on ? `${C.lime}39` : C.ink, borderWidth: 1, borderColor: d.on ? `${C.lime}66` : C.line, alignItems: "center", justifyContent: "center" }}>{d.on ? <AuroraIcon name="check" size={13} color={txt(C, C.lime)} /> : null}</View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          {recentDays.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recentDays.map((d, i) => { const on = d.date === diaryDay; return (
            <Pressable key={d.date} onPress={() => setDiaryDay(d.date)} accessibilityLabel={`${t("w.recovery.nutrition.viewDay")} ${d.date.slice(5)}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, borderLeftWidth: 2, borderLeftColor: on ? C.lime : "transparent", backgroundColor: on ? `${C.lime}14` : "transparent", borderRadius: on ? 8 : 0 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash, width: 48 }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(d.protein)}P {Math.round(d.carbs)}C {Math.round(d.fat)}F</Text>
            </Pressable>
          ); })}
        </View>
      </ACard>
      )}

      <Sheet visible={goalPicker} onClose={() => setGoalPicker(false)} title={t("w.recovery.nutrition.goalSheetTitle")} sub={t("w.recovery.nutrition.goalSheetSub")}>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          {GOALS.map((g) => {
            const on = goal === g.id;
            return (
              <Pressable key={g.id} onPress={() => { chooseGoal(g.id); setGoalPicker(false); }} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: 16, padding: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk }}>{t(g.labelKey)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{goalSub(g.id)}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={C.onAccent} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {/* Portion & quantity — serving × quantity stepper, macros scale live. */}
      {renderPortionSheet()}
      {renderPartSheet()}
    </>
  );

  return (
    <AuroraScreen
      refreshing={refreshing}
      onRefresh={load}
      // THE HEAD IS THE SYSTEM'S. The sticky HUD that used to sit here — and
      // that occupied exactly the rail's y — is gone, so Nutrition's screens
      // take the same hero every other screen does. `root` means this is
      // showing as a Today hub tab, where Today owns the head.
      hero={root && view === "home" ? undefined : { rank: "title", title: viewTitle, eyebrow: view === "home" ? greeting || undefined : undefined }}
      back={view === "home" ? (root ? false : undefined) : () => setView("home")}
      backLabel={view === "home" ? undefined : t("w.recovery.nutrition.title")}
    >
      {body}
    </AuroraScreen>
  );
}

// A labelled hairline divider for the compact Add-a-meal sheet.
function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{label}</Text>
        {tier ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: premium ? `${pa.fill}73` : C.line, color: premium ? pa.text : C.ash }}>{tier}</Text> : null}
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
}

// Bodyweight-trend chart — the mobile parity of the web recharts LineChart
// (aurora/nutrition.tsx). No react-native-svg line: it reuses the native
// bar-trend idiom on the EWMA-smoothed weight series, with the raw latest weight
// + span dates so it reads as a trend at a glance.
function WeightTrend({ points, color }: { points: WeightPoint[]; color: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const series = points.map((p) => p.smoothed);
  const max = Math.max(...series), min = Math.min(...series), range = max - min || 1;
  const first = points[0]!, latest = points[points.length - 1]!;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{latest.smoothed} kg <Text style={{ color: C.ash }}>{t("w.recovery.nutrition.trend")}</Text></Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{latest.raw} kg {t("w.recovery.nutrition.raw")}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 64, gap: series.length > 40 ? 1 : 2 }}>
        {series.map((v, i) => (
          <View key={i} style={{ flex: 1, height: 6 + ((v - min) / range) * 58, borderRadius: 2, backgroundColor: i === series.length - 1 ? color : `${color}55` }} />
        ))}
      </View>
      {points.length > 1 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{first.date.slice(5)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{latest.date.slice(5)}</Text>
        </View>
      )}
    </View>
  );
}


// The coach-voiced "what now?" line — a quiet row (spark glyph + text), coloured
// by kind. No boxed card, no accent bar: it reads like a note, not an alert.
function NutritionNudge({ nudge }: { nudge: NutritionNudge }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const text =
    nudge.kind === "cold-start" ? t("w.recovery.nutrition.nudgeColdStart")
    : nudge.kind === "protein" ? `${nudge.gap}${t("w.recovery.nutrition.nudgeProteinSuffix")}`
    : nudge.kind === "calories-left" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeCalSuffix")}`
    : nudge.kind === "over" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeOverSuffix")}`
    : t("w.recovery.nutrition.nudgeOnTrack");
  const accent = nudge.kind === "over" ? txt(C, C.red) : nudge.kind === "on-track" ? txt(C, C.lime) : txt(C, C.blue);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 2 }}>
      {nudge.kind === "on-track"
        ? <AuroraIcon name="check" size={17} color={accent} style={{ marginTop: 1 }} />
        : <View style={{ marginTop: 1 }}><Glyph name="spark" size={17} color={accent} strokeWidth={5} /></View>}
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{text}</Text>
    </View>
  );
}

// The SUMMARY dashboard — a week/month rollup of stat tiles + macro balance.
function SummaryDashboard({ summary, window, onWindow, goal, weightChangeKg, onUpgrade, full }: { summary: NutritionSummary; window: 7 | 30; onWindow: (w: 7 | 30) => void; goal: NutritionGoal; weightChangeKg: number | null; onUpgrade: () => void; full: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const goalLabel = t(goal === "lose" ? "w.recovery.nutrition.goalLose" : goal === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  const seg = (w: 7 | 30, label: string) => (
    <Pressable key={w} onPress={() => onWindow(w)} style={{ flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center", backgroundColor: window === w ? C.lime : "transparent" }}>
      <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.caption, letterSpacing: 0.9, textTransform: "uppercase", color: window === w ? C.onAccent : C.ash }}>{label}</Text>
    </Pressable>
  );
  // Generic stats stay neutral (ash); the macro-average tile keeps its violet.
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), C.ash],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), C.ash],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C.ash],
    [t("w.recovery.nutrition.protein"), summary.avgProtein != null ? `${summary.avgProtein}g` : "—", t("w.recovery.nutrition.perDay").replace("kcal", "avg"), txt(C, C.violet)],
  ];
  return (
    <ACard solid style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.summary")}</Text>
        <View style={{ flexDirection: "row", width: 132, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 999, padding: 3 }}>
          {seg(7, t("w.recovery.nutrition.week"))}{seg(30, t("w.recovery.nutrition.month"))}
        </View>
      </View>
      {summary.loggedDays === 0 ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12 }}>{t("w.recovery.nutrition.summaryEmpty")}</Text>
      ) : (
        <>
          {/* Goal-progress strip — goal + measured 28-day weight change. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
            <View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</Text>
              <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.5, color: C.chalk, marginTop: 4 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.recovery.nutrition.per28d")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <View key={label} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: col }}>{label}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: -0.5, color: C.chalk, marginTop: 6 }}>{val}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{unit}</Text>
              </View>
            ))}
          </View>
          {summary.macroSplit ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.macroBalance")}</Text>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C.amber, txt(C, C.amber)], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C.violet, txt(C, C.violet)]] as const).map(([label, pct, col, colT]) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: colT, width: 52 }}>{t(label)}</Text>
                  <View style={{ flex: 1, height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink2, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 4, borderRadius: RADIUS.pill, backgroundColor: col }} /></View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, width: 30, textAlign: "right" }}>{pct}%</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!full ? (
            <Pressable onPress={onUpgrade} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, backgroundColor: `${pa.fill}17`, borderWidth: 1, borderColor: `${pa.fill}4d`, borderRadius: 16, padding: 16 }}>
              <Glyph name="spark" size={19} color={pa.text} strokeWidth={5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.deepInsights")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ACard>
  );
}

// The guided 3-step onboarding: goal → activity + weigh-in → ✦ trial. Choice
// cards carry no emoji — the label, sub and radio do the work.
const MACT: { id: string; labelKey: string; subKey: string }[] = [
  { id: "light", labelKey: "w.recovery.nutrition.actLight", subKey: "w.recovery.nutrition.actLightSub" },
  { id: "moderate", labelKey: "w.recovery.nutrition.actModerate", subKey: "w.recovery.nutrition.actModerateSub" },
  { id: "high", labelKey: "w.recovery.nutrition.actHigh", subKey: "w.recovery.nutrition.actHighSub" },
];
function OnboardingGoal({ goal, setGoal, onUpgrade, onWeighIn, onContinueFree, currentWeightKg }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; onWeighIn: (kg: number) => void; onContinueFree: () => void; currentWeightKg?: number }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("moderate");
  const [weight, setWeight] = useState("");
  const GOAL_OPTS: { id: NutritionGoal; label: string; sub: string }[] = [
    { id: "lose", label: t("w.recovery.nutrition.goalLose"), sub: t("w.recovery.nutrition.goalLoseSub") },
    { id: "maintain", label: t("w.recovery.nutrition.goalMaintain"), sub: t("w.recovery.nutrition.goalMaintainSub") },
    { id: "gain", label: t("w.recovery.nutrition.goalGain"), sub: t("w.recovery.nutrition.goalGainSub") },
  ];
  const choice = (on: boolean, label: string, sub: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: on ? 2 : 1, borderColor: on ? C.lime : C.line, borderRadius: 16, padding: on ? 15 : 16, marginBottom: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{label}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{sub}</Text></View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={C.onAccent} /> : null}</View>
    </Pressable>
  );
  const primary = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center", marginTop: 6 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: C.onAccent }}>{label}</Text></Pressable>
  );
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {step > 0 ? <Pressable onPress={() => setStep((s) => s - 1)} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={16} color={C.chalk} /></Pressable> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</Text>
      </View>
      <View style={{ height: 4, borderRadius: RADIUS.pill, backgroundColor: C.ink, overflow: "hidden", marginTop: 12 }}><View style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, backgroundColor: C.lime }} /></View>

      {step === 0 ? (
        <View style={{ marginTop: 24 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickGoal")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickGoalSub")}</Text>
          {GOAL_OPTS.map((o) => choice(goal === o.id, o.label, o.sub, () => setGoal(o.id)))}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ marginTop: 24 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickActivity")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickActivitySub")}</Text>
          {MACT.map((a) => choice(activity === a.id, t(a.labelKey), t(a.subKey), () => setActivity(a.id)))}
          <ACard solid style={{ marginTop: 4 }}>
            {currentWeightKg != null ? (
              /* Profile already has a weight — reuse it, don't ask again. */
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.currentWeight")}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.5, color: C.chalk, marginTop: 6 }}>{currentWeightKg}<Text style={{ fontFamily: F.mono, fontSize: 14, color: C.ash }}> kg</Text></Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6 }}>{t("w.recovery.nutrition.weightFromProfile")}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addWeighIn")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.addWeighIn")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12, textAlign: "center" }} />
                  <Pressable onPress={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 16, justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.save")}</Text></Pressable>
                </View>
              </>
            )}
          </ACard>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ marginTop: 24 }}>
          <ACard solid style={{ alignItems: "center", paddingVertical: 20, backgroundColor: `${pa.fill}14`, borderColor: `${pa.fill}4d` }}>
            <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text></View>
            <AHeading style={{ fontSize: 22, marginTop: 16, textAlign: "center" }}>{t("w.recovery.nutrition.trialTitle")}</AHeading>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: leading(fs.caption) }}>{t("w.recovery.nutrition.trialSub")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.5, color: C.chalk, marginTop: 16 }}>$9.99<Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</Text>
            <Pressable onPress={onUpgrade} style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: pa.fill, borderRadius: 16, paddingVertical: 16, marginTop: 16 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: pa.ink }}>{t("w.recovery.nutrition.startTrial")}</Text><Glyph name="chevron" size={15} color={pa.ink} strokeWidth={6} /></Pressable>
          </ACard>
          {/* The FREE alternative — a limited plan to start on now, no card
              needed. Full is the trial card above; this is the way out that
              isn't an upgrade. */}
          <ACard solid style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.freePlanTitle")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.recovery.nutrition.freePlanSub")}</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              {["w.recovery.nutrition.freeBulletLogging", "w.recovery.nutrition.freeBulletMeals", "w.recovery.nutrition.freeBulletProducts", "w.recovery.nutrition.freeBulletInsights"].map((k) => (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                  <AuroraIcon name="check" size={15} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t(k)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={onContinueFree} accessibilityRole="button" style={{ marginTop: 16, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.continueFree")}</Text>
            </Pressable>
          </ACard>
        </View>
      ) : null}
    </View>
  );
}

// One quadrant tile of the compact Add-a-meal entry: a labelled big-number field
// (kcal / protein / carbs / fat) in the macro's own colour.
function QuadTile({ field, label, unit, color, value, onChange }: { field: string; label: string; unit: string; color: string; value: string; onChange: (v: string) => void }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 4 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ flex: 1, fontFamily: F.black, fontSize: 26, letterSpacing: -1, color: C.chalk, paddingVertical: 2 }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 6 }}>{unit}</Text>
      </View>
    </View>
  );
}

function Cell({ value, onChange, ph, inputRef }: { value: string; onChange: (v: string) => void; ph: string; inputRef?: React.RefObject<TextInput | null> }) {
  const { palette: C } = useTheme();
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      placeholder={ph}
      placeholderTextColor={C.ash}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 12, textAlign: "center" }}
    />
  );
}
