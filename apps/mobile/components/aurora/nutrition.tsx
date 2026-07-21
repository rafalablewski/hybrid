import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
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
  nutritionSummary,
  nutritionNudge,
  type NutritionGoal,
  type MealPreset,
  type WeightPoint,
  type NutritionDay,
  type NutritionNudge,
  type NutritionSummary,
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
import { ABack, AuroraScreen, ACard, ASegment, APill, AHeading, RADIUS, Ring } from "./kit";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; labelKey: string }[] = [
  { id: "lose", labelKey: "w.recovery.nutrition.goalLose" },
  { id: "maintain", labelKey: "w.recovery.nutrition.goalMaintain" },
  { id: "gain", labelKey: "w.recovery.nutrition.goalGain" },
];

/** AURORA Nutrition — the macro tracker in the rounded Figma layout, reusing the
 *  exact adaptive-targets engine + manual-macro Signal logging as the classic.
 *  `compact` renders the focused "Add a meal" quick-add (the Today Nutrition
 *  sheet): today-vs-target header, a manual name+kcal add, and the premade-meals
 *  grid — the full tracker (goal, macro bars, weight trend, history) stays on the
 *  screen. `onNavigateFull` deep-links from the sheet to that full tracker. */
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
  const [mealForm, setMealForm] = useState({ name: "", emoji: "🍽️", kcal: "", protein: "", carbs: "", fat: "" });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [prodForm, setProdForm] = useState({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showProdBuilder, setShowProdBuilder] = useState(false);
  const canSaveAnotherMeal = full || meals.length < FREE_MEAL_LIMIT;
  const loadLibrary = () => { fetchSavedMeals().then(setMeals).catch(() => {}); fetchFoodProducts().then(setProducts).catch(() => {}); };
  useEffect(() => { loadLibrary(); }, []);

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
    setMealForm({ name: "", emoji: "🍽️", kcal: "", protein: "", carbs: "", fat: "" });
    setShowMealBuilder(false);
    loadLibrary();
  };

  const removeMeal = async (id: string) => { setMeals((xs) => xs.filter((x) => x.id !== id)); await deleteSavedMeal(id); };

  const saveProduct = async () => {
    if (!prodForm.name.trim()) return;
    if (!full) { onUpgrade ? onUpgrade() : router.push("/upgrade"); return; }
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
        {/* Quadrant — kcal + protein + carbs + fat, one unified entry */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <QuadTile field="kcal" label={t("w.recovery.nutrition.tabCalories")} unit="kcal" color={C.chalk} value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} />
          <QuadTile field="protein" label={t("w.recovery.nutrition.protein")} unit="g" color={C.chalk} value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} />
          <QuadTile field="carbs" label={t("w.recovery.nutrition.carbs")} unit="g" color={C.chalk} value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} />
          <QuadTile field="fat" label={t("w.recovery.nutrition.fat")} unit="g" color={C.chalk} value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} />
        </View>
        {(() => {
          const macroKcal = Math.round((parseFloat(f.protein) || 0) * 4 + (parseFloat(f.carbs) || 0) * 4 + (parseFloat(f.fat) || 0) * 9);
          return macroKcal > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 12 }}>{t("w.recovery.nutrition.macrosApprox")} {macroKcal} kcal</Text> : null;
        })()}
        {/* Add meal + Scan label — side-by-side rounded pills (Scan is AI vision, Full only → upgrade) */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable onPress={add} disabled={saving} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.addMeal")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 12, opacity: saving ? 0.6 : 1 }}>
            <Text style={{ color: txt(C, C.lime), fontFamily: F.bold, fontSize: 17, fontWeight: "500" }}>＋</Text>
            <Text style={{ color: txt(C, C.lime), fontFamily: F.bold, fontSize: fs.body, fontWeight: "700" }}>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</Text>
          </Pressable>
          <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.scanLabel")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: `${pa.fill}8c`, backgroundColor: "transparent", opacity: scanning ? 0.6 : 1 }}>
            <Text style={{ color: pa.text, fontSize: 12 }}>✦</Text>
            <Text style={{ fontFamily: F.bold, fontWeight: "700", fontSize: fs.caption, color: C.chalk }}>{scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}</Text>
            {!full && <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.6, textTransform: "uppercase", borderWidth: 1, borderColor: `${pa.fill}66`, color: pa.text, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>{t("w.account.settings.full")}</Text>}
          </Pressable>
        </View>
        {mealMsg ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>✓ {mealMsg}</Text> : null}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => (!full && onUpgrade ? onUpgrade() : logPreset(p))}
              accessibilityRole="button"
              accessibilityLabel={t(p.labelKey)}
              style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: full ? C.ink2 : `${pa.fill}12`, borderWidth: 1, borderColor: full ? C.line : `${pa.fill}3d`, borderRadius: 16, padding: 14, opacity: full ? 1 : 0.9 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                {!full && <Text style={{ fontSize: 12 }}>🔒</Text>}
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 8 }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 3 }}>~{p.kcal} kcal</Text>
            </Pressable>
          ))}
        </View>

        {onNavigateFull ? (
          <Pressable onPress={onNavigateFull} style={{ marginTop: 16, alignSelf: "center" }} hitSlop={6}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.recovery.nutrition.fullTracker")} →</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <View>
          {personalized && greeting ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash, marginBottom: 2 }}>{greeting}</Text> : null}
          <AHeading style={{ fontSize: fs.display }}>{t("w.recovery.nutrition.title")}</AHeading>
        </View>
      </View>

      {personalized && (
        <View style={{ marginTop: 16 }}>
          <ASegment options={GOALS.map((g) => ({ id: g.id, label: t(g.labelKey) }))} value={goal} onPick={setGoal} />
        </View>
      )}

      {coachDiet?.diet && (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} ({t("w.recovery.nutrition.readOnly")})
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 8 }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, " kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <View key={label}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{val}{unit === "g" ? "g" : ""}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t(label)}{unit === " kcal" ? " (kcal)" : ""}</Text>
                </View>
              ) : null),
            )}
          </View>
          {coachDiet.diet.note ? <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 18 }}>{coachDiet.diet.note}</Text> : null}
        </ACard>
      )}

      {personalized ? (
        <>
          {/* Ring calories HERO (07/08) — the kit tick-ring carries the budget;
              a macro trio reads P/C/F beneath. */}
          <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 20 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.4, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.calories")}</Text>
            <View style={{ marginTop: 12 }}>
              <Ring value={targets.kcal > 0 ? (today.kcal / targets.kcal) * 100 : 0} size={158} ticks={44} color={today.kcal > targets.kcal * 1.05 ? C.red : C.lime} track={C.line}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: 36, letterSpacing: -1, color: C.chalk }}>{Math.round(today.kcal)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.ofKcal").replace("{n}", String(targets.kcal))}</Text>
                </View>
              </Ring>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", marginTop: 16, paddingHorizontal: 6 }}>
              {([["w.recovery.nutrition.protein", today.protein, targets.protein, C.blue, txt(C, C.blue)], ["w.recovery.nutrition.carbs", today.carbs, targets.carbs, C.amber, C.amber], ["w.recovery.nutrition.fat", today.fat, targets.fat, C.violet, txt(C, C.violet)]] as const).map(([label, cur, tgt, col, colT]) => (
                <View key={label} style={{ flex: 1, maxWidth: 96 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.6, textTransform: "uppercase", color: colT }}>{t(label)}</Text>
                  <Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk, marginTop: 3 }}>{Math.round(cur)}<Text style={{ fontSize: 10, fontFamily: F.mono, color: C.ash }}>/{tgt}g</Text></Text>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: C.ink, overflow: "hidden", marginTop: 5 }}><View style={{ width: `${Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0)}%`, height: 5, backgroundColor: col }} /></View>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 14, textAlign: "center" }}>{t("w.recovery.nutrition.maintenance")} ≈ {maint.kcal} kcal{maint.weightChangeKg != null ? ` – ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}</Text>
          </ACard>

          <NutritionNudgeCard nudge={nudge} />
          {/* Quick-action tiles (07) — Add / Scan / Meals. */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            {([[t("w.recovery.nutrition.add"), "＋", txt(C, C.lime), () => kcalRef.current?.focus()], [t("w.recovery.nutrition.scanLabel"), "✦", pa.text, () => scan()], [t("w.recovery.nutrition.yourMeals"), "🍽️", C.chalk, () => setShowMealBuilder(true)]] as const).map(([label, glyph, col, onPress]) => (
              <Pressable key={label} onPress={onPress} style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontSize: 19, color: col }}>{glyph}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 7 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <SummaryDashboard summary={summary} window={summaryWindow} onWindow={setSummaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} full={full} />
        </>
      ) : (
        <OnboardingGoal goal={goal} setGoal={setGoal} onUpgrade={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} today={today} onWeighIn={logWeighIn} />
      )}

      {/* Bodyweight trend — EWMA-smoothed weight line + weekly rate, from the
          same composition engine the web nutrition screen uses. */}
      {weight.points.length > 0 && (
        <ACard style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.recovery.nutrition.bodyweightTrend")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, weight.ratePerWeek <= 0 ? C.lime : C.amber) }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</Text>
          </View>
          <WeightTrend points={weight.points} color={C.lime} />
        </ACard>
      )}

      {/* Add to today */}
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <AuroraIcon name="add" size={20} color={txt(C, C.lime)} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.addToToday")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          <Cell value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} ph="kcal" inputRef={kcalRef} />
          <Cell value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
          <Cell value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
          <Cell value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
        </View>
        <APill label={saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")} onPress={add} disabled={saving} style={{ marginTop: 14 }} />
        {/* QUICK MEALS — one-tap premade meals. Full users log on tap; free
            users see them LOCKED and a tap routes to upgrade (manual entry
            above stays free for everyone). */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.quickMeals")}</Text>
            {!full && (
              <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: pa.text }}>✦ FULL</Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 16 }}>{full ? t("w.recovery.nutrition.quickMealsSub") : t("w.recovery.nutrition.quickMealsLocked")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {MEAL_PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => logPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={t(p.labelKey)}
                style={{ width: "47%", flexGrow: 1, backgroundColor: full ? C.ink : `${pa.fill}14`, borderWidth: 1, borderColor: full ? C.line : `${pa.fill}4d`, borderRadius: 15, padding: 13, opacity: full ? 1 : 0.85 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
                  {!full && <Text style={{ fontSize: 12 }}>🔒</Text>}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 6 }}>{t(p.labelKey).split(/ [·–] /)[0]}</Text>
                {t(p.labelKey).split(/ [·–] /)[1] ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{t(p.labelKey).split(/ [·–] /)[1]}</Text> : null}
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{p.kcal} kcal ({p.protein}p {p.carbs}c {p.fat}f)</Text>
              </Pressable>
            ))}
          </View>
          {mealMsg ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>✓ {t("w.recovery.nutrition.mealLogged")} — {mealMsg}</Text> : null}
        </View>
      </ACard>

      {/* YOUR MEALS — the user's own saved-meal library (build + save + one-tap
          log). Free users keep up to FREE_MEAL_LIMIT; the save CTA routes to
          upgrade once at the cap. */}
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourMeals")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`}</Text>
        </View>
        {meals.length === 0 && !showMealBuilder ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, lineHeight: 16 }}>{t("w.recovery.nutrition.yourMealsEmpty")}</Text>
        ) : null}
        {meals.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {meals.map((m) => (
              <View key={m.id} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 13 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ fontSize: 20 }}>{m.emoji ?? "🍽️"}</Text>
                  <Pressable onPress={() => removeMeal(m.id)} accessibilityRole="button" accessibilityLabel={t("w.recovery.nutrition.deleteMeal")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 15, color: C.ash }}>×</Text></Pressable>
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 6 }} numberOfLines={1}>{m.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{m.kcal} kcal ({m.protein}p {m.carbs}c {m.fat}f)</Text>
                <Pressable onPress={() => logMeal(m)} accessibilityRole="button" style={{ marginTop: 10, borderRadius: 999, backgroundColor: C.lime, paddingVertical: 8, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, C.lime) }}>+ {t("w.recovery.nutrition.log")}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {showMealBuilder ? (
          <View style={{ marginTop: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={mealForm.emoji} onChangeText={(v) => setMealForm((s) => ({ ...s, emoji: [...v][0] ?? "" }))} accessibilityLabel="emoji" style={{ width: 46, textAlign: "center", fontSize: 20, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 10 }} />
              <TextInput value={mealForm.name} onChangeText={(v) => setMealForm((s) => ({ ...s, name: v }))} placeholder={t("w.recovery.nutrition.mealNameHint")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.mealName")} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Cell value={mealForm.kcal} onChange={(v) => setMealForm((s) => ({ ...s, kcal: v }))} ph="kcal" />
              <Cell value={mealForm.protein} onChange={(v) => setMealForm((s) => ({ ...s, protein: v }))} ph={t("w.recovery.nutrition.proteinPh")} />
              <Cell value={mealForm.carbs} onChange={(v) => setMealForm((s) => ({ ...s, carbs: v }))} ph={t("w.recovery.nutrition.carbsPh")} />
              <Cell value={mealForm.fat} onChange={(v) => setMealForm((s) => ({ ...s, fat: v }))} ph={t("w.recovery.nutrition.fatPh")} />
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setShowMealBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveMeal} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.saveMeal")}</Text></Pressable>
            </View>
          </View>
        ) : canSaveAnotherMeal ? (
          <Pressable onPress={() => setShowMealBuilder(true)} accessibilityRole="button" style={{ marginTop: 12, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>＋ {t("w.recovery.nutrition.createMeal")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 12, flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: `${pa.fill}1f`, borderWidth: 1, borderColor: `${pa.fill}66`, borderRadius: 999, paddingVertical: 12 }}>
            <Text style={{ color: pa.text }}>✦</Text><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: pa.text }}>{t("w.recovery.nutrition.unlockMoreMeals")}</Text>
          </Pressable>
        )}
      </ACard>

      {/* YOUR PRODUCTS — custom foods (Full). "+" drops a product's macros into
          the meal builder. Free users see the ✦ Full upsell. */}
      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.recovery.nutrition.yourProducts")}</Text>
          {!full ? <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: 9, color: pa.text }}>✦ FULL</Text></View> : null}
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 16 }}>{full ? t("w.recovery.nutrition.yourProductsSub") : t("w.recovery.nutrition.yourProductsLocked")}</Text>
        {full && products.length > 3 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Text style={{ color: C.ash }}>🔍</Text>
            <TextInput value={prodSearch} onChangeText={setProdSearch} placeholder={t("w.recovery.nutrition.searchProducts")} placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, padding: 0 }} />
          </View>
        ) : null}
        {full && products.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {products.filter((p) => !prodSearch.trim() || p.name.toLowerCase().includes(prodSearch.trim().toLowerCase())).map((p, i) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{p.servingLabel} — {p.kcal} kcal · {p.protein}p {p.carbs}c {p.fat}f</Text>
                </View>
                <Pressable onPress={() => addProductToMeal(p)} accessibilityLabel={t("w.recovery.nutrition.addToMeal")} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.bold, color: txt(C, C.lime) }}>+</Text></Pressable>
                <Pressable onPress={() => removeProduct(p.id)} accessibilityLabel={t("w.recovery.nutrition.deleteProduct")} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 15, color: C.ash }}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {full && showProdBuilder ? (
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
              <Pressable onPress={() => setShowProdBuilder(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.cancel")}</Text></Pressable>
              <Pressable onPress={saveProduct} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.saveProduct")}</Text></Pressable>
            </View>
          </View>
        ) : null}
        {!showProdBuilder ? (
          <Pressable onPress={() => (full ? setShowProdBuilder(true) : onUpgrade ? onUpgrade() : router.push("/upgrade"))} accessibilityRole="button" style={{ marginTop: 12, flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: full ? C.lime : `${pa.fill}73`, borderRadius: 999, paddingVertical: 12 }}>
            {!full ? <Text style={{ color: pa.text }}>✦</Text> : null}<Text style={{ fontFamily: F.bold, fontSize: fs.body, color: full ? txt(C, C.lime) : pa.text }}>＋ {t("w.recovery.nutrition.addProduct")}</Text>
          </Pressable>
        ) : null}
      </ACard>

      {/* Recent */}
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.recovery.nutrition.recentDays")}</Text>
        {/* Streak week strip (07) — last 7 calendar days, lit when logged. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 12 }}>
          {week.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 5 }}>
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: d.on ? C.lime : C.ink, borderWidth: 1, borderColor: d.on ? C.lime : C.line, alignItems: "center", justifyContent: "center" }}>{d.on ? <Text style={{ fontFamily: F.black, fontSize: 12, color: txt(C, C.lime) }}>✓</Text> : null}</View>
              <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          {recent.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.recovery.nutrition.recentEmpty")}</Text>
          ) : recent.map((d, i) => (
            <View key={d.date} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{d.date.slice(5)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{Math.round(d.kcal)} kcal</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(d.protein)}p {Math.round(d.carbs)}c {Math.round(d.fat)}f</Text>
            </View>
          ))}
        </View>
      </ACard>
    </>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {body}
    </AuroraScreen>
  );
}

// A labelled hairline divider ("──── LOG MANUALLY [FREE] ────") for the compact
// Add-a-meal sheet.
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
// (aurora/nutrition.tsx). No react-native-svg: it reuses the native bar-trend
// idiom (Spark / TrendBars) on the EWMA-smoothed weight series, with the raw
// latest weight + span dates so it reads as a trend at a glance. The weekly
// rate badge lives in the card header (like web).
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


// The coach-voiced "what now?" line (07) — one nudge under the calories hero.
function NutritionNudgeCard({ nudge }: { nudge: NutritionNudge }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const text =
    nudge.kind === "cold-start" ? t("w.recovery.nutrition.nudgeColdStart")
    : nudge.kind === "protein" ? `${nudge.gap}${t("w.recovery.nutrition.nudgeProteinSuffix")}`
    : nudge.kind === "calories-left" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeCalSuffix")}`
    : nudge.kind === "over" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeOverSuffix")}`
    : t("w.recovery.nutrition.nudgeOnTrack");
  const accent = nudge.kind === "over" ? C.red : nudge.kind === "on-track" ? C.lime : C.blue;
  const emoji = nudge.kind === "over" ? "⚠️" : nudge.kind === "on-track" ? "✓" : nudge.kind === "protein" ? "⚡" : "💬";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: accent, borderRadius: 20, padding: 14, marginTop: 12 }}>
      <Text style={{ fontSize: 18, color: accent }}>{emoji}</Text>
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

// The SUMMARY dashboard (08) — a week/month rollup of stat tiles + macro balance.
function SummaryDashboard({ summary, window, onWindow, goal, weightChangeKg, onUpgrade, full }: { summary: NutritionSummary; window: 7 | 30; onWindow: (w: 7 | 30) => void; goal: NutritionGoal; weightChangeKg: number | null; onUpgrade: () => void; full: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const goalLabel = t(goal === "lose" ? "w.recovery.nutrition.goalLose" : goal === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  const seg = (w: 7 | 30, label: string) => (
    <Pressable key={w} onPress={() => onWindow(w)} style={{ flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center", backgroundColor: window === w ? C.lime : "transparent" }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: window === w ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), txt(C, C.lime)],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), txt(C, C.blue)],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C.amber],
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
          {/* Goal-progress strip (07) — goal + measured 28-day weight change. */}
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 }}>
            <View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</Text>
              <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk, marginTop: 3 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.recovery.nutrition.per28d")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <View key={label} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: col }}>{label}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 23, letterSpacing: -0.4, color: C.chalk, marginTop: 5 }}>{val}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{unit}</Text>
              </View>
            ))}
          </View>
          {summary.macroSplit ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash, marginBottom: 9 }}>{t("w.recovery.nutrition.macroBalance")}</Text>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C.blue], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C.amber], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C.violet]] as const).map(([label, pct, col]) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, width: 52 }}>{t(label)}</Text>
                  <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: C.ink2, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 7, backgroundColor: col }} /></View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk, width: 30, textAlign: "right" }}>{pct}%</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!full ? (
            <Pressable onPress={onUpgrade} style={{ flexDirection: "row", alignItems: "center", gap: 11, marginTop: 14, backgroundColor: `${pa.fill}1a`, borderWidth: 1, borderColor: `${pa.fill}52`, borderRadius: 16, padding: 13 }}>
              <Text style={{ color: pa.text, fontSize: 17 }}>✦</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.recovery.nutrition.deepInsights")}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</Text>
              </View>
              <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: 9, color: pa.text }}>{t("w.account.settings.full")}</Text></View>
            </Pressable>
          ) : null}
        </>
      )}
    </ACard>
  );
}

// The guided 3-step onboarding (07): goal → activity + weigh-in → ✦ trial.
const MACT: { id: string; emoji: string; labelKey: string; subKey: string }[] = [
  { id: "light", emoji: "🚶", labelKey: "w.recovery.nutrition.actLight", subKey: "w.recovery.nutrition.actLightSub" },
  { id: "moderate", emoji: "🏃", labelKey: "w.recovery.nutrition.actModerate", subKey: "w.recovery.nutrition.actModerateSub" },
  { id: "high", emoji: "🔥", labelKey: "w.recovery.nutrition.actHigh", subKey: "w.recovery.nutrition.actHighSub" },
];
function OnboardingGoal({ goal, setGoal, onUpgrade, today, onWeighIn }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; today: NutritionDay; onWeighIn: (kg: number) => void }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("moderate");
  const [weight, setWeight] = useState("");
  const GOAL_OPTS: { id: NutritionGoal; emoji: string; label: string; sub: string }[] = [
    { id: "lose", emoji: "📉", label: t("w.recovery.nutrition.goalLose"), sub: t("w.recovery.nutrition.goalLoseSub") },
    { id: "maintain", emoji: "⚖️", label: t("w.recovery.nutrition.goalMaintain"), sub: t("w.recovery.nutrition.goalMaintainSub") },
    { id: "gain", emoji: "📈", label: t("w.recovery.nutrition.goalGain"), sub: t("w.recovery.nutrition.goalGainSub") },
  ];
  const choice = (on: boolean, emoji: string, label: string, sub: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: C.ink2, borderWidth: on ? 2 : 1, borderColor: on ? C.lime : C.line, borderRadius: 20, padding: on ? 14 : 15, marginBottom: 10 }}>
      <Text style={{ fontSize: 23 }}>{emoji}</Text>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{label}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text></View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }} />
    </Pressable>
  );
  const primary = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 6 }}><Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{label}</Text></Pressable>
  );
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {step > 0 ? <Pressable onPress={() => setStep((s) => s - 1)} accessibilityLabel={t("w.recovery.nutrition.back")} style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk }}>←</Text></Pressable> : null}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.ink, overflow: "hidden", marginTop: 12 }}><View style={{ width: `${((step + 1) / 3) * 100}%`, height: 4, backgroundColor: C.lime }} /></View>

      {step === 0 ? (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: -0.4, color: C.chalk }}>{t("w.recovery.nutrition.pickGoal")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, marginBottom: 14 }}>{t("w.recovery.nutrition.pickGoalSub")}</Text>
          {GOAL_OPTS.map((o) => choice(goal === o.id, o.emoji, o.label, o.sub, () => setGoal(o.id)))}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: -0.4, color: C.chalk }}>{t("w.recovery.nutrition.pickActivity")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5, marginBottom: 14 }}>{t("w.recovery.nutrition.pickActivitySub")}</Text>
          {MACT.map((a) => choice(activity === a.id, a.emoji, t(a.labelKey), t(a.subKey), () => setActivity(a.id)))}
          <ACard style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.addWeighIn")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={C.ash} accessibilityLabel={t("w.recovery.nutrition.addWeighIn")} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 11, textAlign: "center" }} />
              <Pressable onPress={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.field, paddingHorizontal: 18, justifyContent: "center" }}><Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.save")}</Text></Pressable>
            </View>
          </ACard>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ marginTop: 20 }}>
          <ACard style={{ alignItems: "center", paddingVertical: 20, backgroundColor: `${pa.fill}14`, borderColor: `${pa.fill}4d` }}>
            <View style={{ backgroundColor: `${pa.fill}28`, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 }}><Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: pa.text }}>✦ {t("w.account.settings.full")}</Text></View>
            <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, color: C.chalk, marginTop: 12, textAlign: "center" }}>{t("w.recovery.nutrition.trialTitle")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8, textAlign: "center", lineHeight: 18 }}>{t("w.recovery.nutrition.trialSub")}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.4, color: C.chalk, marginTop: 14 }}>$9.99<Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text></Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</Text>
            <Pressable onPress={onUpgrade} style={{ alignSelf: "stretch", backgroundColor: pa.fill, borderRadius: 16, paddingVertical: 15, alignItems: "center", marginTop: 14 }}><Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: pa.ink }}>{t("w.recovery.nutrition.startTrial")} →</Text></Pressable>
          </ACard>
          <ACard style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.recovery.nutrition.todayVsTarget")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 20 }}>{t("w.recovery.nutrition.adaptBody")}</Text>
            <View style={{ flexDirection: "row", gap: space.lg, marginTop: 12, flexWrap: "wrap" }}>
              {[[t("w.recovery.nutrition.loggedToday"), `${Math.round(today.kcal)} kcal`], [t("w.recovery.nutrition.protein"), `${Math.round(today.protein)}g`], [t("w.recovery.nutrition.carbs"), `${Math.round(today.carbs)}g`], [t("w.recovery.nutrition.fat"), `${Math.round(today.fat)}g`]].map(([l, v]) => (
                <View key={l}><Text style={{ fontFamily: F.black, fontSize: 17, color: C.chalk }}>{v}</Text><Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{l}</Text></View>
              ))}
            </View>
          </ACard>
        </View>
      ) : null}
    </View>
  );
}

// One quadrant tile of the compact Add-a-meal entry: a labelled big-number
// field (kcal / protein / carbs / fat) with a colour dot and a fill line that
// grows toward a soft max as you type.
function QuadTile({ field, label, unit, color, value, onChange }: { field: string; label: string; unit: string; color: string; value: string; onChange: (v: string) => void }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "46%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 2 }}>
        <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} testID={`quad-${field}`} style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -0.8, color: C.chalk, paddingVertical: 2 }} />
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
