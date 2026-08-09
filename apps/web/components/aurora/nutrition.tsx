"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import { useSessions } from "@/lib/use-sessions";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition, adaptiveTargets, estimateMaintenance, dailyNutrition, weightTrend,
  isFullAccess, canUseRecipes, MEAL_PRESETS, FREE_MEAL_LIMIT, FREE_PRODUCT_LIMIT,
  nutritionSummary, nutritionNudge, trainingEnergyOnDay, nutritionAnalytics, type AnalyticsWindow, sumMealComponents, recipeToMeal,
  nutritionHubSeries,
  fuelToday, hydrationToday,
  RECIPES, recipeById, recipeCoverView, localDayKey, localTodayKey,
  recipeCookView, resolveMealParts, mealPartKey, DEFAULT_MEAL_PART_KEYS, MAX_CUSTOM_MEAL_PARTS,
  canSaveRecipe, emptyUserRecipe, recipeToLog, type UserRecipe, type RecipeSource,
  type QuickAddCandidate, type QuickAddDraft, type QuickAddMatch,
  resolveTargets, targetMismatch, hasOverride, type TargetOverride,
  SERVING_UNITS, composeServingLabel, parseServing, servingGrams as servingGramsOf, unitById,
  type CopyPlan, type CopyableEntry,
  per100g, emptyNutritionDay, panelStatus,
  VERIFIED_SOURCES, verifiedFoodsBySource as vfBySource,
  verifiedSource, verifiedFood, verifiedFoodToHit, verifiedFoodsBySource, relatedVerifiedFoods, kj,
  sourceCheckedOn, verifiedFreshness, type NutritionGoal, type Signal, type MealPreset, type NutritionGlyphName, type FoodHit,
  type MicroFacts, type VerifiedStamp,
  type Recipe, type RecipeCollection, type NutritionMealPart, type MealPartDef,
} from "@hybrid/core";
import { fs, space, CARD_PAD, LINE_HEX, LIME_HEX, ASH, tip, accentText } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { AuroraIcon } from "./icons";
import { CtaLabel } from "./cta-label";
import RailTail from "./rail-tail";
import FetchError from "./fetch-error";
import Sheet from "./sheet";
import { readDeepLink, writeDeepLink, onDeepLinkChange, verifiedFoodUrl } from "@/lib/deep-link";
import { useHeroCollapse } from "./cover-hero";
import { HeroNav } from "./hero";
import { DockRail } from "./dock-rail";
import { NutritionHubBento } from "./nutrition-hub";
import BodyProgress from "./body-progress";
import WaterCard from "./water";
import { UserRecipeShelf, UserRecipeEditor, toUserRecipe, toRecipeBody, type RecipeRow } from "./user-recipes";
import CopyDaySheet from "./copy-day";
import NutritionTrends from "./nutrition-trends";
import QuickAdd from "./quick-add";
import TargetSheet, { TargetMismatchLine } from "./target-sheet";
import {
  collectionTitle, RecipesLibrary, RecipeCollectionScreen, RecipeDetail, CookPlate, RecipeTile,
} from "./recipe-library";
import {
  CDivider, NutritionNudgeLine, Ring, SummaryDashboard, OnboardingGoal, useCountUpFactor,
} from "./nutrition-panels";
import {
  readQuickFoods, writeQuickFoods, Glyph, RailHead, MarkPlate, VerifiedMark, FactsPanel, FoodRow, IClose, IChevDown, IChevRight, IPlus, IBarcode, ITrash, IBolt, IClock,
  IPlusBox, presetGlyph, railScroller, type QuickFood,
} from "./nutrition-kit";

// The Create Food form's blank state — one constant, so the reset paths can
// never fall out of step with the fields the form actually has.
const BLANK_CREATE_FORM = {
  name: "", subname: "", serving: "", unit: "gram",
  kcal: "", carbs: "", protein: "", fat: "",
  satFat: "", sugar: "", fiber: "", salt: "",
};

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "w.recovery.nutrition.goalLose" }, { id: "maintain", label: "w.recovery.nutrition.goalMaintain" }, { id: "gain", label: "w.recovery.nutrition.goalGain" },
];
// The Nutrition subpage is a HUB: a focused landing (view "home") + sub-screens
// reached from a menu, so the daily essentials aren't buried in one long scroll.
// The Nutrition subpage is a HUB: a focused landing (view "home") + sub-screens
// reached from a menu, plus the redesigned add-to-meal / create-food / recipes
// flows. "add" is the meal-food picker, "create" the Create Food form, and
// recipes → recipe → cook is the read-only recipes library.
type NutView = "home" | "log" | "insights" | "diary" | "body" | "meals" | "foods" | "add" | "create" | "recipes" | "collection" | "recipe" | "cook" | "food" | "source" | "sources" | "myRecipe";
// The part of the day a log is attributed to, carried into the Signal `source`
// so the hub can group today's intake. The four built-ins plus any custom parts
// a Full user added — so it's a plain key string, not a closed union.
type MealType = string;
const MEAL_TYPES = DEFAULT_MEAL_PART_KEYS;
const mealGlyph = (m: string): NutritionGlyphName => m === "breakfast" ? "sunrise" : m === "lunch" ? "sun" : m === "dinner" ? "moon" : m === "snack" ? "cup" : "bowl";
// A locally-persisted food the picker can re-log (Recent MRU + Favorites) — the
// same macro shape the portion editor writes, kept per-device so the two tabs
// work without a backend change.
type Row = { id?: string; userId: string; kind: string; value: number; unit: string; source: string; ts: string };
// Today's water logs, newest first — kept beside the engine's rolled-up total
// because UNDO needs the id of the reading it is taking back. A negative water
// Signal would be a lie about the day that every downstream sum would carry.
type WaterLog = { id: string; value: number; ts: string };
// One editable logged entry (per-serving macros + qty) the Diary lists.
// `derived` marks an entry the server rebuilt from its Signals because no
// FoodLog row exists for it (logged before the table shipped, or the migration
// hasn't run) — it edits by a relative scale instead of an absolute quantity.
type FoodLogRow = { id: string; name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; ts: string; derived?: boolean } & MicroFacts;
type SavedMeal = { id: string; name: string; subname?: string | null; emoji: string | null; kcal: number; protein: number; carbs: number; fat: number } & MicroFacts;
type FoodProduct = { id: string; name: string; subname?: string | null; servingLabel: string; servingGrams?: number | null; kcal: number; protein: number; carbs: number; fat: number; verifiedId?: string | null } & MicroFacts;

/** A serving weight recovered from its label, EXACT conversions only —
 *  a volume weight is an assumption (see serving-units.ts) and must not be
 *  handed to anything that treats it as measured. */
const exactGrams = (label: string | null | undefined): number | null => {
  const g = servingGramsOf(parseServing(label));
  return g && !g.assumed ? g.grams : null;
};

// Recent / Favorites persistence — a tiny per-device MRU + starred list so the
// picker's tabs work without a backend (best-effort; ignores private-mode).
/** AURORA Nutrition (web) — the adaptive macro tracker on one restrained system:
 *  the calorie tick-ring is the hero, macros read as hairline lines, iconography
 *  is one monoline voice, and colour appears only where it means something
 *  (lime = go; blue / amber / violet = protein / carbs / fat). Same engine +
 *  /api/signals logging + personal library underneath. */
export default function AuroraNutrition({ onNavigate, compact = false }: { onNavigate?: (screen: string) => void; compact?: boolean }) {
  const revalidate = useRevalidate();
  // The athlete's display unit — Body & progress logs weight in it (kg or lb),
  // the same preference the logger and every tonnage figure read.
  const units = useLoggerPrefs().units;
  const { t } = useLang();
  // Free (casual) users log macros manually; scanning a label and saving
  // meals/products is a Full feature (see canScanFoodLabel / canSaveMealsAndProducts).
  const persona = usePersona();
  const full = isFullAccess(persona);
  // Recipes (browse / cook-along / build a meal from a recipe) are Full-only.
  const recipesUnlocked = canUseRecipes(persona);
  const [signals, setSignals] = useState<Signal[]>([]);
  // Today's water readings (newest first) — see the WaterLog note.
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  // True when the day's intake fetch FAILED — so the hub can show a retry card
  // instead of a "0 eaten" summary that reads as a fresh day (parity with mobile).
  const [loadErr, setLoadErr] = useState(false);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  // The goal is changed through a deliberate Sheet (opened from a card), never a
  // live top-of-screen toggle — switching it recomputes every target, so an
  // accidental tap must not be able to do it.
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
  // Create Food form (redesigned builder) — one blend form for a PRODUCT or a
  // MEAL. Name + the personal Subname sit on the title plate; serving + unit
  // (products only) compose the stored servingLabel, e.g. 100 + "gram".
  const [createMode, setCreateMode] = useState<"product" | "meal">("product");
  const [createForm, setCreateForm] = useState(BLANK_CREATE_FORM);
  // The label panel is OPTIONAL and folded away by default — most foods a user
  // types in have only the four macros, and four more always-visible fields
  // would make the common case worse to serve the rarer one.
  const [showPanelFields, setShowPanelFields] = useState(false);
  const [unitPicker, setUnitPicker] = useState(false);
  // A meal can be composed FROM saved products: each component is a product with
  // a serving count; the meal's macros are the summed total (sumMealComponents).
  // Empty → the create-meal form falls back to manual macro entry.
  type MealComp = { productId: string; name: string; subname?: string | null; kcal: number; protein: number; carbs: number; fat: number; qty: number };
  const [mealComps, setMealComps] = useState<MealComp[]>([]);
  const [compPicker, setCompPicker] = useState(false); // the "Add product" sheet
  const [compQuery, setCompQuery] = useState("");
  const openCreate = (mode: "product" | "meal") => { setCreateMode(mode); setLibMsg(""); setMealComps([]); setCreateForm(BLANK_CREATE_FORM); setShowPanelFields(false); setView("create"); };
  // Add a saved product to the meal being composed (or bump its serving count if
  // already added); remove / re-count keep the summed macros in sync.
  const addMealComp = (p: FoodProduct) => setMealComps((xs) => {
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
  // root (the home rail opens one straight from the hub).
  const [collection, setCollection] = useState<RecipeCollection | null>(null);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeFrom, setRecipeFrom] = useState<"recipes" | "collection">("recipes");
  const openRecipe = (r: Recipe, from: "recipes" | "collection" = "recipes") => { setRecipeFrom(from); setRecipeId(r.id); setRecipeServes(r.baseServes); setCookStep(0); setRecipeMsg(""); setView("recipe"); };
  const openCollection = (key: RecipeCollection) => { setCollection(key); setView("collection"); };
  const openAdd = (m: MealType) => { setMealType(m); setError(""); setView("add"); };
  const recipe = recipeId ? recipeById(recipeId) : undefined;
  // Recent (MRU) + Favorites — persisted per-device so the picker's tabs work
  // without a backend. Recent is written on every log; Favorites toggles a star.
  const [recent, setRecent] = useState<QuickFood[]>(() => readQuickFoods("hybrid.nutrition.recent"));
  const [favorites, setFavorites] = useState<QuickFood[]>(() => readQuickFoods("hybrid.nutrition.favorites"));
  const pushRecent = useCallback((q: QuickFood) => {
    setRecent((xs) => { const next = [q, ...xs.filter((x) => x.key !== q.key)].slice(0, 20); writeQuickFoods("hybrid.nutrition.recent", next); return next; });
  }, []);
  const isFavorite = (key: string) => favorites.some((x) => x.key === key);
  const toggleFavorite = (q: QuickFood) => {
    setFavorites((xs) => { const next = isFavorite(q.key) ? xs.filter((x) => x.key !== q.key) : [q, ...xs]; writeQuickFoods("hybrid.nutrition.favorites", next); return next; });
  };
  const goalName = (id: NutritionGoal) => t(id === "lose" ? "w.recovery.nutrition.goalLose" : id === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  const goalSub = (id: NutritionGoal) => t(id === "lose" ? "w.recovery.nutrition.goalLoseSub" : id === "gain" ? "w.recovery.nutrition.goalGainSub" : "w.recovery.nutrition.goalMaintainSub");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mealMsg, setMealMsg] = useState("");
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { fetch("/api/nutrition/assigned").then((r) => r.json()).then(setCoachDiet).catch(() => {}); }, []);
  const C = (v: string) => `var(--color-${v})`;

  // ── Personal library — the user's OWN saved meals + custom products (Phase B).
  // Meals: free users keep up to FREE_MEAL_LIMIT; more (and any product) is Full.
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  // ── YOUR RECIPES — the athlete's own dishes. A recipe's macros are DERIVED
  // from its ingredients (@hybrid/core user-recipes.ts), so nothing here ever
  // stores or asks for a macro figure.
  const [userRecipes, setUserRecipes] = useState<RecipeRow[]>([]);
  // The recipe currently open in the editor. A recipe with no id has never been
  // saved, which is also what tells the editor to POST rather than PATCH.
  const [editRecipe, setEditRecipe] = useState<UserRecipe | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [userRecipeMsg, setUserRecipeMsg] = useState("");
  const [mealForm, setMealForm] = useState({ name: "", emoji: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [libMsg, setLibMsg] = useState("");
  const canSaveAnotherMeal = full || meals.length < FREE_MEAL_LIMIT;
  const canSaveAnotherProduct = full || products.length < FREE_PRODUCT_LIMIT;
  // First-run onboarding is a separate flow (see the early return). Completion is
  // persisted SERVER-SIDE (/api/nutrition/prefs) so the wizard appears exactly
  // once and survives a device change or the email-confirm round-trip — the old
  // per-device localStorage flag was unreliable (it was only set on the
  // "Continue on Free" button, so starting the trial or just weighing in left it
  // unset and re-showed onboarding every visit). localStorage stays as a fast
  // local cache; the derived `hasNutritionData` below is the final safety net.
  const [onboarded, setOnboarded] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("hybrid.nutrition.onboarded") === "1"; } catch { return false; } });
  // Persist a slice of the Nutrition prefs (best-effort — never blocks the UI).
  const saveNutritionPrefs = useCallback((patch: { onboarded?: boolean; goal?: NutritionGoal; mealParts?: NutritionMealPart[]; targets?: TargetOverride | null }) => {
    fetch("/api/nutrition/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  }, []);
  const finishOnboarding = useCallback(() => {
    try { localStorage.setItem("hybrid.nutrition.onboarded", "1"); } catch { /* private mode */ }
    setOnboarded(true);
    saveNutritionPrefs({ onboarded: true, goal });
  }, [saveNutritionPrefs, goal]);
  // Choose the goal AND remember it (server + the onboarding gate). The goal is a
  // saved preference, not a per-session default — switching it recomputes targets.
  const chooseGoal = useCallback((g: NutritionGoal) => { setGoal(g); saveNutritionPrefs({ goal: g }); }, [saveNutritionPrefs]);
  // Optimistic: the ring must move on save, not on the round-trip.
  const saveTargets = useCallback((next: TargetOverride | null) => {
    setTargetOverride(next);
    saveNutritionPrefs({ targets: next });
  }, [saveNutritionPrefs]);
  // Custom parts of the day (Full only) — e.g. "Pre-workout". Persisted in prefs
  // so they appear on every device alongside the four built-ins.
  // MANUAL TARGETS — per field; null/absent means that figure keeps adapting.
  const [targetOverride, setTargetOverride] = useState<TargetOverride | null>(null);
  const [targetSheet, setTargetSheet] = useState(false);
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
  // The full ordered list of parts to render — built-ins (localized) + custom
  // (Full only). Free users always see just the four.
  const partList: MealPartDef[] = useMemo(
    () => resolveMealParts(full ? customParts : [], (k) => t(`w.recovery.nutrition.meal.${k}`)),
    [full, customParts, t],
  );
  const partLabel = useCallback((key: string) => partList.find((p) => p.key === key)?.label ?? t(`w.recovery.nutrition.meal.${key}`), [partList, t]);

  // Load saved prefs once: restore the goal + custom parts, and short-circuit
  // onboarding if the server already recorded completion.
  useEffect(() => {
    let alive = true;
    fetch("/api/nutrition/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive || !d?.prefs) return;
      if (d.prefs.goal) setGoal(d.prefs.goal as NutritionGoal);
      if (Array.isArray(d.prefs.mealParts)) setCustomParts(d.prefs.mealParts as NutritionMealPart[]);
      if (d.prefs.targets) setTargetOverride(d.prefs.targets as TargetOverride);
      if (d.prefs.onboardedAt) { setOnboarded(true); try { localStorage.setItem("hybrid.nutrition.onboarded", "1"); } catch { /* ignore */ } }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const loadLibrary = useCallback(async () => {
    try {
      const [m, p, r] = await Promise.all([
        fetch("/api/nutrition/meals"),
        fetch("/api/nutrition/products"),
        fetch("/api/nutrition/recipes"),
      ]);
      if (m.ok) setMeals(((await m.json()).meals ?? []) as SavedMeal[]);
      if (p.ok) setProducts(((await p.json()).products ?? []) as FoodProduct[]);
      // Soft: the recipe tables are a later migration, and the route answers
      // with an empty library rather than failing, so an un-migrated database
      // costs the shelf and nothing else.
      if (r.ok) setUserRecipes(((await r.json()).recipes ?? []) as RecipeRow[]);
    } catch { /* offline — leave what we have */ }
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // ── Editable food log — the per-entry records the Diary lists + edit/delete.
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/nutrition/log"); if (r.ok) setLogs(((await r.json()).logs ?? []) as FoodLogRow[]); } catch { /* offline */ }
  }, []);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  // Log one food/meal → creates the editable entry AND the mirrored Signals the
  // engines read (one round-trip). Returns false (with an error set) on failure.
  const logEntry = useCallback(async (e: { name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; verifiedId?: string | null } & MicroFacts): Promise<boolean> => {
    const res = await fetch("/api/nutrition/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    if (res.status === 401) { setError(t("w.recovery.nutrition.errSignIn")); return false; }
    if (!res.ok) { setError(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return false; }
    return true;
  }, [t]);
  // ── YOUR RECIPES — open, save, delete, log ───────────────────────────────
  // The products library doubles as the ingredient source AND as what staleness
  // is checked against, so it is projected into the engine's RecipeSource shape
  // once here rather than inside the editor's render.
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
    // A never-saved recipe carries an empty id — that is what routes the save
    // to POST instead of PATCH, so there is no separate "isNew" flag to drift.
    setEditRecipe(r ? toUserRecipe(r) : { id: "", ...emptyUserRecipe() });
    setView("myRecipe");
  };
  const saveUserRecipe = async () => {
    if (!editRecipe) return;
    if (!editRecipe.name.trim()) { setUserRecipeMsg(t("w.recovery.nutrition.recipeNeedsName")); return; }
    setRecipeSaving(true);
    try {
      const isNew = !editRecipe.id;
      const res = await fetch(isNew ? "/api/nutrition/recipes" : `/api/nutrition/recipes/${editRecipe.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRecipeBody(editRecipe)),
      });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (!res.ok) { setUserRecipeMsg(t("w.recovery.nutrition.recipeNotMigrated")); return; }
      const { recipe } = (await res.json()) as { recipe: RecipeRow };
      // Adopt the SERVER's row: it carries the real ingredient ids, which the
      // editor keys its rows by, so a second save after a create must not send
      // the client-side "new:" ids back.
      setEditRecipe(toUserRecipe(recipe));
      await loadLibrary();
      setView("recipes");
    } catch {
      setUserRecipeMsg(t("w.recovery.nutrition.recipeNotMigrated"));
    } finally { setRecipeSaving(false); }
  };
  const deleteUserRecipe = async () => {
    if (!editRecipe?.id) { setView("recipes"); return; }
    setUserRecipes((xs) => xs.filter((x) => x.id !== editRecipe.id));
    setView("recipes");
    try { await fetch(`/api/nutrition/recipes/${editRecipe.id}`, { method: "DELETE" }); } catch { /* reloads on next visit */ }
    loadLibrary();
  };
  // Logging a recipe writes a NORMAL food entry — per single serving with a
  // separate quantity — so the Diary's own stepper rescales it afterwards and a
  // recipe never becomes a row the diary cannot edit.
  const logUserRecipe = async (qty: number) => {
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
    if (ok) setUserRecipeMsg(t("w.recovery.nutrition.recipeLogged").replace("{v}", partLabel(mealType)));
  };

  // Change an entry's quantity (rescales its Signals) or delete it (removes them).
  const editLogQty = async (id: string, qty: number) => {
    setLogs((xs) => xs.map((x) => x.id === id ? { ...x, qty } : x)); // optimistic
    try { await fetch(`/api/nutrition/log/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qty }) }); } catch { /* revert on reload */ }
    await load(); await loadLogs(); revalidate.recovery();
  };
  const deleteLog = async (id: string) => {
    setLogs((xs) => xs.filter((x) => x.id !== id)); // optimistic
    try { await fetch(`/api/nutrition/log/${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { /* revert on reload */ }
    await load(); await loadLogs(); revalidate.recovery();
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
    try { await fetch(`/api/nutrition/log/${encodeURIComponent(l.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scale: next / prev }) }); } catch { /* revert on reload */ }
    await load(); await loadLogs(); revalidate.recovery();
  };

  // ── Portion & quantity — logging any food/meal opens a sheet where a
  //    serving × quantity stepper scales the macros LIVE before they're written.
  //    One editor for an OFF search hit (offers Save too), a saved food, or a
  //    saved meal, so scaling isn't just for the database.
  // Everything the portion editor needs to show a full label and log it back:
  // the four macros, the LABEL PANEL (satFat/sugar/fiber/salt — null where the
  // food never stated it), the serving weight for a per-100 g comparison, and
  // the HYBRID Verified stamp when the item came from our checked catalog.
  type PortionBase = {
    name: string; subname?: string | null; subtitle?: string; serving: string;
    kcal: number; protein: number; carbs: number; fat: number;
    source: string; offFood?: FoodHit;
    servingGrams?: number | null; verified?: VerifiedStamp; verifiedId?: string | null;
  } & MicroFacts;
  const [portion, setPortion] = useState<PortionBase | null>(null);

  // ── Product pages. A verified item gets its OWN screen (view "food") and its
  //    business gets one too (view "source"). The portion SHEET stays what it
  //    always was — the fast path to logging — because a sheet and a page do
  //    different jobs: the sheet is for adding a food you already trust, the
  //    page is for deciding whether to trust it. `pageBack` remembers where the
  //    athlete came from so Back never dumps them somewhere they didn't start.
  const [foodPageId, setFoodPageId] = useState<string | null>(null);
  const [sourcePageId, setSourcePageId] = useState<string | null>(null);
  const [pageBack, setPageBack] = useState<NutView>("add");
  const openFoodPage = (id: string, from: NutView) => { setFoodPageId(id); setPageBack(from); setView("food"); };
  const openSourcePage = (id: string, from: NutView) => { setSourcePageId(id); setPageBack(from); setView("source"); };

  // DEEP LINKS. A verified page is the one thing in this screen worth an
  // address — it's a fact about a real product, so it can be sent to someone,
  // bookmarked, or landed on from a push. `?food=` / `?source=` mirror the open
  // page; every other view stays local state, because "the diary, scrolled to
  // Tuesday" is not a thing anyone shares.
  // A product page is a DESTINATION, so it gets a history entry (pushState) —
  // unlike a tab switch, which only replaces. That is what makes Back close the
  // page rather than leave the app.
  const viewRef = useRef<NutView>(view);
  viewRef.current = view;
  useEffect(() => {
    const apply = (p: { food?: string; source?: string }) => {
      if (p.food) { setFoodPageId(p.food); setPageBack("add"); setView("food"); }
      else if (p.source) { setSourcePageId(p.source); setPageBack("home"); setView("source"); }
      // Back popped PAST the page: the param is gone, so the page must close.
      // Without this the URL and the screen disagree and Back looks broken on
      // the one screen we just gave history support to.
      else if (viewRef.current === "food" || viewRef.current === "source") setView("add");
    };
    apply(readDeepLink());
    return onDeepLinkChange(apply);
  }, []);

  const mirrored = useRef(false);
  useEffect(() => {
    const open = view === "food" ? { food: foodPageId ?? undefined, source: undefined }
      : view === "source" ? { food: undefined, source: sourcePageId ?? undefined }
      : { food: undefined, source: undefined };
    // Skip the very first run: on a cold landing the deep-link effect above has
    // set state that hasn't flushed yet, so mirroring now would wipe the param
    // we just arrived on and immediately write it back — URL churn for nothing.
    if (!mirrored.current) { mirrored.current = true; if (readDeepLink().food || readDeepLink().source) return; }
    // Opening a page PUSHES (so Back closes it); closing one replaces.
    writeDeepLink(open, { push: !!(open.food || open.source) });
  }, [view, foodPageId, sourcePageId]);

  // Leaving Nutrition entirely unmounts this screen, and its mirror never runs
  // again — so without this the URL keeps `?food=` pointing at a page the user
  // left. Worse, coming back to Nutrition later would re-read it and dump them
  // on the burger instead of their hub.
  useEffect(() => () => { writeDeepLink({ food: undefined, source: undefined }); }, []);
  const [qty, setQty] = useState(1);
  const openPortion = (base: PortionBase) => { setQty(1); setError(""); setPortion(base); };

  // ── QUICK ADD — the athlete's OWN foods, ranked for a typed phrase.
  // Recents first (the food you logged yesterday is a better answer to two
  // words than one you saved in March), then products, then saved meals.
  const quickAddCandidates: QuickAddCandidate[] = useMemo(() => [
    ...recent.map((r) => ({
      id: r.key, name: r.name, subname: r.subname ?? null, servingLabel: r.serving,
      // A recent stores no weight, but its LABEL often implies one.
      servingGrams: exactGrams(r.serving),
      facts: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, satFat: null, sugar: null, fiber: null, salt: null },
      source: "recent" as const,
    })),
    ...products.map((p) => ({
      id: p.id, name: p.name, subname: p.subname ?? null, servingLabel: p.servingLabel,
      // Derived from the LABEL when the product never recorded a weight — the
      // reason this shipped without a migration. "100 g" saved years ago is
      // measurable today. Exact conversions only: an assumed volume weight
      // would let "chicken 200g" resolve against a cup of something.
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
  ], [recent, products, meals, t]);

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
    if (ok) { await load(); await loadLogs(); revalidate.recovery(); }
  };
  // A phrase whose quantity could NOT be computed opens the portion editor
  // instead of logging a number nobody worked out.
  const portionForQuickAdd = (m: QuickAddMatch) => openPortion({
    name: m.candidate.name, subname: m.candidate.subname, subtitle: m.candidate.servingLabel,
    serving: m.candidate.servingLabel,
    kcal: m.candidate.facts.kcal, protein: m.candidate.facts.protein, carbs: m.candidate.facts.carbs, fat: m.candidate.facts.fat,
    satFat: m.candidate.facts.satFat, sugar: m.candidate.facts.sugar, fiber: m.candidate.facts.fiber, salt: m.candidate.facts.salt,
    source: mealType, verifiedId: m.candidate.verifiedId ?? undefined,
  });

  // Log a saved meal → opens the portion editor (default 1×); the SAME
  // energyIntake/protein/carbs/fat signals as a manual add, scaled by quantity.
  const logMeal = (m: SavedMeal) => openPortion({ name: m.name, subname: m.subname, subtitle: m.subname || t("w.recovery.nutrition.savedMeal"), serving: `1 ${t("w.recovery.nutrition.serving")}`, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, satFat: m.satFat, sugar: m.sugar, fiber: m.fiber, salt: m.salt, source: "meal" });

  // Write the scaled macros for the open portion, then close. The log is
  // attributed to the current meal (source = mealType) so the hub can group
  // today's intake by meal, and the food is remembered in the Recent MRU.
  const commitPortion = async () => {
    if (!portion) return;
    const q = qty > 0 ? qty : 1;
    setError(""); setMealMsg(""); setFoodMsg("");
    try {
      // Store per-serving macros + qty so the entry stays editable (a later qty
      // change rescales it). Attributed to the current part of the day.
      const ok = await logEntry({
        name: portion.name, subname: portion.subname ?? portion.subtitle ?? null, source: mealType,
        kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
        satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
        verifiedId: portion.verifiedId ?? null, qty: q,
      });
      if (!ok) return;
      pushRecent({
        key: `${portion.name}|${portion.serving}`, name: portion.name, subname: portion.subname ?? null, serving: portion.serving,
        kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat,
        satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt,
        servingGrams: portion.servingGrams, verified: portion.verified, verifiedId: portion.verifiedId ?? null,
      });
      setMealMsg(`${portion.name} +${Math.round(portion.kcal * q)} kcal`);
      setPortion(null);
      await load(); await loadLogs(); revalidate.recovery();
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
  };

  // Re-log a Recent/Favorite food → opens the portion editor (default 1×).
  const logQuickFood = (q: QuickFood) => openPortion({ name: q.name, subname: q.subname, subtitle: q.subname || q.serving, serving: q.serving, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, satFat: q.satFat, sugar: q.sugar, fiber: q.fiber, salt: q.salt, servingGrams: q.servingGrams, verified: q.verified, verifiedId: q.verifiedId, source: mealType });
  // One-tap re-log of a Recent food at 1× to the current meal (the Today sheet's
  // fast path — no portion editor). Same signals + meal attribution as the picker.
  const relogRecent = async (q: QuickFood) => {
    setError(""); setMealMsg("");
    try {
      const ok = await logEntry({ name: q.name, subname: q.subname ?? null, source: mealType, kcal: q.kcal, protein: q.protein, carbs: q.carbs, fat: q.fat, qty: 1 });
      if (!ok) return;
      pushRecent(q);
      setMealMsg(`${q.name} +${Math.round(q.kcal)} kcal`);
      await load(); await loadLogs(); revalidate.recovery();
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
  };

  // Save the Create form → products OR meals API (one blend form, two targets),
  // carrying the personal subname, then return to the picker Personal tab.
  const submitCreateFood = async () => {
    if (!createForm.name.trim()) return;
    const isMeal = createMode === "meal";
    if (isMeal ? !canSaveAnotherMeal : !canSaveAnotherProduct) { onNavigate?.("upgrade"); return; }
    setLibMsg("");
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
    // The label is composed by core, so what is saved is exactly what
    // parseServing reads back. The weight is DERIVED from the unit — the old
    // rule only set it for "gram", so an ounce serving never got one even
    // though ounces convert exactly. An ASSUMED (volume) conversion is
    // deliberately not stored: writing a guessed weight into the measured
    // field would make it indistinguishable from one somebody weighed.
    const composedLabel = serving ? composeServingLabel(serving, createForm.unit) : undefined;
    const derived = composedLabel ? servingGramsOf(parseServing(composedLabel)) : null;
    const servingGrams = derived && !derived.assumed ? derived.grams : undefined;
    const body = isMeal
      ? { name: createForm.name.trim(), subname, ...macros, ...panelFields }
      : { name: createForm.name.trim(), subname, servingLabel: composedLabel, servingGrams, ...macros, ...panelFields };
    try {
      const res = await fetch(isMeal ? "/api/nutrition/meals" : "/api/nutrition/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (res.status === 401) { setLibMsg(t("w.recovery.nutrition.errSignIn")); return; }
      if (!res.ok) { setLibMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      setCreateForm(BLANK_CREATE_FORM);
      setShowPanelFields(false);
      setMealComps([]);
      await loadLibrary();
      setFoodTab("personal"); setView("add");
    } catch { setLibMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  // Log a product (saved food) from the picker → portion editor.
  const logProduct = (p: FoodProduct) => openPortion({ name: p.name, subname: p.subname, subtitle: p.subname || p.servingLabel, serving: p.servingLabel || `1 ${t("w.recovery.nutrition.serving")}`, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, satFat: p.satFat, sugar: p.sugar, fiber: p.fiber, salt: p.salt, servingGrams: p.servingGrams, verifiedId: p.verifiedId, source: mealType });

  const saveMeal = async () => {
    if (!mealForm.name.trim()) return;
    if (!canSaveAnotherMeal) { onNavigate?.("upgrade"); return; }
    setLibMsg("");
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const body = { name: mealForm.name.trim(), emoji: mealForm.emoji || undefined, kcal: num(mealForm.kcal) || undefined, protein: num(mealForm.protein), carbs: num(mealForm.carbs), fat: num(mealForm.fat) };
    try {
      const res = await fetch("/api/nutrition/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (res.status === 401) { setLibMsg(t("w.recovery.nutrition.errSignIn")); return; }
      if (!res.ok) { setLibMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      setMealForm({ name: "", emoji: "", kcal: "", protein: "", carbs: "", fat: "" });
      setShowMealBuilder(false);
      await loadLibrary();
    } catch { setLibMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  const deleteMeal = async (id: string) => {
    setMeals((xs) => xs.filter((x) => x.id !== id));
    try { await fetch(`/api/nutrition/meals/${id}`, { method: "DELETE" }); } catch { /* revert on next load */ }
  };

  // "Create meal" from a recipe → save its PER-SERVE macros (recipeToMeal) into
  // the personal meal library, so a Full user can one-tap log a favourite recipe
  // as a meal. Respects the free meal cap (recipes are Full-only anyway).
  const [recipeMsg, setRecipeMsg] = useState("");
  const saveRecipeAsMeal = async (r: Recipe) => {
    if (!canSaveAnotherMeal) { onNavigate?.("upgrade"); return; }
    setRecipeMsg("");
    try {
      const res = await fetch("/api/nutrition/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recipeToMeal(r)) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (res.status === 401) { setRecipeMsg(t("w.recovery.nutrition.errSignIn")); return; }
      if (!res.ok) { setRecipeMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      await loadLibrary();
      setRecipeMsg(t("w.recovery.nutrition.recipeSavedMeal"));
    } catch { setRecipeMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  // Custom products — free users keep up to FREE_PRODUCT_LIMIT (canSaveProduct,
  // mirrored client + server); Full is unlimited. Building a meal can draw macros
  // from these.
  const [prodForm, setProdForm] = useState({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showProdBuilder, setShowProdBuilder] = useState(false);

  const saveProduct = async () => {
    if (!prodForm.name.trim()) return;
    if (!canSaveAnotherProduct) { onNavigate?.("upgrade"); return; }
    setLibMsg("");
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const body = { name: prodForm.name.trim(), servingLabel: prodForm.serving.trim() || undefined, kcal: num(prodForm.kcal) || undefined, protein: num(prodForm.protein), carbs: num(prodForm.carbs), fat: num(prodForm.fat) };
    try {
      const res = await fetch("/api/nutrition/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (!res.ok) { setLibMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      setProdForm({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
      setShowProdBuilder(false);
      await loadLibrary();
    } catch { setLibMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  const deleteProduct = async (id: string) => {
    setProducts((xs) => xs.filter((x) => x.id !== id));
    try { await fetch(`/api/nutrition/products/${id}`, { method: "DELETE" }); } catch { /* revert on next load */ }
  };

  // Add a product's macros straight into the meal builder (compose a meal from
  // your foods). Sums onto whatever's already typed.
  const addProductToMeal = (p: FoodProduct) => {
    setShowMealBuilder(true);
    setMealForm((s) => {
      const add = (a: string, b: number) => String((parseFloat(a) || 0) + b);
      return { ...s, name: s.name || p.name, kcal: add(s.kcal, p.kcal), protein: add(s.protein, p.protein), carbs: add(s.carbs, p.carbs), fat: add(s.fat, p.fat) };
    });
  };

  // ── Food search — Open Food Facts (free, no key) via our /api/nutrition/search
  //    proxy. The single box takes text OR a barcode (the server auto-detects a
  //    number). Debounced; a hit can be LOGGED to today or SAVED to the library.
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<FoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [foodMsg, setFoodMsg] = useState("");
  useEffect(() => {
    const q = foodQuery.trim();
    if (q.length < 2) { setFoodResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { foods?: FoodHit[] };
        setFoodResults(data.foods ?? []);
      } catch { setFoodResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(id);
  }, [foodQuery]);

  // Log a database food → opens the portion editor (serving × quantity), which
  // also offers to save it into the library. The write is the SAME signals as a
  // manual add, scaled by quantity.
  const logFood = (food: FoodHit) => openPortion({
    name: food.name, subtitle: food.brand ?? undefined, serving: food.serving,
    kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
    satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
    servingGrams: food.servingGrams, verified: food.verified, verifiedId: food.id ?? null,
    // A verified item is attributed to the part of the day like any other food;
    // only a community hit keeps the generic "off" source.
    source: food.verified ? mealType : "off", offFood: food,
  });

  // Save a database food into the personal library (respects the free cap).
  const saveFood = async (food: FoodHit) => {
    if (!canSaveAnotherProduct) { onNavigate?.("upgrade"); return; }
    setFoodMsg("");
    const body = {
      name: food.name, subname: food.brand, servingLabel: food.serving, servingGrams: food.servingGrams,
      kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
      satFat: food.satFat, sugar: food.sugar, fiber: food.fiber, salt: food.salt,
      verifiedId: food.id ?? null,
    };
    try {
      const res = await fetch("/api/nutrition/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (!res.ok) { setFoodMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      setFoodMsg(`${food.name} ${t("w.recovery.nutrition.savedToFoods")}`);
      await loadLibrary();
    } catch { setFoodMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      // 401 (demo / no-auth) is an honest empty, not a load failure — mirror the
      // useSessions convention so a signed-out view never shows the retry card.
      if (res.status === 401) { setLoadErr(false); return setSignals([]); }
      if (!res.ok) { setLoadErr(true); return setSignals([]); }
      const data = (await res.json()) as { signals?: Row[] };
      const rows = data.signals ?? [];
      setSignals(rows.map((s) => ({ athleteId: s.userId, kind: s.kind as Signal["kind"], value: s.value, unit: s.unit, source: s.source, ts: s.ts })));
      // Keep today's water readings addressable (see WaterLog) so the control
      // can delete the last one rather than appending its negation.
      const todayKey = localTodayKey();
      setWaterLogs(
        rows
          .filter((s) => s.kind === "water" && typeof s.id === "string" && localDayKey(Date.parse(s.ts)) === todayKey)
          .map((s) => ({ id: s.id as string, value: s.value, ts: s.ts }))
          .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)),
      );
      setLoadErr(false);
    } catch { setLoadErr(true); setSignals([]); setWaterLogs([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Training-aware targets — today's sessions estimate a fuel bump (carbs) added
  // to the goal target, so a hard training day earns more food (note #4).
  const { sessions } = useSessions();
  const bodyMassKg = useMemo(() => {
    const w = [...signals].filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    return w?.value;
  }, [signals]);
  const trainingKcal = useMemo(() => trainingEnergyOnDay(sessions, bodyMassKg ?? 75), [sessions, bodyMassKg]);

  const today = useMemo(() => todayNutrition(signals), [signals]);

  // ── WATER ────────────────────────────────────────────────────────────────
  // The same training-aware composition the calorie target uses: a bodyweight
  // baseline plus today's sweat allowance. `today` is passed through so the
  // whole Signal stream isn't rolled up a second time just for one figure.
  const hydration = useMemo(
    () => hydrationToday(signals, { bodyMassKg, trainingKcal, day: today }),
    [signals, bodyMassKg, trainingKcal, today],
  );
  // Optimistic: the vessel row must fill on the tap, not on the round-trip.
  // A failed write reloads from the server rather than leaving the optimistic
  // millilitres on screen — a drink the athlete never logged is worse than a
  // control that visibly bounces back.
  const logWater = useCallback(async (ml: number) => {
    const ts = new Date().toISOString();
    const optimistic: Signal = { athleteId: "me", kind: "water", value: ml, unit: "ml", source: "manual", ts };
    setSignals((xs) => [optimistic, ...xs]);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "water", value: ml, unit: "ml", source: "manual", ts }),
      });
      if (!res.ok) throw new Error("water");
      const { signal } = (await res.json()) as { signal?: { id?: string } };
      if (signal?.id) setWaterLogs((xs) => [{ id: signal.id as string, value: ml, ts }, ...xs]);
      revalidate.recovery();
    } catch {
      load();
    }
  }, [load, revalidate]);

  // Undo removes the READING, not its effect — see the /api/signals/[id] note.
  const undoWater = useCallback(async () => {
    const last = waterLogs[0];
    if (!last) return;
    setWaterLogs((xs) => xs.slice(1));
    setSignals((xs) => {
      const i = xs.findIndex((s) => s.kind === "water" && s.ts === last.ts && s.value === last.value);
      return i < 0 ? xs : [...xs.slice(0, i), ...xs.slice(i + 1)];
    });
    try {
      const res = await fetch(`/api/signals/${last.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("undo");
      revalidate.recovery();
    } catch {
      load();
    }
  }, [waterLogs, load, revalidate]);

  // ── COPY A DAY — "yesterday's breakfast is today's breakfast" ────────────
  // The plan comes from @hybrid/core (copyDayPlan) and is written by the batch
  // endpoint, which runs each entry through the SAME writer a hand-typed entry
  // uses — so a copied day is not a special kind of day.
  const [copySheet, setCopySheet] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const runCopy = useCallback(async (plan: CopyPlan) => {
    setCopyBusy(true); setCopyMsg("");
    try {
      const res = await fetch("/api/nutrition/log/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: plan.entries }),
      });
      if (!res.ok) { setCopyMsg(t("w.recovery.nutrition.copyFailed")); return; }
      const { written, failed } = (await res.json()) as { written: number; failed: number };
      // A partial write is reported as a partial write. The batch is
      // deliberately not transactional (see the route), so claiming a clean
      // copy when two rows fell over would be a lie the diary contradicts.
      setCopyMsg(
        failed > 0
          ? t("w.recovery.nutrition.copyPartial").replace("{n}", String(written)).replace("{f}", String(failed))
          : t("w.recovery.nutrition.copyDone").replace("{n}", String(written)),
      );
      await load(); await loadLogs(); revalidate.recovery();
      if (failed === 0) setCopySheet(false);
    } catch {
      setCopyMsg(t("w.recovery.nutrition.copyFailed"));
    } finally { setCopyBusy(false); }
  }, [load, loadLogs, revalidate, t]);

  // Today's energy grouped by meal (source = meal type) for the hub sections.
  const mealTotals = useMemo(() => {
    const todayKey = localTodayKey();
    // Keyed by the log `source` (the part of the day). Reading by a part key
    // naturally ignores non-part sources like "manual"/"off".
    const totals: Record<string, number> = {};
    for (const s of signals) {
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
  const daySummary = useMemo(() => dailyNutrition(signals).find((d) => d.date === diaryDay) ?? emptyNutritionDay(diaryDay), [signals, diaryDay]);
  const dayPartKcal = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of signals) {
      if (s.kind !== "energyIntake" || localDayKey(s.ts) !== diaryDay) continue;
      totals[s.source] = (totals[s.source] ?? 0) + s.value;
    }
    return totals;
  }, [signals, diaryDay]);
  // A readable weekday + date for the summary header (browser locale).
  const diaryDayLabel = useMemo(() => {
    const [y, m, d] = diaryDay.split("-").map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }, [diaryDay]);
  // The engine's own figures, WITHOUT the training bump — resolveTargets is the
  // single place that decides whether the bump applies, so the adaptive and the
  // manual path cannot add it two different ways.
  const adaptiveBase = useMemo(() => adaptiveTargets(signals, { goal, trainingKcal: 0 }), [signals, goal]);
  const targets = useMemo(() => resolveTargets(adaptiveBase, targetOverride, trainingKcal), [adaptiveBase, targetOverride, trainingKcal]);
  const mismatch = useMemo(() => targetMismatch(targets), [targets]);
  // Over-budget grace: the ring AND the centre number flip red past the SAME
  // 5% threshold, so the two can never disagree.
  const KCAL_OVER_FACTOR = 1.05;
  const kcalOver = today.kcal > targets.kcal * KCAL_OVER_FACTOR;
  const maint = useMemo(() => estimateMaintenance(signals, {}), [signals]);
  const recentDays = useMemo(() => dailyNutrition(signals).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(signals), [signals]);
  const personalized = maint.kcal != null;
  // Final safety net for the "onboarding shows every time" bug: anyone who has
  // ALREADY logged intake or a weigh-in has plainly finished first-run, so never
  // re-show the wizard even if the server flag + local cache are both missing.
  const hasNutritionData = useMemo(() => signals.some((s) => s.kind === "energyIntake" || s.kind === "bodyMass"), [signals]);
  // Summary dashboard window toggle + rolling summary; today's nudge.
  // ONE window for the whole Insights screen: the goal overview and the
  // per-nutrient trends below it must answer the same question over the same
  // span, so the control lives on the screen rather than inside either panel.
  const [summaryWindow, setSummaryWindow] = useState<AnalyticsWindow>(30);
  const summary = useMemo(() => nutritionSummary(signals, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  // Every figure on the trends screen comes from here — nothing is computed
  // in the component, so the two clients cannot reach different conclusions.
  const analytics = useMemo(
    () => nutritionAnalytics(signals, { sessions, goal, bodyMassKg, windowDays: summaryWindow }),
    [signals, sessions, goal, bodyMassKg, summaryWindow],
  );
  // The hub bento's Diary chart: seven days of target-vs-logged. The target is
  // per-day training-aware (the same composition `targets` uses for today), so
  // today's point on the chart and the hero ring above it agree by construction.
  const hubSeries = useMemo(() => nutritionHubSeries(signals, sessions, { goal, bodyMassKg }), [signals, sessions, goal, bodyMassKg]);
  // The Insights tile shows a fixed SEVEN-day average, never the dashboard's
  // 7/30 toggle — a tile whose number silently changes with a control on
  // another screen is a tile you can't trust.
  const weekSummary = useMemo(() => nutritionSummary(signals, { targets, windowDays: 7 }), [signals, targets]);
  const nudge = useMemo(() => nutritionNudge(today, targets), [today, targets]);
  // Mount count-up for the hero's kcal number (0 → target, rAF ease-out).
  // core's statCountUp is the wrapped-slides string formatter, not a hook —
  // the hub number is a plain int, so a 0→1 factor is all we need here.
  const kcalCountF = useCountUpFactor();
  // ── The sticky HUD ────────────────────────────────────────────────────────
  // The one number you came for is what's LEFT, and it used to exist only at
  // the top of the hub: scroll into the picker or the libraries to choose food
  // and the budget was off screen. The rail keeps it there. It reads from
  // fuelToday() — the SAME composition the hero ring draws, with the same
  // opts as `targets` above — so the capsule and the ring cannot disagree.
  const fuel = useMemo(() => fuelToday(signals, { goal, trainingKcal }), [signals, goal, trainingKcal]);
  // Time-of-day greeting (client-only) + anchors for the quick-action tiles.
  const [greeting, setGreeting] = useState("");
  useEffect(() => { const h = new Date().getHours(); setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening")); }, [t]);
  // Last-7-calendar-days logging strip for the history streak.
  const week = useMemo(() => {
    const logged = new Set(dailyNutrition(signals).filter((d) => d.kcal > 0).map((d) => d.date));
    const L = ["S", "M", "T", "W", "T", "F", "S"]; const now = new Date(); const out: { label: string; on: boolean }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push({ label: L[d.getDay()]!, on: logged.has(key) }); }
    return out;
  }, [signals]);
  const streakDays = useMemo(() => week.filter((d) => d.on).length, [week]);
  // A weigh-in writes to the PROFILE (/api/body); the server mirrors it into the
  // bodyMass Signal, so nutrition's maintenance + trend read the one canonical
  // bodyweight the profile owns (note #1 — "body weight derived from profile").
  const logWeighIn = async (kg: number) => {
    try { await fetch("/api/body", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weightKg: kg }) }); await load(); revalidate.recovery(); } catch { /* offline */ }
  };

  // Returns true when the whole meal landed (so the Quick Log sheet can close
  // only on success and leave an error visible otherwise).
  const add = async (): Promise<boolean> => {
    setSaving(true); setError(""); setMealMsg("");
    // One unified entry: kcal + macros. When kcal is left blank, derive it from
    // the macros (4·4·9) so the calorie total always moves — mirrors how a preset
    // stores an explicit kcal alongside its macros.
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const protein = num(f.protein), carbs = num(f.carbs), fat = num(f.fat);
    const kcal = num(f.kcal) || protein * 4 + carbs * 4 + fat * 9;
    if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) { setSaving(false); return false; }
    try {
      // A manual macro entry is still a real, editable/deletable log entry —
      // routed through the same endpoint so it appears in the Diary.
      const ok = await logEntry({ name: t("w.recovery.nutrition.quickEntry"), source: mealType, kcal, protein, carbs, fat, qty: 1 });
      if (!ok) { setSaving(false); return false; }
      setF({ kcal: "", protein: "", carbs: "", fat: "" });
      setMealMsg(`+${Math.round(kcal)} kcal`);
      await load(); await loadLogs(); revalidate.recovery();
      setSaving(false);
      return true;
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
    setSaving(false);
    return false;
  };

  // Premade meal → a real, editable Diary entry (routes through /api/nutrition/log
  // like every other log, so it appears in the Diary with a name + edit/delete)
  // AND the mirrored Signals the engines read. Attributed to the preset's natural
  // part of the day (its id prefix: breakfast|lunch|dinner|snack). Free users
  // can't log presets (canSaveMealsAndProducts === Full) — a tap routes to upgrade.
  const logPreset = async (p: MealPreset) => {
    if (!full) { onNavigate?.("upgrade"); return; }
    setError(""); setMealMsg("");
    const part = p.id.split("-")[0] || mealType;
    const name = t(p.labelKey).split(/ [·–] /)[0] || t(p.labelKey);
    try {
      const ok = await logEntry({ name, source: part, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, qty: 1 });
      if (!ok) return;
      setMealMsg(`${name} +${p.kcal} kcal`);
      await load(); await loadLogs(); revalidate.recovery();
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
  };

  // Scan a nutrition label (Full) — read the file as a data URL, send it to the
  // AI vision endpoint, and prefill the macro fields. A 403 means not-Full →
  // route to upgrade.
  const scanFile = async (file: File) => {
    setScanning(true); setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/nutrition/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: dataUrl }) });
      if (res.status === 403) { onNavigate?.("upgrade"); setScanning(false); return; }
      if (!res.ok) { setError(t("w.recovery.nutrition.scanFailed")); setScanning(false); return; }
      const d = (await res.json()) as { name: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
      setF({ kcal: d.kcal != null ? String(d.kcal) : "", protein: d.protein != null ? String(d.protein) : "", carbs: d.carbs != null ? String(d.carbs) : "", fat: d.fat != null ? String(d.fat) : "" });
    } catch { setError(t("w.recovery.nutrition.scanFailed")); }
    setScanning(false);
  };

  // Scan a label straight INTO the Create form (name + macros) — the dedicated
  // Create-screen path, so the scan prefills the builder, not the quick-log `f`.
  const scanIntoCreate = async (file: File) => {
    setScanning(true); setLibMsg("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("read")); r.readAsDataURL(file); });
      const res = await fetch("/api/nutrition/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: dataUrl }) });
      if (res.status === 403) { onNavigate?.("upgrade"); setScanning(false); return; }
      if (!res.ok) { setLibMsg(t("w.recovery.nutrition.scanFailed")); setScanning(false); return; }
      const d = (await res.json()) as { name: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
      setCreateForm((s) => ({ ...s, name: d.name || s.name, kcal: d.kcal != null ? String(d.kcal) : s.kcal, protein: d.protein != null ? String(d.protein) : s.protein, carbs: d.carbs != null ? String(d.carbs) : s.carbs, fat: d.fat != null ? String(d.fat) : s.fat }));
    } catch { setLibMsg(t("w.recovery.nutrition.scanFailed")); }
    setScanning(false);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: CARD_PAD } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, flex: "1 1 70px", minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px", outline: "none", textAlign: "center" as const };
  // A labelled macro field — the colour-coded, big-number input the redesigned
  // meal/product builders are built from (protein=blue, carbs=amber, fat=violet,
  // kcal=lime). A render helper (not a component) so focus survives keystrokes.
  const macroField = (label: string, colorVar: string, value: string, onChange: (v: string) => void, unit = "g") => (
    <label style={{ flex: "1 1 64px", minWidth: 0, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "10px 12px 12px", display: "block" }}>
      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: colorVar }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 3 }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" placeholder="0" style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{unit}</span>
      </span>
    </label>
  );
  const macroKcalOf = (protein: string, carbs: string, fat: string) => Math.round((parseFloat(protein) || 0) * 4 + (parseFloat(carbs) || 0) * 4 + (parseFloat(fat) || 0) * 9);
  // The Today "Nutrition" sheet — a focused Add-a-meal, not the whole tracker.
  if (compact) {
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22 }}>{t("w.recovery.nutrition.addMealTitle")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 4 }}>{Math.round(today.kcal)} / {targets.kcal} {t("w.recovery.nutrition.kcalToday")}</div>

        {/* Meal selector — the quick-add is attributed to the chosen meal, matching
            the full picker so today's intake groups the same way. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
          {MEAL_TYPES.map((m) => {
            const on = mealType === m;
            return (
              <button className="pressable" key={m} onClick={() => setMealType(m)} aria-label={t(`w.recovery.nutrition.meal.${m}`)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: on ? C("lime") : C("ink"), border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 16, padding: "10px 4px", cursor: "pointer", color: on ? "var(--on-accent)" : C("chalk") }}>
                <Glyph name={mealGlyph(m)} size={18} color={on ? "var(--on-accent)" : C("ash")} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: on ? 700 : 500 }}>{t(`w.recovery.nutrition.meal.${m}`)}</span>
              </button>
            );
          })}
        </div>

        {/* Recent — one-tap re-log of a recent food to the chosen meal. */}
        {recent.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>{t("w.recovery.nutrition.tab.recent")}</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 calc(-1 * var(--page-pad-x, 12px))", padding: "0 var(--page-pad-x, 12px) 2px" }}>
              {recent.slice(0, 8).map((q) => (
                <button className="pressable" key={q.key} onClick={() => relogRecent(q)} style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "8px 16px 8px 12px", cursor: "pointer", color: C("chalk") }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, border: "1.4px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}><IPlus size={12} color="var(--lime-text)" strokeWidth={2.4} /></span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.caption, whiteSpace: "nowrap" }}>{q.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), whiteSpace: "nowrap" }}>{Math.round(q.kcal)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <CDivider label={t("w.recovery.nutrition.logManuallyFree")} tier={t("w.account.settings.free")} />
        {/* Quadrant — kcal + protein + carbs + fat, one unified entry. Each macro
            wears its own colour; calories stay neutral chalk. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          {([
            { k: "kcal", label: t("w.recovery.nutrition.tabCalories"), unit: "kcal", color: "var(--lime-text)" },
            { k: "protein", label: t("w.recovery.nutrition.protein"), unit: "g", color: "var(--blue-text)" },
            { k: "carbs", label: t("w.recovery.nutrition.carbs"), unit: "g", color: "var(--amber-text)" },
            { k: "fat", label: t("w.recovery.nutrition.fat"), unit: "g", color: "var(--violet-text)" },
          ] as const).map((tile) => {
            const raw = f[tile.k];
            return (
              <div key={tile.k} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px 16px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: tile.color }}>{tile.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                  <input value={raw} onChange={(e) => setF((s) => ({ ...s, [tile.k]: e.target.value }))} inputMode="numeric" placeholder="0" aria-label={tile.label} style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 28, letterSpacing: "-.03em", padding: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), flex: "none" }}>{tile.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
        {(() => {
          const macroKcal = Math.round((parseFloat(f.protein) || 0) * 4 + (parseFloat(f.carbs) || 0) * 4 + (parseFloat(f.fat) || 0) * 9);
          return macroKcal > 0 ? <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "center", marginTop: 12 }}>{t("w.recovery.nutrition.macrosApprox")} {macroKcal} kcal</div> : null;
        })()}
        {/* Add meal + Scan label — side-by-side rounded pills (Scan is AI vision, Full only → upgrade) */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, marginTop: 16 }}>
          <button className="pressable" onClick={add} disabled={saving} style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "16px 12px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}><AuroraIcon name="add" size={15} color="var(--on-accent)" />{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</button>
          <button className="pressable" onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: `1px solid color-mix(in srgb, var(--premium-accent) 45%, ${C("line")})`, borderRadius: 999, padding: "16px 12px", cursor: scanning ? "default" : "pointer", color: C("chalk"), fontWeight: 700, fontSize: fs.caption, fontFamily: "var(--font-mono)", opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color="var(--premium-accent-text)" />
            {scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}
            {!full && <span style={{ color: "var(--premium-accent-text)", fontSize: 11 }}>✦</span>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ""; }} />
        {mealMsg && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{mealMsg}</div>}
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 10 }}>{error}</div>}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <button className="pressable" key={p.id} onClick={() => logPreset(p)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C("ink2"), border: `1px solid ${full ? C("line") : `color-mix(in srgb, var(--premium-accent) 28%, ${C("line")})`}`, borderRadius: 16, padding: "12px 16px", cursor: "pointer", color: C("chalk") }}>
              <Glyph name={presetGlyph(p.id)} size={20} color={full ? C("ash") : "var(--premium-accent-text)"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: fs.body }}>{t(p.labelKey).split(/ [·–] /)[0]}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", color: C("ash"), marginTop: 2 }}>{p.kcal} kcal</div>
              </div>
              {!full && <AuroraIcon name="lock" size={13} color="var(--premium-accent-text)" />}
            </button>
          ))}
        </div>

        {onNavigate && (
          <button className="pressable" onClick={() => onNavigate("nutrition")} style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px auto 0", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.fullTracker")} <Glyph name="chevron" size={13} color={C("ash")} /></button>
        )}
      </div>
    );
  }

  // Manage custom parts of the day (Full) — shared by the hub + the picker's
  // chooser so "Add a part" works from either place.
  const renderPartSheet = () => (
    <Sheet open={partSheet} onClose={() => { setPartSheet(false); setNewPart(""); }} title={t("w.recovery.nutrition.addPart")} sub={t("w.recovery.nutrition.addPartSub")}>
      <div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newPart} onChange={(e) => setNewPart(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPart(); }} maxLength={32} placeholder={t("w.recovery.nutrition.partNamePh")} aria-label={t("w.recovery.nutrition.addPart")} style={{ ...numField, flex: 1, textAlign: "left" }} />
          <button className="pressable" onClick={addPart} disabled={!newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 16, padding: "0 16px", cursor: "pointer", opacity: !newPart.trim() || customParts.length >= MAX_CUSTOM_MEAL_PARTS ? 0.5 : 1 }}>{t("w.recovery.nutrition.addPartCta")}</button>
        </div>
        {customParts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {customParts.map((p) => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderTop: `1px solid ${C("line")}` }}>
                <Glyph name="bowl" size={18} color={C("ash")} />
                <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, color: C("chalk") }}>{p.label}</span>
                <button className="pressable" onClick={() => removePart(p.key)} aria-label={t("w.recovery.nutrition.removePart")} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C("ash") }}><ITrash size={18} color={C("ash")} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 12 }}>{customParts.length}/{MAX_CUSTOM_MEAL_PARTS}</div>
      </div>
    </Sheet>
  );

  // The portion editor — one sheet reused by the hub, the picker and the saved
  // library. Extracted so the "add" full screen can open it too.
  const renderPortionSheet = () => (
    <Sheet open={!!portion} onClose={() => setPortion(null)} title={portion?.name} sub={portion?.subtitle}>
      {portion && (() => {
        const q = qty > 0 ? qty : 1;
        const s = (v: number) => Math.round(v * q);
        const stepBtn = { width: 44, height: 44, borderRadius: 12, border: `1px solid color-mix(in srgb, var(--color-lime) 42%, ${C("line")})`, background: "transparent", color: "var(--lime-text)", fontSize: 22, fontWeight: 700, lineHeight: 1, cursor: "pointer", flex: "none" } as const;
        return (
          <div>
            {portion.verified && (() => {
              const src = verifiedSource(portion.verified.sourceId);
              return (
                <div style={{ background: "color-mix(in srgb, var(--color-lime) 8%, transparent)", border: `1px solid color-mix(in srgb, var(--color-lime) 30%, ${C("line")})`, borderRadius: 16, padding: "12px 16px", marginTop: 12 }}>
                  {/* WHO PUBLISHED THE NUMBERS. The operator's mark (or, until we
                      hold artwork, their name set in OUR type — visibly ours, so
                      it can never pass as an approximation of their logo). It
                      sits under a "published by" label and above the trademark
                      line: this is attribution, not a partnership badge. */}
                  <button className="pressable"
                    onClick={() => { const id = portion.verifiedId; setPortion(null); if (id) openFoodPage(id, view); else if (src) openSourcePage(src.id, view); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    {src ? <MarkPlate C={C} src={src} height={24} /> : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.publishedBy")}</div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk"), marginTop: 2 }}>{portion.verified.sourceName}</div>
                    </div>
                    <IChevRight size={16} color={C("ash")} />
                  </button>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid color-mix(in srgb, var(--color-lime) 22%, ${C("line")})` }}>
                    <VerifiedMark size={14} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk") }}>{t("w.recovery.nutrition.verified")}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3, lineHeight: 1.5 }}>
                        {t("w.recovery.nutrition.verifiedSub").replace("{source}", portion.verified.sourceName).replace("{date}", portion.verified.verifiedOn)}
                      </div>
                    </div>
                  </div>
                  {src?.trademark && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8, lineHeight: 1.5, opacity: .85 }}>{src.trademark}</div>
                  )}
                </div>
              );
            })()}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{t("w.recovery.nutrition.perLabel")} {portion.serving}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", marginTop: 16 }}>
              <button className="pressable" onClick={() => setQty((x) => Math.max(0.5, Math.round((x - 0.5) * 2) / 2))} aria-label={t("w.recovery.nutrition.decrease")} style={stepBtn}>–</button>
              <div style={{ textAlign: "center" }}>
                <input value={String(qty)} onChange={(e) => { const n = parseFloat(e.target.value); setQty(Number.isFinite(n) && n >= 0 ? n : 0); }} inputMode="decimal" aria-label={t("w.recovery.nutrition.quantity")} style={{ width: 96, textAlign: "center", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 30, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.servings")}</div>
              </div>
              <button className="pressable" onClick={() => setQty((x) => Math.min(50, Math.round((x + 0.5) * 2) / 2))} aria-label={t("w.recovery.nutrition.increase")} style={stepBtn}>+</button>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 20 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 48, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", color: C("chalk") }}>{s(portion.kcal)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>kcal</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {([["w.recovery.nutrition.protein", "var(--blue-text)", portion.protein], ["w.recovery.nutrition.carbs", "var(--amber-text)", portion.carbs], ["w.recovery.nutrition.fat", "var(--violet-text)", portion.fat]] as const).map(([lab, col, base]) => (
                <div key={lab} style={{ flex: 1, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: col }}>{t(lab)}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{s(base)}<span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}> g</span></div>
                </div>
              ))}
            </div>
            {/* The label panel — saturates, sugars, fibre, salt and the kJ figure
                the four macro tiles above can't carry. Scaled by the same
                quantity, and per-100 g alongside when the serving weight is
                known (the only fair way to compare two different servings). */}
            <FactsPanel
              C={C}
              scale={q}
              facts={{ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }}
              per100={per100g({ kcal: portion.kcal, protein: portion.protein, carbs: portion.carbs, fat: portion.fat, satFat: portion.satFat, sugar: portion.sugar, fiber: portion.fiber, salt: portion.salt }, portion.servingGrams)}
            />
            {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 10 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: portion.offFood ? "1fr 1fr" : "1fr", gap: 10, marginTop: 16 }}>
              {portion.offFood && <button className="pressable" onClick={() => { const ff = portion.offFood; setPortion(null); if (ff) saveFood(ff); }} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.saveToFoods")}</button>}
              <button className="pressable" onClick={commitPortion} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.logToMeal").replace("{meal}", t(`w.recovery.nutrition.meal.${mealType}`))}</button>
            </div>
          </div>
        );
      })()}
    </Sheet>
  );

  // Quick Log — the fast kcal + macro entry, opened from the picker. Calories
  // fill in from 4·4·9 when left blank (the `add` handler already does this).
  const renderQuickLog = () => (
    <Sheet open={quickLog} onClose={() => setQuickLog(false)} title={t("w.recovery.nutrition.quickLog")} sub={t("w.recovery.nutrition.quickLogSub")}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([
            { k: "kcal", label: t("w.recovery.nutrition.calorie"), color: "var(--lime-text)", unit: "kcal" },
            { k: "protein", label: t("w.recovery.nutrition.protein"), color: "var(--blue-text)", unit: "g" },
            { k: "carbs", label: t("w.recovery.nutrition.carbs"), color: "var(--amber-text)", unit: "g" },
            { k: "fat", label: t("w.recovery.nutrition.fat"), color: "var(--violet-text)", unit: "g" },
          ] as const).map((tile) => (
            <div key={tile.k} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: tile.color }}>{tile.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                <input value={f[tile.k]} onChange={(e) => setF((s) => ({ ...s, [tile.k]: e.target.value }))} inputMode="numeric" placeholder="0" aria-label={tile.label} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 27, letterSpacing: "-.03em", padding: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), flex: "none" }}>{tile.unit}</span>
              </div>
            </div>
          ))}
        </div>
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <button className="pressable" onClick={async () => { if (await add()) setQuickLog(false); }} disabled={saving} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body }}><IPlus size={16} color="var(--on-accent)" strokeWidth={2.4} />{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</button>
          <button className="pressable" onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: `1px solid color-mix(in srgb, var(--premium-accent) 45%, ${C("line")})`, borderRadius: 999, padding: 16, cursor: "pointer", color: "var(--premium-accent-text)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption }}>
            <Glyph name="scan" size={16} color="var(--premium-accent-text)" />{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}{!full && <span style={{ fontSize: 11 }}>✦</span>}
          </button>
        </div>
      </div>
    </Sheet>
  );

  // A full-screen chrome for the redesigned modal screens (Add / Create / Cook)
  // — an X (or back) at the left, a centred title, an optional right slot.
  const screenHead = (title: ReactNode, onBack: () => void, opts?: { icon?: "x" | "back"; right?: ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
      <button className="pressable" onClick={onBack} aria-label={t("w.recovery.nutrition.back")} style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {opts?.icon === "back" ? <IChevRight size={22} color={C("chalk")} strokeWidth={2.2} style={{ transform: "scaleX(-1)" } as React.CSSProperties} /> : <IClose size={22} color={C("chalk")} />}
      </button>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, letterSpacing: "-.01em", textAlign: "center", flex: 1 }}>{title}</div>
      <div style={{ width: 44, display: "grid", placeItems: "center", flexShrink: 0 }}>{opts?.right}</div>
    </div>
  );
  // The shared registry, not a local array — the old five lived on web ONLY,
  // so mobile never offered them at all. A mass/volume symbol is the same
  // token in all three languages; only the COUNT words are translated.
  const unitLabel = (id: string) => {
    const u = unitById(id)!;
    return u.kind === "count" ? t(`w.recovery.nutrition.unitOpt.${id}`) : u.symbol;
  };

  // ============ ADD TO MEAL — the food picker (redesigned) ============
  if (view === "add") {
    const foods: QuickFood[] =
      foodTab === "recent" ? recent
      : foodTab === "favorites" ? favorites
      : products.map((p) => ({ key: `p:${p.id}`, name: p.name, subname: p.subname, serving: p.servingLabel, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat }));
    const q = foodQuery.trim();
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(
          <button className="pressable" onClick={() => setMealPicker(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: C("chalk"), fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19 }}>
            {partLabel(mealType)}<IChevDown size={16} color={C("chalk")} />
          </button>,
          () => setView("home"),
        )}

        {/* Meal chooser — the four built-in parts + any custom parts (Full). */}
        <Sheet open={mealPicker} onClose={() => setMealPicker(false)} title={t("w.recovery.nutrition.chooseMeal")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {partList.map((p) => (
              <button className="pressable" key={p.key} onClick={() => { setMealType(p.key); setMealPicker(false); }} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C("ink"), border: `1px solid ${mealType === p.key ? C("lime") : C("line")}`, borderRadius: 16, padding: 16, cursor: "pointer", color: C("chalk") }}>
                <Glyph name={mealGlyph(p.key)} size={20} color={mealType === p.key ? "var(--lime-text)" : C("ash")} />
                <span style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: fs.bodyLg }}>{p.label}</span>
                {mealType === p.key && <AuroraIcon name="check" size={16} color="var(--lime-text)" />}
              </button>
            ))}
            {full && (
              <button className="pressable" onClick={() => { setMealPicker(false); setPartSheet(true); }} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "transparent", border: `1px dashed ${C("line")}`, borderRadius: 16, padding: 16, cursor: "pointer", color: C("ash") }}>
                <IPlus size={18} color={C("ash")} strokeWidth={2.2} />
                <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.bodyLg }}>{t("w.recovery.nutrition.addPart")}</span>
              </button>
            )}
          </div>
        </Sheet>

        {/* QUICK ADD — above the database search, because it answers from foods
            already saved and answers instantly. The search below it is the
            fallback for a food this athlete has never logged. */}
        <div style={{ marginBottom: 16 }}>
          <QuickAdd
            candidates={quickAddCandidates}
            onLog={logQuickAdd}
            onPortion={portionForQuickAdd}
            entryName={t("w.recovery.nutrition.quickEntry")}
          />
        </div>

        {/* Search — text or barcode */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
          <AuroraIcon name="search" size={18} color={C("ash")} />
          <input value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder={t("w.recovery.nutrition.searchPh")} aria-label={t("w.recovery.nutrition.searchPh")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.subtitle }} />
          {q ? <button className="pressable" onClick={() => setFoodQuery("")} aria-label={t("w.recovery.nutrition.clear")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}><IClose size={18} color={C("ash")} /></button> : <IBarcode size={20} color={C("ash")} />}
        </div>

        {/* Quick Log + Create Food */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <button className="pressable" onClick={() => setQuickLog(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "16px 10px", color: C("chalk"), cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.bodyLg }}>
            <IBolt size={18} color={C("chalk")} />{t("w.recovery.nutrition.quickLog")}
          </button>
          <button className="pressable" onClick={() => openCreate("product")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "16px 10px", color: C("chalk"), cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.bodyLg }}>
            <IPlusBox size={18} color={C("chalk")} />{t("w.recovery.nutrition.createFood")}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 4, gap: 4, marginTop: 16 }}>
          {(["recent", "favorites", "meals", "personal"] as const).map((tab) => (
            <button className="pressable" key={tab} onClick={() => setFoodTab(tab)} style={{ flex: 1, border: "none", borderRadius: 12, padding: "10px 8px", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: foodTab === tab ? 700 : 600, fontSize: fs.bodyLg, background: foodTab === tab ? C("lime") : "transparent", color: foodTab === tab ? "var(--on-accent)" : C("ash") }}>
              {t(`w.recovery.nutrition.tab.${tab}`)}
            </button>
          ))}
        </div>

        {/* Search results override the tab list while typing */}
        {q.length >= 2 ? (
          <div style={{ marginTop: 8 }}>
            {searching ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px" }}>{t("w.recovery.nutrition.searching")}</div>
            ) : foodResults.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px", lineHeight: 1.5 }}>{t("w.recovery.nutrition.foodNoResults")}</div>
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
          </div>
        ) : foodTab === "meals" ? (
          /* Full saved MEALS — log one to the current part of the day, or swipe
             to delete. The counterpart to the Products (personal) tab. */
          <div style={{ marginTop: 8 }}>
            {meals.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px", lineHeight: 1.6 }}>{t("w.recovery.nutrition.mealsEmptyPicker")}</div>
            ) : meals.map((m) => (
              <FoodRow
                key={m.id} C={C}
                name={m.name}
                subname={m.subname}
                meta={`${Math.round(m.kcal)} kcal  –  ${Math.round(m.protein)}P ${Math.round(m.carbs)}C ${Math.round(m.fat)}F`}
                onAdd={() => logMeal(m)}
                onDelete={() => deleteMeal(m.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {foods.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px", lineHeight: 1.6 }}>{t(foodTab === "personal" ? "w.recovery.nutrition.personalEmpty" : foodTab === "favorites" ? "w.recovery.nutrition.favoritesEmpty" : "w.recovery.nutrition.recentEmptyPicker")}</div>
            ) : foods.map((food) => {
              const prodId = food.key.startsWith("p:") ? food.key.slice(2) : null;
              return (
                <FoodRow
                  key={food.key} C={C}
                  name={food.name}
                  subname={food.subname}
                  meta={`${Math.round(food.kcal)} kcal  –  ${food.serving || t("w.recovery.nutrition.serving")}`}
                  onAdd={() => prodId ? logProduct(products.find((p) => p.id === prodId)!) : logQuickFood(food)}
                  starred={isFavorite(food.key)}
                  onStar={() => toggleFavorite(food)}
                  onDelete={prodId ? () => deleteProduct(prodId) : undefined}
                />
              );
            })}
          </div>
        )}

        {renderPortionSheet()}
        {renderQuickLog()}
        {renderPartSheet()}
      </div>
    );
  }

  // ============ CREATE (blend: title plate + macro hero) ============
  // One form for a PRODUCT or a MEAL. No nested boxes: Name + Subname on a title
  // plate, calories as the hero number, P/C/F as three light tiles, serving on
  // one quiet line (products only).
  if (view === "create") {
    const isMeal = createMode === "meal";
    const setCF = (patch: Partial<typeof createForm>) => setCreateForm((s) => ({ ...s, ...patch }));
    // When a meal is composed from products, the macros are DERIVED from the
    // summed components (read-only); otherwise they're typed in.
    const fromComps = isMeal && mealComps.length > 0;
    const tile = (label: string, colorVar: string, value: string, onChange: (v: string) => void, fixed?: number) => (
      <div style={{ flex: 1, minWidth: 0, background: C("ink2"), borderRadius: 16, padding: "16px 12px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: colorVar }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
          {fixed != null
            ? <span style={{ width: "100%", minWidth: 0, color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{fixed}</span>
            : <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" placeholder="0" aria-label={label} style={{ width: "100%", minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", padding: 0 }} />}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), flex: "none" }}>g</span>
        </div>
      </div>
    );
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(isMeal ? t("w.recovery.nutrition.createMeal") : t("w.recovery.nutrition.createFood"), () => setView("add"), {
          right: (
            <button className="pressable" onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} aria-label={t("w.recovery.nutrition.scanLabel")} style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--premium-accent-text)" }}>
              <Glyph name="scan" size={19} color="var(--premium-accent-text)" />
            </button>
          ),
        })}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanIntoCreate(file); e.target.value = ""; }} />

        {/* Title plate — Name + the personal Subname, one surface. */}
        <div style={{ background: "linear-gradient(158deg, color-mix(in srgb, var(--color-lime) 6%, var(--color-ink2)), var(--color-ink2) 72%)", border: `1px solid ${C("line")}`, borderRadius: 28, padding: CARD_PAD }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>{t("w.recovery.nutrition.foodName")}</div>
          <input value={createForm.name} onChange={(e) => setCF({ name: e.target.value })} placeholder={t("w.recovery.nutrition.foodNamePh")} aria-label={t("w.recovery.nutrition.foodName")} style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", padding: 0 }} />
          <div style={{ height: 1, background: C("line"), margin: "16px 0" }} />
          <input value={createForm.subname} onChange={(e) => setCF({ subname: e.target.value })} placeholder={t("w.recovery.nutrition.subnamePh")} aria-label={t("w.recovery.nutrition.subname")} style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 16, padding: 0 }} />
        </div>

        {/* Macro hero — calories as the big number, P/C/F as three tiles. When
            the meal is built from products these show the summed total. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {fromComps
            ? <span style={{ width: 172, textAlign: "center", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 60, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{compTotals.kcal}</span>
            : <input value={createForm.kcal} onChange={(e) => setCF({ kcal: e.target.value })} inputMode="numeric" placeholder="0" aria-label={t("w.recovery.nutrition.calorie")} style={{ width: 172, textAlign: "center", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 60, letterSpacing: "-.03em", padding: 0 }} />}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>kcal</span>
        </div>
        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.recovery.nutrition.calorie")}</div>
        {!fromComps && (() => { const mk = macroKcalOf(createForm.protein, createForm.carbs, createForm.fat); return mk > 0 && !createForm.kcal.trim() ? <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), textAlign: "center", marginTop: 8 }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</div> : null; })()}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {tile(t("w.recovery.nutrition.protein"), "var(--blue-text)", createForm.protein, (v) => setCF({ protein: v }), fromComps ? compTotals.protein : undefined)}
          {tile(t("w.recovery.nutrition.carbs"), "var(--amber-text)", createForm.carbs, (v) => setCF({ carbs: v }), fromComps ? compTotals.carbs : undefined)}
          {tile(t("w.recovery.nutrition.fat"), "var(--violet-text)", createForm.fat, (v) => setCF({ fat: v }), fromComps ? compTotals.fat : undefined)}
        </div>

        {/* The label panel — optional, folded away. Anything left blank stays
            NOT STATED rather than becoming a zero the diary would believe. */}
        <button className="pressable"
          onClick={() => setShowPanelFields((x) => !x)}
          aria-expanded={showPanelFields}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 16, background: "transparent", border: "none", padding: "6px 2px", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.caption }}
        >
          <span>{t("w.recovery.nutrition.facts.moreDetail")}</span>
          <span style={{ transform: showPanelFields ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-flex" }}><IChevDown size={13} color={C("ash")} /></span>
        </button>
        {showPanelFields && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
            {([["satFat", "w.recovery.nutrition.facts.satFat"], ["sugar", "w.recovery.nutrition.facts.sugar"], ["fiber", "w.recovery.nutrition.facts.fiber"], ["salt", "w.recovery.nutrition.facts.salt"]] as const).map(([key, lab]) => (
              <label key={key} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t(lab)}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <input
                    value={createForm[key]}
                    onChange={(e) => setCF({ [key]: e.target.value } as Partial<typeof createForm>)}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={t(lab)}
                    style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, padding: "3px 0 0" }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>g</span>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Products — compose a meal from your saved products (meal only). Each
            component carries a serving count; the macros above are their sum. */}
        {isMeal && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.mealProducts")}</div>
              {mealComps.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{mealComps.length}</span>}
            </div>
            {mealComps.map((c) => (
              <div key={c.productId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C("line")}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontWeight: 600, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>{c.subname ? <span style={{ fontSize: fs.caption, color: C("ash"), fontWeight: 500 }}>{c.subname}</span> : null}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{Math.round(c.kcal * c.qty)} kcal — {Math.round(c.protein * c.qty)}P {Math.round(c.carbs * c.qty)}C {Math.round(c.fat * c.qty)}F</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C("line")}`, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                  <button className="pressable" onClick={() => setCompQty(c.productId, c.qty - 1)} aria-label={t("w.recovery.nutrition.decrease")} style={{ width: 32, height: 32, background: C("ink2"), border: "none", color: "var(--lime-text)", fontSize: 18, cursor: "pointer", display: "grid", placeItems: "center" }}>–</button>
                  <div style={{ minWidth: 26, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.body, fontVariantNumeric: "tabular-nums" }}>{c.qty}</div>
                  <button className="pressable" onClick={() => setCompQty(c.productId, c.qty + 1)} aria-label={t("w.recovery.nutrition.increase")} style={{ width: 32, height: 32, background: C("ink2"), border: "none", color: "var(--lime-text)", fontSize: 18, cursor: "pointer", display: "grid", placeItems: "center" }}>+</button>
                </div>
                <button className="pressable" onClick={() => removeMealComp(c.productId)} aria-label={t("w.recovery.nutrition.remove")} style={{ flexShrink: 0, background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 16, padding: 2 }}>×</button>
              </div>
            ))}
            <button className="pressable" onClick={() => { setCompQuery(""); setCompPicker(true); }} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
              <IPlus size={15} color="var(--lime-text)" strokeWidth={2.2} />{t("w.recovery.nutrition.addProduct")}
            </button>
          </div>
        )}

        {/* Serving — one quiet line (products only; a meal logs as one serving). */}
        {!isMeal && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24, fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>
            <span>{t("w.recovery.nutrition.per")}</span>
            <input value={createForm.serving} onChange={(e) => setCF({ serving: e.target.value })} inputMode="numeric" placeholder="1" aria-label={t("w.recovery.nutrition.servingLabel2")} style={{ width: 44, textAlign: "right", border: "none", borderBottom: `1px solid ${C("line")}`, outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: 15, padding: "0 0 3px" }} />
            <button className="pressable" onClick={() => setUnitPicker(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer", background: "transparent", color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body }}>
              {t(`w.recovery.nutrition.unitOpt.${createForm.unit}`)}<IChevDown size={13} color={C("ash")} />
            </button>
          </div>
        )}

        {libMsg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 16, textAlign: "center" }}>{libMsg}</div>}

        <button className="pressable" onClick={submitCreateFood} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, marginTop: 28, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>
          <IPlus size={18} color="var(--on-accent)" strokeWidth={2.4} />{isMeal ? t("w.recovery.nutrition.saveMeal") : t("w.recovery.nutrition.saveProduct")}
        </button>

        <Sheet open={unitPicker} onClose={() => setUnitPicker(false)} title={t("w.recovery.nutrition.unit")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SERVING_UNITS.map(({ id: u }) => (
              <button className="pressable" key={u} onClick={() => { setCF({ unit: u }); setUnitPicker(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C("ink"), border: `1px solid ${createForm.unit === u ? C("lime") : C("line")}`, borderRadius: 16, padding: 16, cursor: "pointer", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.bodyLg }}>
                {unitLabel(u)}{createForm.unit === u && <AuroraIcon name="check" size={16} color="var(--lime-text)" />}
              </button>
            ))}
          </div>
        </Sheet>

        {/* Add product — pick from the saved-products library to compose the meal. */}
        <Sheet open={compPicker} onClose={() => setCompPicker(false)} title={t("w.recovery.nutrition.addProduct")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px", marginBottom: 10 }}>
            <AuroraIcon name="search" size={17} color={C("ash")} />
            <input value={compQuery} onChange={(e) => setCompQuery(e.target.value)} placeholder={t("w.recovery.nutrition.searchProducts")} aria-label={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.bodyLg }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto", paddingBottom: 6 }}>
            {(() => {
              const q = compQuery.trim().toLowerCase();
              const list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.subname ?? "").toLowerCase().includes(q)) : products;
              if (products.length === 0) return <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px", lineHeight: 1.6 }}>{t("w.recovery.nutrition.noProductsYet")}</div>;
              if (list.length === 0) return <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "16px 2px" }}>{t("w.recovery.nutrition.foodNoResults")}</div>;
              return list.map((p) => {
                const added = mealComps.find((c) => c.productId === p.id);
                return (
                  <button className="pressable" key={p.id} onClick={() => addMealComp(p)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}>
                    <span style={{ width: 36, height: 36, borderRadius: 999, border: "1.6px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}><IPlus size={16} color="var(--lime-text)" strokeWidth={2.2} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontWeight: 600, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>{p.subname ? <span style={{ fontSize: fs.caption, color: C("ash"), fontWeight: 500 }}>{p.subname}</span> : null}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{p.servingLabel || t("w.recovery.nutrition.serving")} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</div>
                    </div>
                    {added && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>×{added.qty}</span>}
                  </button>
                );
              });
            })()}
          </div>
          <button className="pressable" onClick={() => setCompPicker(false)} style={{ width: "100%", marginTop: 10, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>{t("w.recovery.nutrition.done")}</button>
        </Sheet>
      </div>
    );
  }

  // ============ FOOD — a verified product's own page ============
  // A page, not a sheet. The sheet exists to log a food you already trust; this
  // exists to decide whether to trust it — so it leads with WHO published the
  // numbers, states them in full (both energy units, per-100 g where the serving
  // weight is known), and ends with what we did and when. Scoped to VERIFIED
  // items on purpose: a community hit has no stable id, no provenance and no
  // sibling menu, so a page for one would be an empty frame around four numbers.
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
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(src?.name ?? t("w.recovery.nutrition.verified"), () => setView(pageBack), {
          icon: "back",
          right: (
            <button className="pressable"
              onClick={async () => {
                const url = verifiedFoodUrl(f.id);
                // navigator.share where the browser has it (mobile web), the
                // clipboard otherwise. Both can be refused — a denied permission
                // is not an error worth shouting about, so it just says nothing.
                try {
                  if (typeof navigator !== "undefined" && navigator.share) await navigator.share({ title: f.name, url });
                  else { await navigator.clipboard.writeText(url); setMealMsg(t("w.recovery.nutrition.linkCopied")); }
                } catch { /* dismissed or blocked */ }
              }}
              aria-label={t("w.recovery.nutrition.shareLink")}
              title={t("w.recovery.nutrition.shareLink")}
              style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", color: C("ash"), cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <AuroraIcon name="share" size={17} color={C("ash")} />
            </button>
          ),
        })}

        {/* WHOSE FOOD THIS IS — the mark leads, under its "published by" label.
            Tapping it opens the business's own page. */}
        {src && (
          <button className="pressable"
            onClick={() => openSourcePage(src.id, "food")}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", marginTop: 6, cursor: "pointer" }}
          >
            <MarkPlate C={C} src={src} height={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.publishedBy")}</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk"), marginTop: 2 }}>{src.name}</div>
            </div>
            <IChevRight size={17} color={C("ash")} />
          </button>
        )}

        {/* ONE name. The operator's own-language name is a search alias only —
            printing it under the English name put a second name on screen for a
            food we had already named, which read as clutter, not help. */}
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 32, letterSpacing: "-.03em", lineHeight: 1.08, margin: "24px 0 0" }}>{f.name}</h2>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".08em", color: C("ash"), marginTop: 8 }}>{t("w.recovery.nutrition.perLabel")} {f.servingLabel}</div>

        {/* Energy hero — both units, because a label states both and we finally can. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 20 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 56, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{f.facts.kcal}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>kcal</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginLeft: "auto" }}>{kj(f.facts.kcal)} kJ</span>
        </div>

        {/* Macro strip — the same four-tile idiom the recipe detail uses. */}
        <div style={{ display: "flex", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: `${CARD_PAD}px 6px`, marginTop: 16 }}>
          {([["w.recovery.nutrition.protein", f.facts.protein, "var(--blue-text)"], ["w.recovery.nutrition.carbs", f.facts.carbs, "var(--amber-text)"], ["w.recovery.nutrition.fat", f.facts.fat, "var(--violet-text)"]] as const).map(([lab, val, col]) => (
            <div key={lab} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>{val}<span style={{ fontSize: 12, color: C("ash") }}>g</span></div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", marginTop: 5, color: col }}>{t(lab)}</div>
            </div>
          ))}
        </div>

        <FactsPanel C={C} facts={f.facts} per100={p100} />
        {!p100 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8, lineHeight: 1.5 }}>{t("w.recovery.nutrition.noServingWeight")}</div>
        )}

        {/* FROM THE PACK — what a shelf item declares beyond the numbers. A
            restaurant dish publishes none of this, so the whole card is absent
            rather than rendered empty. */}
        {(f.packSize || f.ingredients || f.mayContain) && (
          <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16, marginTop: 16 }}>
            {f.packSize && (
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.packSize")}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{f.packSize}</span>
              </div>
            )}
            {f.ingredients && (
              <div style={{ marginTop: f.packSize ? 16 : 0, paddingTop: f.packSize ? 12 : 0, borderTop: f.packSize ? `1px solid ${C("line")}` : "none" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.ingredients")}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: fs.body, color: C("chalk"), marginTop: 6, lineHeight: 1.55 }}>{f.ingredients}</div>
              </div>
            )}
            {f.mayContain && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.mayContain")}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: fs.body, color: C("chalk"), marginTop: 6, lineHeight: 1.55 }}>{f.mayContain}</div>
              </div>
            )}
            {/* Say out loud that this is OUR translation of someone else's pack —
                an allergen line is the last place to imply we quoted verbatim. */}
            {f.nativeName && (f.ingredients || f.mayContain) && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 12, lineHeight: 1.5, opacity: .85 }}>{t("w.recovery.nutrition.labelTranslated")}</div>
            )}
          </div>
        )}

        {/* WHAT WE DID, AND WHEN. The claim, dated, with the operator's own
            wording of where the numbers came from, then the trademark line. */}
        <div style={{ background: "color-mix(in srgb, var(--color-lime) 8%, transparent)", border: `1px solid color-mix(in srgb, var(--color-lime) 30%, ${C("line")})`, borderRadius: 16, padding: "16px 16px", marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <VerifiedMark size={15} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg, color: C("chalk") }}>{t("w.recovery.nutrition.verified")}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 4, lineHeight: 1.6 }}>
                {t("w.recovery.nutrition.verifiedSub").replace("{source}", src?.name ?? "").replace("{date}", f.verifiedOn)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8, lineHeight: 1.6 }}>{f.provenance}</div>
              {/* A stale item KEEPS its tick — the numbers were true when we
                  checked, and withdrawing the claim would be its own dishonesty.
                  It says out loud that it is due another look. */}
              {fresh.stale && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: "var(--amber-text)", marginTop: 8, lineHeight: 1.6 }}>
                  {t("w.recovery.nutrition.verifiedStale")}
                </div>
              )}
            </div>
          </div>
          {src?.trademark && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 10, lineHeight: 1.5, opacity: .85 }}>{src.trademark}</div>}
        </div>

        {/* MORE FROM THIS BUSINESS — a checked item is a way into a checked
            menu, not a dead end. */}
        {related.length > 0 && (
          <div style={{ marginTop: 24 }}>
            {/* Title only — the exit is the LAST ROW of the list, below. Same
                rule as a rail's tail card in the shape this block actually
                has: a vertical list ends in a door, not a header link. */}
            <div style={{ display: "flex", alignItems: "baseline", paddingBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.moreFrom").replace("{source}", src?.name ?? "")}</span>
            </div>
            {related.map((r) => (
              <button className="pressable" key={r.id} onClick={() => openFoodPage(r.id, "food")} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk") }}>{r.name}</span>
                    <VerifiedMark size={11} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3 }}>{r.facts.kcal} kcal  –  {r.servingLabel}</div>
                </div>
                <IChevRight size={16} color={C("ash")} />
              </button>
            ))}
            {/* THE DOOR — the list's own last row, carrying on to the whole
                menu. Same hairline and chevron as the rows above it, mono
                uppercase in ash so it reads as the way out rather than one
                more food. */}
            {src && (
              <button className="pressable" onClick={() => openSourcePage(src.id, "food")} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "14px 2px", cursor: "pointer" }}>
                <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.explore.seeAll")}</span>
                <IChevRight size={16} color={C("ash")} />
              </button>
            )}
          </div>
        )}

        {mealMsg && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 16 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{mealMsg}</div>}

        <div style={{ position: "sticky", bottom: 0, background: C("ink"), padding: "16px 0 20px", marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
          <button className="pressable" onClick={() => saveFood(hit)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "16px 20px", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>
            <IPlus size={16} color="var(--lime-text)" strokeWidth={2.2} />{t("w.recovery.nutrition.saveToFoods")}
          </button>
          <button className="pressable" onClick={() => logFood(hit)} style={{ background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>
            {t("w.recovery.nutrition.logThis")}
          </button>
        </div>
        {renderPortionSheet()}
      </div>
    );
  }

  // ============ SOURCES — every business we've checked ============
  // The source page used to be reachable ONLY by opening one of its foods,
  // which made the verified tier something you stumbled into rather than
  // something you could look at. This is the way in.
  if (view === "sources") {
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(t("w.recovery.nutrition.verifiedFoods"), () => setView("home"), { icon: "back" })}
        <p style={{ fontFamily: "var(--font-display)", fontSize: fs.bodyLg, color: C("ash"), lineHeight: 1.55, margin: "6px 0 0" }}>{t("w.recovery.nutrition.verifiedIntro")}</p>
        <div style={{ marginTop: 20 }}>
          {VERIFIED_SOURCES.map((src) => {
            const n = vfBySource(src.id).length;
            return (
              <button className="pressable" key={src.id} onClick={() => openSourcePage(src.id, "sources")} style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "16px 16px", marginBottom: 10, cursor: "pointer" }}>
                <MarkPlate C={C} src={src} height={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk") }}>{src.name}</span>
                    <VerifiedMark size={12} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 4 }}>
                    {t("w.recovery.nutrition.itemsCheckedN").replace("{n}", String(n))}
                  </div>
                </div>
                <IChevRight size={17} color={C("ash")} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ============ SOURCE — the business's own page ============
  const sourcePage = sourcePageId ? verifiedSource(sourcePageId) : null;
  if (view === "source" && sourcePage) {
    const src = sourcePage;
    const items = verifiedFoodsBySource(src.id);
    const checked = sourceCheckedOn(src.id);
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(t("w.recovery.nutrition.verifiedSourceTitle"), () => setView(pageBack === "food" ? "add" : pageBack), { icon: "back" })}

        <div style={{ marginTop: 6 }}>
          <MarkPlate C={C} src={src} height={52} full />
        </div>

        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 27, letterSpacing: "-.02em", margin: "20px 0 0" }}>{src.name}</h2>
        <p style={{ fontFamily: "var(--font-display)", fontSize: fs.bodyLg, color: C("ash"), lineHeight: 1.55, margin: "8px 0 0" }}>{src.note}</p>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {([[t("w.recovery.nutrition.itemsChecked"), String(items.length)], [t("w.recovery.nutrition.lastChecked"), checked ?? "—"]] as const).map(([lab, val]) => (
            <div key={lab} style={{ flex: 1, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{lab}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.bodyLg, color: C("chalk"), marginTop: 5, fontVariantNumeric: "tabular-nums" }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "24px 0 6px" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.checkedItems")}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{items.length}</span>
        </div>
        {items.map((f) => (
          <button className="pressable" key={f.id} onClick={() => openFoodPage(f.id, "source")} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "16px 2px", cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk") }}>{f.name}</span>
                <VerifiedMark size={12} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 4 }}>{f.facts.kcal} kcal  –  {f.servingLabel}</div>
            </div>
            <IChevRight size={17} color={C("ash")} />
          </button>
        ))}

        <div style={{ marginTop: 20, paddingBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.6, opacity: .85 }}>{src.trademark}</div>
          {/* Where the artwork came from. sourceMarkCredits() had no surface at
              all until now, which made "third-party artwork stays enumerable"
              a claim with nowhere to read it. */}
          {src.mark && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.6, opacity: .7, marginTop: 8 }}>
              {t("w.recovery.nutrition.markCredit")} {src.mark.credit}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ RECIPES — the library root ============
  // The PLANS TAB's root, not a lookalike: the same collapsing cover, the same
  // docked jump rail, the same search field and the same full-bleed shelves of
  // covers. A recipe library and a plan library are the same object — a shelf
  // of things you open and then follow — and they were arriving as two
  // unrelated screens (a chip filter over a two-column grid).
  if (view === "recipes") {
    return (
      <RecipesLibrary
        query={recipeQuery}
        setQuery={setRecipeQuery}
        openCollection={openCollection}
        openRecipe={(r) => openRecipe(r, "recipes")}
        back={() => setView("home")}
        // YOUR recipes lead the library: a shelf you can add to belongs above
        // the shelves you can only read.
        mine={
          <UserRecipeShelf
            recipes={userRecipes}
            onOpen={(r) => openRecipeEditor(r)}
            onNew={() => openRecipeEditor()}
            canAdd={canSaveRecipe(persona, userRecipes.length)}
            onUpgrade={() => onNavigate?.("upgrade")}
          />
        }
      />
    );
  }

  // ============ YOUR RECIPE — the editor, which is also the detail view ============
  // There is no separate read-only recipe page: a recipe you wrote is a document
  // you keep amending ("a bit less pasta next time"), so a read mode would be a
  // navigation layer whose only job is to hide a pencil.
  if (view === "myRecipe" && editRecipe) {
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        {screenHead(editRecipe.id ? t("w.recovery.nutrition.editRecipe") : t("w.recovery.nutrition.newRecipe"), () => setView("recipes"), { icon: "back" })}
        <UserRecipeEditor
          recipe={editRecipe}
          products={recipeSources}
          onChange={setEditRecipe}
          onSave={saveUserRecipe}
          onDelete={editRecipe.id ? deleteUserRecipe : undefined}
          onLog={editRecipe.id ? logUserRecipe : undefined}
          saving={recipeSaving}
          message={userRecipeMsg}
        />
      </div>
    );
  }

  // ============ RECIPES — one collection ("Breakfast") ============
  if (view === "collection" && collection) {
    return <RecipeCollectionScreen collection={collection} openRecipe={(r) => openRecipe(r, "collection")} back={() => setView("recipes")} />;
  }

  // ============ RECIPE — detail ============
  // Opens with the PLAN DETAIL'S COVER, not a lookalike: the same cover-hero
  // scaffold, driven by core's recipeCoverView. A recipe and a plan are both
  // "a thing you commit to and then follow", and they were arriving through two
  // unrelated headers.
  if (view === "recipe" && recipe) {
    return <RecipeDetail
      recipe={recipe}
      serves={recipeServes}
      setServes={setRecipeServes}
      msg={recipeMsg}
      backLabel={recipeFrom === "collection" && collection ? collectionTitle(collection, t) : t("w.recovery.nutrition.recipes")}
      onBack={() => setView(recipeFrom === "collection" && collection ? "collection" : "recipes")}
      onSaveMeal={() => saveRecipeAsMeal(recipe)}
      onCook={() => { setCookStep(0); setView("cook"); }}
    />;
  }

  // ============ COOK — step-through ============
  // The recipe's PLATE, one compression below the detail cover: same wash, same
  // full-colour dish, same chip + title, with the step counter in the slot the
  // cover gives to time and the method's steps as ticks on its bottom edge. Not
  // the full collapsing cover — this screen doesn't scroll and ends in a sticky
  // action bar, so a collapsing hero would promise a collapse that never comes.
  if (view === "cook" && recipe) {
    const cook = recipeCookView(recipe, cookStep, {
      meal: (m) => t(`w.recovery.nutrition.meal.${m}`),
      stepXofY: (x, y) => t("w.recovery.nutrition.stepXofY").replace("{x}", String(x)).replace("{y}", String(y)),
    });
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk"), display: "flex", flexDirection: "column", minHeight: "70vh" }}>
        <CookPlate cook={cook} onBack={() => setView("recipe")} />
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 23, lineHeight: 1.35, letterSpacing: "-.01em", margin: "20px 0 0" }}>{cook.step.text}</p>
        {cook.step.timerSec != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: fs.body, color: "var(--amber-text)", alignSelf: "flex-start" }}>
            <IClock size={15} color="var(--amber-text)" />{Math.floor(cook.step.timerSec / 60)}:{String(cook.step.timerSec % 60).padStart(2, "0")} {t("w.recovery.nutrition.timer")}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: cook.index > 0 ? "auto 1fr" : "1fr", gap: 12, marginTop: 24, paddingBottom: 12 }}>
          {cook.index > 0 && <button className="pressable" onClick={() => setCookStep((s) => s - 1)} style={{ background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "16px 24px", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle }}>{t("w.recovery.nutrition.stepBack")}</button>}
          <button className="pressable" onClick={() => cook.last ? setView("recipe") : setCookStep((s) => s + 1)} style={{ background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle }}>{cook.last ? t("w.recovery.nutrition.finishCooking") : t("w.recovery.nutrition.nextStep")}</button>
        </div>
      </div>
    );
  }

  // Cold start (no maintenance estimate yet) → onboarding is its OWN focused
  // flow, not stacked above the tracker. A weigh-in in the wizard personalizes
  // the estimate and drops the user into the full screen below.
  if (!personalized && !onboarded && !hasNutritionData) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", margin: 0 }}>{t("w.recovery.nutrition.title")}</h1>
        <OnboardingGoal
          goal={goal}
          setGoal={chooseGoal}
          onUpgrade={() => { finishOnboarding(); onNavigate?.("upgrade"); }}
          onWeighIn={(kg) => { logWeighIn(kg); finishOnboarding(); }}
          onContinueFree={finishOnboarding}
          currentWeightKg={bodyMassKg}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* Hub masthead (home), or a sub-screen back-header. */}
      {view === "home" ? (
        <div>
          {greeting && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 3 }}>{greeting}</div>}
          <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", margin: 0 }}>{t("w.recovery.nutrition.title")}</h1>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="pressable" onClick={() => setView("home")} aria-label={t("w.recovery.nutrition.back")} style={{ width: 44, height: 44, borderRadius: 16, border: `1px solid ${C("line")}`, background: "var(--back-surface)", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><AuroraIcon name="back" size={18} color={C("chalk")} /></button>
          <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", margin: 0 }}>{view === "log" ? t("w.recovery.nutrition.logMealCta") : view === "insights" ? t("w.recovery.nutrition.menuInsights") : view === "diary" ? t("w.recovery.nutrition.menuDiary") : view === "body" ? t("w.recovery.nutrition.menuBody") : view === "meals" ? t("w.recovery.nutrition.yourMeals") : t("w.recovery.nutrition.yourProducts")}</h1>
        </div>
      )}

      {view === "home" && (
      loadErr && signals.length === 0 ? (
        /* INTAKE FAILED TO LOAD — with no cached signals the day summary would
           read "0 eaten / full target remaining" as a fresh day, masking an
           offline / 500. Show the honest retry card instead (parity with mobile). */
        <FetchError onRetry={() => load()} style={{ marginTop: 16 }} />
      ) : (
      <>
      {/* Goal — a card you OPEN (never a live toggle): switching the goal
          recomputes every target, so it must take a deliberate tap. */}
      <button onClick={() => setGoalPicker(true)} aria-label={`${t("w.recovery.nutrition.goalLabel")}: ${goalName(goal)}`} className="pressable" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "16px 16px", marginTop: 16, cursor: "pointer", color: C("chalk") }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Glyph name="target" size={20} color={C("ash")} />
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.goalLabel")}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.bodyLg, marginTop: 2 }}>{goalName(goal)}</div>
          </div>
        </div>
        <Glyph name="chevron" size={16} color={C("ash")} />
      </button>

      {/* TARGETS — a door row under the goal, because the goal is what DERIVES
          the targets and setting them by hand is the exception to that. It is
          not a card: it carries no figure of its own, it opens a sheet. */}
      <button
        className="pressable"
        onClick={() => setTargetSheet(true)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "14px 2px 0", marginTop: 14, cursor: "pointer", color: C("chalk") }}
      >
        <span style={{ width: 32, height: 32, borderRadius: 999, border: `1.4px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AuroraIcon name="edit" size={14} color={C("ash")} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>{t("w.recovery.nutrition.tg.title")}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: hasOverride(targetOverride) ? "var(--amber-text)" : C("ash"), marginTop: 3 }}>
            {hasOverride(targetOverride) ? t("w.recovery.nutrition.tg.manual") : t("w.recovery.nutrition.tg.adaptive")}
          </span>
        </span>
      </button>
      {/* The four numbers can disagree once they are hand-set. Say so once. */}
      {hasOverride(targetOverride) && mismatch.material && (
        <TargetMismatchLine macroKcal={mismatch.macroKcal} deltaKcal={mismatch.deltaKcal} />
      )}

      <TargetSheet
        open={targetSheet}
        onClose={() => setTargetSheet(false)}
        adaptive={adaptiveBase}
        override={targetOverride}
        onSave={saveTargets}
      />

      <Sheet open={goalPicker} onClose={() => setGoalPicker(false)} title={t("w.recovery.nutrition.goalSheetTitle")} sub={t("w.recovery.nutrition.goalSheetSub")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {GOALS.map((g) => {
            const on = goal === g.id;
            return (
              <button className="pressable" key={g.id} onClick={() => { chooseGoal(g.id); setGoalPicker(false); }} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C("ink"), border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 16, padding: 16, cursor: "pointer", color: C("chalk") }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.bodyLg }}>{t(g.label)}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3 }}>{goalSub(g.id)}</div>
                </div>
                <span style={{ width: 22, height: 22, borderRadius: 999, border: `2px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent", display: "grid", placeItems: "center", flexShrink: 0 }}>{on && <AuroraIcon name="check" size={12} color="var(--on-accent)" />}</span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <CopyDaySheet
        open={copySheet}
        onClose={() => setCopySheet(false)}
        logs={logs as CopyableEntry[]}
        to={diaryDay}
        toLabel={diaryDay === localTodayKey() ? t("w.recovery.nutrition.todaysMeals") : diaryDayLabel}
        partLabel={partLabel}
        onCopy={runCopy}
        busy={copyBusy}
        message={copyMsg}
      />

      {/* Portion & quantity — serving × quantity stepper, macros scale live. */}
      {renderPortionSheet()}

      {renderPartSheet()}

      {coachDiet?.diet && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} ({t("w.recovery.nutrition.readOnly")})
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, "kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <div key={label}>
                  <div style={{ fontWeight: 900, fontSize: fs.heading, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{val}{unit === "g" ? "g" : ""}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash"), marginTop: 2 }}>{t(label)}{unit === "kcal" ? " (kcal)" : ""}</div>
                </div>
              ) : null),
            )}
          </div>
          {coachDiet.diet.note && <p style={{ fontSize: fs.body, lineHeight: 1.5, marginTop: 12, color: C("chalk") }}>{coachDiet.diet.note}</p>}
        </div>
      )}

          {/* CALORIE RING + MACROS — the hero, ONE card: the ring on top, the
              three macro hairlines beneath. The whole card presses into the
              Diary (same destination as the "Diary →" link). The HUD still
              anchors on the two inner sections — getBoundingClientRect is
              viewport-space, so the nesting changes nothing for it. */}
          <button onClick={() => setView("diary")} aria-label={t("w.recovery.nutrition.menuDiary")} className="pressable" style={{ ...card, display: "block", width: "100%", marginTop: 16, padding: "28px 20px 24px", textAlign: "center", cursor: "pointer", color: C("chalk") }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--lime-text)" }}>{t("w.recovery.nutrition.caloriesLeft")}</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <Ring value={targets.kcal > 0 ? (today.kcal / targets.kcal) * 100 : 0} color={kcalOver ? C("red") : C("lime")} size={200} center={
                  <span style={{ display: "block", textAlign: "center" }}>
                    <span style={{ display: "block", fontWeight: 900, fontSize: 46, letterSpacing: "-.03em", lineHeight: 0.95, fontVariantNumeric: "tabular-nums", color: kcalOver ? "var(--red-text)" : C("chalk") }}>{Math.round((targets.kcal - today.kcal) * kcalCountF)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{Math.round(today.kcal)} / {targets.kcal}</span>
                  </span>
                } />
              </div>
              {maint.kcal != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), marginTop: 16 }}>
                  {t("w.recovery.nutrition.maintenance")} {maint.kcal} kcal{maint.weightChangeKg != null ? ` — ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
                </div>
              )}
              {trainingKcal > 0 && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, background: `color-mix(in srgb, var(--color-lime) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--color-lime) 28%, transparent)`, borderRadius: 999, padding: "6px 12px" }}>
                  <Glyph name="spark" size={13} color="var(--lime-text)" strokeWidth={4} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--lime-text)" }}>+{trainingKcal} {t("w.recovery.nutrition.trainingFuel")}</span>
                </div>
              )}
            </div>
            {/* Macros — hairline lines beneath the hero, same card. */}
            <div style={{ marginTop: 24, textAlign: "left" }}>
              {([["w.recovery.nutrition.protein", today.protein, targets.protein, C("blue"), "var(--blue-text)"], ["w.recovery.nutrition.carbs", today.carbs, targets.carbs, C("amber"), "var(--amber-text)"], ["w.recovery.nutrition.fat", today.fat, targets.fat, C("violet"), "var(--violet-text)"]] as const).map(([label, cur, tgt, col, colT], i) => (
                <div key={label} style={{ marginTop: i ? 16 : 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", color: colT }}>{t(label)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), fontVariantNumeric: "tabular-nums" }}>{Math.round(cur)} / {tgt} g</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: C("ink"), overflow: "hidden", marginTop: 8 }}><div style={{ width: `${Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0)}%`, height: "100%", borderRadius: 999, background: col }} /></div>
                </div>
              ))}
            </div>
          </button>

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
            onAdd={logWater}
            onUndo={undoWater}
            canUndo={waterLogs.length > 0}
            style={{ marginTop: 16 }}
          />

          {/* Today's meals — Breakfast / Lunch / Dinner / Snacks. Each opens the
              picker attributed to that meal; the kcal already logged is shown. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "24px 2px 4px" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.todaysMeals")}</div>
            <button className="pressable" onClick={() => setView("diary")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}><CtaLabel size={12}>{`${t("w.recovery.nutrition.menuDiary")} →`}</CtaLabel></button>
          </div>
          {partList.map((p) => { const kcal = mealTotals[p.key] ?? 0; return (
            <button key={p.key} onClick={() => openAdd(p.key)} className="pressable" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "16px 16px", marginTop: 10, cursor: "pointer", color: C("chalk") }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: C("ink"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0 }}><Glyph name={mealGlyph(p.key)} size={19} color={C("ash")} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle }}>{p.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: kcal > 0 ? C("ash") : "var(--lime-text)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : t("w.recovery.nutrition.addFirstFood")}</div>
              </div>
              <span style={{ width: 34, height: 34, borderRadius: 999, border: "1.6px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}><IPlus size={16} color="var(--lime-text)" strokeWidth={2.4} /></span>
            </button>
          ); })}
          {/* Full users can add their own parts of the day (e.g. Pre-workout). */}
          {full && (
            <button className="pressable" onClick={() => setPartSheet(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "transparent", border: `1px dashed ${C("line")}`, borderRadius: 16, padding: "16px 16px", marginTop: 10, cursor: "pointer", color: C("ash") }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, border: `1px dashed ${C("line")}`, display: "grid", placeItems: "center", flexShrink: 0 }}><IPlus size={18} color={C("ash")} strokeWidth={2.2} /></span>
              <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.subtitle }}>{t("w.recovery.nutrition.addPart")}</span>
            </button>
          )}

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
              screen-level rail: negative margins the width of the shell gutter
              (--page-pad-x) pull the scroll clip to the true screen edge, with
              matching internal padding so resting cards stay on the column. */}
          <RailHead title={t("w.recovery.nutrition.recipes")} />
          <div style={railScroller}>
            {/* the SAME tile the library shelves carry — a recipe reads as one
                object wherever you meet it, and the hub is where most people
                meet it first. */}
            {RECIPES.map((r) => (
              <RecipeTile key={r.id} recipe={r} width="min(52%, 196px)" snap onOpen={() => (recipesUnlocked ? openRecipe(r) : onNavigate?.("upgrade"))} />
            ))}
            {/* The rail's exit, at its end — where the thumb lands once the
                cards run out. Behind Full, so it carries the ✦ and the premium
                accent the head's link used to. */}
            <RailTail
              onOpen={() => (recipesUnlocked ? setView("recipes") : onNavigate?.("upgrade"))}
              a11y={`${t("w.explore.seeAll")} – ${t("w.recovery.nutrition.recipes")}`}
              premium={!recipesUnlocked}
              w="min(52%, 196px)" snapAlign="center"
            />
          </div>

          {/* Verified foods — the BUSINESSES, one card each. The verified tier
              was previously only reachable by stumbling into one of its foods
              through search; the rail puts the companies themselves on the
              screen. */}
          <RailHead title={t("w.recovery.nutrition.verifiedFoods")} />
          <div style={railScroller}>
            {VERIFIED_SOURCES.map((src) => {
              const n = vfBySource(src.id).length;
              return (
                /* a RAIL item, not a full-width card — it keeps the compact inset. */
                <button key={src.id} onClick={() => openSourcePage(src.id, "home")} className="pressable" style={{ flex: "0 0 min(72%, 268px)", scrollSnapAlign: "center", display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", border: `1px solid ${C("line")}`, borderRadius: 28, background: C("ink2"), cursor: "pointer", color: C("chalk"), padding: 16 }}>
                  {/* The business's own logo leads the card — this rail IS the
                      businesses, so recognising one at a glance is its whole job. */}
                  <MarkPlate C={C} src={src} height={34} full />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12, maxWidth: "100%", padding: "0 2px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.name}</span>
                    <VerifiedMark size={12} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 4, padding: "0 2px" }}>{t("w.recovery.nutrition.itemsCheckedN").replace("{n}", String(n))}</div>
                </button>
              );
            })}
            <RailTail
              onOpen={() => setView("sources")}
              a11y={`${t("w.explore.seeAll")} – ${t("w.recovery.nutrition.verifiedFoods")}`}
              w="min(72%, 268px)" snapAlign="center"
            />
          </div>
        </>
      ))}

      {view === "insights" && (
        <div>
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
          <SummaryDashboard summary={summary} window={summaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => onNavigate?.("upgrade")} full={full} />
        </div>
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
          onPhotos={() => onNavigate?.("progress")}
          onSaved={() => { load(); revalidate.recovery(); }}
          trend={weight.points.length > 0 ? (
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}>{t("w.recovery.nutrition.bodyweightTrend")}</b>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: weight.ratePerWeek <= 0 ? "var(--lime-text)" : "var(--amber-text)" }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weight.points} margin={{ left: -10, right: 8 }}>
                    <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis unit="kg" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE_HEX} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={tip} formatter={(v, n) => [`${v} kg`, n === "smoothed" ? t("w.recovery.nutrition.trend") : t("w.recovery.nutrition.raw")]} />
                    <Line type="monotone" dataKey="raw" stroke={ASH} strokeWidth={1} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="smoothed" stroke={LIME_HEX} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        />
      )}

      {/* LOG — the unified manual entry + scan + one-tap premade meals. */}
      {view === "log" && (
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
            <AuroraIcon name="add" size={20} color={C("lime")} />
            <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note }}>{t("w.recovery.nutrition.addToToday")}</b>
          </div>
          <button className="pressable" onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: scanning ? "default" : "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--premium-accent-text)", opacity: scanning ? 0.6 : 1 }}>
            <Glyph name="scan" size={16} color="var(--premium-accent-text)" />{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}{!full && <span style={{ fontSize: 11 }}>✦</span>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: space.sm, marginTop: 16, flexWrap: "wrap" }}>
          <input value={f.kcal} onChange={(e) => setF((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
          <input value={f.protein} onChange={(e) => setF((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.proteinPh")} style={numField} />
          <input value={f.carbs} onChange={(e) => setF((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.carbsPh")} style={numField} />
          <input value={f.fat} onChange={(e) => setF((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.fatPh")} style={numField} />
        </div>
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 8 }}>{error}</div>}
        <button className="pressable" onClick={add} disabled={saving} style={{ width: "100%", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.subtitle, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 16, marginTop: 16, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")}
        </button>
        {/* QUICK MEALS — one-tap premade meals as time-of-day rows. Full users log
            on tap; free users see them locked and tapping routes to upgrade. */}
        <div style={{ marginTop: 16, borderTop: `1px solid ${C("line")}`, paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.quickMeals")}</div>
            {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--premium-accent-text)" }}>✦ Full</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            {MEAL_PRESETS.map((p, i) => (
              <button className="pressable"
                key={p.id}
                onClick={() => logPreset(p)}
                aria-label={t(p.labelKey)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "12px 2px", borderTop: i ? `1px solid ${C("line")}` : "none", background: "transparent", border: "none", borderTopStyle: i ? "solid" : "none", cursor: "pointer", color: C("chalk") }}
              >
                <Glyph name={presetGlyph(p.id)} size={22} color={full ? C("ash") : "var(--premium-accent-text)"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: fs.body }}>{t(p.labelKey).split(/ [·–] /)[0]}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{p.protein}P {p.carbs}C {p.fat}F</div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{p.kcal}</span>
                {!full && <AuroraIcon name="lock" size={13} color="var(--premium-accent-text)" />}
              </button>
            ))}
          </div>
          {mealMsg && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 12 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{t("w.recovery.nutrition.mealLogged")} — {mealMsg}</div>}
        </div>
      </div>

      )}

      {/* MY MEALS — the user's own saved-meal library (build + save + one-tap
          log). Free users keep up to FREE_MEAL_LIMIT; the "Save" CTA routes to
          upgrade once a free user is at the cap. */}
      {view === "meals" && (
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note }}>{t("w.recovery.nutrition.yourMeals")}</b>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`}</span>
        </div>
        {meals.length === 0 && !showMealBuilder && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10, lineHeight: 1.5 }}>{t("w.recovery.nutrition.yourMealsEmpty")}</div>
        )}
        {meals.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {meals.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                {m.emoji ? <span style={{ fontSize: 20, width: 22, textAlign: "center" }}>{m.emoji}</span> : <Glyph name="bowl" size={22} color={C("ash")} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontWeight: 600, fontSize: fs.body }}>{m.name}</span>{m.subname ? <span style={{ fontSize: fs.caption, color: C("ash"), fontWeight: 500 }}>{m.subname}</span> : null}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{m.kcal} kcal — {m.protein}P {m.carbs}C {m.fat}F</div>
                </div>
                <button className="pressable" onClick={() => logMeal(m)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.caption, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>{t("w.recovery.nutrition.log")}</button>
                <button className="pressable" onClick={() => deleteMeal(m.id)} aria-label={t("w.recovery.nutrition.deleteMeal")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
              </div>
            ))}
          </div>
        )}
        {showMealBuilder ? (
          <div style={{ marginTop: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>{t("w.recovery.nutrition.newMeal")}</div>
            <input value={mealForm.name} onChange={(e) => setMealForm((s) => ({ ...s, name: e.target.value }))} placeholder={t("w.recovery.nutrition.mealNameHint")} aria-label={t("w.recovery.nutrition.mealName")} style={{ width: "100%", boxSizing: "border-box", background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none", fontFamily: "var(--font-display)", fontSize: fs.bodyLg }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {macroField("kcal", "var(--lime-text)", mealForm.kcal, (v) => setMealForm((s) => ({ ...s, kcal: v })), "kcal")}
              {macroField(t("w.recovery.nutrition.protein"), "var(--blue-text)", mealForm.protein, (v) => setMealForm((s) => ({ ...s, protein: v })))}
              {macroField(t("w.recovery.nutrition.carbs"), "var(--amber-text)", mealForm.carbs, (v) => setMealForm((s) => ({ ...s, carbs: v })))}
              {macroField(t("w.recovery.nutrition.fat"), "var(--violet-text)", mealForm.fat, (v) => setMealForm((s) => ({ ...s, fat: v })))}
            </div>
            {(() => { const mk = macroKcalOf(mealForm.protein, mealForm.carbs, mealForm.fat); return mk > 0 && !mealForm.kcal.trim() ? <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10, textAlign: "center" }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</div> : null; })()}
            {libMsg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: accentText("red"), marginTop: 8 }}>{libMsg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <button className="pressable" onClick={() => { setShowMealBuilder(false); setLibMsg(""); }} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.cancel")}</button>
              <button className="pressable" onClick={saveMeal} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.saveMeal")}</button>
            </div>
          </div>
        ) : canSaveAnotherMeal ? (
          <button className="pressable" onClick={() => openCreate("meal")} style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}><AuroraIcon name="add" size={15} color="var(--lime-text)" />{t("w.recovery.nutrition.createMeal")}</button>
        ) : (
          <button className="pressable" onClick={() => onNavigate?.("upgrade")} style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: `color-mix(in srgb, var(--premium-accent) 12%, transparent)`, color: "var(--premium-accent-text)", border: `1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            <span aria-hidden>✦</span>{t("w.recovery.nutrition.unlockMoreMeals")}
          </button>
        )}
      </div>

      )}

      {/* MY FOODS — search-first. The box queries Open Food Facts (free, no key)
          for any food or barcode; a hit can be logged to today or saved to the
          library. Below sits the user's own saved foods, with a manual builder
          for anything the database doesn't have. */}
      {view === "foods" && (
      <div style={{ ...card, marginTop: 16 }}>
        {/* Search — text or barcode */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
          <AuroraIcon name="search" size={18} color={C("ash")} />
          <input value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder={t("w.recovery.nutrition.foodSearchPh")} aria-label={t("w.recovery.nutrition.foodSearchPh")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body }} />
          {foodQuery ? <button className="pressable" onClick={() => setFoodQuery("")} aria-label={t("w.recovery.nutrition.clear")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button> : <Glyph name="scan" size={17} color={C("ash")} strokeWidth={4} />}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 8, letterSpacing: ".08em" }}>{t("w.recovery.nutrition.foodSearchHint")}</div>
        {foodMsg && <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}><AuroraIcon name="check" size={13} color="var(--lime-text)" />{foodMsg}</div>}

        {/* Database results */}
        {foodQuery.trim().length >= 2 && (
          <div style={{ marginTop: 16 }}>
            {searching ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "6px 0" }}>{t("w.recovery.nutrition.searching")}</div>
            ) : foodResults.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "6px 0", lineHeight: 1.5 }}>{t("w.recovery.nutrition.foodNoResults")}</div>
            ) : foodResults.map((food, i) => (
              <div key={`${food.id || food.code}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                {/* A verified row opens its page from the name, exactly as in the
                    picker — the same food must not be a dead end on one screen
                    and a doorway on another. */}
                <button className="pressable"
                  onClick={food.verified && food.id ? () => openFoodPage(food.id!, "foods") : () => logFood(food)}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{food.name}</span>
                    {food.verified && <VerifiedMark size={12} />}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{food.brand ? `${food.brand} — ` : ""}{food.serving} — {food.kcal} kcal — {food.protein}P {food.carbs}C {food.fat}F</div>
                </button>
                <button className="pressable" onClick={() => saveFood(food)} aria-label={t("w.recovery.nutrition.saveToFoods")} title={t("w.recovery.nutrition.saveToFoods")} style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C("line")}`, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}><AuroraIcon name="bookmark" size={15} color={C("ash")} /></button>
                <button className="pressable" onClick={() => logFood(food)} style={{ flex: "none", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.caption, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>{t("w.recovery.nutrition.log")}</button>
              </div>
            ))}
          </div>
        )}

        {/* Your saved foods */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 20, paddingTop: foodQuery.trim().length >= 2 ? 16 : 0, borderTop: foodQuery.trim().length >= 2 ? `1px solid ${C("line")}` : "none" }}>
          <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.note }}>{t("w.recovery.nutrition.yourProducts")}</b>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{full ? t("w.recovery.nutrition.unlimited") : `${products.length} / ${FREE_PRODUCT_LIMIT}`}</span>
        </div>
        {products.length === 0 && !showProdBuilder && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5 }}>{t("w.recovery.nutrition.yourProductsSub")}</div>
        )}
        {products.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {products.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontWeight: 600, fontSize: fs.body }}>{p.name}</span>{p.subname ? <span style={{ fontSize: fs.caption, color: C("ash"), fontWeight: 500 }}>{p.subname}</span> : null}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{p.servingLabel} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</div>
                </div>
                <button className="pressable" onClick={() => addProductToMeal(p)} aria-label={t("w.recovery.nutrition.addToMeal")} style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", border: `1px solid color-mix(in srgb, var(--color-lime) 42%, ${C("line")})`, background: "transparent", color: "var(--lime-text)", display: "grid", placeItems: "center", cursor: "pointer" }}><AuroraIcon name="add" size={14} color="var(--lime-text)" /></button>
                <button className="pressable" onClick={() => deleteProduct(p.id)} aria-label={t("w.recovery.nutrition.deleteProduct")} style={{ flex: "none", background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            ))}
          </div>
        )}
        {showProdBuilder && (
          <div style={{ marginTop: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 10 }}>{t("w.recovery.nutrition.newProduct")}</div>
            <input value={prodForm.name} onChange={(e) => setProdForm((s) => ({ ...s, name: e.target.value }))} placeholder={t("w.recovery.nutrition.productNamePh")} aria-label={t("w.recovery.nutrition.productName")} style={{ width: "100%", boxSizing: "border-box", background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none", fontFamily: "var(--font-display)", fontSize: fs.bodyLg }} />
            <input value={prodForm.serving} onChange={(e) => setProdForm((s) => ({ ...s, serving: e.target.value }))} placeholder={t("w.recovery.nutrition.servingPh")} aria-label={t("w.recovery.nutrition.servingPh")} style={{ width: "100%", boxSizing: "border-box", background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none", fontFamily: "var(--font-mono)", fontSize: fs.body, marginTop: 8 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {macroField("kcal", "var(--lime-text)", prodForm.kcal, (v) => setProdForm((s) => ({ ...s, kcal: v })), "kcal")}
              {macroField(t("w.recovery.nutrition.protein"), "var(--blue-text)", prodForm.protein, (v) => setProdForm((s) => ({ ...s, protein: v })))}
              {macroField(t("w.recovery.nutrition.carbs"), "var(--amber-text)", prodForm.carbs, (v) => setProdForm((s) => ({ ...s, carbs: v })))}
              {macroField(t("w.recovery.nutrition.fat"), "var(--violet-text)", prodForm.fat, (v) => setProdForm((s) => ({ ...s, fat: v })))}
            </div>
            {(() => { const mk = macroKcalOf(prodForm.protein, prodForm.carbs, prodForm.fat); return mk > 0 && !prodForm.kcal.trim() ? <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10, textAlign: "center" }}>{t("w.recovery.nutrition.macrosApprox")} {mk} kcal</div> : null; })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <button className="pressable" onClick={() => setShowProdBuilder(false)} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.cancel")}</button>
              <button className="pressable" onClick={saveProduct} style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.saveProduct")}</button>
            </div>
          </div>
        )}
        {showProdBuilder ? null : canSaveAnotherProduct ? (
          <button className="pressable" onClick={() => openCreate("product")} style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            <AuroraIcon name="add" size={15} color="var(--lime-text)" />{t("w.recovery.nutrition.addManually")}
          </button>
        ) : (
          <button className="pressable" onClick={() => onNavigate?.("upgrade")} style={{ width: "100%", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: `color-mix(in srgb, var(--premium-accent) 12%, transparent)`, color: "var(--premium-accent-text)", border: `1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            <span aria-hidden>✦</span>{t("w.recovery.nutrition.unlockMoreProducts")}
          </button>
        )}
      </div>

      )}

      {/* DIARY — the selected day's individual entries, grouped by part, each one
          editable (quantity) and deletable. Defaults to today; pick a past day in
          the record below. Then the week strip + recent days.
          A streak is a number, not a trophy. */}
      {view === "diary" && (() => { const isToday = diaryDay === localTodayKey(); const macros: [string, number, number, string][] = [["P", daySummary.protein, targets.protein ?? 0, "blue"], ["C", daySummary.carbs, targets.carbs ?? 0, "amber"], ["F", daySummary.fat, targets.fat ?? 0, "violet"]];
      // One logged item: what it was, what it cost, a stepper to rescale it and
      // a bin to remove it. A derived entry (no FoodLog row) has no name of its
      // own, so it's labelled by its time of day and scales by a multiplier.
      const entryRow = (l: FoodLogRow) => {
        const mult = derivedScale[l.id] ?? 1;
        const shown = l.derived ? mult : l.qty;
        const time = new Date(l.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        return (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px 8px 31px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: fs.body, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name || t("w.recovery.nutrition.loggedEntry")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{l.derived ? `${time} — ` : ""}{Math.round(l.kcal * l.qty)} kcal — {Math.round(l.protein * l.qty)}P {Math.round(l.carbs * l.qty)}C {Math.round(l.fat * l.qty)}F</div>
          </div>
          {/* Quantity stepper — rescales the entry (and its mirror). */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="pressable" onClick={() => stepEntry(l, Math.max(0.5, Math.round((shown - 0.5) * 2) / 2))} aria-label={t("w.recovery.nutrition.decrease")} style={{ width: 26, height: 26, borderRadius: 12, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 15, lineHeight: 1 }}>−</button>
            <span style={{ minWidth: 26, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{l.derived ? `×${shown}` : shown}</span>
            <button className="pressable" onClick={() => stepEntry(l, Math.min(50, Math.round((shown + 0.5) * 2) / 2))} aria-label={t("w.recovery.nutrition.increase")} style={{ width: 26, height: 26, borderRadius: 12, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 15, lineHeight: 1 }}>+</button>
          </div>
          <button className="pressable" onClick={() => deleteLog(l.id)} aria-label={t("w.recovery.nutrition.deleteEntry")} style={{ flexShrink: 0, background: "none", border: "none", color: C("ash"), cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}><ITrash size={17} color={C("ash")} /></button>
        </div>
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
      <div style={{ ...card, marginTop: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button className="pressable" onClick={() => shiftDiaryDay(-1)} aria-label={t("w.recovery.nutrition.prevDay")} style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><IChevRight size={16} color={C("chalk")} style={{ transform: "rotate(180deg)" }} /></button>
          <div style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk") }}>{isToday ? t("w.recovery.nutrition.todaysMeals") : diaryDayLabel}</div>
            {!isToday && <button className="pressable" onClick={() => setDiaryDay(localTodayKey())} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--lime-text)", marginTop: 2 }}><CtaLabel size={12}>{`${t("w.recovery.nutrition.backToToday")} →`}</CtaLabel></button>}
          </div>
          <button className="pressable" onClick={() => shiftDiaryDay(1)} disabled={isToday} aria-label={t("w.recovery.nutrition.nextDay")} style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${C("line")}`, background: "transparent", color: isToday ? C("line") : C("chalk"), cursor: isToday ? "default" : "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><IChevRight size={16} color={isToday ? C("line") : C("chalk")} /></button>
        </div>
        {/* COPY A DAY — on the diary's day header, because this is the one
            screen where "a day" is the subject rather than the container. A
            quiet bare control, not a filled button: it is one of several things
            you can do to the day on display, not the day's purpose. */}
        <button
          className="pressable"
          onClick={() => { setCopyMsg(""); setCopySheet(true); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", background: "none", border: "none", padding: "12px 0 0", marginTop: 4, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}
        >
          <AuroraIcon name="copy" size={14} color={C("ash")} />
          {t("w.recovery.nutrition.copyDay")}
        </button>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 700, color: C("chalk"), fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{Math.round(daySummary.kcal)}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>kcal{targets.kcal ? ` / ${Math.round(targets.kcal)}` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {macros.map(([lab, val, tgt, tint]) => (
            <div key={lab} style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: `var(--${tint}-text)` }}>{lab}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{Math.round(val)}{tgt ? `/${Math.round(tgt)}` : ""}g</span>
              </div>
              <div style={{ height: 4, borderRadius: 999, background: C("line"), overflow: "hidden" }}>
                <div style={{ width: `${tgt ? Math.min(100, (val / tgt) * 100) : 0}%`, height: "100%", background: `var(--color-${tint})`, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
        {/* The label panel for the whole day. It is a FLOOR, not a total — only
            the foods that stated a value contribute one, so the caption says so
            rather than letting a partial number read as a complete one. */}
        {(daySummary.satFat > 0 || daySummary.sugar > 0 || daySummary.salt > 0 || daySummary.fiber > 0) && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
            {/* Measured against WHO/EFSA REFERENCE intakes, not against a
                personal target — saturates and sugars scale with the athlete's
                energy, salt doesn't, and fibre is a floor to reach rather than
                a ceiling. The label says which it is. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {panelStatus(daySummary, targets.kcal ?? 2000)
                .filter((r) => r.value > 0)
                .map((r) => (
                  <div key={r.key} style={{ minWidth: 74 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t(`w.recovery.nutrition.facts.${r.key}`)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, color: r.over ? "var(--red-text)" : C("chalk"), fontVariantNumeric: "tabular-nums", marginTop: 3 }}>
                      {r.value} g
                      <span style={{ fontWeight: 400, fontSize: fs.nano, color: C("ash") }}> {r.floor ? "/" : "of"} {r.reference}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 999, background: C("line"), overflow: "hidden", marginTop: 5 }}>
                      <div style={{ width: `${Math.min(100, r.pct * 100)}%`, height: "100%", borderRadius: 999, background: r.over ? "var(--color-red)" : r.floor ? "var(--color-lime)" : C("ash") }} />
                    </div>
                  </div>
                ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 12, lineHeight: 1.6 }}>
              {t("w.recovery.nutrition.facts.dayPartial")} {t("w.recovery.nutrition.facts.referenceNote")}
            </div>
          </div>
        )}
      </div>

      {/* PER-PART BREAKDOWN — each part's total, then its individual editable
          entries (from FoodLog when present). */}
      <div style={{ ...card, marginTop: 12, padding: 20 }}>
        <div style={{ marginTop: 0 }}>
          {partList.map((p, i) => {
            const entries = dayLogs.filter((l) => l.source === p.key);
            // Prefer the sum of editable entries; otherwise fall back to the
            // day's Signal total for the part (so past days always show numbers).
            const kcal = entries.length ? entries.reduce((s, l) => s + l.kcal * l.qty, 0) : (dayPartKcal[p.key] ?? 0);
            return (
            <div key={p.key} style={{ borderTop: i ? `1px solid ${C("line")}` : "none", paddingTop: 12, paddingBottom: entries.length ? 6 : 12 }}>
              <button className="pressable" onClick={() => isToday && openAdd(p.key)} disabled={!isToday} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "transparent", border: "none", padding: "0 2px", cursor: isToday ? "pointer" : "default", color: C("chalk") }}>
                <Glyph name={mealGlyph(p.key)} size={19} color={C("ash")} />
                <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body }}>{p.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: kcal > 0 ? C("chalk") : C("ash"), fontVariantNumeric: "tabular-nums" }}>{kcal > 0 ? `${Math.round(kcal)} kcal` : "—"}</span>
                {isToday && <span style={{ width: 26, height: 26, borderRadius: 999, border: "1.4px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}><IPlus size={13} color="var(--lime-text)" strokeWidth={2.4} /></span>}
              </button>
              {entries.map(entryRow)}
            </div>
            );
          })}
          {otherEntries.length > 0 && (
            <div style={{ borderTop: `1px solid ${C("line")}`, paddingTop: 12, paddingBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 2px" }}>
                <Glyph name={mealGlyph("snack")} size={19} color={C("ash")} />
                <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.body, color: C("chalk") }}>{t("w.recovery.nutrition.otherEntries")}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{Math.round(otherEntries.reduce((s, l) => s + l.kcal * l.qty, 0))} kcal</span>
              </div>
              {otherEntries.map(entryRow)}
            </div>
          )}
        </div>
        {dayLogs.length === 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 12, lineHeight: 1.5 }}>{daySummary.kcal > 0 ? t("w.recovery.nutrition.diaryTotalsOnly") : t("w.recovery.nutrition.diaryEntriesHint")}</div>}
      </div>
      </>
      ); })()}

      {view === "diary" && (
      <div style={{ ...card, marginTop: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.recentDays")}</div>
          {streakDays > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)", fontVariantNumeric: "tabular-nums" }}>{streakDays}/7</span>}
        </div>
        {/* week strip — last 7 days, lit when intake was logged */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 16 }}>
          {week.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
              <div style={{ width: "100%", maxWidth: 30, aspectRatio: "1", borderRadius: 12, background: d.on ? `color-mix(in srgb, var(--color-lime) 22%, ${C("ink")})` : C("ink"), border: `1px solid ${d.on ? `color-mix(in srgb, var(--color-lime) 40%, ${C("line")})` : C("line")}`, display: "grid", placeItems: "center" }}>{d.on && <AuroraIcon name="check" size={13} color="var(--lime-text)" />}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C("ash") }}>{d.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          {recentDays.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.recovery.nutrition.recentEmpty")}</div>
          ) : recentDays.map((d, i) => {
            const on = d.date === diaryDay;
            return (
            <button className="pressable" key={d.date} onClick={() => setDiaryDay(d.date)} aria-label={`${t("w.recovery.nutrition.viewDay")} ${d.date.slice(5)}`} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, padding: "12px 6px", borderTop: i ? `1px solid ${C("line")}` : "none", background: on ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", borderRadius: on ? 12 : 0, border: "none", borderLeft: on ? "2px solid var(--color-lime)" : "2px solid transparent", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption }}>
              <span style={{ color: on ? "var(--lime-text)" : C("ash"), width: 48, textAlign: "left" }}>{d.date.slice(5)}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: C("chalk") }}>{Math.round(d.kcal)} kcal</span>
              <span style={{ color: C("ash"), flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(d.protein)}P {Math.round(d.carbs)}C {Math.round(d.fat)}F</span>
            </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

// ── THE RECIPES LIBRARY — the Plans tab, on food ────────────────────────────
//
// Three levels, one object at three compressions, exactly as Plans does it:
// the library root (a soft cover + shelves of covers), a collection (its own
// cover + the recipes as cards), and the recipe itself (the cover + the
// method). Each level is its OWN component and that is load-bearing:
// useHeroCollapse captures the root and hero NODES once, so a level must
// unmount when you leave it or the cover stops collapsing — the same reason
// plans.tsx splits Library / List / Detail.

/** A collection's display name — the meals borrow the meal-part vocabulary the
 *  rest of nutrition uses, the cross-cut borrows the filter chip's. */
