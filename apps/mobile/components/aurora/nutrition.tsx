import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, Alert, ScrollView, StyleSheet } from "react-native";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  weightTrend,
  isFullAccess,
  canUseRecipes,
  MEAL_PRESETS,
  mealPresetSignals,
  FREE_MEAL_LIMIT,
  FREE_PRODUCT_LIMIT,
  nutritionSummary,
  nutritionNudge,
  trainingEnergyOnDay,
  localDayKey,
  localTodayKey,
  NUTRITION_GLYPHS,
  sumMealComponents, recipeToMeal,
  RECIPES, RECIPE_FILTERS, filterRecipes, formatIngredient, recipeById,
  type NutritionGoal,
  type MealPreset,
  type WeightPoint,
  type NutritionNudge,
  type NutritionSummary,
  type NutritionGlyphName,
  type OffFood,
  type Recipe, type RecipeFilter,
} from "@hybrid/core";
import {
  createSignal, logBodyweight, getAssignedDiet, scanNutritionLabel,
  fetchSavedMeals, createSavedMeal, deleteSavedMeal,
  fetchFoodProducts, createFoodProduct, deleteFoodProduct, searchFoods,
  API_BASE,
  type SavedMealRow, type FoodProductRow,
} from "../../lib/api";
import { useSignalsQuery, useSessionsQuery, useRevalidate } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { usePersona } from "../../lib/persona";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, APill, AHeading, RADIUS, Ring } from "./kit";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

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
type NutView = "home" | "log" | "insights" | "diary" | "body" | "meals" | "foods" | "add" | "create" | "recipes" | "recipe" | "cook";
// The meal a log is attributed to. Carried into the Signal `source` so the hub
// can group today's intake by meal (breakfast / lunch / dinner / snack).
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const mealGlyph = (m: MealType): NutritionGlyphName => m === "breakfast" ? "sunrise" : m === "lunch" ? "sun" : m === "dinner" ? "moon" : "cup";
const UNIT_OPTIONS = ["gram", "ml", "oz", "piece", "serving"];
// A locally-persisted food the picker can re-log (Recent MRU + Favorites) — the
// same macro shape the portion editor writes, kept per-device so the two tabs
// work without a backend change.
type QuickFood = { key: string; name: string; subname?: string | null; serving: string; kcal: number; protein: number; carbs: number; fat: number };

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
function IRestart({ size = 20, color = "#fff", strokeWidth = 2 }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /><Path d="M3 3v5h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
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

// A food row in the picker — a lime add-circle, name + macro meta, and either a
// chevron (a DB hit), a favourite star, or a trash affordance (a personal item).
// The row body + the add-circle both open the portion editor.
function FoodRow({ C, name, subname, meta, onAdd, chevron, starred, onStar, onDelete }: {
  C: ReturnType<typeof useTheme>["palette"]; name: string; subname?: string | null; meta: string; onAdd: () => void;
  chevron?: boolean; starred?: boolean; onStar?: () => void; onDelete?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add ${name}`} style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={20} color={txt(C, C.lime)} strokeWidth={2.2} /></Pressable>
      <Pressable onPress={onAdd} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flexShrink: 1 }}>{name}</Text>
          {subname ? <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }}>{subname}</Text> : null}
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
export default function AuroraNutrition({ compact = false, onNavigateFull, onUpgrade }: { compact?: boolean; onNavigateFull?: () => void; onUpgrade?: () => void } = {}) {
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
  const { data: signals = [], isFetching: refreshing, refetch } = useSignalsQuery();
  const revalidate = useRevalidate();
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  // The goal is changed through a deliberate Sheet (opened from a card), never a
  // live top-of-screen toggle — switching it recomputes every target.
  const [goalPicker, setGoalPicker] = useState(false);
  const [view, setView] = useState<NutView>("home");
  // The meal the picker is adding to (drives the log `source` + the picker head).
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [mealPicker, setMealPicker] = useState(false); // the "Dinner ▾" chooser
  const [foodTab, setFoodTab] = useState<"recent" | "favorites" | "personal">("personal");
  const [quickLog, setQuickLog] = useState(false); // the Quick Log sheet
  // Create form (blend: title plate + macro hero) — one form for a PRODUCT or a
  // MEAL. Name + the personal Subname on the plate; serving + unit (products
  // only) compose the stored servingLabel, e.g. 100 + "gram" → "100 gram".
  const [createMode, setCreateMode] = useState<"product" | "meal">("product");
  const [createForm, setCreateForm] = useState({ name: "", subname: "", serving: "", unit: "gram", kcal: "", carbs: "", protein: "", fat: "" });
  const [unitPicker, setUnitPicker] = useState(false);
  // A meal can be composed FROM saved products: each component is a product with
  // a serving count; the meal's macros are the summed total (sumMealComponents).
  // Empty → the create-meal form falls back to manual macro entry.
  type MealComp = { productId: string; name: string; subname?: string | null; kcal: number; protein: number; carbs: number; fat: number; qty: number };
  const [mealComps, setMealComps] = useState<MealComp[]>([]);
  const [compPicker, setCompPicker] = useState(false); // the "Add product" sheet
  const [compQuery, setCompQuery] = useState("");
  const openCreate = (mode: "product" | "meal") => { setCreateMode(mode); setMealComps([]); setCreateForm({ name: "", subname: "", serving: "", unit: "gram", kcal: "", carbs: "", protein: "", fat: "" }); setView("create"); };
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
  const [recipeFilter, setRecipeFilter] = useState<RecipeFilter>("all");
  const recipe = recipeId ? recipeById(recipeId) : undefined;
  const openRecipe = (r: Recipe) => { setRecipeId(r.id); setRecipeServes(r.baseServes); setCookStep(0); setRecipeMsg(""); setView("recipe"); };
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
  // Signal kinds already logged for the meal being entered — survives a partial
  // failure so a retry doesn't duplicate the kinds that already succeeded.
  const loggedKinds = useRef<Set<string>>(new Set());
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
  // First-run onboarding is a separate flow (see the early return). A weigh-in
  // personalizes; "Continue on Free" finishes it without a weigh-in, persisted
  // same-device so the free user isn't re-prompted every visit.
  const [onboarded, setOnboarded] = useState(false);
  useEffect(() => { AsyncStorage.getItem("hybrid.nutrition.onboarded").then((v) => { if (v === "1") setOnboarded(true); }).catch(() => {}); }, []);
  const finishOnboarding = () => { AsyncStorage.setItem("hybrid.nutrition.onboarded", "1").catch(() => {}); setOnboarded(true); };

  const load = () => { refetch(); loadLibrary(); };
  useRefreshOnFocus(refetch);

  // ── Portion & quantity — logging any food/meal opens a sheet where a
  //    serving × quantity stepper scales the macros LIVE before they're written.
  //    One editor for an OFF search hit (offers Save too), a saved food, or a
  //    saved meal, so scaling isn't just for the database.
  const [portion, setPortion] = useState<{ name: string; subname?: string | null; subtitle?: string; serving: string; kcal: number; protein: number; carbs: number; fat: number; offFood?: OffFood } | null>(null);
  const [qty, setQty] = useState(1);
  const openPortion = (base: NonNullable<typeof portion>) => { setQty(1); setPortion(base); };

  // Log a saved meal → opens the portion editor (default 1×), scaled by quantity.
  const logMeal = (m: SavedMealRow) => openPortion({ name: m.name, subname: m.subname, subtitle: m.subname || t("w.recovery.nutrition.savedMeal"), serving: `1 ${t("w.recovery.nutrition.serving")}`, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat });

  // Post a single signal attributed to a specific `source` (e.g. the meal type),
  // which `createSignal` can't do (it hardcodes source:"manual"). Mirrors the
  // web's raw fetch in commitPortion so today's intake can be grouped by meal.
  const postSignal = async (kind: string, value: number, unit: string, source: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${API_BASE}/api/signals`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ kind, value, unit, source }) });
      return res.ok;
    } catch { return false; }
  };

  // Write the scaled macros for the open portion, then close. The log is
  // attributed to the current meal (source = mealType) so the hub can group
  // today's intake by meal, and the food is remembered in the Recent MRU.
  const commitPortion = async () => {
    if (!portion) return;
    const q = qty > 0 ? qty : 1;
    setMealMsg(""); setFoodMsg("");
    const jobs: [string, number, string][] = [["energyIntake", portion.kcal * q, "kcal"], ["protein", portion.protein * q, "g"], ["carbs", portion.carbs * q, "g"], ["fat", portion.fat * q, "g"]];
    for (const [kind, value, unit] of jobs) {
      if (value <= 0) continue;
      if (!(await postSignal(kind, Math.round(value), unit, mealType))) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    }
    pushRecent({ key: `${portion.name}|${portion.serving}`, name: portion.name, subname: portion.subname ?? null, serving: portion.serving, kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat });
    setMealMsg(`${portion.name} +${Math.round(portion.kcal * q)} kcal`);
    setPortion(null);
    revalidate.recovery();
  };

  // Re-log a Recent/Favorite food → opens the portion editor (default 1×).
  const logQuickFood = (q: QuickFood) => openPortion({ name: q.name, subname: q.subname, subtitle: q.subname || q.serving, serving: q.serving, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat });
  // One-tap re-log of a Recent food at 1× to the current meal (the Today sheet's
  // fast path — no portion editor). Same signals + meal attribution as the picker.
  const relogRecent = async (q: QuickFood) => {
    setMealMsg("");
    const jobs: [string, number, string][] = [["energyIntake", q.kcal, "kcal"], ["protein", q.protein, "g"], ["carbs", q.carbs, "g"], ["fat", q.fat, "g"]];
    for (const [kind, value, unit] of jobs) {
      if (value <= 0) continue;
      if (!(await postSignal(kind, Math.round(value), unit, mealType))) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    }
    pushRecent(q);
    setMealMsg(`${q.name} +${Math.round(q.kcal)} kcal`);
    revalidate.recovery();
  };
  // Log a product (saved food) from the picker → portion editor.
  const logProduct = (p: FoodProductRow) => openPortion({ name: p.name, subname: p.subname, subtitle: p.subname || p.servingLabel, serving: p.servingLabel || `1 ${t("w.recovery.nutrition.serving")}`, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat });

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
    const res = isMeal
      ? await createSavedMeal({ name: createForm.name.trim(), subname, ...macros })
      : await createFoodProduct({ name: createForm.name.trim(), subname, servingLabel: serving ? `${serving} ${createForm.unit}`.trim() : undefined, ...macros });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setCreateForm({ name: "", subname: "", serving: "", unit: "gram", kcal: "", carbs: "", protein: "", fat: "" });
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
    if (!out.ok || !out.data) { Alert.alert(t("w.recovery.nutrition.scanLabel"), t("w.recovery.nutrition.scanFailed")); return; }
    const d = out.data;
    setCreateForm((s) => ({ ...s, name: d.name ?? s.name, kcal: d.kcal != null ? String(d.kcal) : s.kcal, protein: d.protein != null ? String(d.protein) : s.protein, carbs: d.carbs != null ? String(d.carbs) : s.carbs, fat: d.fat != null ? String(d.fat) : s.fat }));
  };

  const saveMeal = async () => {
    if (!mealForm.name.trim()) return;
    if (!canSaveAnotherMeal) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const res = await createSavedMeal({ name: mealForm.name.trim(), emoji: mealForm.emoji || undefined, kcal: num(mealForm.kcal) || undefined, protein: num(mealForm.protein), carbs: num(mealForm.carbs), fat: num(mealForm.fat) });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
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
    if (!res.ok) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    loadLibrary();
    setRecipeMsg(t("w.recovery.nutrition.recipeSavedMeal"));
  };

  const saveProduct = async () => {
    if (!prodForm.name.trim()) return;
    if (!canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const res = await createFoodProduct({ name: prodForm.name.trim(), servingLabel: prodForm.serving.trim() || undefined, kcal: num(prodForm.kcal) || undefined, protein: num(prodForm.protein), carbs: num(prodForm.carbs), fat: num(prodForm.fat) });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
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
  const [foodResults, setFoodResults] = useState<OffFood[]>([]);
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
  const logFood = (food: OffFood) => openPortion({ name: food.name, subtitle: food.brand ?? undefined, serving: food.serving, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat, offFood: food });

  // Save a database food into the personal library (respects the free cap).
  const saveFood = async (food: OffFood) => {
    if (!canSaveAnotherProduct) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    setFoodMsg("");
    const res = await createFoodProduct({ name: food.name, servingLabel: food.serving, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat });
    if (res.status === 403) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
    if (!res.ok) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
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
    const totals: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    for (const s of signals) {
      if (s.kind !== "energyIntake") continue;
      if (!(MEAL_TYPES as string[]).includes(s.source)) continue;
      if (localDayKey(s.ts) !== todayKey) continue;
      totals[s.source as MealType] += s.value;
    }
    return totals;
  }, [signals]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal, trainingKcal }), [signals, goal, trainingKcal]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recentDays = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(sig), [signals]);
  const personalized = maint.kcal != null;
  const [summaryWindow, setSummaryWindow] = useState<7 | 30>(30);
  const summary = useMemo(() => nutritionSummary(sig, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  const nudge = useMemo(() => nutritionNudge(today, targets), [today, targets]);
  const [greeting, setGreeting] = useState("");
  useEffect(() => { const h = new Date().getHours(); setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening")); }, [t]);
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
    // Post one signal per macro, remembering which kinds already landed
    // (loggedKinds) so a retry after a partial failure re-sends ONLY the failed
    // kinds and never double-logs. Reset once the whole meal is in.
    const jobs = ([["energyIntake", kcal, "kcal"], ["protein", protein, "g"], ["carbs", carbs, "g"], ["fat", fat, "g"]] as [string, number, string][])
      .filter(([kind, value]) => value > 0 && !loggedKinds.current.has(kind));
    if (!jobs.length) { setSaving(false); return false; }
    let failed = false;
    for (const [kind, value, unit] of jobs) {
      if (!(await postSignal(kind, value, unit, mealType))) { failed = true; break; }
      loggedKinds.current.add(kind);
    }
    if (failed) Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody"));
    else { setF({ kcal: "", protein: "", carbs: "", fat: "" }); setMealMsg(`+${Math.round(kcal)} kcal`); loggedKinds.current = new Set(); }
    setSaving(false);
    revalidate.recovery();
    return !failed;
  };

  // Premade meal → one signal per macro (SAME kinds as the manual add). Free
  // users can't log presets (Full-only, per access.canSaveMealsAndProducts) —
  // a tap routes to the upgrade screen instead. Manual entry above stays free.
  const logPreset = async (p: MealPreset) => {
    if (!full) { router.push("/upgrade"); return; }
    setMealMsg("");
    const ok = await Promise.all(mealPresetSignals(p).map((s) => createSignal(s.kind, s.value, s.unit)));
    if (ok.includes(false)) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    setMealMsg(`${t(p.labelKey).split(/ [·–] /)[0]} +${p.kcal} kcal`);
    revalidate.recovery();
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
    if (!out.ok || !out.data) { Alert.alert(t("w.recovery.nutrition.scanLabel"), t("w.recovery.nutrition.scanFailed")); return; }
    const d = out.data;
    setF({ kcal: d.kcal != null ? String(d.kcal) : "", protein: d.protein != null ? String(d.protein) : "", carbs: d.carbs != null ? String(d.carbs) : "", fat: d.fat != null ? String(d.fat) : "" });
  };

  // The Today "Nutrition" sheet — a focused Add-a-meal, not the whole tracker.
  if (compact) {
    return (
      <View>
        <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk }}>{t("w.recovery.nutrition.addMealTitle")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 4 }}>{Math.round(today.kcal)} / {targets.kcal} {t("w.recovery.nutrition.kcalToday")}</Text>

        {/* Meal selector — the quick-add is attributed to the chosen meal,
            matching the full picker so today's intake groups the same way. */}
        <View style={{ flexDirection: "row", gap: 7, marginTop: 14 }}>
          {MEAL_TYPES.map((m) => {
            const on = mealType === m;
            return (
              <Pressable key={m} onPress={() => setMealType(m)} accessibilityLabel={t(`w.recovery.nutrition.meal.${m}`)} style={{ flex: 1, alignItems: "center", gap: 5, backgroundColor: on ? C.lime : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4 }}>
                <Glyph name={mealGlyph(m)} size={18} color={on ? C.onAccent : C.ash} strokeWidth={5} />
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: on ? "700" : "500", color: on ? C.onAccent : C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Recent — one-tap re-log of a recent food to the chosen meal. */}
        {recent.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 9 }}>{t("w.recovery.nutrition.tab.recent")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {recent.slice(0, 8).map((q) => (
                <Pressable key={q.key} onPress={() => relogRecent(q)} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingLeft: 11, paddingRight: 14 }}>
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
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Pressable onPress={add} disabled={saving} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.addMeal")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 12, opacity: saving ? 0.6 : 1 }}>
            <AuroraIcon name="add" size={15} color={C.onAccent} />
            <Text style={{ color: C.onAccent, fontFamily: F.mono, fontSize: fs.body, fontWeight: "700" }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text>
          </Pressable>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: `${pa.fill}73`, backgroundColor: "transparent", opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color={pa.text} strokeWidth={5} />
            <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.caption, color: C.chalk }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: 11 }}>✦</Text>}
          </Pressable>
        </View>
        {mealMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{mealMsg}</Text></View> : null}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => (!full && onUpgrade ? onUpgrade() : logPreset(p))}
              accessibilityRole="button"
              accessibilityLabel={t(p.labelKey)}
              style={{ flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.ink2, borderWidth: 1, borderColor: full ? C.line : `${pa.fill}47`, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14 }}
            >
              <Glyph name={presetGlyph(p.id)} size={20} color={full ? C.ash : pa.text} strokeWidth={5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: 0.4, marginTop: 2 }}>{p.kcal} kcal</Text>
              </View>
              {!full && <AuroraIcon name="lock" size={13} color={pa.text} />}
            </Pressable>
          ))}
        </View>

        {onNavigateFull ? (
          <Pressable onPress={onNavigateFull} style={{ marginTop: 18, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6 }} hitSlop={6}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.fullTracker")}</Text>
            <Glyph name="chevron" size={13} color={C.ash} strokeWidth={6} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Cold start (no maintenance estimate yet) → onboarding is its OWN focused
  // flow, not stacked above the tracker. A weigh-in in the wizard personalizes
  // the estimate and drops the user into the full screen below.
  if (!personalized && !onboarded) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
          <ABack />
          <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.nutrition.title")}</AHeading>
        </View>
        <OnboardingGoal goal={goal} setGoal={setGoal} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} onWeighIn={logWeighIn} onContinueFree={finishOnboarding} />
      </AuroraScreen>
    );
  }

  // The portion editor — one Sheet reused by the hub, the picker and the saved
  // library. Attributed to the current meal + remembered in Recent on commit.
  const renderPortionSheet = () => (
    <Sheet visible={!!portion} onClose={() => setPortion(null)} title={portion?.name} sub={portion?.subtitle} scroll={false}>
      {portion ? (() => {
        const q = qty > 0 ? qty : 1;
        const sc = (v: number) => Math.round(v * q);
        const step = (d: number) => setQty((x) => Math.max(0.5, Math.min(50, Math.round((x + d) * 2) / 2)));
        return (
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{t("w.recovery.nutrition.perLabel")} {portion.serving}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 }}>
              <Pressable onPress={() => step(-0.5)} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 24, fontWeight: "700", lineHeight: 26, color: txt(C, C.lime) }}>–</Text></Pressable>
              <View style={{ alignItems: "center" }}>
                <TextInput value={String(qty)} onChangeText={(v) => { const n = parseFloat(v); setQty(Number.isFinite(n) && n >= 0 ? n : 0); }} keyboardType="decimal-pad" accessibilityLabel={t("w.recovery.nutrition.quantity")} style={{ minWidth: 96, textAlign: "center", fontFamily: F.black, fontSize: 30, letterSpacing: -0.9, color: C.chalk, padding: 0 }} />
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.servings")}</Text>
              </View>
              <Pressable onPress={() => step(0.5)} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontSize: 22, fontWeight: "700", lineHeight: 24, color: txt(C, C.lime) }}>+</Text></Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <Text style={{ fontFamily: F.black, fontSize: 48, letterSpacing: -1.6, color: C.chalk }}>{sc(portion.kcal)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>kcal</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              {([["w.recovery.nutrition.protein", txt(C, C.blue), portion.protein], ["w.recovery.nutrition.carbs", txt(C, C.amber), portion.carbs], ["w.recovery.nutrition.fat", txt(C, C.violet), portion.fat]] as const).map(([lab, col, base]) => (
                <View key={lab} style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: col }}>{t(lab)}</Text>
                  <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk, marginTop: 4 }}>{sc(base)}<Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}> g</Text></Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              {portion.offFood ? <Pressable onPress={() => { const ff = portion.offFood; setPortion(null); if (ff) saveFood(ff); }} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 13, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.saveToFoods")}</Text></Pressable> : null}
              <Pressable onPress={commitPortion} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 13, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.logToMeal").replace("{meal}", t(`w.recovery.nutrition.meal.${mealType}`))}</Text></Pressable>
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
          <View key={tile.k} style={{ width: "47.5%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: tile.color }}>{tile.label}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 4 }}>
              <TextInput value={f[tile.k]} onChangeText={(v) => setF((s) => ({ ...s, [tile.k]: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={C.line} accessibilityLabel={tile.label} style={{ flex: 1, fontFamily: F.black, fontSize: 27, letterSpacing: -0.9, color: C.chalk, padding: 0 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{tile.unit}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable onPress={async () => { if (await add()) setQuickLog(false); }} disabled={saving} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, opacity: saving ? 0.6 : 1 }}><IPlus size={16} color={C.onAccent} strokeWidth={2.4} /><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text></Pressable>
        <Pressable onPress={scan} disabled={scanning} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: `${pa.fill}73`, borderRadius: 999, paddingVertical: 14 }}><Glyph name="scan" size={16} color={pa.text} strokeWidth={5} /><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: pa.text }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}{!full ? " ✦" : ""}</Text></Pressable>
      </View>
    </Sheet>
  );

  // Full-screen chrome for the redesigned modal screens (Add / Create / Cook) —
  // an X (or back) at the left, a centred title, an optional right slot.
  const screenHead = (title: ReactNode, onBack: () => void, opts?: { icon?: "x" | "back"; right?: ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        {opts?.icon === "back" ? <AuroraIcon name="back" size={20} color={C.chalk} /> : <IClose size={22} color={C.chalk} />}
      </Pressable>
      <View style={{ flex: 1, alignItems: "center" }}>{typeof title === "string" ? <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: 19, color: C.chalk }}>{title}</Text> : title}</View>
      <View style={{ width: 44, alignItems: "center" }}>{opts?.right}</View>
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
          <Pressable onPress={() => setMealPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text style={{ fontFamily: F.black, fontSize: 19, color: C.chalk }}>{t(`w.recovery.nutrition.meal.${mealType}`)}</Text><IChevDown size={16} color={C.chalk} />
          </Pressable>,
          () => setView("home"),
        )}

        <Sheet visible={mealPicker} onClose={() => setMealPicker(false)} title={t("w.recovery.nutrition.chooseMeal")} scroll={false}>
          <View style={{ gap: 8 }}>
            {MEAL_TYPES.map((m) => (
              <Pressable key={m} onPress={() => { setMealType(m); setMealPicker(false); }} style={{ flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.ink, borderWidth: 1, borderColor: mealType === m ? C.lime : C.line, borderRadius: 16, padding: 14 }}>
                <Glyph name={mealGlyph(m)} size={20} color={mealType === m ? txt(C, C.lime) : C.ash} strokeWidth={5} />
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
                {mealType === m ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : null}
              </Pressable>
            ))}
          </View>
        </Sheet>

        {/* Search — text or barcode */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput value={foodQuery} onChangeText={setFoodQuery} placeholder={t("w.recovery.nutrition.searchPh")} placeholderTextColor={C.ash} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.subtitle, color: C.chalk, padding: 0 }} />
          {q ? <Pressable onPress={() => setFoodQuery("")} accessibilityLabel={t("w.recovery.nutrition.clear")}><IClose size={18} color={C.ash} /></Pressable> : <IBarcode size={20} color={C.ash} />}
        </View>

        {/* Quick Log + Create Food */}
        <View style={{ flexDirection: "row", gap: 11, marginTop: 12 }}>
          <Pressable onPress={() => setQuickLog(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 14 }}><IBolt size={18} color={C.chalk} /><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.quickLog")}</Text></Pressable>
          <Pressable onPress={() => openCreate("product")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 14 }}><IPlusBox size={18} color={C.chalk} /><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.nutrition.createFood")}</Text></Pressable>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 4, gap: 4, marginTop: 14 }}>
          {(["recent", "favorites", "personal"] as const).map((tab) => (
            <Pressable key={tab} onPress={() => setFoodTab(tab)} style={{ flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: "center", backgroundColor: foodTab === tab ? C.lime : "transparent" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: foodTab === tab ? C.onAccent : C.ash }}>{t(`w.recovery.nutrition.tab.${tab}`)}</Text>
            </Pressable>
          ))}
        </View>

        {q.length >= 2 ? (
          <View style={{ marginTop: 8 }}>
            {searching ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14 }}>{t("w.recovery.nutrition.searching")}</Text>
            ) : foodResults.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14, lineHeight: 18 }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
            ) : foodResults.map((food, i) => (
              <FoodRow key={`${food.code}-${i}`} C={C} name={food.name} meta={`${Math.round(food.kcal)} kcal  –  ${food.serving}`} onAdd={() => logFood(food)} chevron />
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            {foods.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 18, lineHeight: 20 }}>{t(foodTab === "personal" ? "w.recovery.nutrition.personalEmpty" : foodTab === "favorites" ? "w.recovery.nutrition.favoritesEmpty" : "w.recovery.nutrition.recentEmptyPicker")}</Text>
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
      <View style={{ flex: 1, backgroundColor: C.ink2, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 13 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 7 }}>
          {fixed != null
            ? <Text style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -0.4, color: C.chalk }}>{fixed}</Text>
            : <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={label} style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -0.4, color: C.chalk, padding: 0 }} />}
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
        <LinearGradient colors={[`${C.lime}12`, C.ink2]} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 22, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 20 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash, marginBottom: 9 }}>{t("w.recovery.nutrition.foodName")}</Text>
          <TextInput value={createForm.name} onChangeText={(v) => setCF({ name: v })} placeholder={t("w.recovery.nutrition.foodNamePh")} placeholderTextColor="#3a3d34" accessibilityLabel={t("w.recovery.nutrition.foodName")} style={{ fontFamily: F.black, fontSize: 27, letterSpacing: -0.5, color: C.chalk, padding: 0 }} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 14 }} />
          <TextInput value={createForm.subname} onChangeText={(v) => setCF({ subname: v })} placeholder={t("w.recovery.nutrition.subnamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.subname")} style={{ fontFamily: F.reg, fontSize: 16, color: C.ash, padding: 0 }} />
        </LinearGradient>

        {/* Macro hero — calories as the big number, P/C/F as three tiles. When
            the meal is built from products these show the summed total. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 9, marginTop: 26 }}>
          {fromComps
            ? <Text style={{ width: 172, textAlign: "center", fontFamily: F.black, fontSize: 60, letterSpacing: -2, color: C.chalk }}>{compTotals.kcal}</Text>
            : <TextInput value={createForm.kcal} onChangeText={(v) => setCF({ kcal: v })} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.calorie")} style={{ width: 172, textAlign: "center", fontFamily: F.black, fontSize: 60, letterSpacing: -2, color: C.chalk, padding: 0 }} />}
          <Text style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>kcal</Text>
        </View>
        <Text style={{ textAlign: "center", fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.calorie")}</Text>
        {!fromComps && approx > 0 && !createForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 8 }}>{t("w.recovery.nutrition.macrosApprox")} {approx} kcal</Text> : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
          {tile(t("w.recovery.nutrition.protein"), txt(C, C.blue), createForm.protein, (v) => setCF({ protein: v }), fromComps ? compTotals.protein : undefined)}
          {tile(t("w.recovery.nutrition.carbs"), txt(C, C.amber), createForm.carbs, (v) => setCF({ carbs: v }), fromComps ? compTotals.carbs : undefined)}
          {tile(t("w.recovery.nutrition.fat"), txt(C, C.violet), createForm.fat, (v) => setCF({ fat: v }), fromComps ? compTotals.fat : undefined)}
        </View>

        {/* Products — compose a meal from your saved products (meal only). Each
            component carries a serving count; the macros above are their sum. */}
        {isMeal ? (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.mealProducts")}</Text>
              {mealComps.length > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{mealComps.length}</Text> : null}
            </View>
            {mealComps.map((c) => (
              <View key={c.productId} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}><Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{c.name}</Text>{c.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{c.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{Math.round(c.kcal * c.qty)} kcal — {Math.round(c.protein * c.qty)}P {Math.round(c.carbs * c.qty)}C {Math.round(c.fat * c.qty)}F</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 10, overflow: "hidden" }}>
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
            <Pressable onPress={() => setUnitPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{t(`w.recovery.nutrition.unitOpt.${createForm.unit}`)}</Text><IChevDown size={13} color={C.ash} />
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={submitCreateFood} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 17, marginTop: 28 }}>
          <IPlus size={18} color={C.onAccent} strokeWidth={2.4} /><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{isMeal ? t("w.recovery.nutrition.saveMeal") : t("w.recovery.nutrition.saveProduct")}</Text>
        </Pressable>

        <Sheet visible={unitPicker} onClose={() => setUnitPicker(false)} title={t("w.recovery.nutrition.unit")} scroll={false}>
          <View style={{ gap: 8 }}>
            {UNIT_OPTIONS.map((u) => (
              <Pressable key={u} onPress={() => { setCreateForm((s) => ({ ...s, unit: u })); setUnitPicker(false); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.ink, borderWidth: 1, borderColor: createForm.unit === u ? C.lime : C.line, borderRadius: 14, padding: 14 }}>
                <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{t(`w.recovery.nutrition.unitOpt.${u}`)}</Text>
                {createForm.unit === u ? <AuroraIcon name="check" size={16} color={txt(C, C.lime)} /> : null}
              </Pressable>
            ))}
          </View>
        </Sheet>

        {/* Add product — pick from the saved-products library to compose the meal. */}
        <Sheet visible={compPicker} onClose={() => setCompPicker(false)} title={t("w.recovery.nutrition.addProduct")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 10 }}>
            <AuroraIcon name="search" size={17} color={C.ash} />
            <TextInput value={compQuery} onChangeText={setCompQuery} placeholder={t("w.recovery.nutrition.searchProducts")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, padding: 0 }} />
          </View>
          {products.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14, lineHeight: 20 }}>{t("w.recovery.nutrition.noProductsYet")}</Text>
          ) : compList.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14 }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
          ) : compList.map((p) => {
            const added = mealComps.find((c) => c.productId === p.id);
            return (
              <Pressable key={p.id} onPress={() => addMealComp(p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.2} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}><Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }}>{p.name}</Text>{p.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{p.subname}</Text> : null}</View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel || t("w.recovery.nutrition.serving")} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                {added ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>×{added.qty}</Text> : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setCompPicker(false)} style={{ marginTop: 10, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.recovery.nutrition.done")}</Text></Pressable>
        </Sheet>
      </AuroraScreen>
    );
  }

  // ============ RECIPES — browse ============
  if (view === "recipes") {
    const list = filterRecipes(RECIPES, recipeFilter);
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(t("w.recovery.nutrition.recipes"), () => setView("home"), { icon: "back" })}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {RECIPE_FILTERS.map((rf) => (
            <Pressable key={rf} onPress={() => setRecipeFilter(rf)} style={{ borderWidth: 1, borderColor: recipeFilter === rf ? C.lime : C.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 15, backgroundColor: recipeFilter === rf ? C.lime : C.ink2 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: recipeFilter === rf ? C.onAccent : C.ash }}>{t(`w.recovery.nutrition.recipeFilter.${rf}`)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
          {list.map((r) => (
            <Pressable key={r.id} onPress={() => openRecipe(r)} style={{ width: "47.5%", flexGrow: 1, borderWidth: 1, borderColor: C.line, borderRadius: 20, overflow: "hidden", backgroundColor: C.ink2 }}>
              <RecipeHero tint={r.tint} emoji={r.emoji} height={96} fontSize={40} />
              <View style={{ paddingHorizontal: 12, paddingTop: 11, paddingBottom: 13 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{r.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{t(`w.recovery.nutrition.meal.${r.meal}`)}  –  {r.timeMins} {t("w.recovery.nutrition.min")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 7 }}>{r.macros.kcal} kcal</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </AuroraScreen>
    );
  }

  // ============ RECIPE — detail ============
  if (view === "recipe" && recipe) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load} padding={0}>
        <RecipeHero tint={recipe.tint} emoji={recipe.emoji} height={240} fontSize={92}>
          <Pressable onPress={() => setView("recipes")} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ position: "absolute", top: 14, left: 14, width: 42, height: 42, borderRadius: 999, backgroundColor: "rgba(12,13,12,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={20} color={C.chalk} /></Pressable>
        </RecipeHero>
        <View style={{ marginTop: -28, backgroundColor: C.ink, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
            <View style={{ position: "absolute", left: 0 }}><IRestart size={22} color={C.chalk} /></View>
            <Text style={{ fontFamily: F.black, fontSize: 30, letterSpacing: -0.6, color: C.chalk }}>{recipe.name}</Text>
          </View>
          <Text style={{ textAlign: "center", fontFamily: F.mono, fontSize: fs.caption, letterSpacing: 0.6, color: C.ash, marginTop: 5 }}>{t(`w.recovery.nutrition.meal.${recipe.meal}`)}  –  {recipe.timeMins} {t("w.recovery.nutrition.mins")}</Text>

          <View style={{ flexDirection: "row", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 6, marginTop: 18 }}>
            {([["w.recovery.nutrition.energy", recipe.macros.kcal, txt(C, C.lime), false], ["w.recovery.nutrition.protein", recipe.macros.protein, txt(C, C.blue), true], ["w.recovery.nutrition.carbs", recipe.macros.carbs, txt(C, C.amber), true], ["w.recovery.nutrition.fat", recipe.macros.fat, txt(C, C.violet), true]] as const).map(([lab, val, col, g]) => (
              <View key={lab} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: 19, color: C.chalk }}>{val}<Text style={{ fontSize: 12, color: C.ash }}>{g ? "g" : ""}</Text></Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", marginTop: 5, color: col }}>{t(lab)}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 9 }}>
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.ingredients")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{recipeServes} {t("w.recovery.nutrition.serves")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
              <Pressable onPress={() => setRecipeServes((x) => Math.max(1, x - 1))} accessibilityLabel={t("w.recovery.nutrition.decrease")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20, color: txt(C, C.lime) }}>–</Text></Pressable>
              <Text style={{ width: 40, textAlign: "center", fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line, lineHeight: 38 }}>{recipeServes}</Text>
              <Pressable onPress={() => setRecipeServes((x) => Math.min(12, x + 1))} accessibilityLabel={t("w.recovery.nutrition.increase")} style={{ width: 44, height: 38, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 20, color: txt(C, C.lime) }}>+</Text></Pressable>
            </View>
          </View>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: ing.optional ? C.ash : C.chalk }}>{ing.name}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}>{formatIngredient(ing, recipe.baseServes, recipeServes)}</Text>
            </View>
          ))}
          {recipeMsg ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 20 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{recipeMsg}</Text></View> : null}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <Pressable onPress={() => saveRecipeAsMeal(recipe)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 17, paddingHorizontal: 22 }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.2} /><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.createMeal")}</Text></Pressable>
            <Pressable onPress={() => { setCookStep(0); setView("cook"); }} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 17, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.recovery.nutrition.startCooking")}</Text></Pressable>
          </View>
        </View>
      </AuroraScreen>
    );
  }

  // ============ COOK — step-through ============
  if (view === "cook" && recipe) {
    const cstep = recipe.steps[cookStep]!;
    const last = cookStep >= recipe.steps.length - 1;
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {screenHead(recipe.name, () => setView("recipe"))}
        <RecipeHero tint={recipe.tint} emoji={recipe.emoji} height={150} fontSize={64} style={{ borderRadius: 24, marginTop: 2, marginBottom: 20 }} />
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 18 }}>
          {recipe.steps.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= cookStep ? C.lime : C.line }} />)}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepXofY").replace("{x}", String(cookStep + 1)).replace("{y}", String(recipe.steps.length))}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 23, lineHeight: 31, letterSpacing: -0.2, color: C.chalk, marginTop: 12 }}>{cstep.text}</Text>
        {cstep.timerSec != null ? (
          <View style={{ flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8, marginTop: 20, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15 }}>
            <IClock size={15} color={txt(C, C.amber)} /><Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.amber) }}>{Math.floor(cstep.timerSec / 60)}:{String(cstep.timerSec % 60).padStart(2, "0")} {t("w.recovery.nutrition.timer")}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
          {cookStep > 0 ? <Pressable onPress={() => setCookStep((s) => s - 1)} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 26, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.stepBack")}</Text></Pressable> : null}
          <Pressable onPress={() => last ? setView("recipe") : setCookStep((s) => s + 1)} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}><Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{last ? t("w.recovery.nutrition.finishCooking") : t("w.recovery.nutrition.nextStep")}</Text></Pressable>
        </View>
      </AuroraScreen>
    );
  }

  const body = (
    <>
      {/* Hub masthead (home), or a sub-screen back-header. */}
      {view === "home" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
          <ABack />
          <View>
            {greeting ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash, marginBottom: 2 }}>{greeting}</Text> : null}
            <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.nutrition.title")}</AHeading>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => setView("home")} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={18} color={C.chalk} /></Pressable>
          <AHeading style={{ fontSize: 26 }}>{view === "log" ? t("w.recovery.nutrition.logMealCta") : view === "insights" ? t("w.recovery.nutrition.menuInsights") : view === "diary" ? t("w.recovery.nutrition.menuDiary") : view === "body" ? t("w.recovery.nutrition.menuBody") : view === "meals" ? t("w.recovery.nutrition.yourMeals") : t("w.recovery.nutrition.yourProducts")}</AHeading>
        </View>
      )}

      {view === "home" && (<>
      {/* Goal — a card you OPEN (never a live toggle): switching the goal
          recomputes every target, so it must take a deliberate tap. */}
      <Pressable onPress={() => setGoalPicker(true)} accessibilityRole="button" accessibilityLabel={`${t("w.recovery.nutrition.goalLabel")}: ${goalName(goal)}`} style={{ marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
          <Glyph name="target" size={20} color={C.ash} strokeWidth={5} />
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.goalLabel")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk, marginTop: 2 }}>{goalName(goal)}</Text>
          </View>
        </View>
        <Glyph name="chevron" size={16} color={C.ash} strokeWidth={6} />
      </Pressable>

      {coachDiet?.diet && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} ({t("w.recovery.nutrition.readOnly")})
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 10 }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, " kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <View key={label}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{val}{unit === "g" ? "g" : ""}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t(label)}{unit === " kcal" ? " (kcal)" : ""}</Text>
                </View>
              ) : null),
            )}
          </View>
          {coachDiet.diet.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 10, lineHeight: 18 }}>{coachDiet.diet.note}</Text> : null}
        </ACard>
      )}

          {/* CALORIE RING — the hero. Calories LEFT is the number; the ring fills
              as the day is consumed. */}
          <ACard style={{ marginTop: 16, paddingVertical: 26, alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.6, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.caloriesLeft")}</Text>
            <View style={{ marginTop: 18 }}>
              <Ring value={targets.kcal > 0 ? (today.kcal / targets.kcal) * 100 : 0} size={190} ticks={52} color={today.kcal > targets.kcal * 1.05 ? C.red : C.lime} track={C.line}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: 44, letterSpacing: -1.4, color: today.kcal > targets.kcal ? txt(C, C.red) : C.chalk }}>{Math.round(targets.kcal - today.kcal)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>{Math.round(today.kcal)} / {targets.kcal}</Text>
                </View>
              </Ring>
            </View>
            {maint.kcal != null ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash, marginTop: 18, textAlign: "center" }}>{t("w.recovery.nutrition.maintenance")} {maint.kcal} kcal{maint.weightChangeKg != null ? ` — ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}</Text> : null}
            {trainingKcal > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: `${C.lime}47`, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13 }}>
                <Glyph name="spark" size={13} color={txt(C, C.lime)} strokeWidth={5} />
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: txt(C, C.lime) }}>+{trainingKcal} {t("w.recovery.nutrition.trainingFuel")}</Text>
              </View>
            ) : null}
          </ACard>

          {/* Macros — their own card, hairline lines beneath the hero. */}
          <ACard style={{ marginTop: 12 }}>
            {([["w.recovery.nutrition.protein", today.protein, targets.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", today.carbs, targets.carbs, C.amber, txt(C, C.amber)], ["w.recovery.nutrition.fat", today.fat, targets.fat, C.violet, txt(C, C.violet)]] as const).map(([label, cur, tgt, col, colT], i) => (
              <View key={label} style={{ marginTop: i ? 18 : 0 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: colT }}>{t(label)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{Math.round(cur)} / {tgt} g</Text>
                </View>
                <View style={{ height: 4, borderRadius: 99, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}><View style={{ width: `${Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0)}%`, height: 4, borderRadius: 99, backgroundColor: col }} /></View>
              </View>
            ))}
          </ACard>

          {/* One plain-spoken nudge — a quiet line, not a boxed card. */}
          <NutritionNudge nudge={nudge} />

          {/* Today's meals — Breakfast / Lunch / Dinner / Snacks. Each opens the
              picker attributed to that meal; the kcal already logged is shown. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginHorizontal: 2 }}>
            <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("w.recovery.nutrition.todaysMeals")}</Text>
            <Pressable onPress={() => setView("diary")}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.menuDiary")} →</Text></Pressable>
          </View>
          {MEAL_TYPES.map((m) => (
            <Pressable key={m} onPress={() => openAdd(m)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 15, marginTop: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Glyph name={mealGlyph(m)} size={19} color={C.ash} strokeWidth={5} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: mealTotals[m] > 0 ? C.ash : txt(C, C.lime), marginTop: 2 }}>{mealTotals[m] > 0 ? `${Math.round(mealTotals[m])} kcal` : t("w.recovery.nutrition.addFirstFood")}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 1.6, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><IPlus size={16} color={txt(C, C.lime)} strokeWidth={2.4} /></View>
            </Pressable>
          ))}

          {/* Recipes — the cook-along library (Full-only; free users route to
              upgrade). */}
          <Pressable onPress={() => (recipesUnlocked ? setView("recipes") : (onUpgrade ? onUpgrade() : router.push("/upgrade")))} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 15, paddingHorizontal: 16, marginTop: 24 }}>
            <Glyph name="bowl" size={20} color={C.ash} strokeWidth={5} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.recipes")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.recipesSub")}</Text>
            </View>
            {!recipesUnlocked ? <Text style={{ color: pa.text, fontSize: 12 }}>✦</Text> : null}
            <Glyph name="chevron" size={16} color={C.ash} strokeWidth={6} />
          </Pressable>

          {/* Menu — the deliberate way into every deeper feature. */}
          {([
            ["diary", <AuroraIcon key="d" name="calendar" size={20} color={C.ash} />, t("w.recovery.nutrition.menuDiary"), t("w.recovery.nutrition.menuDiarySub"), undefined],
            ["insights", <Glyph key="i" name="spark" size={20} color={C.ash} strokeWidth={5} />, t("w.recovery.nutrition.menuInsights"), t("w.recovery.nutrition.menuInsightsSub"), undefined],
            ["body", <AuroraIcon key="b" name="heart" size={20} color={C.ash} />, t("w.recovery.nutrition.menuBody"), t("w.recovery.nutrition.menuBodySub"), undefined],
            ["meals", <Glyph key="m" name="bowl" size={20} color={C.ash} strokeWidth={5} />, t("w.recovery.nutrition.yourMeals"), t("w.recovery.nutrition.menuMealsSub"), full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`],
            ["foods", <AuroraIcon key="f" name="store" size={20} color={C.ash} />, t("w.recovery.nutrition.yourProducts"), t("w.recovery.nutrition.menuFoodsSub"), full ? t("w.recovery.nutrition.unlimited") : `${products.length} / ${FREE_PRODUCT_LIMIT}`],
          ] as [NutView, ReactNode, string, string, string | undefined][]).map(([key, icon, title, sub, badge], i) => (
            <Pressable key={key} onPress={() => setView(key)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 15, paddingHorizontal: 16, marginTop: i ? 10 : 24 }}>
              {icon}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{title}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
              </View>
              {badge ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{badge}</Text> : null}
              <Glyph name="chevron" size={16} color={C.ash} strokeWidth={6} />
            </Pressable>
          ))}
      </>
      )}

      {view === "insights" && (
        <View style={{ marginTop: 16 }}>
          <SummaryDashboard summary={summary} window={summaryWindow} onWindow={setSummaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} full={full} />
        </View>
      )}

      {view === "body" && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addWeighIn")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TextInput value={weighIn} onChangeText={setWeighIn} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.addWeighIn")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 11, textAlign: "center" }} />
            <Pressable onPress={() => { const kg = parseFloat(weighIn); if (Number.isFinite(kg) && kg > 0) { logWeighIn(kg); setWeighIn(""); } }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 18, justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.save")}</Text></Pressable>
          </View>
        </ACard>
      )}

      {/* Bodyweight trend — EWMA-smoothed weight line + weekly rate. */}
      {view === "body" && weight.points.length > 0 && (
        <ACard style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.bodyweightTrend")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, weight.ratePerWeek <= 0 ? C.lime : C.amber) }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</Text>
          </View>
          <WeightTrend points={weight.points} color={C.lime} />
        </ACard>
      )}

      {/* LOG — the unified manual entry + scan + one-tap premade meals. */}
      {view === "log" && (
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <AuroraIcon name="add" size={20} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
          </View>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flexDirection: "row", alignItems: "center", gap: 7, opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color={pa.text} strokeWidth={5} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: pa.text }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ color: pa.text, fontSize: 11 }}>✦</Text>}
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 14 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" inputRef={kcalRef} />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")} onPress={add} disabled={saving} style={{ marginTop: 14 }} />
        {/* QUICK MEALS — one-tap premade meals as time-of-day rows. Full users log
            on tap; free users see them locked and a tap routes to upgrade. */}
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.quickMeals")}</Text>
            {!full && <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: pa.text }}>✦ Full</Text>}
          </View>
          <View style={{ marginTop: 12 }}>
            {MEAL_PRESETS.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => logPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={t(p.labelKey)}
                style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
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
          {mealMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.mealLogged")} — {mealMsg}</Text></View> : null}
        </View>
      </ACard>

      )}

      {/* MY MEALS — the user's own saved-meal library. */}
      {view === "meals" && (
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourMeals")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`}</Text>
        </View>
        {meals.length === 0 && !showMealBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 10, lineHeight: 16 }}>{t("w.recovery.nutrition.yourMealsEmpty")}</Text>
        ) : null}
        {meals.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {meals.map((m, i) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                {m.emoji ? <Text style={{ fontSize: 20, width: 22, textAlign: "center" }}>{m.emoji}</Text> : <Glyph name="bowl" size={22} color={C.ash} strokeWidth={5} />}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{m.name}</Text>
                    {m.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }} numberOfLines={1}>{m.subname}</Text> : null}
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
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.newMeal")}</Text>
            <TextInput value={mealForm.name} onChangeText={(v) => setMealForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.mealNameHint")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.mealName")} style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 13 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <QuadTile field="kcal" label="kcal" unit="kcal" color={txt(C, C.lime)} value={mealForm.kcal} onChange={(v) => setMealForm((s) => ({ ...s, kcal: v }))} />
              <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={mealForm.protein} onChange={(v) => setMealForm((s) => ({ ...s, protein: v }))} />
              <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={mealForm.carbs} onChange={(v) => setMealForm((s) => ({ ...s, carbs: v }))} />
              <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.violet)} value={mealForm.fat} onChange={(v) => setMealForm((s) => ({ ...s, fat: v }))} />
            </View>
            {(() => { const mk = macroKcal(mealForm.protein, mealForm.carbs, mealForm.fat); return mk > 0 && !mealForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</Text> : null; })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setShowMealBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveMeal} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.saveMeal")}</Text></Pressable>
            </View>
          </View>
        ) : canSaveAnotherMeal ? (
          <Pressable onPress={() => openCreate("meal")} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.createMeal")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: `${pa.fill}1f`, borderWidth: 1, borderColor: `${pa.fill}66`, borderRadius: 999, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreMeals")}</Text>
          </Pressable>
        )}
      </ACard>

      )}

      {/* MY FOODS — search-first. The box queries Open Food Facts (free, no key)
          for any food or barcode; a hit can be logged to today or saved to the
          library. Below sits your own saved foods + a manual builder. */}
      {view === "foods" && (
      <ACard style={{ marginTop: 16 }}>
        {/* Search — text or barcode */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput value={foodQuery} onChangeText={setFoodQuery} placeholder={t("w.recovery.nutrition.foodSearchPh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.foodSearchPh")} autoCorrect={false} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, padding: 0 }} />
          {foodQuery ? <Pressable onPress={() => setFoodQuery("")} accessibilityLabel={t("w.recovery.nutrition.clear")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 17, color: C.ash }}>×</Text></Pressable> : <Glyph name="scan" size={17} color={C.ash} strokeWidth={4} />}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8, letterSpacing: 0.2 }}>{t("w.recovery.nutrition.foodSearchHint")}</Text>
        {foodMsg ? <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }}><AuroraIcon name="check" size={13} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{foodMsg}</Text></View> : null}

        {/* Database results */}
        {foodQuery.trim().length >= 2 ? (
          <View style={{ marginTop: 14 }}>
            {searching ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 6 }}>{t("w.recovery.nutrition.searching")}</Text>
            ) : foodResults.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 6, lineHeight: 16 }}>{t("w.recovery.nutrition.foodNoResults")}</Text>
            ) : foodResults.map((food, i) => (
              <View key={`${food.code}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{food.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }} numberOfLines={1}>{food.brand ? `${food.brand} — ` : ""}{food.serving} — {food.kcal} kcal — {food.protein}P {food.carbs}C {food.fat}F</Text>
                </View>
                <Pressable onPress={() => saveFood(food)} accessibilityLabel={t("w.recovery.nutrition.saveToFoods")} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="bookmark" size={15} color={C.ash} /></Pressable>
                <Pressable onPress={() => logFood(food)} accessibilityRole="button" style={{ borderRadius: 999, backgroundColor: C.lime, paddingVertical: 9, paddingHorizontal: 16 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: C.onAccent }}>{t("w.recovery.nutrition.log")}</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Your saved foods */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: foodQuery.trim().length >= 2 ? 16 : 0, borderTopWidth: foodQuery.trim().length >= 2 ? 1 : 0, borderTopColor: C.line }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourProducts")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${products.length} / ${FREE_PRODUCT_LIMIT}`}</Text>
        </View>
        {products.length === 0 && !showProdBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, lineHeight: 16 }}>{t("w.recovery.nutrition.yourProductsSub")}</Text>
        ) : null}
        {products.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            {products.map((p, i) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, flexShrink: 1 }} numberOfLines={1}>{p.name}</Text>
                    {p.subname ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, flexShrink: 1 }} numberOfLines={1}>{p.subname}</Text> : null}
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
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.newProduct")}</Text>
            <TextInput value={prodForm.name} onChangeText={(v) => setProdForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.productNamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.productName")} style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 13 }} />
            <TextInput value={prodForm.serving} onChangeText={(v) => setProdForm((s) => ({ ...s, serving: v }))} placeholder={t("w.recovery.nutrition.servingPh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.servingPh")} style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 11, marginTop: 8 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <QuadTile field="kcal" label="kcal" unit="kcal" color={txt(C, C.lime)} value={prodForm.kcal} onChange={(v) => setProdForm((s) => ({ ...s, kcal: v }))} />
              <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={txt(C, C.blue)} value={prodForm.protein} onChange={(v) => setProdForm((s) => ({ ...s, protein: v }))} />
              <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={txt(C, C.amber)} value={prodForm.carbs} onChange={(v) => setProdForm((s) => ({ ...s, carbs: v }))} />
              <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={txt(C, C.violet)} value={prodForm.fat} onChange={(v) => setProdForm((s) => ({ ...s, fat: v }))} />
            </View>
            {(() => { const mk = macroKcal(prodForm.protein, prodForm.carbs, prodForm.fat); return mk > 0 && !prodForm.kcal.trim() ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</Text> : null; })()}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setShowProdBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveProduct} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.onAccent }}>{t("w.recovery.nutrition.saveProduct")}</Text></Pressable>
            </View>
          </View>
        ) : null}
        {showProdBuilder ? null : canSaveAnotherProduct ? (
          <Pressable onPress={() => openCreate("product")} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addManually")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: `${pa.fill}1f`, borderWidth: 1, borderColor: `${pa.fill}66`, borderRadius: 999, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreProducts")}</Text>
          </Pressable>
        )}
      </ACard>

      )}

      {/* DIARY — the honest record of the week + recent days. */}
      {view === "diary" && (
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.todaysMeals")}</Text>
        <View style={{ marginTop: 12 }}>
          {MEAL_TYPES.map((m, i) => (
            <Pressable key={m} onPress={() => openAdd(m)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingVertical: 12, paddingHorizontal: 2 }}>
              <Glyph name={mealGlyph(m)} size={19} color={C.ash} strokeWidth={5} />
              <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t(`w.recovery.nutrition.meal.${m}`)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: mealTotals[m] > 0 ? C.chalk : C.ash }}>{mealTotals[m] > 0 ? `${Math.round(mealTotals[m])} kcal` : "—"}</Text>
              <Glyph name="chevron" size={14} color={C.ash} strokeWidth={6} />
            </Pressable>
          ))}
        </View>
      </ACard>
      )}

      {view === "diary" && (
      <ACard style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.recentDays")}</Text>
          {streakDays > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{streakDays}/7</Text> : null}
        </View>
        {/* week strip — last 7 days, lit when intake was logged */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 14 }}>
          {week.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: d.on ? `${C.lime}39` : C.ink, borderWidth: 1, borderColor: d.on ? `${C.lime}66` : C.line, alignItems: "center", justifyContent: "center" }}>{d.on ? <AuroraIcon name="check" size={13} color={txt(C, C.lime)} /> : null}</View>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          {recentDays.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recentDays.map((d, i) => (
            <View key={d.date} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, width: 48 }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(d.protein)}P {Math.round(d.carbs)}C {Math.round(d.fat)}F</Text>
            </View>
          ))}
        </View>
      </ACard>
      )}

      <Sheet visible={goalPicker} onClose={() => setGoalPicker(false)} title={t("w.recovery.nutrition.goalSheetTitle")} sub={t("w.recovery.nutrition.goalSheetSub")}>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          {GOALS.map((g) => {
            const on = goal === g.id;
            return (
              <Pressable key={g.id} onPress={() => { setGoal(g.id); setGoalPicker(false); }} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line, borderRadius: 16, padding: 15 }}>
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
    </>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {body}
    </AuroraScreen>
  );
}

// A labelled hairline divider for the compact Add-a-meal sheet.
function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.4, color: C.ash }}>{label}</Text>
        {tier ? <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: premium ? `${pa.fill}73` : C.line, color: premium ? pa.text : C.ash }}>{tier}</Text> : null}
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
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{first.date.slice(5)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{latest.date.slice(5)}</Text>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 4, paddingTop: 14, paddingBottom: 2 }}>
      {nudge.kind === "on-track"
        ? <AuroraIcon name="check" size={17} color={accent} style={{ marginTop: 1 }} />
        : <View style={{ marginTop: 1 }}><Glyph name="spark" size={17} color={accent} strokeWidth={5} /></View>}
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 20 }}>{text}</Text>
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
    <Pressable key={w} onPress={() => onWindow(w)} style={{ flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center", backgroundColor: window === w ? C.lime : "transparent" }}>
      <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.caption, letterSpacing: 0.4, textTransform: "uppercase", color: window === w ? C.onAccent : C.ash }}>{label}</Text>
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
    <ACard style={{ marginTop: 16 }}>
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
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15 }}>
            <View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</Text>
              <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk, marginTop: 4 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.recovery.nutrition.per28d")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <View key={label} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: col }}>{label}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: -0.4, color: C.chalk, marginTop: 6 }}>{val}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{unit}</Text>
              </View>
            ))}
          </View>
          {summary.macroSplit ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.recovery.nutrition.macroBalance")}</Text>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C.amber, txt(C, C.amber)], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C.violet, txt(C, C.violet)]] as const).map(([label, pct, col, colT]) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.6, textTransform: "uppercase", color: colT, width: 52 }}>{t(label)}</Text>
                  <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: C.ink2, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 4, borderRadius: 99, backgroundColor: col }} /></View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, width: 30, textAlign: "right" }}>{pct}%</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!full ? (
            <Pressable onPress={onUpgrade} style={{ flexDirection: "row", alignItems: "center", gap: 11, marginTop: 16, backgroundColor: `${pa.fill}17`, borderWidth: 1, borderColor: `${pa.fill}4d`, borderRadius: 16, padding: 14 }}>
              <Glyph name="spark" size={19} color={pa.text} strokeWidth={5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.deepInsights")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text>
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
function OnboardingGoal({ goal, setGoal, onUpgrade, onWeighIn, onContinueFree }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; onWeighIn: (kg: number) => void; onContinueFree: () => void }) {
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
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.ink2, borderWidth: on ? 2 : 1, borderColor: on ? C.lime : C.line, borderRadius: 20, padding: on ? 15 : 16, marginBottom: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{label}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{sub}</Text></View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={C.onAccent} /> : null}</View>
    </Pressable>
  );
  const primary = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 6 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: C.onAccent }}>{label}</Text></Pressable>
  );
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {step > 0 ? <Pressable onPress={() => setStep((s) => s - 1)} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="back" size={16} color={C.chalk} /></Pressable> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</Text>
      </View>
      <View style={{ height: 4, borderRadius: 99, backgroundColor: C.ink, overflow: "hidden", marginTop: 12 }}><View style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, backgroundColor: C.lime }} /></View>

      {step === 0 ? (
        <View style={{ marginTop: 22 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickGoal")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickGoalSub")}</Text>
          {GOAL_OPTS.map((o) => choice(goal === o.id, o.label, o.sub, () => setGoal(o.id)))}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ marginTop: 22 }}>
          <AHeading style={{ fontSize: fs.title }}>{t("w.recovery.nutrition.pickActivity")}</AHeading>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, marginBottom: 16 }}>{t("w.recovery.nutrition.pickActivitySub")}</Text>
          {MACT.map((a) => choice(activity === a.id, t(a.labelKey), t(a.subKey), () => setActivity(a.id)))}
          <ACard style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addWeighIn")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.addWeighIn")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 11, textAlign: "center" }} />
              <Pressable onPress={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 18, justifyContent: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.save")}</Text></Pressable>
            </View>
          </ACard>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ marginTop: 22 }}>
          <ACard style={{ alignItems: "center", paddingVertical: 22, backgroundColor: `${pa.fill}14`, borderColor: `${pa.fill}4d` }}>
            <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 }}><Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text></View>
            <AHeading style={{ fontSize: 22, marginTop: 14, textAlign: "center" }}>{t("w.recovery.nutrition.trialTitle")}</AHeading>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: 18 }}>{t("w.recovery.nutrition.trialSub")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.4, color: C.chalk, marginTop: 16 }}>$9.99<Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</Text>
            <Pressable onPress={onUpgrade} style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: pa.fill, borderRadius: 16, paddingVertical: 15, marginTop: 16 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: pa.ink }}>{t("w.recovery.nutrition.startTrial")}</Text><Glyph name="chevron" size={15} color={pa.ink} strokeWidth={6} /></Pressable>
          </ACard>
          {/* The FREE alternative — a limited plan to start on now, no card
              needed. Full is the trial card above; this is the way out that
              isn't an upgrade. */}
          <ACard style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.freePlanTitle")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.8, color: C.ash }}>{t("w.recovery.nutrition.freePlanSub")}</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              {["w.recovery.nutrition.freeBulletLogging", "w.recovery.nutrition.freeBulletMeals", "w.recovery.nutrition.freeBulletProducts", "w.recovery.nutrition.freeBulletInsights"].map((k) => (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 7 }}>
                  <AuroraIcon name="check" size={15} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t(k)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={onContinueFree} accessibilityRole="button" style={{ marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 14, alignItems: "center" }}>
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
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 15, paddingTop: 13, paddingBottom: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 4 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ flex: 1, fontFamily: F.black, fontSize: 26, letterSpacing: -0.8, color: C.chalk, paddingVertical: 2 }} />
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
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 11, textAlign: "center" }}
    />
  );
}
