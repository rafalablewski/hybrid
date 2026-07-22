import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import Svg, { Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  weightTrend,
  isFullAccess,
  MEAL_PRESETS,
  mealPresetSignals,
  FREE_MEAL_LIMIT,
  FREE_PRODUCT_LIMIT,
  nutritionSummary,
  nutritionNudge,
  NUTRITION_GLYPHS,
  type NutritionGoal,
  type MealPreset,
  type WeightPoint,
  type NutritionNudge,
  type NutritionSummary,
  type NutritionGlyphName,
} from "@hybrid/core";
import {
  createSignal, getAssignedDiet, scanNutritionLabel,
  fetchSavedMeals, createSavedMeal, deleteSavedMeal,
  fetchFoodProducts, createFoodProduct, deleteFoodProduct,
  type SavedMealRow, type FoodProductRow,
} from "../../lib/api";
import { useSignalsQuery, useRevalidate } from "../../lib/queries";
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

// The Nutrition subpage is a HUB: a focused landing + sub-screens reached from a
// menu, so the daily essentials aren't buried in one long scroll.
type NutView = "home" | "log" | "insights" | "diary" | "body" | "meals" | "foods";

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
  const full = isFullAccess(usePersona());
  const { data: signals = [], isFetching: refreshing, refetch } = useSignalsQuery();
  const revalidate = useRevalidate();
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  // The goal is changed through a deliberate Sheet (opened from a card), never a
  // live top-of-screen toggle — switching it recomputes every target.
  const [goalPicker, setGoalPicker] = useState(false);
  const [view, setView] = useState<NutView>("home");
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

  // Log a saved meal → the SAME signals as a manual add.
  const logMeal = async (m: SavedMealRow) => {
    setMealMsg("");
    const jobs: [string, number, string][] = [["energyIntake", m.kcal, "kcal"], ["protein", m.protein, "g"], ["carbs", m.carbs, "g"], ["fat", m.fat, "g"]];
    for (const [kind, value, unit] of jobs) {
      if (value <= 0) continue;
      if (!(await createSignal(kind, value, unit))) { Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody")); return; }
    }
    setMealMsg(`${m.name} +${m.kcal} kcal`);
    revalidate.recovery();
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

  const sig = signals as unknown as Parameters<typeof todayNutrition>[0];
  const today = useMemo(() => todayNutrition(sig), [signals]);
  const targets = useMemo(() => adaptiveTargets(sig, { goal }), [signals, goal]);
  const maint = useMemo(() => estimateMaintenance(sig, {}), [signals]);
  const recent = useMemo(() => dailyNutrition(sig).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(sig), [signals]);
  const personalized = maint.kcal != null;
  const [summaryWindow, setSummaryWindow] = useState<7 | 30>(30);
  const summary = useMemo(() => nutritionSummary(sig, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  const nudge = useMemo(() => nutritionNudge(today, targets), [today, targets]);
  const [greeting, setGreeting] = useState("");
  useEffect(() => { const h = new Date().getHours(); setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening")); }, [t]);
  const kcalRef = useRef<TextInput>(null);
  const [prodSearch, setProdSearch] = useState("");
  const week = useMemo(() => {
    const logged = new Set(dailyNutrition(sig).filter((d) => d.kcal > 0).map((d) => d.date));
    const L = ["S", "M", "T", "W", "T", "F", "S"]; const now = new Date(); const out: { label: string; on: boolean }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push({ label: L[d.getDay()]!, on: logged.has(key) }); }
    return out;
  }, [signals]);
  const streakDays = useMemo(() => week.filter((d) => d.on).length, [week]);
  const logWeighIn = async (kg: number) => { await createSignal("bodyMass", kg, "kg"); revalidate.recovery(); load(); };

  const add = async () => {
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
    if (!jobs.length) { setSaving(false); return; }
    let failed = false;
    for (const [kind, value, unit] of jobs) {
      if (!(await createSignal(kind, value, unit))) { failed = true; break; }
      loggedKinds.current.add(kind);
    }
    if (failed) Alert.alert(t("w.recovery.nutrition.errSave"), t("w.recovery.nutrition.errSaveBody"));
    else { setF({ kcal: "", protein: "", carbs: "", fat: "" }); setMealMsg(`+${Math.round(kcal)} kcal`); loggedKinds.current = new Set(); }
    setSaving(false);
    revalidate.recovery();
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
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} />
            <Text style={{ color: txt(C, C.lime), fontFamily: F.mono, fontSize: fs.body, fontWeight: "700" }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text>
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
          {/* One primary action — log a meal (opens the Log sub-screen). */}
          <Pressable onPress={() => setView("log")} accessibilityRole="button" style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 15, marginTop: 14 }}>
            <AuroraIcon name="add" size={16} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.logMealCta")}</Text>
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
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{m.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{m.kcal} kcal — {m.protein}P {m.carbs}C {m.fat}F</Text>
                </View>
                <Pressable onPress={() => logMeal(m)} accessibilityRole="button" style={{ borderRadius: 999, backgroundColor: C.lime, paddingVertical: 8, paddingHorizontal: 16 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.log")}</Text>
                </Pressable>
                <Pressable onPress={() => removeMeal(m.id)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.deleteMeal")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showMealBuilder ? (
          <View style={{ marginTop: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 }}>
            <TextInput value={mealForm.name} onChangeText={(v) => setMealForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.mealNameHint")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.mealName")} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10 }} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Cell value={mealForm.kcal} onChange={(v) => setMealForm((s) => ({ ...s, kcal: v }))} ph="kcal" />
              <Cell value={mealForm.protein} onChange={(v) => setMealForm((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
              <Cell value={mealForm.carbs} onChange={(v) => setMealForm((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
              <Cell value={mealForm.fat} onChange={(v) => setMealForm((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setShowMealBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveMeal} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.saveMeal")}</Text></Pressable>
            </View>
          </View>
        ) : canSaveAnotherMeal ? (
          <Pressable onPress={() => setShowMealBuilder(true)} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
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

      {/* MY FOODS — custom foods. Free users keep up to FREE_PRODUCT_LIMIT
          (mirrors saved meals); "+" drops a product's macros into the meal
          builder. */}
      {view === "foods" && (
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourProducts")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${products.length} / ${FREE_PRODUCT_LIMIT}`}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, lineHeight: 16 }}>{t("w.recovery.nutrition.yourProductsSub")}</Text>
        {products.length > 3 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 }}>
            <AuroraIcon name="search" size={16} color={C.ash} />
            <TextInput value={prodSearch} onChangeText={setProdSearch} placeholder={t("w.recovery.nutrition.searchProducts")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, padding: 0 }} />
          </View>
        ) : null}
        {products.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {products.filter((p) => !prodSearch.trim() || p.name.toLowerCase().includes(prodSearch.trim().toLowerCase())).map((p, i) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel} — {p.kcal} kcal — {p.protein}P {p.carbs}C {p.fat}F</Text>
                </View>
                <Pressable onPress={() => addProductToMeal(p)} accessibilityLabel={t("w.recovery.nutrition.addToMeal")} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: `${C.lime}6b`, alignItems: "center", justifyContent: "center" }}><AuroraIcon name="add" size={14} color={txt(C, C.lime)} /></Pressable>
                <Pressable onPress={() => removeProduct(p.id)} accessibilityLabel={t("w.recovery.nutrition.deleteProduct")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 16, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showProdBuilder ? (
          <View style={{ marginTop: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 }}>
            <TextInput value={prodForm.name} onChangeText={(v) => setProdForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.productNamePh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.productName")} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10 }} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput value={prodForm.serving} onChangeText={(v) => setProdForm((s) => ({ ...s, serving: v }))} placeholder={t("w.recovery.nutrition.servingPh")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.servingPh")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 8, paddingVertical: 11, textAlign: "center" }} />
              <Cell value={prodForm.kcal} onChange={(v) => setProdForm((s) => ({ ...s, kcal: v }))} ph="kcal" />
              <Cell value={prodForm.protein} onChange={(v) => setProdForm((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
              <Cell value={prodForm.carbs} onChange={(v) => setProdForm((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
              <Cell value={prodForm.fat} onChange={(v) => setProdForm((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setShowProdBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveProduct} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.saveProduct")}</Text></Pressable>
            </View>
          </View>
        ) : null}
        {showProdBuilder ? null : canSaveAnotherProduct ? (
          <Pressable onPress={() => setShowProdBuilder(true)} accessibilityRole="button" style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12 }}>
            <AuroraIcon name="add" size={15} color={txt(C, C.lime)} /><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addProduct")}</Text>
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
          {recent.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recent.map((d, i) => (
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
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={txt(C, C.lime)} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
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
      <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.caption, letterSpacing: 0.4, textTransform: "uppercase", color: window === w ? txt(C, C.lime) : C.ash }}>{label}</Text>
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
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <AuroraIcon name="check" size={12} color={txt(C, C.lime)} /> : null}</View>
    </Pressable>
  );
  const primary = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 6 }}><Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.subtitle, color: txt(C, C.lime) }}>{label}</Text></Pressable>
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
