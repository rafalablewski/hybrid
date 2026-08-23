import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Share, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { SvgXml } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NUTRITION_FAVS_KEY, NUTRITION_RECENT_KEY } from "@hybrid/core";
import { getPref, setPref } from "../../lib/synced-prefs";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  HERO,
  HERO_INLINE_TITLE,
  todayNutrition,
  adaptiveTargets,
  fuelToday, hydrationToday,
  canSaveRecipe, emptyUserRecipe, recipeToLog, libraryRecipeToLog, type UserRecipe, type RecipeSource,
  NAV_SURFACE_RECIPES, recipeShareView, recipeShareText, recipeLibraryShareLink, savedRecipes,
  userRecipeShareText, libraryRecipeToUserRecipe,
  type CopyPlan, type CopyableEntry,
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
  nutritionAnalytics,
  type AnalyticsWindow,
  type QuickAddCandidate,
  type QuickAddDraft,
  type QuickAddMatch,
  resolveTargets,
  targetMismatch,
  hasOverride,
  type TargetOverride,
  SERVING_UNITS,
  composeServingLabel,
  parseServing,
  servingGrams as servingGramsOf,
  unitById,
  portionUnits, portionUnit, portionMeasure, portionQty, portionAmount, portionStep, portionEquivalent,
  loggedPortionOf, loggedAmountLabel, loggedAmountShown, stepLoggedPortion, rescaleLoggedAmount,
  parseFoodPortions, dedupePortions, usualAmounts, usualLogPortion, MAX_FOOD_PORTIONS,
  foodPortions, removeFoodPortion, namedPortionUnits, oneOfPortion,
  formatAmount, parsePackSize, type PortionUnit, type FoodPortion, type PortionSource,
  trainingEnergyOnDay,
  localDayKey,
  localTodayKey,
  sumMealComponents, recipeToMeal,
  nutritionHubSeries,
  RECIPES, formatIngredient, isHighProtein, recipeById, recipeCoverView, searchRecipes,
  recipeShelves, recipesInCollection, recipeLibraryCoverView, recipeCollectionCoverView, recipeCardStats, recipeCookView,
  resolveMealParts, mealPartKey, DEFAULT_MEAL_PART_KEYS, MAX_CUSTOM_MEAL_PARTS,
  type NutritionMealPart, type MealPartDef,
  type NutritionGoal,
  type MealPreset,
  type GlyphName,
  type FoodHit,
  type MicroFacts, type VerifiedStamp,
  per100g, emptyNutritionDay, panelStatus,
  VERIFIED_SOURCES, verifiedFoodsBySource as vfBySource,
  verifiedSource, verifiedFood, verifiedFoodToHit, verifiedFoodsBySource, relatedVerifiedFoods,
  sourceCheckedOn, kj, verifiedFreshness, type Recipe, type RecipeCollection,
  dedupeCandidates, pickerAnswer, pickerRemoteQuery, pickerSubmit, quickAddVocab, macroDraft, quickAddDraft,
  recordLog, usualAtHour, nutritionGap, nutritionFigures, figureText, wouldOvershoot,
  NAV_SURFACE_FOOD_PICKER,
  type PickerSourceKey,
  ALPHA, GHOST_PLACEHOLDER_ALPHA, STATE_OPACITY } from "@hybrid/core";
import {
  logBodyweight, getAssignedDiet, scanNutritionLabel,
  fetchSavedMeals, createSavedMeal, deleteSavedMeal,
  fetchFoodProducts, createFoodProduct, updateFoodProduct, deleteFoodProduct, searchFoods,
  getNutritionPrefs, saveNutritionPrefs as apiSaveNutritionPrefs,
  fetchFoodLogs, createFoodLog, updateFoodLogQty, scaleFoodLog, deleteFoodLog,
  fetchWaterLogs, logWater, deleteSignal,
  fetchUserRecipes, saveUserRecipe as apiSaveUserRecipe, deleteUserRecipe as apiDeleteUserRecipe,
  copyFoodLogs,
  type SavedMealRow, type FoodProductRow, type FoodLogRow, type WaterLog as WaterLogRow,
} from "../../lib/api";
import { useSignalsQuery, useSessionsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { usePersona } from "../../lib/persona";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { CtaLabel } from "./cta-label";
import RailTail from "./rail-tail";
import { usePremiumAccent } from "../../lib/premium-accent";
import { F, FIXED_FONT_SCALE, HIT_SLOP, MAX_FONT_SCALE, PressScale, PressScale as Pressable, fs, leading, space, trackFigure, tracking, ty} from "../../lib/ui";
import { useListMotion } from "../../lib/list-motion";
import { usePublishNavSurface } from "../../lib/nav-surface";
import { RecipeShareCard, shareCardImage } from "../../lib/share";
import { toast } from "./toast";
import { CookStepTimer } from "./cook-timer";
import { CookAwake } from "./cook-awake";
import { toggleSavedRecipeId, useSavedRecipeIds } from "../../lib/recipe-saved";
import { haptic } from "../../lib/haptics";
import { AuroraScreen, ACard, AChoice, APressCard, AField, ASearch, APill, AHeading, AMeter, Empty, GUTTER, RADIUS, CARD_PAD, Ring, ASection } from "./kit";
import { HeroAction, HeroNav } from "./hero";
import { SHARE_MARK } from "./share-mark";
import { GlassSelectMenu, LIQUID_GLASS_RENDERED } from "./swiftui";
import { AppHeader } from "./app-header";
import { HubMasthead } from "./hub-masthead";
import { CoverScreen, type CoverScreenApi } from "../plan-hero";
import FetchError from "./fetch-error";
import { AuroraIcon, Glyph } from "./icons";
import Sheet from "./sheet";
import { useConfirm } from "./confirm";
import { NutritionHubBento } from "./nutrition-hub";
import BodyProgress from "./body-progress";
import WaterCard from "./water";
import { UserRecipeShelf, UserRecipeEditor, toUserRecipe, toRecipeBody, type RecipeRow } from "./user-recipes";
import CopyDaySheet from "./copy-day";
import NutritionTrends from "./nutrition-trends";
import { PickerField, Understood, NoneOfYours } from "./quick-add";
import BarcodeScanSheet from "./barcode-scan";
import {
  VerifiedMark, MarkPlate, FactsPanel, FoodRow, SourceSwitch, PickerDoor, DayGap, MacroLedger, MACRO_FILL, PICKER_EDGE, BLOCK,
  presetGlyph, macroKcal, savedFoodMenu, packMenu, FoldChevron, type RowPortion,
} from "./nutrition-kit";
import { HoldMenu, type HoldMenuItem } from "../hold-menu";
import {
  collectionTitle, CollectionRail, RecipeShelf, RecipeTile, CookPlate, RecipeCard, SavedRecipeShelf,
} from "./recipe-library";
import {
  CDivider, WeightTrend, NutritionNudgeLine, SummaryDashboard, OnboardingGoal, QuadTile, Cell,
} from "./nutrition-panels";
import TargetSheet, { TargetMismatchLine } from "./target-sheet";
import { PantryScreen, PantrySearchToggle, UndoToast, UNDO_MS } from "./pantry";
import GroupMark from "./group-mark";
import { RollingNumber } from "./rolling-number";
import { withAlpha } from "./field";

const GOALS: { id: NutritionGoal; labelKey: string }[] = [
  { id: "lose", labelKey: "w.recovery.nutrition.goalLose" },
  { id: "maintain", labelKey: "w.recovery.nutrition.goalMaintain" },
  { id: "gain", labelKey: "w.recovery.nutrition.goalGain" },
];

// One monoline icon voice for the whole Nutrition surface (no emoji) — the shared
// 72×72 stroke paths as true vectors, at the same weight as AuroraSvgIcon so they
// sit beside the app's kit icons as one family.
type NutView = "home" | "log" | "insights" | "diary" | "body" | "meals" | "foods" | "add" | "create" | "recipes" | "collection" | "recipe" | "cook" | "food" | "source" | "sources" | "myRecipe";
// The part of the day a log is attributed to, carried into the Signal `source`.
// The four built-ins plus any custom parts a Full user added — a plain key
// string, not a closed union.
type MealType = string;
const MEAL_TYPES = DEFAULT_MEAL_PART_KEYS;
// Over-target: the calorie ring and its number flip red past the SAME 5% grace
// band (web parity — one threshold, both surfaces).
// Where 'over' begins — the shared band, so the hub's ring and the picker's
// header cannot disagree about it (core/nutrition-gap.ts).
const mealGlyph = (m: string): GlyphName => m === "breakfast" ? "sunrise" : m === "lunch" ? "sun" : m === "dinner" ? "moon" : m === "snack" ? "cup" : "bowl";
/** A serving weight recovered from its label, EXACT conversions only — a
 *  volume weight is an assumption (see serving-units.ts) and must not be
 *  handed to anything that treats it as measured. */
const exactGrams = (label: string | null | undefined): number | null => {
  const g = servingGramsOf(parseServing(label));
  return g && !g.assumed ? g.grams : null;
};
/** The servings unit every food has — core's own definition of the half-serving
 *  grid, borrowed by the Diary's row stepper so the two cannot drift apart. */
const SERVINGS_UNIT: PortionUnit = portionUnits({})[0]!;
/** One press of the Diary row's −/+, in servings, capped where it always was. */
const entryStep = (shown: number, direction: number): number => portionStep(shown, SERVINGS_UNIT, direction, 50);
// A locally-persisted food the picker can re-log (Recent MRU + Favorites) — the
// same macro shape the portion editor writes, kept per-device so the two tabs
// work without a backend change.
type QuickFood = { key: string; name: string; subname?: string | null; serving: string; kcal: number; protein: number; carbs: number; fat: number } & MicroFacts & { verified?: VerifiedStamp; verifiedId?: string | null; servingGrams?: number | null }
  /** the portions this food comes in, carried so re-logging a Recent still
   *  offers "the whole bottle" — a recent is a food PLUS its serving, and a
   *  copy that dropped them would quietly lose units the pantry row had */
  & { portions?: FoodPortion[] | null }
  /** WHEN this exact (food, serving) was logged — epoch ms, capped. Written
   *  on every log; read by usualAtHour so the picker can open on what this
   *  athlete actually eats at this time of day. Per-device, like the MRU
   *  itself; an entry saved before this shipped simply has no history yet. */
  & { logs?: number[] | null };

// Small stroke icons for the redesigned flows (close, chevron, barcode, trash,
// restart, star, bolt, plus-box) — inline react-native-svg so the mockup chrome
// renders exactly, at the same monoline weight as the rest of the surface.
/**
 * A saved food's portions, COMPLETE.
 *
 * Every read of a product's packs goes through this rather than the shorter
 * `parseFoodPortions(p.portions)` that used to be written at each site, because
 * that spelling silently DROPS the legacy pack: a food saved before the list
 * existed keeps its bottle in the `packSize`/`packLabel` columns, and only
 * core's `foodPortions` folds those back in. The two spellings disagreed in
 * exactly the way that is hardest to notice — the pantry row offered the bottle
 * (it read the row) and the portion editor did not (it read the parsed list).
 */
const productPortions = (p: FoodProductRow): FoodPortion[] =>
  foodPortions({
    serving: p.servingLabel,
    servingGrams: p.servingGrams,
    portions: parseFoodPortions(p.portions),
    packSize: p.packSize,
    packLabel: p.packLabel,
  });

/** What it takes to name a food's packs — the three fields a saved product, a
 *  recent and a search hit all already carry. */
type PackedFood = { serving?: string | null; servingGrams?: number | null; portions?: FoodPortion[] | null };
/** …and what it takes to log one of them. */
type LoggablePack = PackedFood & MicroFacts
  & { name: string; subname?: string | null; kcal: number; protein: number; carbs: number; fat: number; verifiedId?: string | null };

/**
 * A PACK BEING TYPED — one row of the Create Food form's pack list.
 *
 * The form used to offer exactly ONE, and the data model has held a LIST since
 * portions shipped, because real foods have several: a cheese has a slice and a
 * block, a bread has a slice and a loaf, and the kefir this feature was asked
 * for has a bottle and a glass. One field could only ever record whichever the
 * athlete happened to type first, and the second one had to be found later, at
 * the bottom of the portion editor, one food at a time.
 *
 * `key` is a stable identity for the row, minted here rather than derived from
 * the values: the fields are edited keystroke by keystroke, so a key made of
 * size-plus-label changes under the finger and remounts the input being typed
 * into. `source` rides along so a size the CATALOG published stays marked as
 * the catalog's until somebody changes it — the form shows the whole truth
 * about the food's packs now, and the whole truth includes where each came from.
 */
type CreatePack = { key: string; size: string; label: string; source: PortionSource };
let packKeySeq = 0;
const newPackKey = () => `pk${++packKeySeq}`;
const packRow = (p: FoodPortion): CreatePack => ({ key: newPackKey(), size: formatAmount(p.size), label: p.label, source: p.source });

const BLANK_CREATE_FORM = {
  name: "",
  subname: "",
  /**
   * 100, NOT BLANK — the number a food label is actually written per, and the
   * one this module's own doctrine uses as its example ("a food saved the way a
   * label is written — Kefir, 100 g, 50 kcal", core/portion.ts).
   *
   * Blank was not a neutral default, it was a broken one. The serving row still
   * DISPLAYED "per 1 Grams" through the field's placeholder, but every reader of
   * the serving guarded on the text being non-empty — so a fresh form had no
   * measure, which meant THE PACKS BLOCK DID NOT RENDER AT ALL until a number
   * was typed into a field that already looked filled in. The one flow that
   * exists to record a pack at creation time could not reach the control.
   *
   * It was wrong on the way out too: a food saved without touching the field
   * went to the database as the column default "1 serving" while the screen had
   * said grams, so it arrived with no measure and could never be weighed or
   * carry a pack — the screen and the store describing two different foods.
   */
  serving: "100",
  /**
   * "g", THE REGISTRY ID — not "gram", which is only an ALIAS.
   *
   * `unitById` (what `composeServingLabel` and the form's own `unitLabel` both
   * call) matches ids exactly; the alias table is read by `parseServing`, on the
   * way IN from free text. So the default resolved to nothing at both ends: the
   * serving row printed the raw string ("per 1 gram", where every other unit
   * prints a symbol), and the composer fell through to its `serving` fallback
   * and stored "1 serving". Every food created without opening the unit picker
   * was therefore saved as a COUNT — no measure, so it could never be weighed,
   * and no measure means no pack, on a screen whose whole subject is packs.
   *
   * Picking Grams by hand always worked, because the picker writes ids straight
   * off SERVING_UNITS. Only the default was wrong, which is why it survived: the
   * one path nobody clicks through when testing the thing they just built.
   */
  unit: "g",
  kcal: "", carbs: "", protein: "", fat: "",
  satFat: "", sugar: "", fiber: "", salt: "",
  // The containers this comes in, and what to call each — so the whole bottle
  // is one tap on the row rather than arithmetic (core/portion.ts).
  packs: [] as CreatePack[],
};

// The HYBRID Verified mark — the same quiet lime tick the verified-coach badge
// uses, so "checked by us" reads identically wherever it appears in the app.
export default function AuroraNutrition({ compact = false, root = false, onNavigateFull, onUpgrade, openFood, openSource, openRecipe: openRecipeId, openRecipes }: {
  compact?: boolean;
  /** Rendered as a BOTTOM-NAV tab root (app/(tabs)/nutrition.tsx) rather than a
   *  pushed screen: there is nothing beneath it in the stack, so the masthead
   *  drops its back button — a back arrow on a tab root is a dead control. */
  root?: boolean;
  onNavigateFull?: () => void;
  onUpgrade?: () => void;
  /** land directly on a verified product page — the deep-link entry (app/food/[id]) */
  openFood?: string;
  /** Land on a recipe by id — the cross-app search's recipe results. */
  openRecipe?: string;
  /** Land on the LIBRARY itself — what a shared library link addresses. */
  openRecipes?: boolean;
  /** land directly on a verified source page (app/source/[id]) */
  openSource?: string;
} = {}) {
  const { notify } = useConfirm();
  const { palette: C } = useTheme();
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
  // The athlete's display unit — Body & progress logs weight in it (kg or lb),
  // the same preference the logger and every tonnage figure read.
  const units = useLoggerPrefs().units;
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
  // The source line's selection. Opens on RECENT, not Foods: the list you
  // want at 21:12 is what you just ate, not the whole library.
  const [foodTab, setFoodTab] = useState<PickerSourceKey>("recent");
  const [quickLog, setQuickLog] = useState(false); // the Quick Log sheet
  // Create form (blend: title plate + macro hero) — one form for a PRODUCT or a
  // MEAL. Name + the personal Subname on the plate; serving + unit (products
  // only) compose the stored servingLabel, e.g. 100 + "g" → "100 g".
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
  // `name` seeds the form from the picker's unmatched query: the door says
  // "New food: zupa", so arriving at an empty Name field would be the screen
  // forgetting the word it just quoted back.
  const openCreate = (mode: "product" | "meal", name = "") => { setCreateMode(mode); setMealComps([]); setEditingProduct(null); setCreateForm({ ...BLANK_CREATE_FORM, name }); setView("create"); };

  // ── EDITING A SAVED FOOD — the same form, prefilled, saving with PATCH.
  //    A second form would drift from the first (the de-clutter pass deleted an
  //    inline builder for exactly that reason), and delete-and-recreate is not
  //    an option: a new id breaks every recipe ingredient pointing at the old
  //    one. So a typo in a serving label used to be permanent for any food a
  //    recipe used.
  const [editingProduct, setEditingProduct] = useState<FoodProductRow | null>(null);
  const openEditProduct = (p: FoodProductRow) => {
    const parsedServing = parseServing(p.servingLabel);
    const num = (v: number | null | undefined) => (v == null ? "" : String(v));
    setCreateMode("product");
    setMealComps([]);
    setEditingProduct(p);
    setCreateForm({
      name: p.name, subname: p.subname ?? "",
      // The serving is stored as text and read back through the same parser
      // that wrote it, so the form reopens on the quantity and unit the athlete
      // actually chose rather than on a re-guess of their label.
      serving: String(parsedServing.qty),
      unit: parsedServing.unit ?? "serving",
      kcal: num(p.kcal), carbs: num(p.carbs), protein: num(p.protein), fat: num(p.fat),
      satFat: num(p.satFat), sugar: num(p.sugar), fiber: num(p.fiber), salt: num(p.salt),
      // EVERY pack the food has, whatever put it there — the athlete's, the
      // catalog's, a scan's, and the single one the legacy columns still hold.
      // The form used to show only the typed one, on the argument that this is
      // where the athlete states what they know rather than where they overwrite
      // what the database published. That was right about authorship and wrong
      // about the screen: a pack you cannot SEE is a pack you cannot correct or
      // remove, and a wrong 6-pack net quantity is exactly the thing somebody
      // opens this form to fix. Each row still says where it came from.
      packs: productPortions(p).map(packRow),
    });
    setShowPanelFields([p.satFat, p.sugar, p.fiber, p.salt].some((v) => v != null));
    setView("create");
  };
  // The Create form's pack list — grow it, type into it, take a row off it. A
  // row EDITED becomes the athlete's own: correcting a size the catalog
  // published is exactly the moment their figure starts outranking it, which is
  // the tie-break core's SOURCE_RANK already encodes.
  const addPack = () => {
    if (createForm.packs.length >= MAX_FOOD_PORTIONS) { haptic.rigid(); return; } // as far as it goes
    haptic.light();
    listMotion(() => setCreateForm((s) => ({ ...s, packs: [...s.packs, { key: newPackKey(), size: "", label: "", source: "typed" }] })));
  };
  const setPack = (key: string, patch: Partial<Pick<CreatePack, "size" | "label">>) =>
    setCreateForm((s) => ({ ...s, packs: s.packs.map((p) => p.key === key ? { ...p, ...patch, source: "typed" } : p) }));
  const removePack = (key: string) => listMotion(() => setCreateForm((s) => ({ ...s, packs: s.packs.filter((p) => p.key !== key) })));

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
    setRecent(getPref<QuickFood[]>(NUTRITION_RECENT_KEY, []));
    setFavorites(getPref<QuickFood[]>(NUTRITION_FAVS_KEY, []));
  }, []);
  // Every log STAMPS the entry, carrying forward the hours it was already
  // logged at, so the picker can open on what this athlete eats at this time
  // of day (core/hour-recents.ts). Per-device, no schema change.
  const pushRecent = (q: QuickFood) => setRecent((xs) => {
    const prev = xs.find((x) => x.key === q.key);
    // The STORED history wins: the caller's copy can be a snapshot taken
    // before the last write (a double tap, or a favourite holding a frozen
    // copy of the entry), and stamping that would drop a log.
    const stamped = { ...q, logs: recordLog(prev?.logs ?? q.logs, Date.now()) };
    const next = [stamped, ...xs.filter((x) => x.key !== q.key)].slice(0, 20);
    setPref(NUTRITION_RECENT_KEY, next);
    return next;
  });
  const isFavorite = (key: string) => favorites.some((x) => x.key === key);
  const toggleFavorite = (q: QuickFood) => setFavorites((xs) => { const next = xs.some((x) => x.key === q.key) ? xs.filter((x) => x.key !== q.key) : [q, ...xs]; setPref(NUTRITION_FAVS_KEY, next); return next; });
  /**
   * FORGET A RECENT. The MRU is written on every log and could never be edited,
   * so one mistyped quick entry sat at the top of the picker for the next twenty
   * meals — and the athlete's own recents are exactly where the app claims to be
   * remembering FOR them. Held, like everything else that was remembered.
   *
   * It also drops the food's HOURS with it (`logs`), because a habit is the
   * thing being forgotten: leaving the stamps behind would keep ranking a food
   * to the top of this hour after it was taken off the list.
   */
  const forgetRecent = (key: string) => {
    // The row LEAVES rather than teleporting, and the list closes over it —
    // lib/list-motion, the same commit the logger's set rows travel on. This is
    // the moment the athlete caused, which is where motion does its actual job.
    listMotion(() => setRecent((xs) => {
      const next = xs.filter((x) => x.key !== key);
      setPref(NUTRITION_RECENT_KEY, next);
      return next;
    }));
    haptic.warning();
  };
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
  // ── YOUR RECIPES — the athlete's own dishes.
  const [userRecipes, setUserRecipes] = useState<RecipeRow[]>([]);
  const [editRecipe, setEditRecipe] = useState<UserRecipe | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [userRecipeMsg, setUserRecipeMsg] = useState("");
  const [mealForm, setMealForm] = useState({ name: "", emoji: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const canSaveAnotherMeal = full || meals.length < FREE_MEAL_LIMIT;
  const canSaveAnotherProduct = full || products.length < FREE_PRODUCT_LIMIT;
  const loadLibrary = () => {
    fetchSavedMeals().then(setMeals).catch(() => {});
    fetchFoodProducts().then(setProducts).catch(() => {});
    fetchUserRecipes().then(setUserRecipes).catch(() => {});
  };
  useEffect(() => { loadLibrary(); }, []);
  // First-run onboarding is a separate flow (see the early return). Completion is
  // persisted SERVER-SIDE (/api/nutrition/prefs) so the wizard appears exactly
  // once and survives a device change — the old per-device flag was only set on
  // "Continue on Free", so starting the trial or just weighing in re-showed it.
  // AsyncStorage stays as a local cache; `hasNutritionData` is the safety net.
  const [onboarded, setOnboarded] = useState(false);
  const saveNutritionPrefs = useCallback((patch: { onboarded?: boolean; goal?: NutritionGoal; mealParts?: NutritionMealPart[]; targets?: TargetOverride | null }) => { apiSaveNutritionPrefs(patch); }, []);
  const finishOnboarding = useCallback(() => {
    AsyncStorage.setItem("hybrid.nutrition.onboarded", "1").catch(() => {});
    setOnboarded(true);
    saveNutritionPrefs({ onboarded: true, goal });
  }, [saveNutritionPrefs, goal]);
  // Choose the goal AND remember it (server + gate). A saved preference, not a
  // per-session default.
  const chooseGoal = useCallback((g: NutritionGoal) => { setGoal(g); saveNutritionPrefs({ goal: g }); }, [saveNutritionPrefs]);
  // MANUAL TARGETS — per field; null/absent means that figure keeps adapting.
  const [targetOverride, setTargetOverride] = useState<TargetOverride | null>(null);
  const [targetSheet, setTargetSheet] = useState(false);
  // Optimistic: the ring must move on save, not on the round-trip.
  const saveTargets = useCallback((next: TargetOverride | null) => {
    setTargetOverride(next);
    saveNutritionPrefs({ targets: next });
  }, [saveNutritionPrefs]);
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
      if (p.targets) setTargetOverride(p.targets as TargetOverride);
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
  // A mass/volume symbol is the same token in all three languages; only the
  // COUNT words are translated.
  const unitLabel = useCallback((id: string) => {
    const u = unitById(id);
    return !u ? id : u.kind === "count" ? t(`w.recovery.nutrition.unitOpt.${id}`) : u.symbol;
  }, [t]);

  const load = () => { refetch(); loadLibrary(); };
  useRefreshOnFocus(refetch);

  /**
   * THE PICKER'S OWN VERB, published to the bottom bar.
   *
   * While the add-to-meal picker is the visible surface, the bar's detached
   * circle stops offering Train — which is the one thing nobody is doing at
   * 23:08 with Snacks open — and becomes this screen's search: it brings the
   * field back under the thumb and puts the cursor in it. The field is IN FLOW
   * (deliberately — it scrolls with the decision it belongs to), so twenty rows
   * down there was no way back to it but to scroll, and the one place a thumb
   * already is on a phone is the bottom-right corner.
   *
   * `usePublishNavSurface` takes null everywhere but the picker, so the circle
   * is the dumbbell on every other nutrition view.
   */
  const pickerScroller = useRef<ScrollView | null>(null);
  const pickerInput = useRef<TextInput | null>(null);
  /**
   * SEARCH IS A STATE, NOT A PERMANENT BAND.
   *
   * The field used to sit under the day header on every visit. Once the bar's
   * detached circle carries this screen's Find, that is the same question asked
   * twice, ten inches apart — so the field is now what the circle OPENS, and
   * the resting screen is what the athlete came for: what the day owes, the
   * four sources, and the list. Same pattern the pantry already uses
   * (`searchOpen` there), with the toggle being the bar rather than a hero
   * accessory.
   *
   * Leaving search CLEARS the query, because a stale query behind a closed
   * field would leave the list showing search results with nothing on screen
   * explaining why.
   */
  const [pickerSearch, setPickerSearch] = useState(false);
  const openPickerSearch = useCallback(() => {
    // Already open — the press means "put me back in the field", which is the
    // whole point of the circle once the list has scrolled the field away.
    pickerScroller.current?.scrollTo({ y: 0, animated: true });
    if (pickerSearch) pickerInput.current?.focus();
    else setPickerSearch(true); // `autoFocus` takes it from here on mount
    haptic.light();
  }, [pickerSearch]);
  const closePickerSearch = useCallback(() => {
    setPickerSearch(false);
    setFoodQuery("");
  }, []);
  // Leaving the picker leaves search with it: coming back to Snacks tomorrow
  // should not reopen a keyboard over yesterday's question.
  useEffect(() => { if (view !== "add") closePickerSearch(); }, [view, closePickerSearch]);

  // ── Editable food log — the per-entry records the Diary lists + edit/delete.
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const listMotion = useListMotion();
  const loadLogs = useCallback(() => { fetchFoodLogs().then(setLogs).catch(() => {}); }, []);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  // Log one food/meal → creates the editable entry AND the mirrored Signals the
  // engines read (one round-trip). Per-serving macros + qty so it stays editable.
  const logEntry = async (e: { name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; amount?: number | null; amountUnit?: string | null; verifiedId?: string | null } & MicroFacts): Promise<boolean> => {
    const { ok } = await createFoodLog(e);
    if (!ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return false; }
    // A SOFT LANDING, and it belongs HERE rather than at the seven call sites.
    // lib/haptics asks for `soft` by name for a set being banked, and calls it
    // "the difference between logging a set and pressing a button that happens
    // to log a set" — a meal landing in the day is the same event. One gate, so
    // a path added later cannot arrive silent (which is exactly how four
    // ungated haptics got into the app before the `haptic` module existed).
    haptic.soft();
    return true;
  };
  // ── YOUR RECIPES — open, save, delete, log ───────────────────────────────
  // A recipe's macros are DERIVED from its ingredients (@hybrid/core
  // user-recipes.ts), so nothing here stores or asks for a macro figure.
  // The products library doubles as the ingredient source AND as what staleness
  // is checked against, projected once into the engine's RecipeSource shape.
  const recipeSources: RecipeSource[] = useMemo(
    () => products.map((p) => ({
      id: p.id,
      name: p.name,
      servingLabel: p.servingLabel,
      facts: { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, satFat: p.satFat ?? null, sugar: p.sugar ?? null, fiber: p.fiber ?? null, salt: p.salt ?? null },
    })),
    [products],
  );
  const openRecipeEditor = (r?: RecipeRow) => {
    setUserRecipeMsg("");
    // A never-saved recipe carries an empty id — that is what routes the save to
    // POST instead of PATCH, so there is no separate "isNew" flag to drift.
    setEditRecipe(r ? toUserRecipe(r) : { id: "", ...emptyUserRecipe() });
    setView("myRecipe");
  };
  /**
   * THE DETACHED NAV CIRCLE'S VERB, per surface (@hybrid/core nav-bar.ts).
   *
   * Two surfaces in this screen claim it: the add-to-meal picker (Find — it
   * brings the search field back under the thumb) and the RECIPES LIBRARY,
   * whose verb is writing another one. Both are `screen`-kind, so the native
   * trigger is disabled and the press comes back here.
   *
   * The library's press runs the SAME gate the shelf's own door row runs. A
   * circle that walked past the free cap would not be a shortcut, it would be a
   * way to hit a 403 with no explanation attached.
   */
  const navSurface = view === "add" ? NAV_SURFACE_FOOD_PICKER : view === "recipes" ? NAV_SURFACE_RECIPES : null;
  const runNavVerb = useCallback(() => {
    if (view === "add") { openPickerSearch(); return; }
    if (view !== "recipes") return;
    if (canSaveRecipe(persona, userRecipes.length)) openRecipeEditor();
    else router.push("/upgrade");
    // openRecipeEditor is stable for this purpose — it only ever sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, openPickerSearch, persona, userRecipes.length, router]);
  usePublishNavSurface(navSurface, runNavVerb);

  // ── SHARING A RECIPE, AND KEEPING ONE ────────────────────────────────────
  // The saved shelf is a set of ids on the device (lib/recipe-saved.ts over
  // core's own shape); the messages are core's `recipeShareText`, so the phone
  // formats nothing and translates nothing on its own.
  const savedIds = useSavedRecipeIds();
  const saved = useMemo(() => savedRecipes(savedIds), [savedIds]);
  // What the off-screen card is currently drawing. Set, captured one frame
  // later, cleared — the card is never on screen, it is a thing to photograph.
  const [cardRecipe, setCardRecipe] = useState<Recipe | null>(null);
  const cardRef = useRef<View>(null);

  const shareLabels = useMemo(
    () => ({
      meal: (m: Recipe["meal"]) => t(`w.recovery.nutrition.meal.${m}`),
      mins: (n: number) => `${n} ${t("w.recovery.nutrition.min")}`,
      serves: (n: number) => `${n} ${t("w.recovery.nutrition.serves")}`,
      macros: (m: { kcal: number; protein: number; carbs: number; fat: number }) =>
        t("w.recovery.nutrition.recipeShareMacros")
          .replace("{kcal}", String(m.kcal))
          .replace("{p}", String(m.protein))
          .replace("{c}", String(m.carbs))
          .replace("{f}", String(m.fat)),
      ingredientsHead: (n: number) =>
        `${t("w.recovery.nutrition.ingredients")} (${n} ${t("w.recovery.nutrition.serves")})`.toUpperCase(),
      methodHead: t("w.recovery.nutrition.method").toUpperCase(),
      optional: t("w.recovery.nutrition.recipeShareOptional"),
      credit: t("w.recovery.nutrition.recipeShareCredit"),
    }),
    [t],
  );

  /** The recipe as a message — the whole dish, then the link. A bare URL would
   *  reach somebody who has no app and no web page to open it with. */
  const shareRecipe = (r: Recipe, serves: number) => {
    Share.share({ message: recipeShareText(recipeShareView(r, serves, shareLabels)) }).catch(() => {
      /* dismissed */
    });
  };

  /** The ingredients ALONE, for the shopping-list-shaped job. It is a SHARE and
   *  not a copy because the clipboard is a native module this repo may only add
   *  through `npx expo install` (the one-set rule in CLAUDE.md), and the share
   *  sheet already offers Copy on both platforms. */
  const shareIngredients = (r: Recipe, serves: number) => {
    const v = recipeShareView(r, serves, shareLabels);
    Share.share({ message: [r.name, "", v.ingredientsHead, ...v.ingredients].join("\n") }).catch(() => {});
  };

  /** The recipe as an IMAGE, through the same capture path as the workout card.
   *  The card mounts off-screen, so it needs a frame before it can be shot. */
  const shareRecipeCard = async (r: Recipe, serves: number) => {
    setCardRecipe(r);
    await new Promise((done) => setTimeout(done, 80));
    await shareCardImage(cardRef, recipeShareText(recipeShareView(r, serves, shareLabels)), r.name);
    setCardRecipe(null);
  };

  const toggleSaveRecipe = (r: Recipe) => {
    const nowSaved = toggleSavedRecipeId(r.id);
    haptic.selection();
    toast(t(nowSaved ? "w.recovery.nutrition.recipeSavedToast" : "w.recovery.nutrition.recipeUnsavedToast"));
  };

  /** The rail's trailing control on a recipe — one glass circle presenting the
   *  four things worth doing with a dish. The rows are named here rather than
   *  in the renderer so the system menu and the RN fallback card can never
   *  offer different ones. */
  /**
   * MAKE IT MINE — the curated dish copied into Your recipes, editable.
   *
   * Every line is matched against foods that actually STATE their numbers (the
   * athlete's saved products, through core's recipe-match: exact names, exact
   * unit arithmetic, no guessing). A line that finds none arrives visibly
   * UNKNOWN rather than as a zero — which is the whole reason this could not be
   * built before `UserRecipeIngredient.unstated` existed. The copy is taken at
   * the serving count on screen, and the screen says how much of it came with
   * numbers, because "3 of 7 ingredients need their numbers" is the difference
   * between a draft you can finish and one you distrust.
   */
  const makeItMine = (r: Recipe, serves: number) => {
    if (!canSaveRecipe(persona, userRecipes.length)) { router.push("/upgrade"); return; }
    const { recipe: draft, matched, unmatched } = libraryRecipeToUserRecipe(r, serves, recipeSources);
    setEditRecipe({ id: "", ...draft });
    setUserRecipeMsg(
      unmatched === 0
        ? t("w.recovery.nutrition.recipeCopiedAll").replace("{n}", String(matched))
        : t("w.recovery.nutrition.recipeCopiedPartial").replace("{n}", String(unmatched)),
    );
    setView("myRecipe");
  };

  const recipeActions = (r: Recipe, serves: number) => ({
    items: [
      { key: "share", label: t("w.recovery.nutrition.recipeShareAction") },
      { key: "card", label: t("w.recovery.nutrition.recipeShareCard") },
      { key: "ingredients", label: t("w.recovery.nutrition.recipeCopyIngredients") },
      {
        key: "save",
        label: t(savedIds.includes(r.id) ? "w.recovery.nutrition.recipeUnsaveAction" : "w.recovery.nutrition.recipeSaveAction"),
      },
      { key: "mine", label: t("w.recovery.nutrition.recipeMakeMine") },
    ],
    onSelect: (key: string) => {
      if (key === "share") shareRecipe(r, serves);
      else if (key === "card") void shareRecipeCard(r, serves);
      else if (key === "ingredients") shareIngredients(r, serves);
      else if (key === "save") toggleSaveRecipe(r);
      else if (key === "mine") makeItMine(r, serves);
    },
  });

  const saveRecipe = async () => {
    if (!editRecipe) return;
    if (!editRecipe.name.trim()) { setUserRecipeMsg(t("w.recovery.nutrition.recipeNeedsName")); return; }
    setRecipeSaving(true);
    const { recipe, upgrade } = await apiSaveUserRecipe(toRecipeBody(editRecipe), editRecipe.id || undefined);
    setRecipeSaving(false);
    if (upgrade) { router.push("/upgrade"); return; }
    if (!recipe) { setUserRecipeMsg(t("w.recovery.nutrition.recipeNotMigrated")); return; }
    // Adopt the SERVER's row: it carries the real ingredient ids the editor keys
    // its rows by, so a second save must not send the client-side "new:" ids.
    setEditRecipe(toUserRecipe(recipe));
    loadLibrary();
    setView("recipes");
  };
  const removeRecipe = async () => {
    if (!editRecipe?.id) { setView("recipes"); return; }
    const id = editRecipe.id;
    setUserRecipes((xs) => xs.filter((x) => x.id !== id));
    setView("recipes");
    await apiDeleteUserRecipe(id);
    loadLibrary();
  };
  // Logging a recipe writes a NORMAL food entry — per single serving with a
  // separate quantity — so the Diary's own stepper rescales it afterwards and a
  // recipe never becomes a row the diary cannot edit.
  const logRecipe = async (qty: number) => {
    if (!editRecipe) return;
    const draft = recipeToLog(editRecipe, qty);
    const ok = await logEntry({
      name: draft.name,
      subname: draft.subname,
      source: mealType,
      kcal: draft.facts.kcal,
      protein: draft.facts.protein,
      carbs: draft.facts.carbs,
      fat: draft.facts.fat,
      satFat: draft.facts.satFat,
      sugar: draft.facts.sugar,
      fiber: draft.facts.fiber,
      salt: draft.facts.salt,
      qty: draft.qty,
    });
    if (ok) { setUserRecipeMsg(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType))); loadLogs(); refetch(); revalidate.recovery(); }
  };

  // ── COPY A DAY — "yesterday's breakfast is today's breakfast" ────────────
  // The plan comes from @hybrid/core (copyDayPlan) and is written by the batch
  // endpoint, which runs each entry through the SAME writer a hand-typed entry
  // uses — so a copied day is not a special kind of day.
  const [copySheet, setCopySheet] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const runCopy = async (plan: CopyPlan) => {
    setCopyBusy(true); setCopyMsg("");
    const { written, failed, ok } = await copyFoodLogs(plan.entries as unknown as Record<string, unknown>[]);
    setCopyBusy(false);
    if (!ok) { setCopyMsg(t("w.recovery.nutrition.copyFailed")); return; }
    // A partial write is reported as a partial write — the batch is
    // deliberately not transactional, so claiming a clean copy when two rows
    // fell over would be a lie the diary contradicts.
    setCopyMsg(
      failed > 0
        ? t("w.recovery.nutrition.copyPartial").replace("{n}", String(written)).replace("{f}", String(failed))
        : t("w.recovery.nutrition.copyDone").replace("{n}", String(written)),
    );
    loadLogs(); refetch(); revalidate.recovery();
    if (failed === 0) setCopySheet(false);
  };

  // The AMOUNT moves with the quantity, by the same ratio — locally for the
  // optimistic row, and again on the server for the stored one, from the same
  // core rule, so the two cannot land on different numbers.
  const editLogQty = async (id: string, qty: number) => {
    setLogs((xs) => xs.map((x) => x.id === id
      ? { ...x, qty, amount: rescaleLoggedAmount(x.amount, x.qty, qty) ?? x.amount }
      : x)); // optimistic
    await updateFoodLogQty(id, qty);
    loadLogs(); refetch(); revalidate.recovery();
  };
  const deleteLogEntry = async (id: string) => {
    // The OPTIMISTIC removal is what the eye sees, so it is the one that has to
    // travel — the server round-trip below lands long after the gap has closed.
    listMotion(() => setLogs((xs) => xs.filter((x) => x.id !== id)));
    await deleteFoodLog(id);
    loadLogs(); refetch(); revalidate.recovery();
  };
  // A DERIVED entry (Signals only, no FoodLog row) has no per-serving base, so
  // its stepper is a relative multiplier: each press rescales the stored
  // readings by the ratio between the new multiplier and the previous one. The
  // multiplier is per-visit UI state — the amounts on screen are always the
  // server's own numbers.
  const [derivedScale, setDerivedScale] = useState<Record<string, number>>({});
  /** One press of a row's −/+. A real entry steps in ITS OWN unit (core
   *  stepLoggedPortion): grams for a weighed portion, half a bottle for a pack,
   *  half a serving for everything else. A derived entry has no unit and no
   *  per-serving base, so its multiplier keeps the half-step it always had. */
  const stepEntry = async (l: FoodLogRow, direction: number) => {
    if (!l.derived) { await editLogQty(l.id, stepLoggedPortion(l, direction).qty); return; }
    const prev = derivedScale[l.id] ?? 1;
    const next = entryStep(prev, direction);
    if (next === prev) return;
    setDerivedScale((m) => ({ ...m, [l.id]: next }));
    await scaleFoodLog(l.id, next / prev);
    loadLogs(); refetch(); revalidate.recovery();
  };

  // ── Portion & quantity — logging any food/meal opens a sheet where an
  //    amount × unit stepper scales the macros LIVE before they're written.
  //    One editor for an OFF search hit (offers Save too), a saved food, or a
  //    saved meal, so scaling isn't just for the database.
  //
  //    THE NUMBER HAS A UNIT (core/portion.ts). It used to count servings and
  //    nothing else, so a food saved the way a label is written — "100 g" —
  //    could be logged as 1 or 1.5 servings and never as the 35 g the scale
  //    read, nor as the whole 400 ml bottle. Every unit the food can honestly
  //    be measured in is offered instead, and each converts through the same
  //    multiplication, so the diary still stores exactly what it stored before:
  //    per-serving macros with a quantity.
  const [portion, setPortion] = useState<
    ({ name: string; subname?: string | null; subtitle?: string; serving: string; kcal: number; protein: number; carbs: number; fat: number; offFood?: FoodHit; servingGrams?: number | null; verified?: VerifiedStamp; verifiedId?: string | null } & MicroFacts
      /** the saved product this came from, when it is one — a new portion is
       *  written back to it, so it must be a row and not a copy */
      & { productId?: string | null; portions?: FoodPortion[] | null }) | null
  >(null);
  const [portionUnitId, setPortionUnitId] = useState<string>("servings");
  // The amount is TEXT, not a number: a half-typed "0." has to survive the
  // keystroke it takes to become "0.35", which a numeric state would round away.
  const [portionText, setPortionText] = useState("1");
  const [packMsg, setPackMsg] = useState("");
  /** The label panel's fold. Closed on every open: the sheet's job is to log a
   *  food you already trust, and a panel that remembered being open would make
   *  the next food's sheet a different height for no reason the athlete gave. */
  const [portionFacts, setPortionFacts] = useState(false);
  const openPortion = (base: NonNullable<typeof portion>) => {
    // OPENS ON THE FOOD'S OWN MEASURE when it has one, and on servings when it
    // does not.
    //
    // It used to open on servings always, on the argument that the unit switch
    // is an offer and never a surprise. Nothing about that is given up here: a
    // measure's `initial` IS one serving's worth (100 for a "100 g" food), so
    // the sheet opens on exactly the same PORTION it always did — only the unit
    // the number is expressed in changes, and the equivalent line under the
    // stepper states the other reading. What it costs is the tap it used to take
    // to say "grams" before a weight could be typed, on the single most common
    // thing anybody does on this screen: putting the food on a scale. It also
    // brings the learned amounts on screen at once, since those are offered on
    // the measure — a second tap saved for the foods logged most often.
    const units = portionUnits({ serving: base.serving, servingGrams: base.servingGrams, portions: base.portions });
    const measure = portionUnit(units, "measure");
    setPortionUnitId(measure ? "measure" : "servings");
    setPortionText(formatAmount(measure ? measure.initial : 1));
    setPackMsg("");
    setPortionFacts(false);
    setPortion(base);
  };
  const portionUnitList = useMemo(
    () => portionUnits({ serving: portion?.serving, servingGrams: portion?.servingGrams, portions: portion?.portions }),
    [portion],
  );
  // A unit the food stopped offering (the sheet reopened on a different food)
  // falls back to servings, which every food has.
  const portionUnitActive: PortionUnit = portionUnit(portionUnitList, portionUnitId) ?? portionUnitList[0]!;
  const portionTyped = parseFloat(portionText.replace(",", "."));
  const portionQtyValue = portionQty(portionTyped, portionUnitActive);
  // Switching unit keeps the PORTION, not the number: 1 serving becomes 100 g,
  // not 1 g. Anything else would silently change what is about to be logged.
  const switchPortionUnit = (id: string) => {
    const next = portionUnit(portionUnitList, id);
    if (!next || id === portionUnitId) return;
    const carried = portionAmount(portionQtyValue, next);
    setPortionUnitId(id);
    setPortionText(formatAmount(carried > 0 ? carried : next.initial));
    // `selection`, not `light`: this is a segmented control moving between
    // discrete values, which is the first row of lib/haptics' table. `light` is
    // for a control COMMITTING, and switching units commits nothing.
    haptic.selection();
  };
  const stepPortion = (d: number) => {
    const next = portionStep(portionTyped, portionUnitActive, d);
    // A stepper moving through discrete values taps `selection`; one that will
    // not go further says `rigid`, because "that worked" and "that is as far as
    // it goes" must not answer the same way (lib/haptics' own table).
    if (next === portionTyped) haptic.rigid(); else haptic.selection();
    setPortionText(formatAmount(next));
  };
  /** The caption under the stepper: the measure's own symbol, the athlete's word
   *  for their container, or the generic "servings" / "pack". */
  const portionUnitLabel = (u: PortionUnit): string =>
    u.symbol
    ?? (u.kind === "portion" ? (u.portionLabel?.trim() || t("w.recovery.nutrition.pt.pack")) : t("w.recovery.nutrition.servings"));

  // ── LEARNED — the amounts this athlete actually logs for THIS food.
  //    The answer for everything the catalog has never heard of: the deli
  //    counter, the bakery, the thing somebody's mother makes. Costs nothing to
  //    collect, because the diary already records what was entered and in which
  //    unit. Offered as a prefill rather than invented into a named unit — a
  //    learned amount's name is its size (core usualAmounts).
  const portionUsual = useMemo(
    () => portion ? usualAmounts(logs, portion.name) : [],
    [logs, portion],
  );
  /** The one amount a food is usually logged at — what the pantry row prints
   *  beside its ⊕, and what that ⊕ then writes. */
  const usualFor = useCallback(
    (f: { name: string }) => usualAmounts(logs, f.name)[0] ?? null,
    [logs],
  );

  // Record a portion from the amount on screen — the athlete weighed the tub
  // once, and from now on it is one tap. The LAST of the four sources (the
  // catalog, the scan and their own logs all get there without asking), and the
  // only one that needs a control. PATCHes the saved row rather than
  // re-creating it: a new id breaks every recipe ingredient pointing at the old
  // one (the same trap the pantry's held delete exists to avoid).
  const rememberPortion = async (size: number) => {
    const p = portion;
    const packSize = parsePackSize(size);
    if (!p?.productId || packSize == null) return;
    setPackMsg("");
    const next = dedupePortions([...(p.portions ?? []), { label: "", size: packSize, source: "typed" }]);
    // The sheet's list is the FOLDED one (productPortions), so writing it back
    // carries a legacy pack into `portions` — and the legacy pair is cleared in
    // the same PATCH so it cannot fold itself in a second time at the next read.
    const ok = await updateFoodProduct(p.productId, { portions: next, packSize: null });
    if (!ok) { setPackMsg(t("w.recovery.nutrition.pt.packFailed")); return; }
    setProducts((xs) => xs.map((x) => x.id === p.productId ? { ...x, portions: next } : x));
    setPortion((cur) => cur ? { ...cur, portions: next } : cur);
    const measure = portionUnit(portionUnitList, "measure");
    setPackMsg(t("w.recovery.nutrition.pt.packSaved").replace("{v}", `${formatAmount(packSize)} ${measure?.symbol ?? ""}`.trim()));
  };

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
    else if (openRecipeId) { const r = recipeById(openRecipeId); if (r) openRecipe(r); }
    else if (openRecipes) { setView("recipes"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFood, openSource, openRecipeId, openRecipes]);

  // Log a saved meal → opens the portion editor (default 1×), scaled by quantity.
  // ── QUICK ADD — the athlete's OWN foods, ranked for a typed phrase.
  // Recents first (the food you logged yesterday is a better answer to two
  // words than one you saved in March), then products, then saved meals.
  //
  // ALL FOUR SOURCES, IN RANK ORDER, DEDUPED. The four lists overlap by design
  // — a product you starred and logged yesterday is legitimately in three of
  // them — so the order here decides which provenance a ranked row keeps, and
  // dedupeCandidates drops the repeats (see core/food-picker.ts).
  const quickAddCandidates: QuickAddCandidate[] = useMemo(() => dedupeCandidates([
    ...recent.map((r) => ({
      id: r.key, name: r.name, subname: r.subname ?? null, servingLabel: r.serving,
      // A recent carries no serving weight, so a gram phrase against one is
      // routed to the portion editor rather than converted (see quick-add.ts).
      servingGrams: r.servingGrams ?? exactGrams(r.serving),
      facts: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, satFat: r.satFat ?? null, sugar: r.sugar ?? null, fiber: r.fiber ?? null, salt: r.salt ?? null },
      source: "recent" as const,
      verifiedId: r.verifiedId ?? null,
    })),
    // A favourite is a per-device STAR over a food that lives somewhere else, so
    // the star must not become the record: a favourite of a saved product is
    // resolved back to the PRODUCT here, because the stored QuickFood carries no
    // serving weight, no micros and no verified id, and dedupeCandidates would
    // then let that thinner copy win (it ranks above `product`). What survives
    // is the product's data with the favourite's rank.
    ...favorites.map((q) => {
      const prod = q.key.startsWith("p:") ? products.find((x) => x.id === q.key.slice(2)) : null;
      const f = prod
        ? { name: prod.name, subname: prod.subname ?? null, serving: prod.servingLabel, grams: prod.servingGrams ?? exactGrams(prod.servingLabel), kcal: prod.kcal, protein: prod.protein, carbs: prod.carbs, fat: prod.fat, satFat: prod.satFat ?? null, sugar: prod.sugar ?? null, fiber: prod.fiber ?? null, salt: prod.salt ?? null, verifiedId: prod.verifiedId ?? null }
        : { name: q.name, subname: q.subname ?? null, serving: q.serving, grams: q.servingGrams ?? exactGrams(q.serving), kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, satFat: q.satFat ?? null, sugar: q.sugar ?? null, fiber: q.fiber ?? null, salt: q.salt ?? null, verifiedId: q.verifiedId ?? null };
      return {
        id: `fav:${q.key}`, name: f.name, subname: f.subname, servingLabel: f.serving,
        servingGrams: f.grams,
        facts: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, satFat: f.satFat, sugar: f.sugar, fiber: f.fiber, salt: f.salt },
        source: "favorite" as const,
        verifiedId: f.verifiedId,
      };
    }),
    ...products.map((p) => ({
      id: p.id, name: p.name, subname: p.subname ?? null, servingLabel: p.servingLabel,
      // Derived from the LABEL when the product never recorded a weight — the
      // reason this shipped without a migration. "100 g" saved years ago is
      // measurable today. Exact conversions only.
      servingGrams: p.servingGrams ?? exactGrams(p.servingLabel),
      facts: { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, satFat: p.satFat ?? null, sugar: p.sugar ?? null, fiber: p.fiber ?? null, salt: p.salt ?? null },
      source: "product" as const,
      verifiedId: p.verifiedId ?? null,
    })),
    ...meals.map((m) => ({
      id: m.id, name: m.name, subname: m.subname ?? null, servingLabel: `1 ${t("w.recovery.nutrition.serving")}`,
      servingGrams: null,
      facts: { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, satFat: m.satFat ?? null, sugar: m.sugar ?? null, fiber: m.fiber ?? null, salt: m.salt ?? null },
      source: "meal" as const,
    })),
  ]), [recent, favorites, products, meals, t]);

  // A quick-add commits straight to the diary — per single serving with a
  // separate quantity, the same shape every other logging path writes, so the
  // Diary's stepper rescales it afterwards.
  const logQuickAdd = async (draft: QuickAddDraft) => {
    const ok = await logEntry({
      name: draft.name, subname: draft.subname, source: mealType,
      kcal: draft.facts.kcal, protein: draft.facts.protein, carbs: draft.facts.carbs, fat: draft.facts.fat,
      satFat: draft.facts.satFat, sugar: draft.facts.sugar, fiber: draft.facts.fiber, salt: draft.facts.salt,
      qty: draft.qty, verifiedId: draft.verifiedId,
    });
    if (!ok) return;
    // ── INTO THE RECENTS MRU. This is the picker's PRIMARY commit path now, and
    //    it was the one path that never wrote here — so nothing logged by typing
    //    entered Recent, and nothing stamped the hour history the "at this hour"
    //    ranking reads from (core/hour-recents.ts). A macro line has no food
    //    behind it and no serving, so it stays out: the MRU's identity is a food
    //    PLUS its serving, and an unnamed quick entry is neither.
    if (draft.serving) {
      pushRecent({
        key: `${draft.name}|${draft.serving}`,
        name: draft.name, subname: draft.subname, serving: draft.serving,
        kcal: draft.facts.kcal, protein: draft.facts.protein, carbs: draft.facts.carbs, fat: draft.facts.fat,
        satFat: draft.facts.satFat, sugar: draft.facts.sugar, fiber: draft.facts.fiber, salt: draft.facts.salt,
        servingGrams: draft.servingGrams, verifiedId: draft.verifiedId,
      });
    }
    loadLogs(); refetch(); revalidate.recovery();
  };
  // A phrase whose quantity could NOT be computed opens the portion editor
  // instead of logging a number nobody worked out.
  //
  // A match that IS one of the saved foods is routed back through the product
  // itself. The ranked candidate is a projection — it carries the macros and
  // the serving weight, and not the portions or the row id — so opening the
  // editor from it would drop the bottle unit and the "remember as the whole
  // pack" control on the picker's own primary path, which is the one people
  // actually use. Everything else opens on what the candidate holds.
  const portionForQuickAdd = (m: QuickAddMatch) => {
    const saved = products.find((x) => x.id === m.candidate.id);
    if (saved) { logProduct(saved); return; }
    openPortion({
      name: m.candidate.name, subname: m.candidate.subname, subtitle: m.candidate.servingLabel,
      serving: m.candidate.servingLabel,
      servingGrams: m.candidate.servingGrams,
      kcal: m.candidate.facts.kcal, protein: m.candidate.facts.protein, carbs: m.candidate.facts.carbs, fat: m.candidate.facts.fat,
      satFat: m.candidate.facts.satFat, sugar: m.candidate.facts.sugar, fiber: m.candidate.facts.fiber, salt: m.candidate.facts.salt,
      verifiedId: m.candidate.verifiedId ?? undefined,
    });
  };

  const logMeal = (m: SavedMealRow) => openPortion({ name: m.name, subname: m.subname, subtitle: m.subname || t("w.recovery.nutrition.savedMeal"), serving: `1 ${t("w.recovery.nutrition.serving")}`, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, satFat: m.satFat, sugar: m.sugar, fiber: m.fiber, salt: m.salt });

  // Write the scaled macros for the open portion, then close. The log is
  // attributed to the current meal (source = mealType) so the hub can group
  // today's intake by meal, and the food is remembered in the Recent MRU.
  const commitPortion = async () => {
    if (!portion) return;
    // An empty field is not a portion of nothing — it is a field nobody has
    // finished typing in, so the editor's own opening amount stands.
    const q = portionQtyValue > 0 ? portionQtyValue : portionQty(portionUnitActive.initial, portionUnitActive);
    setMealMsg(""); setFoodMsg("");
    if (!(await logEntry({
      name: portion.name, subname: portion.subname ?? portion.subtitle ?? null, source: mealType,
      kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
      satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
      verifiedId: portion.verifiedId ?? null, qty: q,
      // WHAT WAS ENTERED, alongside the quantity that scales the macros: the
      // diary row says "35 g" rather than the 0.35 that 35 g of a 100 g food
      // works out to. An empty field logged the editor's opening amount, so
      // that is the amount recorded too.
      ...loggedPortionOf(portionTyped > 0 ? portionTyped : portionUnitActive.initial, portionUnitActive),
    }))) return;
    pushRecent({
      key: `${portion.name}|${portion.serving}`, name: portion.name, subname: portion.subname ?? null, serving: portion.serving,
      kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
      satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
      servingGrams: portion.servingGrams, verified: portion.verified, verifiedId: portion.verifiedId ?? null,
      portions: portion.portions ?? null,
    });
    setMealMsg(`${portion.name} +${Math.round(portion.kcal * q)} kcal`);
    setPortion(null);
    load(); loadLogs(); revalidate.recovery();
  };

  // Re-log a Recent/Favorite food → opens the portion editor (default 1×).
  const logQuickFood = (q: QuickFood) => openPortion({ name: q.name, subname: q.subname, subtitle: q.subname || q.serving, serving: q.serving, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, satFat: q.satFat, sugar: q.sugar, fiber: q.fiber, salt: q.salt, servingGrams: q.servingGrams, portions: q.portions, verified: q.verified, verifiedId: q.verifiedId });
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
  const logProduct = (p: FoodProductRow) => openPortion({ productId: p.id, name: p.name, subname: p.subname, subtitle: p.subname || p.servingLabel, serving: p.servingLabel || `1 ${t("w.recovery.nutrition.serving")}`, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt, servingGrams: p.servingGrams, portions: productPortions(p), verifiedId: p.verifiedId });

  // Save the Create form → products OR meals API (one blend form, two targets),
  // carrying the personal subname, then return to the picker Personal tab.
  /**
   * The Create form's packs, as portions.
   *
   * NULL means THE FORM HAS NOTHING TO SAY, which is not the same as "no packs"
   * and must not be written as one: a serving with no measure ("1 slice") states
   * its sizes in a unit that does not exist, so the form does not show the list
   * at all — and an edit that then wrote `[]` would silently delete the packs a
   * scan had recorded, on a screen where the athlete only changed the name.
   *
   * A blank row is skipped rather than refused. It is what an ＋ pressed one too
   * many times leaves behind, and refusing to save over it would be the form
   * blocking on its own affordance.
   */
  const createPortions = (): FoodPortion[] | null => {
    const label = composeServingLabel(createForm.serving, createForm.unit);
    if (!portionMeasure({ serving: label })) return null;
    const out: FoodPortion[] = [];
    for (const p of createForm.packs) {
      const size = parsePackSize(p.size);
      if (size != null) out.push({ label: p.label.trim().slice(0, 24), size, source: p.source });
    }
    return dedupePortions(out);
  };

  const submitCreateFood = async () => {
    if (!createForm.name.trim()) return;
    const isMeal = createMode === "meal";
    // An EDIT is not a new save, so it never meets the free cap: the cap gates
    // how many foods you keep, not whether you may fix one you already have.
    if (!editingProduct && (isMeal ? !canSaveAnotherMeal : !canSaveAnotherProduct)) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const subname = createForm.subname.trim() || undefined;
    // A meal composed from products takes its macros from the summed components;
    // otherwise (a manually-typed meal, or a product) from the macro fields.
    const useComps = isMeal && mealComps.length > 0;
    const macros = useComps
      ? { kcal: compTotals.kcal || undefined, protein: compTotals.protein, carbs: compTotals.carbs, fat: compTotals.fat }
      : { kcal: num(createForm.kcal) || undefined, protein: num(createForm.protein), carbs: num(createForm.carbs), fat: num(createForm.fat) };

    // A BLANK panel field stays undefined, not 0 — leaving "sugars" empty means
    // "I don't know", and writing a zero there would invent a fact.
    const opt = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : undefined; };
    const panelFields = { satFat: opt(createForm.satFat), sugar: opt(createForm.sugar), fiber: opt(createForm.fiber), salt: opt(createForm.salt) };
    // The label is composed by core, so what is saved is exactly what
    // parseServing reads back. The weight is DERIVED from the unit — the old
    // rule only set it for "gram", so an ounce serving never got one even
    // though ounces convert exactly. An ASSUMED (volume) conversion is
    // deliberately not stored: writing a guessed weight into the measured
    // field would make it indistinguishable from one somebody weighed.
    // ALWAYS composed, so what the serving row SHOWS is what the row stores. It
    // used to be skipped when the field was blank, which sent the food to the
    // database as the column default "1 serving" while the screen had said
    // grams — a food that arrived with no measure and could never be weighed or
    // carry a pack. `composeServingLabel` reads a blank as the 1 the field's own
    // placeholder displays.
    const composedLabel = composeServingLabel(createForm.serving, createForm.unit);
    const derivedGrams = servingGramsOf(parseServing(composedLabel));
    const servingGrams = derivedGrams && !derivedGrams.assumed ? derivedGrams.grams : undefined;
    // EDITING: the same fields, through PATCH, so the row keeps its id and every
    // recipe ingredient pointing at it keeps working. The food's catalog and
    // scanned portions are carried through untouched — this form states what the
    // athlete knows, it does not overwrite what the database published.
    if (editingProduct) {
      // The pack LIST on the form is the food's whole truth about its packs
      // (that is why the form now shows every one of them, whatever its source),
      // so it is written whole — and the legacy pair is cleared with it, since
      // a pack still sitting in those two columns would fold itself back in at
      // the next read and undo a removal made here.
      const packs = createPortions();
      const ok = await updateFoodProduct(editingProduct.id, {
        name: createForm.name.trim(), subname: subname ?? null,
        servingLabel: composedLabel, servingGrams: servingGrams ?? null,
        ...(packs ? { portions: packs, packSize: null } : {}),
        ...macros, ...panelFields,
      });
      if (!ok) { notify(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
      setEditingProduct(null);
      setCreateForm(BLANK_CREATE_FORM);
      setShowPanelFields(false);
      loadLibrary();
      setFoodTab("personal"); setView("add");
      return;
    }
    const res = isMeal
      ? await createSavedMeal({ name: createForm.name.trim(), subname, ...macros, ...panelFields })
      : await createFoodProduct({
          name: createForm.name.trim(), subname, servingLabel: composedLabel, servingGrams,
          // The packs are stated in the SERVING'S own measure, so a label with
          // no measure at all ("1 slice") carries none — a size with no unit is
          // a number nobody can read back.
          portions: createPortions() ?? [],
          ...macros, ...panelFields,
        });
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

  const removeMeal = async (id: string) => {
    haptic.warning();
    listMotion(() => setMeals((xs) => xs.filter((x) => x.id !== id)));
    await deleteSavedMeal(id);
  };

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

  // Eat what you cooked. ONE serving, not the tray: the serves stepper scales
  // the ingredient list (how much you're making), which is a different number
  // from how much you ate. It writes an ordinary food entry — per single
  // serving with a separate quantity — so the Diary's stepper rescales it after
  // the fact, exactly as a user recipe's log does. Web parity: logLibraryRecipe.
  const logLibraryRecipe = async (r: Recipe, serves: number) => {
    setRecipeMsg("");
    const draft = libraryRecipeToLog(r, 1, serves);
    const ok = await logEntry({
      name: draft.name,
      subname: draft.subname,
      source: mealType,
      kcal: draft.facts.kcal,
      protein: draft.facts.protein,
      carbs: draft.facts.carbs,
      fat: draft.facts.fat,
      qty: draft.qty,
    });
    if (ok) { setRecipeMsg(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType))); loadLogs(); refetch(); revalidate.recovery(); }
  };

  // The inline bordered "New product" builder that used to sit at the bottom of
  // this screen is GONE with the Pantry redesign, along with its own form state
  // and its own POST. It was the second way to create a product — the Create
  // Food form (openCreate("product")) is the primary one and has been since the
  // de-clutter pass — and two forms writing the same row is how a field lands
  // on one of them and not the other.
  // The picker's own fire-and-forget delete is GONE with it. It dropped a saved
  // food with no undo while the pantry's identical gesture held the row for six
  // seconds — one food, two deletes, and only one of them survivable. Both doors
  // are `askDeleteProduct` now.

  // ── PANTRY — hold (or swipe) to delete, with a real undo ─────────────────
  // The row leaves immediately but the DELETE is HELD for UNDO_MS. Undoing a
  // completed delete would have to re-create the product, which mints a new id
  // and quietly breaks every recipe ingredient pointing at the old one, so the
  // row that comes back has to be the row that left. `pendingRef` mirrors the
  // state so the flush on unmount can read it without re-subscribing: a delete
  // that silently un-happens on the next load is worse than one that lands.
  // Web parity: aurora/nutrition.tsx askDeleteProduct.
  const [pantrySearch, setPantrySearch] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FoodProductRow | null>(null);
  const pendingRef = useRef<{ product: FoodProductRow; timer: ReturnType<typeof setTimeout> } | null>(null);
  const commitDeleteProduct = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    void deleteFoodProduct(p.product.id);
  }, []);
  const askDeleteProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    // A second swipe while one is still pending commits the first: two rows can
    // leave, but only one of them can be the one Undo brings back.
    commitDeleteProduct();
    // A destructive commit going through — the same warning the swipe fires, so
    // the hold and the swipe feel identical as well as behaving identically.
    haptic.warning();
    listMotion(() => setProducts((xs) => xs.filter((x) => x.id !== id)));
    const timer = setTimeout(() => commitDeleteProduct(), UNDO_MS);
    pendingRef.current = { product: p, timer };
    setPendingDelete(p);
  };
  const undoDeleteProduct = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    listMotion(() => setProducts((xs) => xs.some((x) => x.id === p.product.id) ? xs : [...xs, p.product]));
  };
  useEffect(() => () => { const p = pendingRef.current; if (p) { clearTimeout(p.timer); void deleteFoodProduct(p.product.id); } }, []);

  // ⊕ ON A SAVED FOOD — log it to the current meal, NOW. The row body still
  // opens the portion editor for a different amount and the full panel; this is
  // the tap for the food you eat the same way every time.
  //
  // It is the same on both doors now. The pantry's ⊕ logged, and the picker's ⊕
  // on the very same food opened a sheet — one control, two meanings, on two
  // lists an athlete moves between without noticing which one they are on.
  // `say` is the only thing that differs, because the two screens carry their
  // confirmation on different lines.
  const logOneServing = async (p: FoodProductRow, say: (v: string) => void = setFoodMsg) => {
    say("");
    // THE HABIT, IF THERE IS ONE. A food this athlete has weighed the same way
    // three times or more logs THAT, not a serving they have never once eaten —
    // and the row says "usually 35 g" beside the ⊕, so the tap does what the
    // line above it claims. No habit, or a food whose measure has moved out
    // from under it, falls back to the one serving this always logged.
    const habit = usualLogPortion(
      { serving: p.servingLabel, servingGrams: p.servingGrams, portions: productPortions(p) },
      usualFor(p),
    );
    const ok = await logEntry({
      name: p.name, subname: p.subname, source: mealType,
      kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat,
      satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt,
      verifiedId: p.verifiedId,
      qty: habit?.qty ?? 1,
      amount: habit?.amount ?? null, amountUnit: habit?.amountUnit ?? null,
    });
    if (ok) { say(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType))); loadLogs(); refetch(); revalidate.recovery(); }
  };

  // ── THE PACKS, ON THE ROW ────────────────────────────────────────────────
  //
  // A food that states what its container holds should be loggable AS that
  // container in one tap. It took five — picker, source, row, the bottle on the
  // unit switch, Log — four of which exist to answer a question the food already
  // answered when the pack was recorded. The row states them and logs them.

  /**
   * The food's packs, localized for a row: the container and how big it is —
   * "bottle", "400 g".
   *
   * NOT "Whole bottle", which is the SHEET's wording and belongs there. On the
   * unit switch that word is load-bearing: it tells a chip apart from the two
   * beside it that count servings and grams. On a row there is nothing to tell
   * it apart FROM, so the word is decoration — and decoration with a width.
   * Measured in the shipping face at 393dp, two packs with it come to 317 of the
   * 321dp the strip has, which is not a layout, it is luck: German is longer and
   * one notch of Dynamic Type ends it. Without it the same two come to 237 and
   * the row breathes. The verb the word was carrying moves to the a11y label,
   * where it is read rather than measured.
   */
  const rowPortions = useCallback((food: PackedFood): RowPortion[] => {
    const measure = portionMeasure(food);
    if (!measure) return [];
    return namedPortionUnits(food).map((u) => ({
      id: u.id,
      label: u.portionLabel?.trim() || t("w.recovery.nutrition.pt.pack"),
      size: `${formatAmount(u.servingsPer * measure.perServing)} ${measure.unit}`,
      a11y: t("w.recovery.nutrition.pt.wholePack").replace("{v}", u.portionLabel?.trim() || t("w.recovery.nutrition.pt.pack")),
    }));
  }, [t]);

  /** Log ONE of a named portion — the whole bottle — straight into the current
   *  meal. Same write the portion editor makes at amount 1 on that unit
   *  (core `oneOfPortion`), so the diary row reads "1 bottle" and not "4". */
  const logWholePortion = async (food: LoggablePack, unitId: string): Promise<boolean> => {
    const units = portionUnits({ serving: food.serving, servingGrams: food.servingGrams, portions: food.portions });
    const unit = portionUnit(units, unitId);
    // A pack that has just been removed under the finger is not an error worth
    // a message — the chip it was on is already gone.
    if (!unit) return false;
    const one = oneOfPortion(unit);
    const ok = await logEntry({
      name: food.name, subname: food.subname ?? null, source: mealType,
      kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
      satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
      verifiedId: food.verifiedId ?? null,
      ...one,
    });
    if (!ok) return false;
    pushRecent({
      key: `${food.name}|${food.serving ?? ""}`, name: food.name, subname: food.subname ?? null, serving: food.serving ?? "",
      kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
      satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
      servingGrams: food.servingGrams ?? null, verifiedId: food.verifiedId ?? null, portions: food.portions ?? null,
    });
    loadLogs(); refetch(); revalidate.recovery();
    return true;
  };

  /** The pantry's ⊕-on-a-pack, and the picker's. Each sets its own screen's
   *  confirmation line, because the two screens have different ones. */
  const logProductPortion = async (p: FoodProductRow, unitId: string, say: (v: string) => void) => {
    say("");
    const ok = await logWholePortion(
      { name: p.name, subname: p.subname, serving: p.servingLabel, servingGrams: p.servingGrams, portions: productPortions(p),
        kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat,
        satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt, verifiedId: p.verifiedId },
      unitId,
    );
    if (ok) say(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType)));
  };

  /**
   * FORGET A PACK — the half that was missing.
   *
   * Four sources could put a unit on the switch and nothing could take one off:
   * a bottle typed as 400 when the scale said 450, a catalog net quantity for
   * the multipack somebody does not buy. It writes the FOLDED list back (so a
   * legacy pack is genuinely gone rather than gone until the next read) and
   * clears the legacy pair in the same PATCH.
   */
  const removeProductPortion = async (p: FoodProductRow, unitId: string) => {
    const next = removeFoodPortion(productPortions(p), unitId);
    const before = products;
    const patched = { ...p, portions: next, packSize: null, packLabel: null } as FoodProductRow;
    listMotion(() => setProducts((xs) => xs.map((x) => x.id === p.id ? patched : x)));
    // The open portion editor is looking at the same food: leaving its unit
    // switch showing a pack that no longer exists would be the screen and the
    // database disagreeing while the athlete watches.
    setPortion((cur) => cur?.productId === p.id ? { ...cur, portions: next } : cur);
    // A stepper left counting a unit that no longer exists would keep the number
    // and lose its meaning, so it falls back to where the sheet opens — the
    // food's own measure — reading one serving's worth, exactly as it would have
    // if the sheet had been opened a second later.
    if (portionUnitId === unitId) {
      const left = portionUnits({ serving: p.servingLabel, servingGrams: p.servingGrams, portions: next });
      const fallback = portionUnit(left, "measure") ?? left[0]!;
      setPortionUnitId(fallback.id);
      setPortionText(formatAmount(fallback.initial));
    }
    haptic.warning();
    if (await updateFoodProduct(p.id, { portions: next, packSize: null })) return;
    setProducts(before);
    setFoodMsg(t("w.recovery.nutrition.pt.packFailed"));
  };

  // ── THE ONE FIELD. `foodQuery` is now the picker's ONLY input: quick add and
  //    the database search were two boxes asking the same question, ninety
  //    pixels apart, in the same shape with the same left-hand glyph.
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<FoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [foodMsg, setFoodMsg] = useState("");

  // ONE READ OF THE GRAMMAR, shared by the field, the list beneath it and the
  // search below that, so the three cannot disagree about what was typed. Quick
  // add is not a second box any more; it is what this field does FIRST.
  const pickVocab = useMemo(() => quickAddVocab(t), [t]);
  const answer = useMemo(
    () => pickerAnswer(foodQuery, quickAddCandidates, { vocab: pickVocab }),
    [foodQuery, quickAddCandidates, pickVocab],
  );

  // ── THE HOUR — what this athlete actually eats around now (core/hour-recents).
  //    Recomputed on the minute rather than on every render, so a picker left
  //    open across 21:59 → 22:00 does not keep answering yesterday's question.
  const [clockMinute, setClockMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    // Only while the picker is open: this screen is seventeen views, and a
    // timer that re-rendered all of them for a label one of them shows would
    // be paying for the clock everywhere it is not on screen.
    if (view !== "add") return;
    // Read it on ENTRY too: the picker opened at 21:12 from a screen mounted at
    // 08:00 would otherwise greet the athlete with breakfast for half a minute.
    setClockMinute(Math.floor(Date.now() / 60000));
    const id = setInterval(() => setClockMinute(Math.floor(Date.now() / 60000)), 30000);
    return () => clearInterval(id);
  }, [view]);
  const usuals = useMemo(() => usualAtHour(recent, clockMinute * 60000), [recent, clockMinute]);
  const usualDays = useMemo(() => new Map(usuals.map((u) => [u.item.key, u.days])), [usuals]);
  const clockLabel = useMemo(() => {
    const d = new Date(clockMinute * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [clockMinute]);

  // ── Food search — Open Food Facts (free, no key) via searchFoods → the
  //    /api/nutrition/search proxy. Debounced, and driven by the PARSED query
  //    rather than the raw text: "kefir 200g" asks the database about kefir, and
  //    a macro line never reaches the network at all, because there is no food
  //    in "40g protein" to look up (see core pickerRemoteQuery).
  const remoteQuery = pickerRemoteQuery(answer);
  useEffect(() => {
    if (!remoteQuery) { setFoodResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      const foods = await searchFoods(remoteQuery);
      setFoodResults(foods);
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [remoteQuery]);

  // ── BARCODE SCAN — the camera half of a flow that already worked.
  // A scanned code is handed to the SAME barcode lookup a typed one uses, so
  // the two cannot resolve differently. The code also lands in the search box:
  // if the database has never heard of it, the athlete is left holding it and
  // can create the food from there rather than re-reading the pack.
  const [scanSheet, setScanSheet] = useState(false);
  const onScanned = useCallback(async (code: string) => {
    setScanSheet(false);
    setFoodQuery(code);
    setSearching(true);
    const foods = await searchFoods(code, { barcode: true });
    // A BARCODE IDENTIFIES ONE SPECIFIC PACKAGE — that is what a barcode is
    // for — so a pack size that arrives on a scanned hit is better sourced than
    // the same figure found by typing a name, and outranks it in the merge
    // (core dedupePortions). Nothing else about the hit changes.
    setFoodResults(foods.map((f) => f.portions?.length
      ? { ...f, portions: f.portions.map((x) => ({ ...x, source: "scanned" as const })) }
      : f));
    setSearching(false);
    if (foods.length === 0) setFoodMsg(t("w.recovery.nutrition.scan.notFound"));
  }, [t]);

  // Log a database food → opens the portion editor (serving × quantity), which
  // also offers to save it into the library.
  const logFood = (food: FoodHit) => openPortion({
    name: food.name, subtitle: food.brand ?? undefined, serving: food.serving,
    kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
    satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
    servingGrams: food.servingGrams, verified: food.verified, verifiedId: food.id ?? null,
    // THE CATALOG ALREADY KNOWS HOW BIG THE PACK IS. Open Food Facts publishes
    // the net quantity on every product it holds, so "the whole bottle" is a
    // unit here before the food has even been saved — no typing, at the scale
    // of a supermarket rather than of one person's patience.
    portions: food.portions ?? null,
    offFood: food,
  });

  // Save a database food into the personal library (respects the free cap).
  const saveFood = async (food: FoodHit) => {
    if (!canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    setFoodMsg("");
    const res = await createFoodProduct({
      name: food.name, subname: food.brand, servingLabel: food.serving, servingGrams: food.servingGrams ?? undefined,
      portions: food.portions ?? [],
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

  // ── WATER ────────────────────────────────────────────────────────────────
  // The same training-aware composition the calorie target uses: a bodyweight
  // baseline plus today's sweat allowance. `today` is passed through so the
  // whole Signal stream isn't rolled up a second time just for one figure.
  const hydration = useMemo(
    () => hydrationToday(sig, { bodyMassKg, trainingKcal, day: today }),
    [signals, bodyMassKg, trainingKcal, today],
  );
  // Today's water readings, newest first — undo needs the id of the reading it
  // is taking back (a negative water Signal would be a lie about the day).
  const [waterLogs, setWaterLogs] = useState<WaterLogRow[]>([]);
  const loadWater = useCallback(() => { fetchWaterLogs().then(setWaterLogs).catch(() => {}); }, []);
  useEffect(() => { loadWater(); }, [loadWater]);

  // Optimistic on the client's own list, then refetch: the vessel row must fill
  // on the tap rather than on the round-trip, and a failed write must not leave
  // millilitres on screen the athlete never drank.
  const addWater = useCallback(async (ml: number) => {
    const row = await logWater(ml);
    if (row) setWaterLogs((xs) => [row, ...xs]);
    refetch(); revalidate.recovery();
  }, [refetch, revalidate]);

  const undoWater = useCallback(async () => {
    const last = waterLogs[0];
    if (!last) return;
    setWaterLogs((xs) => xs.slice(1));
    await deleteSignal(last.id);
    refetch(); revalidate.recovery();
  }, [waterLogs, refetch, revalidate]);
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
  // HOME-HERO DAY SCOPE — the hero ring shares the Diary's viewed day
  // (diaryDay), so its ‹ › stepper reviews any past day's ring + macros in
  // place (web parity). Today reads todayNutrition; a past day reads the same
  // dailyNutrition row the Diary's summary shows.
  const heroIsToday = diaryDay === localTodayKey();
  const heroDay = heroIsToday ? today : daySummary;
  // The engine's own figures, WITHOUT the training bump — resolveTargets is the
  // single place that decides whether the bump applies, so the adaptive and the
  // manual path cannot add it two different ways.
  const adaptiveBase = useMemo(() => adaptiveTargets(sig, { goal, trainingKcal: 0 }), [signals, goal]);
  const targets = useMemo(() => resolveTargets(adaptiveBase, targetOverride, trainingKcal), [adaptiveBase, targetOverride, trainingKcal]);
  // ── THE GAP — what the day still owes. Against TODAY's totals, never the
  //    diary's scrubbed day: the picker writes to today, so a header reading
  //    yesterday's remainder would be answering a question nobody asked.
  const pickerGap = useMemo(() => nutritionGap(today, targets), [today, targets]);
  // THE HERO'S FIGURES, through the same sum as the picker's and the diary's.
  // The ring used to compute its own share and its own over-flag inline, and
  // the second of those was wrong in the state the app is careful about
  // everywhere else: with NO target, `kcal > targets.kcal * 1.05` reduces to
  // `kcal > 0`, so the first food of the day painted the ring amber against a
  // number nobody set. `gapFigure` reports no target as no target.
  const heroFigures = useMemo(() => nutritionFigures(heroDay, targets), [heroDay, targets]);
  const mismatch = useMemo(() => targetMismatch(targets), [targets]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recentDays = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(sig), [signals]);
  const personalized = maint.kcal != null;
  // Safety net for the "onboarding shows every time" bug: anyone who has already
  // logged intake or a weigh-in has finished first-run — never re-show the wizard.
  const hasNutritionData = useMemo(() => sig.some((s) => s.kind === "energyIntake" || s.kind === "bodyMass"), [signals]);
  // ONE window for the whole Insights screen: the goal overview and the
  // per-nutrient trends below it must answer the same question over the same
  // span, so the control lives on the screen rather than inside either panel.
  const [summaryWindow, setSummaryWindow] = useState<AnalyticsWindow>(30);
  const summary = useMemo(() => nutritionSummary(sig, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  // Every figure on the trends screen comes from here — nothing is computed
  // in the component, so the two clients cannot reach different conclusions.
  const analytics = useMemo(
    () => nutritionAnalytics(sig, { sessions, goal, bodyMassKg, windowDays: summaryWindow }),
    [signals, sessions, goal, bodyMassKg, summaryWindow],
  );
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
        <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk }}>{t("w.recovery.nutrition.addMealTitle")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{figureText(today.kcal, targets.kcal)} {t("w.recovery.nutrition.kcalToday")}</Text>

        {/* Meal selector — the quick-add is attributed to the chosen meal,
            matching the full picker so today's intake groups the same way. */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {MEAL_TYPES.map((m) => {
            const on = mealType === m;
            return (
              <Pressable key={m} onPress={() => setMealType(m)} accessibilityLabel={t(`w.recovery.nutrition.meal.${m}`)} style={{ flex: 1, alignItems: "center", gap: 5, backgroundColor: on ? C.lime : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: RADIUS.field, paddingVertical: 10, paddingHorizontal: 4 }}>
                <Glyph name={mealGlyph(m)} size={18} color={on ? C.onAccent : C.ash} />
                <Text style={{ fontFamily: on ? F.monoBold : F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: on ? C.onAccent : C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Recent — one-tap re-log of a recent food to the chosen meal. */}
        {recent.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ ...ty(C, "overline"), marginBottom: 8  }}>{t("w.recovery.nutrition.tab.recent")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {recent.slice(0, 8).map((q) => (
                <Pressable key={q.key} onPress={() => relogRecent(q)} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 8, paddingLeft: 12, paddingRight: 16 }}>
                  <View style={{ width: 22, height: 22, borderRadius: RADIUS.pill, borderWidth: 1.4, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><Glyph name="plus" size={12} color={txt(C, C.lime)} /></View>
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
          <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.red)} value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} />
        </View>
        {(() => {
          const macroKcal = Math.round((parseFloat(f.protein) || 0) * 4 + (parseFloat(f.carbs) || 0) * 4 + (parseFloat(f.fat) || 0) * 9);
          return macroKcal > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 12 }}>{t("w.recovery.nutrition.macrosApprox")} {macroKcal} kcal</Text> : null;
        })()}
        {/* Add meal + Scan label — side-by-side rounded pills (Scan is AI vision, Full only → upgrade) */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <APill label={t("w.recovery.nutrition.addMeal")} savingLabel={t("w.recovery.nutrition.adding")} state={saving ? "saving" : "idle"} onPress={add} style={{ flex: 1 }} />
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t(scanning ? "w.recovery.nutrition.scanning" : "w.recovery.nutrition.scanLabel")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(pa.fill, ALPHA.rim), backgroundColor: "transparent", opacity: scanning ? STATE_OPACITY.busy : 1 }}>
            {/* The GLYPH SLOT carries the in-flight state, not the word: a
                fixed-size box so the spinner and the icon occupy the same
                space, and the label stops changing width mid-scan. Its sibling
                in this row (the Add pill) holds its width the same way. */}
            <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
              {scanning ? <ActivityIndicator size="small" color={pa.text} /> : <Glyph name="scan" size={16} color={pa.text} />}
            </View>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.chalk }}>{t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: fs.micro }}>✦</Text>}
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
              style={{ flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: full ? C.line : withAlpha(pa.fill, ALPHA.edge), borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Glyph name={presetGlyph(p.id)} size={20} color={full ? C.ash : pa.text} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label"), marginTop: 2 }}>{p.kcal} kcal</Text>
              </View>
              {!full && <AuroraIcon name="lock" size={13} color={pa.text} />}
            </Pressable>
          ))}
        </View>

        {onNavigateFull ? (
          <Pressable onPress={onNavigateFull} style={{ marginTop: 16, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6 }} hitSlop={6}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking(fs.caption, "label"), textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.fullTracker")}</Text>
            <Glyph name="chevron" size={13} color={C.ash} />
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
    <Sheet visible={partSheet} onClose={() => { setPartSheet(false); setNewPart(""); }} title={t("w.recovery.nutrition.addPart")} sub={t("w.recovery.nutrition.addPartSub")}>
      <View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={newPart} onChangeText={setNewPart} maxLength={32} placeholder={t("w.recovery.nutrition.partNamePh")} placeholderTextColor={C.ash} onSubmitEditing={addPart} accessibilityLabel={t("w.recovery.nutrition.addPart")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12 }} />
          <Pressable onPress={addPart} disabled={!newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 16, justifyContent: "center", opacity: !newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS ? STATE_OPACITY.disabled : 1 }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addPartCta")}</Text></Pressable>
        </View>
        {customParts.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            {customParts.map((p) => (
              <View key={p.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                <Glyph name="bowl" size={18} color={C.ash} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{p.label}</Text>
                <Pressable onPress={() => removePart(p.key)} accessibilityLabel={t("w.recovery.nutrition.removePart")} hitSlop={8} style={{ padding: 4 }}><Glyph name="trash" size={18} color={C.ash} /></Pressable>
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
        const q = portionQtyValue > 0 ? portionQtyValue : portionQty(portionUnitActive.initial, portionUnitActive);
        const sc = (v: number) => Math.round(v * q);
        const equiv = portionEquivalent(portionTyped, portionUnitActive, portionUnitList);
        // The measure UNIT; its `initial` is one serving's worth of it (100 for
        // a "100 g" food), which is what turns a portion's servingsPer back
        // into a printable size.
        const measure = portionUnit(portionUnitList, "measure");
        const perServing = measure?.initial ?? 0;
        const namedPortions = portionUnitList.filter((u) => u.kind === "portion");
        // Offered for a SAVED food that can be measured and has room for another
        // portion, from the measure unit — which is where the athlete has just
        // typed what the container holds. The catalog, a scan and their own logs
        // all get here without a control; this is the fallback.
        // A PACK THE SIZE OF ONE SERVING is not offered. The editor opens on the
        // measure now (reading one serving's worth), so without this the control
        // would greet every gram-labelled food with "remember 100 g as the whole
        // pack" before the athlete has typed anything — and a pack equal to the
        // serving names nothing the stepper could not already log as 1.
        const canRememberPortion =
          !!portion.productId && !!measure && portionUnitId === "measure" &&
          namedPortions.length < MAX_FOOD_PORTIONS && portionTyped > 0 &&
          Math.abs(portionTyped - perServing) > 0.01 &&
          !namedPortions.some((u) => Math.abs(u.servingsPer * perServing - portionTyped) < 0.01);
        return (
          <View>
            {portion.verified ? (() => {
              const src = verifiedSource(portion.verified!.sourceId);
              return (
                <View style={{ backgroundColor: withAlpha(C.lime, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.line), borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16, marginTop: 12 }}>
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
                      <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.publishedBy")}</Text>
                      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 2 }}>{portion.verified!.sourceName}</Text>
                    </View>
                    <Glyph name="chevron" size={16} color={C.ash} />
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: withAlpha(C.lime, ALPHA.edge) }}>
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

            {/* THE UNIT SWITCH. Only drawn when the food HAS a choice: a single
                chip reading "servings" would be a control that decides nothing.
                Mode chips, because one is always on and the number below
                changes meaning with it. It SCROLLS rather than wrapping — a
                food can carry several named portions, and a switch that
                reflowed to two rows would move the stepper down the screen
                every time a different food opened. Inside a sheet, so it
                respects the sheet's padding rather than bleeding (the
                full-bleed rule is for rails sitting on a screen). */}
            {portionUnitList.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                accessibilityRole="radiogroup"
                accessibilityLabel={t("w.recovery.nutrition.pt.measuredIn")}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                style={{ marginTop: 16, flexGrow: 0 }}
              >
                {portionUnitList.map((u) => {
                  const on = u.id === portionUnitActive.id;
                  const label = u.kind === "portion"
                    ? t("w.recovery.nutrition.pt.wholePack").replace("{v}", portionUnitLabel(u))
                    : portionUnitLabel(u);
                  // A portion says how big it is on the chip, so picking between
                  // "bottle" and "block" is not a memory test.
                  const a11y = u.kind === "portion" && measure ? `${label}, ${formatAmount(u.servingsPer * perServing)} ${measure.symbol}` : label;
                  const chip = (
                    <View style={{ minWidth: 84, alignItems: "center", borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? withAlpha(C.lime, ALPHA.wash) : "transparent", borderRadius: RADIUS.pill, paddingVertical: 9, paddingHorizontal: 14 }}>
                      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.monoBold, fontSize: fs.caption, letterSpacing: tracking(fs.caption, "label"), textTransform: "uppercase", color: on ? txt(C, C.lime) : C.ash }}>
                        {label}
                      </Text>
                      {u.kind === "portion" && measure ? (
                        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>
                          {formatAmount(u.servingsPer * perServing)} {measure.symbol}
                        </Text>
                      ) : null}
                    </View>
                  );
                  // HOLD A PACK TO TAKE IT OFF THE SWITCH. This is where a wrong
                  // pack is SEEN — the chip states its size right under the word
                  // — so it is where the correction belongs, rather than three
                  // screens away in the form. Only on a saved food, and only on
                  // a pack: servings and the measure are read off the food's own
                  // label and there is nothing there to remove.
                  const product = u.kind === "portion" && portion.productId ? products.find((x) => x.id === portion.productId) : undefined;
                  if (product) {
                    return (
                      <HoldMenu
                        key={u.id}
                        items={packMenu(t)}
                        onSelect={() => { void removeProductPortion(product, u.id); }}
                        onPress={() => switchPortionUnit(u.id)}
                        a11yLabel={a11y}
                        a11yRole="radio"
                      >
                        {chip}
                      </HoldMenu>
                    );
                  }
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => switchPortionUnit(u.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={a11y}
                    >
                      {chip}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16, marginTop: 16 }}>
              <Pressable onPress={() => stepPortion(-1)} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 44, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.rim), alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.display, lineHeight: leading(fs.display, "tight"), color: txt(C, C.lime) }}>–</Text></Pressable>
              <View style={{ alignItems: "center" }}>
                <TextInput value={portionText} onChangeText={setPortionText} keyboardType="decimal-pad" accessibilityLabel={t("w.recovery.nutrition.pt.amount")} style={{ minWidth: 96, textAlign: "center", fontFamily: F.takeover, fontSize: 30, lineHeight: leading(30, "flush"), letterSpacing: trackFigure(30), color: C.chalk, padding: 0 }} />
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={ty(C, "overline")}>{portionUnitLabel(portionUnitActive)}</Text>
              </View>
              <Pressable onPress={() => stepPortion(1)} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 44, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.rim), alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.headline, lineHeight: 24, color: txt(C, C.lime) }}>+</Text></Pressable>
            </View>
            {/* What that amount is in the food's other terms — a bottle in
                millilitres, a serving count in grams. Only ever ADDS a fact:
                it is silent when the number on screen is already the measure. */}
            {equiv ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center", marginTop: 8 }}>
                {t("w.recovery.nutrition.pt.thatIs").replace("{v}", `${formatAmount(equiv.amount)} ${equiv.symbol}`)}
              </Text>
            ) : null}
            {/* WHERE THIS SIZE CAME FROM. A pack the athlete never typed needs to
                say so — otherwise a 400 g that the food database published is
                indistinguishable from one they set themselves, and there is no
                way to know whether it is worth correcting. */}
            {portionUnitActive.kind === "portion" && portionUnitActive.source ? (
              <Text style={{ ...ty(C, "kicker"), opacity: 0.85, textAlign: "center", marginTop: 6  }}>
                {t(`w.recovery.nutrition.pt.src${portionUnitActive.source === "catalog" ? "Catalog" : portionUnitActive.source === "scanned" ? "Scanned" : "Typed"}`)}
              </Text>
            ) : null}
            {/* WHAT YOU USUALLY LOG. Learned from this athlete's own diary, so
                a food no database has ever heard of still gets one-tap amounts
                after a few weighings. Bare chips, not cards: they set the
                number in place, they do not go anywhere. */}
            {portionUnitId === "measure" && portionUsual.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 }}>
                {portionUsual.map((u) => (
                  <Pressable
                    key={`${u.unit}:${u.amount}`}
                    onPress={() => { setPortionText(formatAmount(u.amount)); haptic.light(); }}
                    accessibilityRole="button"
                    accessibilityLabel={t("w.recovery.nutrition.pt.usualA11y").replace("{v}", `${formatAmount(u.amount)} ${u.unit}`).replace("{n}", String(u.times))}
                    style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 7, paddingHorizontal: 14 }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{formatAmount(u.amount)} {u.unit}</Text>
                  </Pressable>
                ))}
                <Text style={{ width: "100%", textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.pt.usual")}</Text>
              </View>
            ) : null}
            {/* Weigh the tub once, and the whole thing is a unit from then on.
                Chromeless — it changes this food, it does not go anywhere. */}
            {canRememberPortion ? (
              <Pressable onPress={() => rememberPortion(portionTyped)} accessibilityRole="button" style={{ alignSelf: "center", marginTop: 10, paddingVertical: 4 }}>
                <CtaLabel label={t("w.recovery.nutrition.pt.setPack").replace("{v}", `${formatAmount(portionTyped)} ${measure!.symbol}`)} color={txt(C, C.lime)} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label") }} />
              </Pressable>
            ) : null}
            {packMsg ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center", marginTop: 8, lineHeight: leading(fs.nano) }}>{packMsg}</Text>
            ) : null}
            {/* IT ROLLS. This is the one figure on the sheet the stepper exists
                to move — press + and it changes under your thumb — and it was
                the last big number in Nutrition that jump-cut while the day's
                gap, the meal total and the ledger three inches away all
                travelled. Same argument DayGap makes for its own hero: only the
                changed digits move, so one event reads as one event. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <RollingNumber
                value={String(sc(portion.kcal))}
                align="center"
                style={{ fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk }}
              />
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking(fs.caption, "label"), textTransform: "uppercase", color: C.ash }}>kcal</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              {([["w.recovery.nutrition.protein", txt(C, C.blue), portion.protein], ["w.recovery.nutrition.carbs", txt(C, C.amber), portion.carbs], ["w.recovery.nutrition.fat", txt(C, C.red), portion.fat]] as const).map(([lab, col, base]) => (
                <View key={lab} style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 12 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: col }}>{t(lab)}</Text>
                  <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk, marginTop: 4 }}>{sc(base)}<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}> g</Text></Text>
                </View>
              ))}
            </View>
            {/* THE LABEL PANEL FOLDS, and this sheet is the reason.
                It was always open, directly under three tiles reading protein,
                carbs and fat — and its own first four rows are energy, fat,
                carbs and protein. The same three figures twice, two hundred
                pixels apart, which is the one arrangement that makes a reader
                stop and check whether they agree.

                Which one gives way is not a toss-up, because this screen has
                already written down what it is for: "a sheet is for adding a
                food you already trust, a page is for deciding whether to trust
                it" (see the product-page note above). A full label panel open by
                default is the PAGE's job arriving on the sheet. The tiles are
                the summary and stay; the panel is the detail and is one tap
                away — behind the same control, in the same words, as the Create
                form's own "More detail" thirty pixels into its sibling screen.

                It still carries what the tiles cannot: saturates, sugars, fibre,
                salt, the kJ figure, the per-100 g column and the em dashes that
                say NOT STATED rather than zero. */}
            <Pressable
              onPress={() => listMotion(() => setPortionFacts((x) => !x))}
              accessibilityRole="button"
              accessibilityState={{ expanded: portionFacts }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.lg, paddingVertical: space.xs, paddingHorizontal: space.xxs }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.facts.moreDetail")}</Text>
              <FoldChevron open={portionFacts} color={C.ash} />
            </Pressable>
            {portionFacts ? (
              <FactsPanel
                C={C}
                scale={q}
                facts={{ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }}
                per100={per100g({ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }, portion.servingGrams)}
              />
            ) : null}
            {/* EDITING THE FOOD ITSELF, from the sheet that just showed you it
                was wrong. A door, not a card: it leaves for the form. */}
            {portion.productId ? (
              <Pressable
                onPress={() => { const p = products.find((x) => x.id === portion.productId); setPortion(null); if (p) openEditProduct(p); }}
                accessibilityRole="button"
                style={{ alignSelf: "center", marginTop: 14, paddingVertical: 4 }}
              >
                <CtaLabel label={`${t("w.recovery.nutrition.pt.editThisFood")} →`} color={C.ash} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label") }} />
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              {portion.offFood ? <Pressable onPress={() => { const ff = portion.offFood; setPortion(null); if (ff) saveFood(ff); }} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.saveToFoods")}</Text></Pressable> : null}
              <Pressable onPress={commitPortion} style={{ flex: 1, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.logToMeal").replace("{meal}", partLabel(mealType))}</Text></Pressable>
            </View>
          </View>
        );
      })() : null}
    </Sheet>
  );

  // Quick Log — the fast kcal + macro entry, opened from the picker.
  const renderQuickLog = () => (
    <Sheet visible={quickLog} onClose={() => setQuickLog(false)} title={t("w.recovery.nutrition.quickLog")} sub={t("w.recovery.nutrition.quickLogSub")}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {([
          { k: "kcal" as const, label: t("w.recovery.nutrition.calorie"), color: txt(C, C.lime), unit: "kcal" },
          { k: "protein" as const, label: t("w.recovery.nutrition.protein"), color: txt(C, C.blue), unit: "g" },
          { k: "carbs" as const, label: t("w.recovery.nutrition.carbs"), color: txt(C, C.amber), unit: "g" },
          { k: "fat" as const, label: t("w.recovery.nutrition.fat"), color: txt(C, C.red), unit: "g" },
        ]).map((tile) => (
          <View key={tile.k} style={{ width: "47.5%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: tile.color }}>{tile.label}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 4 }}>
              <TextInput value={f[tile.k]} onChangeText={(v) => setF((s) => ({ ...s, [tile.k]: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={withAlpha(C.ash, GHOST_PLACEHOLDER_ALPHA)} accessibilityLabel={tile.label} style={{ flex: 1, fontFamily: F.black, fontSize: 27, letterSpacing: tracking(27), color: C.chalk, padding: 0 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{tile.unit}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <APill label={t("w.recovery.nutrition.addMeal")} savingLabel={t("w.recovery.nutrition.adding")} state={saving ? "saving" : "idle"} onPress={async () => { if (await add()) setQuickLog(false); }} style={{ flex: 1 }} />
        <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityState={{ busy: scanning }} accessibilityLabel={t(scanning ? "w.recovery.nutrition.scanning" : "w.recovery.nutrition.scanLabel")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: withAlpha(pa.fill, ALPHA.rim), borderRadius: RADIUS.pill, paddingVertical: 16 }}><View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>{scanning ? <ActivityIndicator size="small" color={pa.text} /> : <Glyph name="scan" size={16} color={pa.text} />}</View><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: pa.text }}>{t("w.recovery.nutrition.scanLabel")}{!full ? " ✦" : ""}</Text></Pressable>
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
      {/* Glass, like every other nav circle — the bare `clear` glyph this head
          used to draw was retired with core's clear state (hero.ts §7). */}
      <HeroNav onPress={onBack} mode={opts?.icon === "back" ? "page" : "takeover"} onDark={false} />
      <View style={{ flex: 1, alignItems: "center" }}>
        {typeof title === "string" ? (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: HERO_INLINE_TITLE.size, lineHeight: HERO_INLINE_TITLE.lineHeight, letterSpacing: HERO_INLINE_TITLE.tracking * HERO_INLINE_TITLE.size, color: C.chalk }}>{title}</Text>
        ) : (
          title
        )}
      </View>
      <View style={{ width: HERO.nav.hit, alignItems: "center" }}>{opts?.right}</View>
    </View>
  );

  // ============ ADD TO MEAL — the food picker ============
  if (view === "add") {
    // RECENT, SPLIT BY THE CLOCK: the usuals for this hour are drawn under
    // their own head, and everything else follows under its own. The hour is a
    // RANKING of Recent, not a fifth source beside it.
    const usualKeys = new Set(usuals.map((u) => u.item.key));
    const restOfRecent = recent.filter((r) => !usualKeys.has(r.key));
    const foods: QuickFood[] =
      foodTab === "recent" ? recent
      : foodTab === "favorites" ? favorites
      : products.map((p) => ({ key: `p:${p.id}`, name: p.name, subname: p.subname, serving: p.servingLabel, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat,
          // Carried so STARRING one keeps the whole food — a favourite is stored
          // as this shape, and a stripped copy loses the serving weight (and so
          // the gram conversion), the micros and the verified provenance.
          satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt, servingGrams: p.servingGrams, portions: productPortions(p), verifiedId: p.verifiedId }));
    const sourceCounts: Record<PickerSourceKey, number> = {
      recent: recent.length, favorites: favorites.length, meals: meals.length, personal: products.length,
    };
    // ONE row renderer, used by both groups of the hour split below.
    const recentRow = (food: QuickFood) => {
              const prodId = food.key.startsWith("p:") ? food.key.slice(2) : null;
      const product = prodId ? products.find((x) => x.id === prodId) ?? null : null;
      const days = usualDays.get(food.key);
      const isRecent = foodTab === "recent";
      // WHAT THE HOLD OFFERS DEPENDS ON WHAT THE ROW IS. A saved food is a row
      // in the database — it edits and it deletes. A recent and a favourite are
      // per-device lists, and the only honest verb for either is FORGET: they
      // hold no food of their own, and deleting the entry from one of them must
      // not be dressed up as deleting the food.
      const menu: HoldMenuItem[] = product
        ? savedFoodMenu(t)
        : [{ key: "forget", label: t(isRecent ? "w.recovery.nutrition.hold.forget" : "w.recovery.nutrition.hold.unstar"), destructive: true }];
      const runMenu = (key: string) => {
        if (product && key === "edit") { openEditProduct(product); return; }
        if (product && key === "delete") { askDeleteProduct(product.id); return; }
        if (isRecent) forgetRecent(food.key); else toggleFavorite(food);
      };
      return (
        <FoodRow
          key={food.key} C={C}
          name={food.name}
          subname={food.subname}
          // A row that jumped the queue says WHY: the count is the
          // evidence, not an ornament.
          meta={`${Math.round(food.kcal)} kcal  –  ${food.serving || t("w.recovery.nutrition.serving")}${isRecent && days ? `  –  ${t("w.recovery.nutrition.pick.atThisHour").replace("{n}", String(days))}` : ""}`}
          // The one thing the row cannot be read off the screen: whether THIS
          // food takes the day past its target. A statement, never a block — an
          // athlete who wants the extra 400 kcal is not asking permission.
          over={wouldOvershoot(pickerGap, food.kcal)}
          // ONE TAP on a recent. An MRU entry is a food PLUS its
          // serving, so re-logging it needs no question answering —
          // the portion editor is still one tap away on the row body,
          // for the evening the amount is different.
          // ⊕ LOGS, on every row of every source. It used to open the portion
          // sheet for a saved food and log outright for a recent — the same
          // glyph meaning two different things one tab apart.
          onAdd={() => { if (product) void logOneServing(product, setMealMsg); else if (isRecent) relogRecent(food); else logQuickFood(food); }}
          // …and the BODY opens the editor, on every row of every source.
          onOpen={product ? () => logProduct(product) : () => logQuickFood(food)}
          starred={isFavorite(food.key)}
          onStar={() => toggleFavorite(food)}
          // The SWIPE and the HOLD fire the same delete now. It used to be the
          // bare `removeProduct` — the one path in the app that dropped a saved
          // food with no undo, while the pantry's identical swipe held it.
          onDelete={product ? () => askDeleteProduct(product.id) : isRecent ? () => forgetRecent(food.key) : undefined}
          menu={menu}
          onMenu={runMenu}
          // THE PACKS. A recent carries the food's portions with it (that is why
          // QuickFood stores them), so the whole bottle is one tap here too —
          // but it is only REMOVABLE where there is a row to write it back to.
          portions={rowPortions(food)}
          onLogPortion={(unitId) => {
            if (product) { void logProductPortion(product, unitId, setMealMsg); return; }
            setMealMsg("");
            void logWholePortion(food, unitId).then((ok) => { if (ok) setMealMsg(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType))); });
          }}
          portionMenu={product ? packMenu(t) : undefined}
          onPortionMenu={product ? (unitId) => { void removeProductPortion(product, unitId); } : undefined}
        />
      );
    };

    // The two doors at the end of the list. Both LEAVE — Quick Log opens a
    // sheet, New food opens a screen — so both wear the exit rule's ring.
    const doors = (
      <>
        <PickerDoor C={C} title={t("w.recovery.nutrition.quickLog")} icon={<Glyph name="bolt" size={16} color={C.ash} />} onPress={() => setQuickLog(true)} />
        <PickerDoor
          C={C} last
          title={answer.kind === "matches" && answer.matches.length === 0 && answer.query
            ? t("w.recovery.nutrition.pick.newNamed").replace("{v}", answer.query)
            : t("w.recovery.nutrition.pick.newFood")}
          icon={<Glyph name="plus" size={17} color={C.ash} />}
          onPress={() => openCreate("product", answer.kind === "matches" ? answer.query : "")}
        />
      </>
    );
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load} scrollRef={pickerScroller}>
        {screenHead(
          // The meal switcher. On iOS 26 it IS a system menu — the meals as an
          // inline picker (checkmark on the one in force) with "Add a meal
          // part" behind a divider; elsewhere it opens the chooser sheet.
          LIQUID_GLASS_RENDERED ? (
            <GlassSelectMenu
              label={partLabel(mealType)}
              // THE HERO SYSTEM'S INLINE TITLE, not a hand-rolled one. Both
              // branches of this switcher drew the display face's heaviest cut at 19 — a face and
              // a size that appear on no other screen head in the app, so the
              // picker's title sat 3pt above every title it pushes from. The
              // rank owns the type (reference/hero-system.md §2).
              fontFamily={F.bold}
              fontSize={HERO_INLINE_TITLE.size}
              labelColor={C.chalk}
              a11yLabel={t("w.recovery.nutrition.chooseMeal")}
              options={partList.map((p) => ({ id: p.key, label: p.label }))}
              value={mealType}
              onPick={(k) => setMealType(k)}
              extras={full ? [{ key: "addPart", label: t("w.recovery.nutrition.addPart") }] : undefined}
              onExtra={() => setPartSheet(true)}
            />
          ) : (
            <Pressable onPress={() => setMealPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                maxFontSizeMultiplier={FIXED_FONT_SCALE}
                numberOfLines={1}
                style={{ fontFamily: F.bold, fontSize: HERO_INLINE_TITLE.size, lineHeight: HERO_INLINE_TITLE.lineHeight, letterSpacing: HERO_INLINE_TITLE.tracking * HERO_INLINE_TITLE.size, color: C.chalk }}
              >
                {partLabel(mealType)}
              </Text>
              <Glyph name="chevron-down" size={16} color={C.chalk} />
            </Pressable>
          ),
          () => setView("home"),
          {
            // BACK, not a second dismiss chevron: the head used to draw a ⌄ on
            // the left and the meal switcher a ⌄ beside the title — one glyph,
            // two jobs, on the same row.
            icon: "back",
            // THE SCANNER MOVES HERE, into the head's one trailing slot, which
            // this screen had left empty. It used to be the field's trailing
            // glyph — right while the field was always on screen, wrong the
            // moment the field went behind the bar's circle: scanning a label
            // is a PRIMARY way to add a food, and a scanner two taps deep is a
            // scanner nobody uses. The head is the one row that is always
            // there.
            right: (
              <Pressable
                onPress={() => { setFoodMsg(""); setScanSheet(true); }}
                accessibilityRole="button"
                accessibilityLabel={t("w.recovery.nutrition.scan.title")}
                hitSlop={HIT_SLOP}
                style={{ width: HERO.nav.hit, height: HERO.nav.hit, alignItems: "center", justifyContent: "center" }}
              >
                <Glyph name="barcode" size={21} color={C.chalk} />
              </Pressable>
            ),
          },
        )}

        <Sheet visible={mealPicker} onClose={() => setMealPicker(false)} title={t("w.recovery.nutrition.chooseMeal")}>
          {/* The pick-one row in a sheet is the kit's `AChoice` now, with its
              leading `glyph`. It drew its own before: a trailing check ICON that
              VANISHED when unpicked, so an unpicked row said nothing about being
              pickable — and the unit sheet 400 lines below drew the same row
              with a different label face. */}
          <View style={{ gap: space.ms }}>
            {partList.map((p) => (
              <AChoice
                key={p.key}
                sheet
                active={mealType === p.key}
                title={p.label}
                glyph={(color) => <Glyph name={mealGlyph(p.key)} size={20} color={color} />}
                onPress={() => { haptic.selection(); setMealType(p.key); setMealPicker(false); }}
              />
            ))}
            {full ? (
              <Pressable onPress={() => { setMealPicker(false); setPartSheet(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: RADIUS.field, padding: 16 }}>
                <Glyph name="plus" size={18} color={C.ash} />
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}>{t("w.recovery.nutrition.addPart")}</Text>
              </Pressable>
            ) : null}
          </View>
        </Sheet>

        <BarcodeScanSheet visible={scanSheet} onClose={() => setScanSheet(false)} onCode={onScanned} />

        {/* ── THE HEAD MATTER ──────────────────────────────────────────────
            Everything above the list, as ONE stack with ONE owner of the space
            in it. These four blocks each used to declare how much room the next
            one got — the day header's 20dp bottom pad, the confirmation line's
            12dp top margin, the source line's 16 — so the screen's rhythm was
            the sum of three unrelated decisions and could not be read off any
            single line of code. `gap: BLOCK` is that rhythm, chosen once.
            (Null children take no gap, so a day with no target, no confirmation
            and a typed query still spaces correctly.)

            THE SEAM UNDER IT is the stack's own step, and only at rest. The
            source switch used to end in a hairline the LIST borrowed as its top
            edge, so the two touched; a segmented track is an object, not a rule,
            and an object sitting on the first row is the one spacing this screen
            has never had to state. At rest it takes BLOCK, like every other seam
            in the stack. TYPED, it stays 0: that branch opens on an ASection,
            which brings its own `marginTop` — adding to it would be the "sum of
            unrelated decisions" this stack exists to end. */}
        <View style={{ gap: BLOCK, marginBottom: answer.kind === "resting" ? BLOCK : 0 }}>
          {/* THE GAP first — the screen's subject. It renders only when there is
              a target to be short of. */}
          {pickerGap ? (
            <DayGap
              C={C}
              gap={pickerGap}
              mealLabel={partLabel(mealType)}
              mealKcal={mealTotals[mealType] ?? 0}
            />
          ) : null}

          {/* THE ONE FIELD, now behind the bar's circle. Quick add and the
              database search were two boxes asking the same question; this is
              that question, asked once — and asked only when asked for.
              The EDGE is the parent's to give — the field is a container, and a
              container that sets its own outer margin is a block deciding where
              the screen's column is. */}
          {pickerSearch ? (
          <View style={{ paddingHorizontal: PICKER_EDGE }}>
            <PickerField
              inputRef={pickerInput}
              autoFocus
              onCancel={closePickerSearch}
              value={foodQuery}
              onChange={setFoodQuery}
              onSubmit={() => {
                // Enter commits the FIRST interpretation — the one on screen.
                const s = pickerSubmit(answer);
                if (s.kind === "macros") { logQuickAdd(macroDraft(s.macros, t("w.recovery.nutrition.quickEntry"))); setFoodQuery(""); }
                else if (s.kind === "log") { logQuickAdd(quickAddDraft(s.match)); setFoodQuery(""); }
                else if (s.kind === "portion") portionForQuickAdd(s.match);
              }}
            />
          </View>
          ) : null}

          {/* A one-tap add is invisible unless the screen says so. Same confirmation
              line the hub and the diary already use; a FAILED write is already
              surfaced by logEntry's notify(), so this slot only carries success. */}
          {mealMsg ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: PICKER_EDGE }}>
              <AuroraIcon name="check" size={13} color={txt(C, C.lime)} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{mealMsg}</Text>
            </View>
          ) : null}

          {/* THE UNDO FOLLOWS THE DELETE. This screen deletes saved foods now —
              the hold's menu and the swipe both run `askDeleteProduct`, which
              holds the row for six seconds so the food that comes back is the
              food that left rather than a new id every recipe ingredient has
              stopped pointing at. A held delete with the bar only on the OTHER
              screen would be a promise made where nobody can see it. */}
          {pendingDelete ? (
            <View style={{ paddingHorizontal: PICKER_EDGE }}>
              <UndoToast label={t("w.recovery.nutrition.pn.deleted").replace("{v}", pendingDelete.name)} onUndo={undoDeleteProduct} />
            </View>
          ) : null}

          {/* THE FOUR SOURCES, on the app's ONE segmented control — the same
              track, lens and spring as the Today hub, the This-week filter and
              the Trends switcher one tap away, with the counts riding ASegment's
              `meta` slot. It is the LAST block of the head matter; SourceSwitch's
              header has the full account of why this screen drew its own control
              for three passes and no longer does. */}
          {answer.kind === "resting" ? (
            <SourceSwitch value={foodTab} counts={sourceCounts} onChange={(k) => listMotion(() => setFoodTab(k))} />
          ) : null}
        </View>

        {answer.kind === "resting" ? (
          /* AT REST — all four sources, switchable, with the box gone. */
          <>
            {foodTab === "meals" ? (
              meals.length === 0 ? (
                <Text style={{ ...ty(C, "caption"), paddingVertical: space.lg, paddingHorizontal: PICKER_EDGE }}>{t("w.recovery.nutrition.mealsEmptyPicker")}</Text>
              ) : meals.map((m) => (
                <FoodRow
                  key={m.id} C={C}
                  name={m.name}
                  subname={m.subname}
                  meta={`${Math.round(m.kcal)} kcal  –  ${Math.round(m.protein)}P ${Math.round(m.carbs)}C ${Math.round(m.fat)}F`}
                  onAdd={() => logMeal(m)}
                  onDelete={() => removeMeal(m.id)}
                  menu={[{ key: "delete", label: t("w.recovery.nutrition.deleteMeal"), destructive: true }]}
                  onMenu={() => removeMeal(m.id)}
                />
              ))
            ) : foods.length === 0 ? (
              <Text style={{ ...ty(C, "caption"), paddingVertical: space.lg, paddingHorizontal: PICKER_EDGE }}>{t(foodTab === "personal" ? "w.recovery.nutrition.personalEmpty" : foodTab === "favorites" ? "w.recovery.nutrition.favoritesEmpty" : "w.recovery.nutrition.recentEmptyPicker")}</Text>
            ) : foodTab === "recent" && usuals.length ? (
              /* THE HOUR. The app knows the clock and the meal, so Recent
                 opens on what this athlete actually eats around now — and
                 the head covers ONLY those rows. The rest of the MRU follows
                 under its own head, because a recent that happens to sit in
                 this list is not a habit and must not be labelled as one.
                 A cold start has no habit, so `usuals` is empty and the list
                 stays exactly as it was — no empty state, nothing claimed. */
              <>
                <ASection title={t("w.recovery.nutrition.pick.usualHour")} meta={clockLabel} style={{ paddingHorizontal: PICKER_EDGE }} />
                {usuals.map((u) => recentRow(u.item))}
                {restOfRecent.length ? (
                  <>
                    <ASection title={t("w.recovery.nutrition.pick.everythingElse")} style={{ paddingHorizontal: PICKER_EDGE }} />
                    {restOfRecent.map(recentRow)}
                  </>
                ) : null}
              </>
            ) : foods.map(recentRow)}
            {doors}
          </>
        ) : (
          /* TYPED — what the grammar understood, then the athlete's own foods
             ranked across ALL FOUR sources at once (you never have to know
             which list a food is in), then the world under a section head. */
          <>
            <ASection
              title={t("w.recovery.nutrition.pick.understood")}
              meta={answer.kind === "macros" ? t("w.recovery.nutrition.pick.quickAdd") : t("w.recovery.nutrition.pick.allSources")}
              style={{ paddingHorizontal: PICKER_EDGE }}
            />
            <Understood
              answer={answer}
              entryName={t("w.recovery.nutrition.quickEntry")}
              onLog={(d) => { logQuickAdd(d); setFoodQuery(""); }}
              onPortion={portionForQuickAdd}
            />
            {answer.kind === "matches" && answer.matches.length === 0 ? <NoneOfYours query={answer.query} /> : null}

            {remoteQuery ? (
              <>
                <ASection title={t("w.recovery.nutrition.pick.database")} meta={t("w.recovery.nutrition.pick.databaseMeta")} style={{ paddingHorizontal: PICKER_EDGE }} />
                {searching ? (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: space.lg, paddingHorizontal: PICKER_EDGE }}>{t("w.recovery.nutrition.searching")}</Text>
                ) : foodResults.length === 0 ? (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: space.lg, paddingHorizontal: PICKER_EDGE, lineHeight: leading(fs.caption) }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
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
              </>
            ) : null}
            {doors}
          </>
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
      <View style={{ flex: 1, backgroundColor: C.ink2, borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 8 }}>
          {fixed != null
            ? <Text style={{ flex: 1, fontFamily: F.takeover, fontSize: fs.display, letterSpacing: tracking(fs.display), color: C.chalk }}>{fixed}</Text>
            : <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={label} style={{ flex: 1, fontFamily: F.takeover, fontSize: fs.display, letterSpacing: tracking(fs.display), color: C.chalk, padding: 0 }} />}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>g</Text>
        </View>
      </View>
    );
    const approx = macroKcal(createForm.protein, createForm.carbs, createForm.fat);
    // The measure THIS serving can be poured or weighed in — the unit the pack
    // size below is stated in. A food whose serving is a bare count ("1 slice")
    // has none, and is not asked how big its pack is: the answer would have no
    // unit to be in (core/portion.ts).
    // Composed UNCONDITIONALLY. `composeServingLabel` already reads a blank or
    // unparseable quantity as 1 — the same 1 the field shows as its placeholder
    // — so guarding on the text being non-empty only made the block vanish while
    // the row above it still read "per 1 Grams".
    const createMeasure = portionMeasure({ serving: composeServingLabel(createForm.serving, createForm.unit) });
    const compList = compQuery.trim() ? products.filter((p) => p.name.toLowerCase().includes(compQuery.trim().toLowerCase()) || (p.subname ?? "").toLowerCase().includes(compQuery.trim().toLowerCase())) : products;
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(editingProduct ? t("w.recovery.nutrition.pt.editFood") : isMeal ? t("w.recovery.nutrition.createMeal") : t("w.recovery.nutrition.createFood"), () => { setEditingProduct(null); setView("add"); }, {
          // No label-scan while EDITING: that control overwrites the form from a
          // photo, which is the opposite of the gesture somebody makes when they
          // have opened a food to correct one field of it.
          right: editingProduct ? undefined : (
            <Pressable onPress={scanIntoCreate} accessibilityLabel={t(scanning ? "w.recovery.nutrition.scanning" : "w.recovery.nutrition.scanLabel")} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Glyph name="scan" size={19} color={pa.text} />
            </Pressable>
          ),
        })}

        {/* Title plate — Name + the personal Subname, one surface. */}
        <LinearGradient colors={[withAlpha(C.lime, 0.07), C.ink2]} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: CARD_PAD }}>
          <Text style={{ ...ty(C, "overline"), marginBottom: 8  }}>{t("w.recovery.nutrition.foodName")}</Text>
          <TextInput value={createForm.name} onChangeText={(v) => setCF({ name: v })} placeholder={t("w.recovery.nutrition.foodNamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.foodName")} style={{ fontFamily: F.black, fontSize: 27, letterSpacing: tracking(27), color: C.chalk, padding: 0 }} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />
          <TextInput value={createForm.subname} onChangeText={(v) => setCF({ subname: v })} placeholder={t("w.recovery.nutrition.subnamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.subname")} style={{ fontFamily: F.reg, fontSize: fs.subtitle, color: C.ash, padding: 0 }} />
        </LinearGradient>

        {/* Macro hero — calories as the big number, P/C/F as three tiles. When
            the meal is built from products these show the summed total. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {fromComps
            ? <Text style={{ width: 172, textAlign: "center", fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk }}>{compTotals.kcal}</Text>
            : <TextInput value={createForm.kcal} onChangeText={(v) => setCF({ kcal: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.calorie")} style={{ width: 172, textAlign: "center", fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk, padding: 0 }} />}
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, letterSpacing: tracking(fs.body, "label"), textTransform: "uppercase", color: C.ash }}>kcal</Text>
        </View>
        <Text style={{ textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.calorie")}</Text>
        {!fromComps && approx > 0 && !createForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 8 }}>{t("w.recovery.nutrition.macrosApprox")} {approx} kcal</Text> : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
          {tile(t("w.recovery.nutrition.protein"), txt(C, C.blue), createForm.protein, (v) => setCF({ protein: v }), fromComps ? compTotals.protein : undefined)}
          {tile(t("w.recovery.nutrition.carbs"), txt(C, C.amber), createForm.carbs, (v) => setCF({ carbs: v }), fromComps ? compTotals.carbs : undefined)}
          {tile(t("w.recovery.nutrition.fat"), txt(C, C.red), createForm.fat, (v) => setCF({ fat: v }), fromComps ? compTotals.fat : undefined)}
        </View>

        {/* The label panel — optional, folded away. Anything left blank stays
            NOT STATED rather than becoming a zero the diary would believe. */}
        <Pressable
          onPress={() => listMotion(() => setShowPanelFields((x) => !x))}
          accessibilityRole="button"
          accessibilityState={{ expanded: showPanelFields }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingVertical: 6, paddingHorizontal: 2 }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.facts.moreDetail")}</Text>
          <FoldChevron open={showPanelFields} color={C.ash} />
        </Pressable>
        {showPanelFields ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {([["satFat", "w.recovery.nutrition.facts.satFat"], ["sugar", "w.recovery.nutrition.facts.sugar"], ["fiber", "w.recovery.nutrition.facts.fiber"], ["salt", "w.recovery.nutrition.facts.salt"]] as const).map(([key, lab]) => (
              // The MACRO TILE's own box, because this is the macro tile's own
              // object: a labelled numeric field. It was drawn on `ink` with a
              // border while the three tiles thirty pixels above sat on `ink2`
              // with none — same thing, two spellings, and the bordered one
              // read as a different KIND of field rather than as more of them.
              <View key={key} style={{ width: "47.5%", flexGrow: 1, backgroundColor: C.ink2, borderRadius: RADIUS.field, paddingVertical: space.md, paddingHorizontal: space.md }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={ty(C, "kicker")}>{t(lab)}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <TextInput
                    value={createForm[key]}
                    onChangeText={(v) => setCF({ [key]: v } as Partial<typeof createForm>)}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={withAlpha(C.ash, GHOST_PLACEHOLDER_ALPHA)}
                    accessibilityLabel={t(lab)}
                    style={{ flex: 1, fontFamily: F.black, fontSize: fs.headline, color: C.chalk, padding: 0, paddingTop: 3 }}
                  />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>g</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Products — compose a meal from your saved products (meal only). Each
            component carries a serving count; the macros above are their sum. */}
        {isMeal ? (
          <View style={{ marginTop: 24 }}>
            {/* THE SHARED HEAD, not a hand-rolled copy of it. This block drew
                the standard by hand (F.black/fs.title + a mono count) while the
                Packs block below drew a GroupMark — two spellings of one object,
                forty pixels apart in one form. */}
            <ASection
              title={t("w.recovery.nutrition.mealProducts")}
              meta={mealComps.length > 0 ? String(mealComps.length) : undefined}
              style={{ marginTop: 0 }}
            />
            {mealComps.map((c) => (
              <View key={c.productId} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}><Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{c.name}</Text>{c.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{c.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{Math.round(c.kcal * c.qty)} kcal — {Math.round(c.protein * c.qty)}P {Math.round(c.carbs * c.qty)}C {Math.round(c.fat * c.qty)}F</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, overflow: "hidden" }}>
                  <Pressable onPress={() => setCompQty(c.productId, c.qty - 1)} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 32, height: 32, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: fs.title, color: txt(C, C.lime) }}>–</Text></Pressable>
                  <Text style={{ minWidth: 26, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{c.qty}</Text>
                  <Pressable onPress={() => setCompQty(c.productId, c.qty + 1)} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 32, height: 32, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: fs.title, color: txt(C, C.lime) }}>+</Text></Pressable>
                </View>
                <Pressable onPress={() => removeMealComp(c.productId)} accessibilityLabel={t("w.recovery.nutrition.remove")} hitSlop={8} style={{ padding: 2 }}><Text style={{ fontSize: fs.subtitle, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
            <APill
              label={t("w.recovery.nutrition.addProduct")}
              variant="outline"
              color={C.lime}
              glyph={(c) => <Glyph name="plus" size={15} color={c} />}
              onPress={() => { setCompQuery(""); setCompPicker(true); }}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : null}

        {/* Serving — one quiet line (products only; a meal logs as one serving). */}
        {!isMeal ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.recovery.nutrition.per")}</Text>
            <TextInput value={createForm.serving} onChangeText={(v) => setCF({ serving: v })} keyboardType="numeric" placeholder="1" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.servingLabel2")} style={{ width: 44, textAlign: "right", fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 2 }} />
            <Pressable onPress={() => setUnitPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{unitLabel(createForm.unit)}</Text><Glyph name="chevron-down" size={13} color={C.ash} />
            </Pressable>
          </View>
        ) : null}

        {/* THE PACKS — the whole bottle, the glass, the tub, each in the
            serving's own measure with the athlete's word for it. A LIST, because
            real foods have several: the kefir is a 400 ml bottle AND a 250 ml
            glass, and a form with one field could only ever record whichever was
            typed first. Only offered when the serving above can be measured at
            all: asking how many grams are in a pack of "1 slice" is a question
            with no answer.

            The ＋ is BARE and it GROWS IN PLACE — the exit rule's grammar. A ring
            here would promise a screen that does not exist. */}
        {!isMeal && createMeasure ? (
          <View style={{ marginTop: 24 }}>
            {/* The same head as Products above it, and the count is the one the
                athlete needs: a food carries at most MAX_FOOD_PORTIONS, and the
                ＋ disappears at the cap without saying why. */}
            <ASection
              title={t("w.recovery.nutrition.pt.packs")}
              meta={createForm.packs.length > 0 ? `${createForm.packs.length} / ${MAX_FOOD_PORTIONS}` : undefined}
              style={{ marginTop: 0 }}
            />
            {createForm.packs.map((pk) => (
              <View key={pk.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <TextInput
                  value={pk.size}
                  onChangeText={(v) => setPack(pk.key, { size: v })}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={C.ash}
                  accessibilityLabel={t("w.recovery.nutrition.pt.packSize")}
                  style={{ width: 62, textAlign: "right", fontFamily: F.monoBold, fontSize: fs.bodyLg, color: C.chalk }}
                />
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{createMeasure.unit}</Text>
                <TextInput
                  value={pk.label}
                  onChangeText={(v) => setPack(pk.key, { label: v })}
                  maxLength={24}
                  placeholder={t("w.recovery.nutrition.pt.packName")}
                  placeholderTextColor={C.ash}
                  accessibilityLabel={t("w.recovery.nutrition.pt.packName")}
                  style={{ flex: 1, minWidth: 0, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}
                />
                {/* WHERE THIS SIZE CAME FROM. A pack the athlete never typed has
                    to say so — otherwise a 400 the food database published is
                    indistinguishable from one they set, and there is no way to
                    know whether it is worth correcting. */}
                {/* WHERE THIS SIZE CAME FROM, as one word. The `pt.src*` strings
                    are SENTENCES ("pack size from the food database"), which is
                    right where they were written — centred on their own line
                    under the portion editor's stepper — and impossible in a row
                    that already holds two fields and a delete: measured, that
                    one runs 221dp of a 369dp row, and the German 304. The row
                    carries the flag; the sheet keeps the sentence. */}
                {pk.source !== "typed" ? (
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={ty(C, "kicker")}>
                    {t(`w.recovery.nutrition.pt.srcTag${pk.source === "catalog" ? "Catalog" : "Scanned"}`)}
                  </Text>
                ) : null}
                <Pressable onPress={() => removePack(pk.key)} accessibilityLabel={t("w.recovery.nutrition.hold.removePack")} hitSlop={8} style={{ padding: 2 }}>
                  <Text style={{ fontSize: fs.subtitle, color: C.ash }}>×</Text>
                </Pressable>
              </View>
            ))}
            {createForm.packs.length < MAX_FOOD_PORTIONS ? (
              /* The expander grammar, on this list's own left edge. The house
                 standard (endurance-lanes' All-sports control) sets the bare ＋
                 at fs.title in ash — taken — but boxes it 32dp and follows with
                 a chalk label, because ITS rows lead with a 32dp mark and the
                 control has to align with them. These rows lead with a FIELD at
                 x=0, so the same box would put this label 44dp inside every row
                 above it and draw a step down the block's left edge. Same
                 glyph, same rung, same ash; the lead is the list's, not the
                 other list's. The label stays in the quiet meta voice: this
                 block already carries a bold head, and a second chalk-bold line
                 four rows under it would be the title twice. */
              <Pressable onPress={addPack} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 14 }}>
                <Text style={{ fontSize: fs.title, color: C.ash }}>＋</Text>
                <CtaLabel label={t("w.recovery.nutrition.pt.addPack")} color={C.ash} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label") }} />
              </Pressable>
            ) : null}
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4, lineHeight: leading(fs.nano) }}>{t("w.recovery.nutrition.pt.packHint")}</Text>
          </View>
        ) : null}

        <Pressable onPress={submitCreateFood} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 16, marginTop: 28 }}>
          <Glyph name="plus" size={18} color={C.onAccent} /><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{editingProduct ? t("w.recovery.nutrition.pt.saveChanges") : isMeal ? t("w.recovery.nutrition.saveMeal") : t("w.recovery.nutrition.saveProduct")}</Text>
        </Pressable>

        <Sheet visible={unitPicker} onClose={() => setUnitPicker(false)} title={t("w.recovery.nutrition.unit")}>
          <View style={{ gap: space.ms }}>
            {SERVING_UNITS.map(({ id: u }) => (
              <AChoice
                key={u}
                sheet
                active={createForm.unit === u}
                title={unitLabel(u)}
                onPress={() => { haptic.selection(); setCreateForm((s) => ({ ...s, unit: u })); setUnitPicker(false); }}
              />
            ))}
          </View>
        </Sheet>

        {/* Add product — pick from the saved-products library to compose the meal. */}
        <Sheet visible={compPicker} onClose={() => setCompPicker(false)} title={t("w.recovery.nutrition.addProduct")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 10 }}>
            <AuroraIcon name="search" size={17} color={C.ash} />
            <TextInput value={compQuery} onChangeText={setCompQuery} placeholder={t("w.recovery.nutrition.searchProducts")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, padding: 0 }} />
          </View>
          {products.length === 0 ? (
            <Text style={{ ...ty(C, "caption"), paddingVertical: 16 }}>{t("w.recovery.nutrition.noProductsYet")}</Text>
          ) : compList.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16 }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
          ) : compList.map((p) => {
            const added = mealComps.find((c) => c.productId === p.id);
            return (
              <Pressable key={p.id} onPress={() => addMealComp(p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><Glyph name="plus" size={16} color={txt(C, C.lime)} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}><Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{p.name}</Text>{p.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{p.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel || t("w.recovery.nutrition.serving")} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                {added ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>×{added.qty}</Text> : null}
              </Pressable>
            );
          })}
          <APill label={t("w.recovery.nutrition.done")} onPress={() => setCompPicker(false)} style={{ marginTop: 10 }} />
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
          // The same control the recipe pages put in this slot, down to the
          // mark: a flat ash glyph in a bare box was the last share on this tab
          // that answered the thumb with nothing, on the one page whose whole
          // job is to be worth passing on.
          right: (
            <HeroAction
              glyph={SHARE_MARK.glyph}
              fallbackGlyph={SHARE_MARK.fallback}
              onDark={false}
              label={`${t("w.recovery.nutrition.shareLink")} – ${f.name}`}
              onPress={() => {
                // The https form, not hybrid:// — a link is only worth sharing
                // if it opens for someone who hasn't installed the app. The
                // universal-link entitlement is what makes it open IN the app;
                // until that ships it lands on the web page, which is the right
                // fallback rather than a dead scheme.
                Share.share({ message: `https://hybrid.app/app?s=nutrition&food=${f.id}` }).catch(() => {});
              }}
            />
          ),
        })}

        {/* WHOSE FOOD THIS IS — the mark leads, under its "published by" label. */}
        {src ? (
          <Pressable onPress={() => openSourcePage(src.id, "food")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 16, marginTop: 6 }}>
            <MarkPlate C={C} src={src} height={26} />
            <View style={{ flex: 1 }}>
              <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.publishedBy")}</Text>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 2 }}>{src.name}</Text>
            </View>
            <Glyph name="chevron" size={17} color={C.ash} />
          </Pressable>
        ) : null}

        {/* ONE name. The operator's own-language name is a search alias only —
            printing it under the English name put a second name on screen for a
            food we had already named, which read as clutter, not help. */}
        <Text style={{ fontFamily: F.takeover, fontSize: 32, letterSpacing: trackFigure(32), lineHeight: leading(32, "flush"), color: C.chalk, marginTop: 24 }}>{f.name}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>{t("w.recovery.nutrition.perLabel")} {f.servingLabel}</Text>

        {/* Energy hero — both units, because a label states both and we finally can. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 20 }}>
          <Text style={{ fontFamily: F.takeover, fontSize: fs.stat, letterSpacing: trackFigure(fs.stat), lineHeight: leading(fs.stat, "flush"), color: C.chalk }}>{f.facts.kcal}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking(fs.caption, "label"), textTransform: "uppercase", color: C.ash }}>kcal</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{kj(f.facts.kcal)} kJ</Text>
        </View>

        {/* Macro strip — the same idiom the recipe detail uses.
            ACard: the strip's own values are the ROW direction and the 6dp
            side pad (three flex columns centre their own text, so a 20 a side
            would only squeeze them); the fill, the hairline and the radius
            were the kit's, written out. This file already rendered eight real
            ACards, so on iOS 26 the split was INSIDE one screen — eight glass
            panels and this strip solid between them. */}
        <ACard style={{ flexDirection: "row", paddingVertical: CARD_PAD, paddingHorizontal: 6, marginTop: 16 }}>
          {([["w.recovery.nutrition.protein", f.facts.protein, C.blue], ["w.recovery.nutrition.carbs", f.facts.carbs, C.amber], ["w.recovery.nutrition.fat", f.facts.fat, C.red]] as const).map(([lab, val, col]) => (
            <View key={lab} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 21, color: C.chalk }}>{val}<Text style={{ fontSize: fs.caption, color: C.ash }}>g</Text></Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", marginTop: 5, color: txt(C, col) }}>{t(lab)}</Text>
            </View>
          ))}
        </ACard>

        <FactsPanel C={C} facts={f.facts} per100={p100} />
        {!p100 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, lineHeight: leading(fs.nano) }}>{t("w.recovery.nutrition.noServingWeight")}</Text>
        ) : null}

        {/* FROM THE PACK — what a shelf item declares beyond the numbers. A
            restaurant dish publishes none of this, so the whole card is absent
            rather than rendered empty. */}
        {f.packSize || f.ingredients || f.mayContain ? (
          <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16, marginTop: 16 }}>
            {f.packSize ? (
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.packSize")}</Text>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{f.packSize}</Text>
              </View>
            ) : null}
            {f.ingredients ? (
              <View style={f.packSize ? { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line } : null}>
                <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.ingredients")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: leading(fs.body, "relaxed") }}>{f.ingredients}</Text>
              </View>
            ) : null}
            {f.mayContain ? (
              <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.mayContain")}</Text>
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
        <View style={{ backgroundColor: withAlpha(C.lime, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.line), borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16, marginTop: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <VerifiedMark C={C} size={15} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.verified")}</Text>
              <Text style={{ ...ty(C, "caption"), marginTop: 4 }}>
                {t("w.recovery.nutrition.verifiedSub").replace("{source}", src?.name ?? "").replace("{date}", f.verifiedOn)}
              </Text>
              <Text style={{ ...ty(C, "caption"), marginTop: 8 }}>{f.provenance}</Text>
              {/* A stale item KEEPS its tick — the numbers were true when we
                  checked. It says out loud that it is due another look. */}
              {fresh.stale ? (
                <Text style={{ ...ty(C, "caption", txt(C, C.amber)), marginTop: 8 }}>{t("w.recovery.nutrition.verifiedStale")}</Text>
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
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.recovery.nutrition.moreFrom").replace("{source}", src?.name ?? "")}</Text>
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
                <Glyph name="chevron" size={16} color={C.ash} />
              </Pressable>
            ))}
            {/* THE DOOR — the list's own last row, carrying on to the whole
                menu. Same hairline and chevron as the rows above it, mono
                uppercase in ash so it reads as the way out rather than one
                more food. */}
            {src ? (
              <Pressable onPress={() => openSourcePage(src.id, "food")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 14, paddingHorizontal: 2 }}>
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), textTransform: "uppercase", color: C.ash }}>{t("w.explore.seeAll")}</Text>
                <Glyph name="chevron" size={16} color={C.ash} />
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
          <APill
            label={t("w.recovery.nutrition.saveToFoods")}
            variant="outline"
            color={C.lime}
            glyph={(c) => <Glyph name="plus" size={16} color={c} />}
            onPress={() => saveFood(hit)}
          />
          <APill label={t("w.recovery.nutrition.logThis")} onPress={() => logFood(hit)} style={{ flex: 1 }} />
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
              <Pressable key={src.id} onPress={() => openSourcePage(src.id, "sources")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 }}>
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
                <Glyph name="chevron" size={17} color={C.ash} />
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

        <Text style={{ fontFamily: F.black, fontSize: 27, letterSpacing: tracking(27), color: C.chalk, marginTop: 20 }}>{src.name}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, lineHeight: leading(fs.bodyLg, "relaxed"), marginTop: 8 }}>{src.note}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {([[t("w.recovery.nutrition.itemsChecked"), String(items.length)], [t("w.recovery.nutrition.lastChecked"), checked ?? "—"]] as const).map(([lab, val]) => (
            <View key={lab} style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={ty(C, "kicker")}>{lab}</Text>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: C.chalk, marginTop: 5 }}>{val}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginBottom: 6 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.recovery.nutrition.checkedItems")}</Text>
          <Text style={ty(C, "kicker")}>{items.length}</Text>
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
            <Glyph name="chevron" size={17} color={C.ash} />
          </Pressable>
        ))}

        <Text style={{ ...ty(C, "caption"), marginTop: 20, opacity: 0.85 }}>{src.trademark}</Text>
        {/* Where the artwork came from — sourceMarkCredits() had no surface at
            all until now. */}
        {src.mark ? (
          <Text style={{ ...ty(C, "caption"), opacity: 0.7, marginTop: 8, marginBottom: 20 }}>
            {t("w.recovery.nutrition.markCredit")} {src.mark.credit}
          </Text>
        ) : <View style={{ marginBottom: 20 }} />}
      </AuroraScreen>
    );
  }

  // ============ YOUR RECIPE — the editor, which is also the detail view ============
  // There is no separate read-only recipe page: a recipe you wrote is a document
  // you keep amending, so a read mode would be a navigation layer whose only job
  // is to hide a pencil.
  if (view === "myRecipe" && editRecipe) {
    return (
      <AuroraScreen scroll>
        {screenHead(
          editRecipe.id ? t("w.recovery.nutrition.editRecipe") : t("w.recovery.nutrition.newRecipe"),
          () => setView("recipes"),
          {
            // A dish you wrote can leave the phone too — as TEXT and nothing
            // else, because a private recipe has no public address to link to.
            // Only once it exists: a blank form has nothing to send.
            right:
              editRecipe.id && editRecipe.name.trim() ? (
                <HeroAction
                  glyph={SHARE_MARK.glyph}
                  fallbackGlyph={SHARE_MARK.fallback}
                  onDark={false}
                  label={`${t("w.recovery.nutrition.recipeShareAction")} – ${editRecipe.name}`}
                  onPress={() => {
                    Share.share({
                      message: userRecipeShareText(editRecipe, {
                        mins: shareLabels.mins,
                        serves: shareLabels.serves,
                        macros: shareLabels.macros,
                        ingredientsHead: shareLabels.ingredientsHead,
                        credit: shareLabels.credit,
                      }),
                    }).catch(() => {});
                  }}
                />
              ) : undefined,
          },
        )}
        <UserRecipeEditor
          recipe={editRecipe}
          products={recipeSources}
          onChange={setEditRecipe}
          onSave={saveRecipe}
          onDelete={editRecipe.id ? removeRecipe : undefined}
          onLog={editRecipe.id ? logRecipe : undefined}
          saving={recipeSaving}
          message={userRecipeMsg}
        />
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
    const searching = recipeQuery.trim().length > 0;
    const q = recipeQuery.trim().toLowerCase();
    // Your own recipes match on their NAME or on an ingredient's — the same two
    // fields core's searchRecipes reads on a curated one, so one query behaves
    // the same way whoever wrote the dish.
    const mineMatch = !searching
      ? userRecipes
      : userRecipes.filter(
          (r) => r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
        );
    const savedMatch = searching ? searchRecipes(saved, recipeQuery) : saved;
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
        trailing={
          <HeroAction
            glyph={SHARE_MARK.glyph}
            fallbackGlyph={SHARE_MARK.fallback}
            label={t("w.recovery.nutrition.recipeShareLibrary")}
            onPress={() => {
              Share.share({
                message: [
                  t("w.recovery.nutrition.recipes"),
                  `${RECIPES.length} ${t("w.recovery.nutrition.recipesCount")} – ${recipeShelves().map((sh) => collectionTitle(sh.key, t)).join(", ")}`,
                  "",
                  t("w.recovery.nutrition.recipeShareCredit"),
                  recipeLibraryShareLink(),
                ].join("\n"),
              }).catch(() => {});
            }}
          />
        }
        rail={shelves.length > 0 ? <CollectionRail keys={shelves.map((sh) => sh.key)} onJump={(k) => { const y = shelfTops.current[k]; if (y != null) recipeScroll.current?.scrollToChild(y); }} /> : undefined}
      >
        <View style={{ marginTop: 16 }}>
          {/* ASearch, not a bare field: it is the same AField with the CLEAR
              button attached, which is the one affordance that matters when a
              query returns nothing — and the one this screen was missing. */}
          <ASearch value={recipeQuery} onChange={setRecipeQuery} placeholder={t("w.recovery.nutrition.searchRecipes")} />
        </View>
        {/* THE QUERY SEARCHES THE WHOLE SCREEN, not just the curated half.
            The screen shows three kinds of recipe — the ones you wrote, the
            ones you kept, and the library — and the search used to read only
            the third, so typing "pasta" with a pasta recipe of your own
            answered "nothing matches". Your shelves stay while they match, and
            they stop carrying their resting chrome: no door row among results,
            no "you haven't written one yet" under a search that simply missed. */}
        {mineMatch.length > 0 || !searching ? (
          <UserRecipeShelf
            recipes={mineMatch}
            onOpen={(r) => openRecipeEditor(r)}
            onNew={searching ? undefined : () => openRecipeEditor()}
            canAdd={canSaveRecipe(persona, userRecipes.length)}
            onUpgrade={() => router.push("/upgrade")}
            emptyNote={!searching}
          />
        ) : null}
        {/* What you KEPT, between what you wrote and what we wrote. */}
        <SavedRecipeShelf recipes={savedMatch} openRecipe={(r) => openRecipe(r, "recipes")} />
        {shelves.length === 0 && mineMatch.length === 0 && savedMatch.length === 0 ? (
          <Empty title={t("w.recovery.nutrition.noRecipeMatches")} sub={t("w.recovery.nutrition.noRecipeMatchesSub")} />
        ) : (
          shelves.map((shelf) => (
            <RecipeShelf
              key={shelf.key}
              shelf={shelf}
              savedIds={savedIds}
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
      <CoverScreen
        cover={{ ...cover, duration: cover.count, stats: [] }}
        backLabel={t("w.recovery.nutrition.recipes")}
        back={() => setView("recipes")}
        trailing={
          <HeroAction
            glyph={SHARE_MARK.glyph}
            fallbackGlyph={SHARE_MARK.fallback}
            label={t("w.recovery.nutrition.recipeShareCollection")}
            onPress={() => {
              // A collection has no address of its own, so the message carries
              // what is IN it and links the library. Naming the dishes is the
              // part worth sending; the link is provenance.
              Share.share({
                message: [
                  `${collectionTitle(collection, t)} – ${t("w.recovery.nutrition.recipes")}`,
                  ...list.map((r) => `${r.name} – ${r.macros.kcal} kcal – ${r.timeMins} ${t("w.recovery.nutrition.min")}`),
                  "",
                  t("w.recovery.nutrition.recipeShareCredit"),
                  recipeLibraryShareLink(),
                ].join("\n"),
              }).catch(() => {});
            }}
          />
        }
      >
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
        trailing={
          <HeroAction
            glyph={SHARE_MARK.glyph}
            fallbackGlyph={SHARE_MARK.fallback}
            label={`${t("w.recovery.nutrition.recipeShareAction")} – ${rc.name}`}
            {...recipeActions(rc, recipeServes)}
          />
        }
      >
        {/* Ingredients — the stepper scales every quantity live. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 2 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.recovery.nutrition.ingredients")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.inner, overflow: "hidden" }}>
            <Pressable onPress={() => setRecipeServes((x) => Math.max(1, x - 1))} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: fs.headline, color: txt(C, C.lime) }}>–</Text></Pressable>
            <Text style={{ width: 52, textAlign: "center", fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line, lineHeight: 38 }}>{recipeServes}</Text>
            <Pressable onPress={() => setRecipeServes((x) => Math.min(12, x + 1))} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: fs.headline, color: txt(C, C.lime) }}>+</Text></Pressable>
          </View>
        </View>
        <Text style={{ ...ty(C, "kicker"), marginBottom: 4  }}>{recipeServes} {t("w.recovery.nutrition.serves")}</Text>
        {rc.ingredients.map((ing, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: ing.optional ? C.ash : C.chalk }}>{ing.name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}>{formatIngredient(ing, rc.baseServes, recipeServes)}</Text>
          </View>
        ))}

        {/* METHOD — readable before you commit, not only once you're cooking.
            The cook view is still the hands-free step-through; this is the read. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 24, marginBottom: 2 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.recovery.nutrition.method")}</Text>
          <Text style={ty(C, "kicker")}>{t("w.recovery.nutrition.stepsN").replace("{n}", String(rc.steps.length))}</Text>
        </View>
        {rc.steps.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line }}>
            {/* The number is the STEP ORDER — method is genuinely a sequence, so
                this encodes something true rather than decorating the list. */}
            {/* The number shares the STEP BODY's leading (not its own), so the
                digit sits on the first line of the text beside it. */}
            <Text style={{ width: 20, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.bodyLg) }}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color: C.chalk }}>{s.text}</Text>
              {s.timerSec != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <Glyph name="stopwatch" size={12} color={txt(C, C.amber)} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.amber) }}>{Math.floor(s.timerSec / 60)}:{String(s.timerSec % 60).padStart(2, "0")}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}

        {recipeMsg ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{recipeMsg}</Text></View> : null}
        {/* Two secondaries, then the primary. Saving a meal FILES the recipe in
            your library; logging a serving records that you ATE one — different
            jobs, so they read as a pair rather than one hiding behind the
            other, and neither competes with Start cooking. */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
          <Pressable onPress={() => saveRecipeAsMeal(rc)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, paddingHorizontal: 12 }}><Glyph name="plus" size={14} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.createMeal")}</Text></Pressable>
          <Pressable onPress={() => logLibraryRecipe(rc, recipeServes)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, paddingHorizontal: 12 }}><AuroraIcon name="check" size={14} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.logServing")}</Text></Pressable>
        </View>
        <APill label={t("w.recovery.nutrition.startCooking")} onPress={() => { setCookStep(0); setView("cook"); }} style={{ marginTop: 12 }} />

        {/* THE THING BEING PHOTOGRAPHED. Mounted only while a card share is in
            flight, and far off the left edge: react-native-view-shot captures a
            view's own rendering, so it has to be laid out and drawn — it does
            not have to be somewhere anybody can see. */}
        {cardRecipe ? (
          <View pointerEvents="none" style={{ position: "absolute", left: -1000, top: 0, width: 340 }}>
            <RecipeShareCard
              ref={cardRef}
              recipe={cardRecipe}
              labels={{
                eyebrow: [t(`w.recovery.nutrition.meal.${cardRecipe.meal}`), isHighProtein(cardRecipe) ? t("w.recovery.nutrition.recipeFilter.highProtein") : null]
                  .filter(Boolean)
                  .join(" – "),
                kcal: t("w.recovery.nutrition.energy"),
                protein: t("w.recovery.nutrition.protein"),
                time: t("w.recovery.nutrition.time"),
                ingredients: t("w.recovery.nutrition.ingredientsN").replace("{n}", String(cardRecipe.ingredients.length)),
              }}
            />
          </View>
        ) : null}
      </CoverScreen>
    );
  }

  // ============ COOK — step-through ============
  // The recipe's PLATE, one compression below the detail cover: same wash, same
  // full-colour dish, same chip + title, with the step counter in the slot the
  // cover gives to time and the method's steps as ticks on its bottom edge. Not
  // the full collapsing cover — this screen doesn't scroll and ends in a sticky
  // action bar, so a collapsing hero would promise a collapse that never comes.
  // Web parity: aurora/nutrition.tsx CookPlate.
  if (view === "cook" && recipe) {
    const cook = recipeCookView(recipe, cookStep, {
      meal: (m) => t(`w.recovery.nutrition.meal.${m}`),
      stepXofY: (x, y) => t("w.recovery.nutrition.stepXofY").replace("{x}", String(x)).replace("{y}", String(y)),
    });
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {/* Wet hands, a phone on the counter, and a method you are halfway
            through: the one screen in Nutrition that must not sleep. Mounted
            here rather than hooked in the component, because the hook has to be
            scoped to THIS view and a component's mount is that scope. */}
        <CookAwake />
        <CookPlate cook={cook} onBack={() => setView("recipe")} />
        <Text style={{ fontFamily: F.bold, fontSize: 23, lineHeight: 31, letterSpacing: tracking(23), color: C.chalk, marginTop: 20 }}>{cook.step.text}</Text>
        {/* The step's timer, and it RUNS — see aurora/cook-timer.tsx for why a
            chip that only printed the number was worse than no number. */}
        {cook.step.timerSec != null ? (
          <View style={{ marginTop: 12 }}>
            <CookStepTimer seconds={cook.step.timerSec} stepNumber={cook.index + 1} />
          </View>
        ) : null}
        {/* On the last step the accent moves to the LOG: the end of cooking is
            the moment you eat it, and "Finish" only ever navigated. It demotes
            to a ghost exit rather than disappearing — cooking for the family
            and logging nothing is a real ending too. */}
        {cook.last ? (
          <APill label={t("w.recovery.nutrition.logServing")} onPress={() => { setView("recipe"); void logLibraryRecipe(recipe, recipeServes); }} style={{ marginTop: 28 }} />
        ) : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: cook.last ? 12 : 28 }}>
          {cook.index > 0 ? <Pressable onPress={() => setCookStep((s) => s - 1)} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 16, paddingHorizontal: 24, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.stepBack")}</Text></Pressable> : null}
          <Pressable onPress={() => cook.last ? setView("recipe") : setCookStep((s) => s + 1)} style={cook.last
            ? { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center" }
            : { flex: 1, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center" }}><Text style={{ fontFamily: cook.last ? F.bold : F.black, fontSize: fs.subtitle, color: cook.last ? C.chalk : C.onAccent }}>{cook.last ? t("w.recovery.nutrition.finishCooking") : t("w.recovery.nutrition.nextStep")}</Text></Pressable>
        </View>
      </AuroraScreen>
    );
  }

  // THE HEAD OWNS THE GAP BELOW IT. At the tab root the shared masthead sits
  // above this body and already emits HUB_MASTHEAD.gap.below, so the first
  // block must contribute none of its own — RN does not collapse margins and
  // CSS does, so a first block that kept its 16 would sit 16 lower here than
  // on the web twin while both files "looked" the same.
  const headGap = root && view === "home" ? 0 : 16;
  const body = (
    <>
      {/* The head — the app header + hub masthead at the tab root, the hero's
          rail on every other view — is the SHELL's (see the AuroraScreen
          below). Nothing renders here. */}

      {view === "home" && (signalsError && signals.length === 0 ? (
        /* SIGNALS FAILED TO LOAD — with no cached intake the day summary would
           read "0 eaten / full target remaining" as if nothing were logged yet,
           masking an offline / 500. Show the honest retry card instead. */
        <FetchError onRetry={() => refetch()} style={{ marginTop: headGap }} />
      ) : (<>
      {/* Goal — a card you OPEN (never a live toggle): switching the goal
          recomputes every target, so it must take a deliberate tap. */}
      <PressScale onPress={() => setGoalPicker(true)} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.goalLabel")}: ${goalName(goal)}`} style={{ marginTop: headGap, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Glyph name="target" size={20} color={C.ash} />
          <View>
            <Text style={ty(C, "overline")}>{t("w.recovery.nutrition.goalLabel")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk, marginTop: 2 }}>{goalName(goal)}</Text>
          </View>
        </View>
        <Glyph name="chevron" size={16} color={C.ash} />
      </PressScale>

      {coachDiet?.diet && (
        <ACard solid style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: C.ash }}>
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
              macro hairlines beneath. It no longer presses into the Diary
              (that door lives in the "Diary →" link + the bento) — instead it
              carries the Diary's ‹ › day stepper, sharing the SAME viewed-day
              scope, so any past day's ring is reviewed in place (web parity). */}
          <View style={{ marginTop: 16 }}>
          <ACard solid style={{ paddingVertical: 20, alignItems: "center" }}>
            <View style={{ alignSelf: "stretch", alignItems: "center" }}>
              <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Pressable onPress={() => shiftDiaryDay(-1)} accessibilityLabel={t("w.recovery.nutrition.prevDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><View style={{ transform: [{ rotate: "180deg" }] }}><Glyph name="chevron" size={16} color={C.chalk} /></View></Pressable>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: txt(C, C.lime) }}>{t("w.recovery.nutrition.caloriesLeft")}</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 2 }}>{heroIsToday ? t("w.recovery.nutrition.backToToday") : diaryDayLabel}</Text>
                  {!heroIsToday ? <Pressable onPress={() => setDiaryDay(localTodayKey())}><CtaLabel label={`${t("w.recovery.nutrition.backToToday")} →`} color={txt(C, C.lime)} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginTop: 2 }} /></Pressable> : null}
                </View>
                <Pressable onPress={() => shiftDiaryDay(1)} disabled={heroIsToday} accessibilityLabel={t("w.recovery.nutrition.nextDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Glyph name="chevron" size={16} color={heroIsToday ? C.line : C.chalk} /></Pressable>
              </View>
              <View style={{ marginTop: 16 }}>
                {/* One over-target threshold for BOTH the ring and the number (1.05).
                    OVER IS SAND, NOT RED. `red is kept strictly for risk`
                    (theme/palette.ts), and 100 kcal past today's target is not a
                    risk — it is the same statement the picker's rows and its day
                    header already make in sand. Red here also made the hub and
                    the picker disagree about the colour of one fact. (The label
                    panel below keeps red: a saturated-fat or salt figure past a
                    WHO/EFSA reference is a different claim from "you ate more
                    than you planned to.") */}
                <Ring value={heroFigures.kcal.pct} size={190} ticks={52} color={heroFigures.kcal.over ? C.amber : C.lime} track={C.line}>
                  <View style={{ alignItems: "center" }}>
                    {/* THE NUMBER YOU CAME FOR, and the one that moves most: it
                        changes every time food is logged, so it rolls rather
                        than swapping. Web parity — its side used to run a
                        mount-only count-up this never had. */}
                    <RollingNumber
                      // NO TARGET, NO REMAINDER. This printed `0 - 1675 = -1675`
                      // under a "CALORIES LEFT" label when no target was set —
                      // a confident wrong number of exactly the kind the picker
                      // refuses to draw (DayGap renders nothing without one).
                      // An em dash is the app's own mark for a figure that does
                      // not exist yet, and a figure that changes SHAPE does not
                      // roll, which is already RollingNumber's rule.
                      value={heroFigures.kcal.left != null ? String(heroFigures.kcal.left) : "—"}
                      align="center"
                      // The picker's day header now draws this same figure, so
                      // the two land on ONE spec: the `fs.stat` rung and
                      // `trackFigure(fs.stat)`, in place of a hand-set 44/-1 that
                      // existed nowhere else.
                      // `trackFigure`, NOT `tracking` — the comment above has
                      // said so since this landed and the code did not do it.
                      // The text bands hand a 46dp figure -0.02em; every other
                      // `fs.stat` hero in the app (exercise 1RM, learned, load
                      // sheet, the picker's own day header four hundred lines
                      // up) takes trackFigure's -0.035em. This one number, on
                      // the most-looked-at screen in the product, sat 0.7dp
                      // looser than every other number of its size.
                      // `leading` joins it for the same reason: a figure takes
                      // a flush line box, and this was inheriting a default.
                      style={{ fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: heroFigures.kcal.over ? txt(C, C.amber) : C.chalk }}
                    />
                    <Text style={ty(C, "kicker")}>{figureText(heroFigures.kcal.have, heroFigures.kcal.want)}</Text>
                  </View>
                </Ring>
              </View>
              {maint.kcal != null ? <Text style={{ ...ty(C, "kicker"), marginTop: 16, textAlign: "center"  }}>{t("w.recovery.nutrition.maintenance")} {maint.kcal} kcal{maint.weightChangeKg != null ? ` — ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}</Text> : null}
              {/* Today's training bump only belongs to today's target — a past
                  day's ring must not wear today's fuel badge. */}
              {trainingKcal > 0 && heroIsToday ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: withAlpha(C.lime, ALPHA.fill), borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.edge), borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Glyph name="spark" size={13} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: txt(C, C.lime) }}>+{trainingKcal} {t("w.recovery.nutrition.trainingFuel")}</Text>
                </View>
              ) : null}
            </View>
            {/* MACROS — the SAME ROW the picker's day header draws, because it
                is the same three figures. This card hand-rolled a 4dp pill
                track with a coloured mono-caps label while the picker
                hand-rolled a 3dp one with an ash nano-caps label, so the two
                nutrition heroes agreed on the numbers and on nothing else.
                Both are AMeter now: one track (6dp, RADIUS.mark), one label
                voice, one animated fill. The macro's colour stays where it
                carries the meaning — the fill. */}
            <View style={{ alignSelf: "stretch", marginTop: 24 }}>
              {heroFigures.macros.map((m) => (
                <AMeter
                  key={m.key}
                  label={t(`w.recovery.nutrition.${m.key}`)}
                  // THE SAME SPELLING AS THE LEDGER. This wrote `118 / 150 g`
                  // while the picker and the diary wrote `118/150`, so the two
                  // heroes of one day agreed on the number and disagreed on how
                  // to say it. The unit is the label's job.
                  value={figureText(m.figure.have, m.figure.want)}
                  pct={m.figure.pct}
                  color={C[MACRO_FILL[m.key]]}
                />
              ))}
            </View>
          </ACard>
          </View>

          {/* One plain-spoken nudge — a quiet line, not a boxed card. */}
          <NutritionNudgeLine nudge={nudge} />

          {/* WATER — its own card directly under the energy hero, because it is
              a target the athlete acts on hourly, not a figure they review. It
              is deliberately NOT a fourth hairline inside the hero card: water
              carries no energy and has no place in the macro split, and sitting
              it under protein/carbs/fat would say that it does. */}
          <WaterCard
            h={hydration}
            units={units}
            onAdd={addWater}
            onUndo={undoWater}
            canUndo={waterLogs.length > 0}
            style={{ marginTop: 16 }}
          />

          {/* Today's meals — Breakfast / Lunch / Dinner / Snacks. Each opens the
              picker attributed to that meal; the kcal already logged is shown. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginHorizontal: 2 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.recovery.nutrition.todaysMeals")}</Text>
            <Pressable onPress={() => setView("diary")}><CtaLabel label={`${t("w.recovery.nutrition.menuDiary")} →`} color={C.ash} fontSize={fs.micro} font={F.mono} style={{ letterSpacing: tracking(fs.micro, "label"), textTransform: "uppercase" }} /></Pressable>
          </View>
          {partList.map((p) => { const kcal = mealTotals[p.key] ?? 0; return (
            <PressScale key={p.key} onPress={() => openAdd(p.key)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16, marginTop: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: RADIUS.inner, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Glyph name={mealGlyph(p.key)} size={19} color={C.ash} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{p.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: kcal > 0 ? C.ash : txt(C, C.lime), marginTop: 2 }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : t("w.recovery.nutrition.addFirstFood")}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><Glyph name="plus" size={16} color={txt(C, C.lime)} /></View>
            </PressScale>
          ); })}
          {full ? (
            <PressScale onPress={() => setPartSheet(true)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: RADIUS.field, paddingVertical: 16, paddingHorizontal: 16, marginTop: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}><Glyph name="plus" size={18} color={C.ash} /></View>
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
          <ASection title={t("w.recovery.nutrition.recipes")} />
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
              premium={!recipesUnlocked} w={recipeCardW}
            />
          </ScrollView>

          {/* Verified foods — the BUSINESSES, one card each. The verified tier
              was previously only reachable by stumbling into one of its foods
              through search; the rail puts the companies themselves on the
              screen. */}
          <ASection title={t("w.recovery.nutrition.verifiedFoods")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={sourceCardW + 12} decelerationRate="fast" style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: GUTTER }}>
            {VERIFIED_SOURCES.map((src) => {
              const n = vfBySource(src.id).length;
              return (
                /* APressCard — a RAIL item, not a full-width card, so it keeps
                   the compact inset and its rail width. Those two are all it
                   passes now; the surface and the press both come from the
                   kit. (The tail beside it is already the shared RailTail.) */
                <APressCard key={src.id} onPress={() => openSourcePage(src.id, "home")} a11yLabel={src.name} style={{ width: sourceCardW, padding: 16 }}>
                  {/* The business's own logo leads the card — this rail IS the
                      businesses, so recognising one at a glance is its whole job. */}
                  <MarkPlate C={C} src={src} height={34} full />
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12, paddingHorizontal: 2 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{src.name}</Text>
                    <VerifiedMark C={C} size={12} />
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4, paddingHorizontal: 2 }}>{t("w.recovery.nutrition.itemsCheckedN").replace("{n}", String(n))}</Text>
                </APressCard>
              );
            })}
            <RailTail
              onOpen={() => setView("sources")}
              a11y={`${t("w.explore.seeAll")} – ${t("w.recovery.nutrition.verifiedFoods")}`}
              w={sourceCardW}
            />
          </ScrollView>
      </>
      ))}

      {view === "insights" && (
        <View>
          {/* The window control belongs to the SCREEN, so the goal overview and
              every nutrient below it read the same span. */}
          <NutritionTrends
            analytics={analytics}
            window={summaryWindow}
            onWindow={setSummaryWindow}
            units={units}
          />
          {/* The goal overview keeps what the per-nutrient view has no place
              for: the chosen goal and the measured weight change it is actually
              being judged by. */}
          <SummaryDashboard summary={summary} window={summaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} full={full} />
        </View>
      )}

      {/* BODY — the athlete's measurements, rehomed here from the retired
          Profile → Private tab. It belongs on Nutrition: the weigh-in IS the
          input the intake targets are steered by (a bodyMass signal drives
          maintenance and every kcal target), so the number and the thing it
          feeds now share a screen instead of sitting two tabs apart. The panel
          owns the whole log — height, weight, tape and body fat — so the old
          kg-only weigh-in card is gone rather than sitting beside it asking for
          the same number in a second place. The EWMA trend rides in the panel's
          `trend` slot, directly under the report that names the same weight. */}
      {view === "body" && (
        <BodyProgress
          units={units}
          onPhotos={() => router.push("/progress")}
          onSaved={() => { revalidate.recovery(); load(); }}
          trend={weight.points.length > 0 ? (
            <ACard solid style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.bodyweightTrend")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, weight.ratePerWeek <= 0 ? C.lime : C.amber) }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</Text>
              </View>
              <WeightTrend points={weight.points} color={C.lime} />
            </ACard>
          ) : null}
        />
      )}

      {/* LOG — the unified manual entry + scan + one-tap premade meals. */}
      {view === "log" && (
      <ACard solid style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <AuroraIcon name="add" size={20} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
          </View>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t(scanning ? "w.recovery.nutrition.scanning" : "w.recovery.nutrition.scanLabel")} style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: scanning ? STATE_OPACITY.busy : 1 }}>
            <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
              {scanning ? <ActivityIndicator size="small" color={pa.text} /> : <Glyph name="scan" size={16} color={pa.text} />}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: pa.text }}>{t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: fs.micro }}>✦</Text>}
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 16 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" inputRef={kcalRef} />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={t("w.recovery.nutrition.add")} savingLabel={t("w.recovery.nutrition.adding")} state={saving ? "saving" : "idle"} onPress={add} style={{ marginTop: 16 }} />
        {/* QUICK MEALS — one-tap premade meals as time-of-day rows. Full users log
            on tap; free users see them locked and a tap routes to upgrade. */}
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: C.ash }}>{t("w.recovery.nutrition.quickMeals")}</Text>
            {!full && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: pa.text }}>✦ Full</Text>}
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
                <Glyph name={presetGlyph(p.id)} size={22} color={full ? C.ash : pa.text} />
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
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.yourMeals")}</Text>
          <Text style={ty(C, "kicker")}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length}/${FREE_MEAL_LIMIT}`}</Text>
        </View>
        {meals.length === 0 && !showMealBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 10, lineHeight: leading(fs.caption, "snug") }}>{t("w.recovery.nutrition.yourMealsEmpty")}</Text>
        ) : null}
        {meals.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {/* THE HOLD REACHES HERE TOO. This row keeps its × — it is visible,
                it works, and taking a control away to prove a point about a
                gesture is the trade the picker's swipe was spared. But a saved
                meal that deletes by holding on one screen and only by a × on
                another is the same "one food, two answers" this change exists to
                end, so the hold is armed on both. */}
            {meals.map((m, i) => (
              <HoldMenu
                key={m.id}
                items={[{ key: "delete", label: t("w.recovery.nutrition.deleteMeal"), destructive: true }]}
                onSelect={() => removeMeal(m.id)}
                a11yLabel={m.name}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
              >
                {/* A saved meal draws the shared dish mark. The row used to prefer a
                    stored `emoji` — app-authored (recipeToMeal seeded it) and rendered
                    straight back onto the glass, which is how a pictograph survived a
                    round-trip through the database. */}
                <Glyph name="bowl" size={22} color={C.ash} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{m.name}</Text>
                    {m.subname ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }} numberOfLines={1}>{m.subname}</Text> : null}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{m.kcal} kcal — {m.protein}P {m.carbs}C {m.fat}F</Text>
                </View>
                <Pressable onPress={() => logMeal(m)} accessibilityRole="button" style={{ borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 8, paddingHorizontal: 16 }}>
                  <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.onAccent }}>{t("w.recovery.nutrition.log")}</Text>
                </Pressable>
                <Pressable onPress={() => removeMeal(m.id)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.deleteMeal")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>×</Text></Pressable>
              </HoldMenu>
            ))}
          </View>
        ) : null}
        {showMealBuilder ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ ...ty(C, "overline"), marginBottom: 10  }}>{t("w.recovery.nutrition.newMeal")}</Text>
            <TextInput value={mealForm.name} onChangeText={(v) => setMealForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.mealNameHint")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.mealName")} style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <QuadTile field="kcal" label="kcal" unit="kcal" color={txt(C, C.lime)} value={mealForm.kcal} onChange={(v) => setMealForm((s) => ({ ...s, kcal: v }))} />
              <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={mealForm.protein} onChange={(v) => setMealForm((s) => ({ ...s, protein: v }))} />
              <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={mealForm.carbs} onChange={(v) => setMealForm((s) => ({ ...s, carbs: v }))} />
              <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.red)} value={mealForm.fat} onChange={(v) => setMealForm((s) => ({ ...s, fat: v }))} />
            </View>
            {(() => { const mk = macroKcal(mealForm.protein, mealForm.carbs, mealForm.fat); return mk > 0 && !mealForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</Text> : null; })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setShowMealBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveMeal} style={{ flex: 1, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.saveMeal")}</Text></Pressable>
            </View>
          </View>
        ) : canSaveAnotherMeal ? (
          <APill
            label={t("w.recovery.nutrition.createMeal")}
            variant="outline"
            color={C.lime}
            glyph={(c) => <AuroraIcon name="add" size={15} color={c} />}
            onPress={() => openCreate("meal")}
            style={{ marginTop: 16 }}
          />
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 16, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: withAlpha(pa.fill, ALPHA.fill), borderWidth: 1, borderColor: withAlpha(pa.fill, ALPHA.rim), borderRadius: RADIUS.pill, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreMeals")}</Text>
          </Pressable>
        )}
      </ACard>

      )}

      {/* THE PANTRY — the athlete's own saved foods, shelved. The redesign is
          documented in aurora/pantry.tsx; the search sits in the HERO's
          accessory slot (top right), which is why this screen passes the
          open/closed state down rather than letting the panel own it. */}
      {view === "foods" && (
      <>
      <PantryScreen
        items={products}
        query={foodQuery}
        onQuery={setFoodQuery}
        searchOpen={pantrySearch}
        onSearchOpen={setPantrySearch}
        onLogOne={logOneServing}
        onOpen={logProduct}
        usualFor={usualFor}
        onDelete={askDeleteProduct}
        onEdit={openEditProduct}
        // The packs, as one-tap amounts on the row — and held, to take one off.
        portionsFor={(p) => rowPortions({ serving: p.servingLabel, servingGrams: p.servingGrams, portions: productPortions(p) })}
        onLogPortion={(p, unitId) => { void logProductPortion(p, unitId, setFoodMsg); }}
        onRemovePortion={(p, unitId) => { void removeProductPortion(p, unitId); }}
        onCreate={() => canSaveAnotherProduct ? openCreate("product") : (onUpgrade ? onUpgrade() : router.push("/upgrade"))}
        canCreate={canSaveAnotherProduct}
        full={full}
        limit={FREE_PRODUCT_LIMIT}
        msg={foodMsg}
        premium={{ fill: pa.fill, text: pa.text }}
        searchHint={<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, letterSpacing: tracking(fs.nano, "label") }}>{t("w.recovery.nutrition.foodSearchHint")}</Text>}
        // Gated on the SAME condition as the fetch below the picker: the
        // search only fires for a query that names a food, so a block that
        // rendered on the raw text would sit on a permanent "no results".
        dbSlot={remoteQuery ? (
          <View style={{ marginTop: 26 }}>
            <GroupMark label={t("w.recovery.nutrition.pn.fromDatabase")} mt={0} />
            {searching ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 10 }}>{t("w.recovery.nutrition.searching")}</Text>
            ) : foodResults.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 10, lineHeight: leading(fs.caption, "snug") }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
            ) : foodResults.map((food, i) => (
              <View key={`${food.id || food.code}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                {/* A verified row opens its page from the name, exactly as in
                    the picker — the same food must not be a dead end on one
                    screen and a doorway on another. */}
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
                <Pressable onPress={() => logFood(food)} accessibilityRole="button" style={{ borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 8, paddingHorizontal: 16 }}><Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.onAccent }}>{t("w.recovery.nutrition.log")}</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
      />
      {pendingDelete ? (
        <UndoToast label={t("w.recovery.nutrition.pn.deleted").replace("{v}", pendingDelete.name)} onUndo={undoDeleteProduct} />
      ) : null}
      </>
      )}

      {/* DIARY — the selected day's individual entries, grouped by part, each
          editable (quantity) and deletable. Defaults to today; pick a past day
          in the record below. Then the week strip + recent days. */}
      {view === "diary" && (() => { const isToday = diaryDay === localTodayKey();
      // One logged item: what it was, what it cost, a stepper to rescale it and
      // a bin to remove it. A derived entry (no FoodLog row) has no name of its
      // own, so it's labelled by its time of day and scales by a multiplier.
      const entryRow = (l: FoodLogRow) => {
        const mult = derivedScale[l.id] ?? 1;
        // THE ROW SHOWS WHAT WAS ENTERED. An entry logged as 35 g used to read
        // "0.35" — the quantity that scales the macros, which is the correct
        // number and not the one the athlete typed. The amount is now stored
        // beside it, so the stepper counts grams (or bottles) and the meta line
        // names the unit. An entry from before this shipped, or one with no
        // amount to record (a quick macro line), reads exactly as it always did.
        const shown = l.derived ? mult : loggedAmountShown(l);
        const amountLabel = l.derived ? null : loggedAmountLabel(l, { pack: t("w.recovery.nutrition.pt.pack") });
        const d = new Date(l.ts);
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return (
        <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 31, paddingRight: 2 }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{l.name || t("w.recovery.nutrition.loggedEntry")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{l.derived ? `${time} — ` : ""}{amountLabel ? `${amountLabel} — ` : ""}{Math.round(l.kcal * l.qty)} kcal — {Math.round(l.protein * l.qty)}P {Math.round(l.carbs * l.qty)}C {Math.round(l.fat * l.qty)}F</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* Each press steps the entry's OWN unit — five grams for a weighed
                portion, half a bottle for a pack, half a serving otherwise —
                and never snaps an off-grid amount onto the grid, which is how a
                measured 35 g used to become 50 g on the first tap. */}
            <Pressable onPress={() => stepEntry(l, -1)} accessibilityLabel={t("w.recovery.nutrition.decrease")} hitSlop={6} style={{ width: 26, height: 26, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "tight"), color: C.chalk }}>−</Text></Pressable>
            <Text style={{ minWidth: 26, textAlign: "center", fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{l.derived ? `×${shown}` : formatAmount(shown)}</Text>
            <Pressable onPress={() => stepEntry(l, 1)} accessibilityLabel={t("w.recovery.nutrition.increase")} hitSlop={6} style={{ width: 26, height: 26, borderRadius: RADIUS.inner, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "tight"), color: C.chalk }}>+</Text></Pressable>
          </View>
          <Pressable onPress={() => deleteLogEntry(l.id)} accessibilityLabel={t("w.recovery.nutrition.deleteEntry")} hitSlop={6} style={{ padding: 4 }}><Glyph name="trash" size={17} color={C.ash} /></Pressable>
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
          <Pressable onPress={() => shiftDiaryDay(-1)} accessibilityLabel={t("w.recovery.nutrition.prevDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><View style={{ transform: [{ rotate: "180deg" }] }}><Glyph name="chevron" size={16} color={C.chalk} /></View></Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{isToday ? t("w.recovery.nutrition.todaysMeals") : diaryDayLabel}</Text>
            {!isToday ? <Pressable onPress={() => setDiaryDay(localTodayKey())}><CtaLabel label={`${t("w.recovery.nutrition.backToToday")} →`} color={txt(C, C.lime)} fontSize={fs.nano} font={F.mono} style={{ textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginTop: 2 }} /></Pressable> : null}
          </View>
          <Pressable onPress={() => shiftDiaryDay(1)} disabled={isToday} accessibilityLabel={t("w.recovery.nutrition.nextDay")} hitSlop={6} style={{ width: 34, height: 34, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Glyph name="chevron" size={16} color={isToday ? C.line : C.chalk} /></Pressable>
        </View>
        {/* COPY A DAY — on the diary's day header, because this is the one
            screen where "a day" is the subject rather than the container. A
            quiet bare control, not a filled button: it is one of several things
            you can do to the day on display, not the day's purpose. */}
        <Pressable
          onPress={() => { setCopyMsg(""); setCopySheet(true); }}
          accessibilityRole="button"
          accessibilityLabel={t("w.recovery.nutrition.copyDay")}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingTop: 12, marginTop: 4 }}
        >
          <AuroraIcon name="copy" size={14} color={C.ash} />
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={ty(C, "kicker")}>
            {t("w.recovery.nutrition.copyDay")}
          </Text>
        </Pressable>
        {/* THE DAY'S ENERGY, as the card's one figure — and ONLY the figure.
            The "/ 2325" it used to trail is gone from here because the ledger
            below states it, in the column where the other three targets are:
            the same number twice, eight points apart, in two different forms is
            exactly what this pass exists to remove. It ROLLS, like every other
            figure that moves when a day is edited. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <RollingNumber
            value={String(Math.round(daySummary.kcal))}
            align="center"
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            style={{ fontFamily: F.monoBold, fontSize: fs.hero, color: C.chalk }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>kcal</Text>
        </View>
        {/* THE LEDGER — the same four figures, in the same form, as the meal
            picker one tab away. This card used to speak a dialect of its own:
            single-letter labels, a `g` suffix the picker drops, a hand-rolled
            4dp bar instead of the shared meter, and no energy column at all
            (energy was the figure above, measured against a target the macros
            below stated in a different way). It keeps a macro nobody targeted —
            a diary is a RECORD of the day, and what you ate is worth stating
            with or without a plan to measure it against; that column simply
            draws no track. Read through the SAME arithmetic as the picker, so
            the two can never disagree about the day they both describe. */}
        <MacroLedger
          C={C}
          figures={nutritionFigures(
            { kcal: daySummary.kcal, protein: daySummary.protein, carbs: daySummary.carbs, fat: daySummary.fat },
            targets,
          )}
          style={{ marginTop: 16 }}
        />
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
                    <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: r.over ? txt(C, C.red) : C.chalk, marginTop: 3 }}>
                      {r.value} g<Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}> {r.floor ? "/" : "of"} {r.reference}</Text>
                    </Text>
                    <View style={{ height: 3, borderRadius: RADIUS.pill, backgroundColor: C.line, overflow: "hidden", marginTop: 5 }}>
                      <View style={{ width: `${Math.min(100, r.pct * 100)}%`, height: "100%", borderRadius: RADIUS.pill, backgroundColor: r.over ? C.red : r.floor ? C.lime : C.ash }} />
                    </View>
                  </View>
                ))}
            </View>
            <Text style={{ ...ty(C, "caption"), marginTop: 12 }}>
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
                <Glyph name={mealGlyph(p.key)} size={19} color={C.ash} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{p.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: kcal > 0 ? C.chalk : C.ash }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : "—"}</Text>
                {isToday ? <View style={{ width: 26, height: 26, borderRadius: RADIUS.pill, borderWidth: 1.4, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><Glyph name="plus" size={13} color={txt(C, C.lime)} /></View> : null}
              </Pressable>
              {entries.map(entryRow)}
            </View>
            );
          })}
          {otherEntries.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, paddingBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 2 }}>
                <Glyph name={mealGlyph("snack")} size={19} color={C.ash} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.otherEntries")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(otherEntries.reduce((s, l) => s + l.kcal * l.qty, 0))} kcal</Text>
              </View>
              {otherEntries.map(entryRow)}
            </View>
          ) : null}
        </View>
        {dayLogs.length === 0 ? <Text style={{ ...ty(C, "caption"), marginTop: 12 }}>{daySummary.kcal > 0 ? t("w.recovery.nutrition.diaryTotalsOnly") : t("w.recovery.nutrition.diaryEntriesHint")}</Text> : null}
      </ACard>
      </>
      ); })()}

      {view === "diary" && (
      <ACard solid style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: C.ash }}>{t("w.recovery.nutrition.recentDays")}</Text>
          {streakDays > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{streakDays}/7</Text> : null}
        </View>
        {/* week strip — last 7 days, lit when intake was logged */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 16 }}>
          {week.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ width: 30, height: 30, borderRadius: RADIUS.inner, backgroundColor: d.on ? withAlpha(C.lime, ALPHA.edge) : C.ink, borderWidth: 1, borderColor: d.on ? withAlpha(C.lime, ALPHA.rim) : C.line, alignItems: "center", justifyContent: "center" }}>{d.on ? <AuroraIcon name="check" size={13} color={txt(C, C.lime)} /> : null}</View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          {recentDays.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recentDays.map((d, i) => { const on = d.date === diaryDay; return (
            <Pressable key={d.date} onPress={() => setDiaryDay(d.date)} accessibilityLabel={`${t("w.recovery.nutrition.viewDay")} ${d.date.slice(5)}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, borderLeftWidth: 2, borderLeftColor: on ? C.lime : "transparent", backgroundColor: on ? withAlpha(C.lime, ALPHA.wash) : "transparent", borderRadius: on ? 8 : 0 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash, width: 48 }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(d.protein)}P {Math.round(d.carbs)}C {Math.round(d.fat)}F</Text>
            </Pressable>
          ); })}
        </View>
      </ACard>
      )}

      <CopyDaySheet
        visible={copySheet}
        onClose={() => setCopySheet(false)}
        logs={logs as unknown as CopyableEntry[]}
        to={diaryDay}
        toLabel={diaryDay === localTodayKey() ? t("w.recovery.nutrition.todaysMeals") : diaryDayLabel}
        partLabel={partLabel}
        onCopy={runCopy}
        busy={copyBusy}
        message={copyMsg}
      />

      {/* TARGETS — a door row under the goal, because the goal is what DERIVES
          the targets and setting them by hand is the exception to that. Not a
          card: it carries no figure of its own, it opens a sheet. */}
      <Pressable
        onPress={() => setTargetSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={t("w.recovery.nutrition.tg.title")}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, paddingHorizontal: 2, marginTop: 14 }}
      >
        <View style={{ width: 32, height: 32, borderRadius: RADIUS.pill, borderWidth: 1.4, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="edit" size={14} color={C.ash} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.tg.title")}</Text>
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: hasOverride(targetOverride) ? txt(C, C.amber) : C.ash, marginTop: 3 }}>
            {hasOverride(targetOverride) ? t("w.recovery.nutrition.tg.manual") : t("w.recovery.nutrition.tg.adaptive")}
          </Text>
        </View>
      </Pressable>
      {/* The four numbers can disagree once they are hand-set. Say so once. */}
      {hasOverride(targetOverride) && mismatch.material ? (
        <TargetMismatchLine macroKcal={mismatch.macroKcal} deltaKcal={mismatch.deltaKcal} />
      ) : null}

      <TargetSheet
        visible={targetSheet}
        onClose={() => setTargetSheet(false)}
        adaptive={adaptiveBase}
        override={targetOverride}
        onSave={saveTargets}
      />

      <Sheet visible={goalPicker} onClose={() => setGoalPicker(false)} title={t("w.recovery.nutrition.goalSheetTitle")} sub={t("w.recovery.nutrition.goalSheetSub")}>
        {/* THE SAME QUESTION THE NUTRITION WIZARD ASKS, so it is now the same
            control: the kit's `AChoice`. This sheet drew its own copy of the
            option row — the title a face heavier, the blurb in mono, and a
            private 22dp radio that popped in a single frame — so "lose fat"
            looked like two different choices depending on whether you were
            setting up or changing your mind later. */}
        <View style={{ gap: space.ms }}>
          {GOALS.map((g) => (
            <AChoice
              key={g.id}
              sheet
              active={goal === g.id}
              title={t(g.labelKey)}
              sub={goalSub(g.id)}
              onPress={() => { haptic.selection(); chooseGoal(g.id); setGoalPicker(false); }}
            />
          ))}
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
      // take the same hero every other screen does.
      //
      // AT THE TAB ROOT there is no hero, because a tab root has nothing to pop
      // and no origin to name. It wears the APP HEADER instead (`top`, below) —
      // the same lockup row Today wears, since Nutrition is a bottom-nav
      // destination of its own now rather than a view inside Today's hub.
      hero={root && view === "home" ? undefined : { rank: "title", title: viewTitle, eyebrow: view === "home" ? greeting || undefined : undefined }}
      // THE TAB ROOT'S CHROME — the shared app header (aurora/app-header.tsx:
      // avatar, the HYBRID lockup with the day-streak, the bell) over the
      // shared hub masthead, which is exactly what Today puts above its own
      // first content row. The masthead carries the greeting and the screen's
      // name here, the job the hero's rail does on every pushed view. Both are
      // shared components, so the two tab roots cannot drift.
      top={root && view === "home" ? (
        <>
          <AppHeader />
          <HubMasthead eyebrow={greeting || null} title={viewTitle} />
        </>
      ) : undefined}
      // The Pantry's SEARCH is the rail's trailing slot — the shell's own
      // top-right control, which is where web puts it too. Nothing else on
      // Nutrition claims the accessory, so it is absent everywhere else.
      accessory={view === "foods" ? <PantrySearchToggle open={pantrySearch} onToggle={() => { setPantrySearch(!pantrySearch); if (pantrySearch) setFoodQuery(""); }} /> : undefined}
      back={view === "home" ? (root ? false : undefined) : () => setView("home")}
      backLabel={view === "home" ? undefined : t("w.recovery.nutrition.title")}
    >
      {body}
    </AuroraScreen>
  );
}

// A labelled hairline divider for the compact Add-a-meal sheet.
