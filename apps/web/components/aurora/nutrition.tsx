"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition, adaptiveTargets, estimateMaintenance, dailyNutrition, weightTrend,
  isFullAccess, MEAL_PRESETS, mealPresetSignals, FREE_MEAL_LIMIT,
  nutritionSummary, nutritionNudge,
  type NutritionGoal, type Signal, type MealPreset, type NutritionDay, type NutritionNudge, type NutritionSummary,
} from "@hybrid/core";
import { fs, space, LINE_HEX, LIME_HEX, ASH, tip } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "w.recovery.nutrition.goalLose" }, { id: "maintain", label: "w.recovery.nutrition.goalMaintain" }, { id: "gain", label: "w.recovery.nutrition.goalGain" },
];
type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };
type SavedMeal = { id: string; name: string; emoji: string | null; kcal: number; protein: number; carbs: number; fat: number };
type FoodProduct = { id: string; name: string; servingLabel: string; kcal: number; protein: number; carbs: number; fat: number };

/** AURORA Nutrition (web) — rounded macro tracker, same adaptive-targets engine
 *  + /api/signals logging + bodyweight trend as the classic. */
export default function AuroraNutrition({ onNavigate, compact = false }: { onNavigate?: (screen: string) => void; compact?: boolean }) {
  const revalidate = useRevalidate();
  const { t } = useLang();
  // Free (casual) users log macros manually; scanning a label and saving
  // meals/products is a Full feature (see canScanFoodLabel / canSaveMealsAndProducts).
  const full = isFullAccess(usePersona());
  const [signals, setSignals] = useState<Signal[]>([]);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mealMsg, setMealMsg] = useState("");
  // Signal kinds already POSTed for the meal being entered — survives a partial
  // failure so a retry doesn't duplicate the kinds that already succeeded.
  const loggedKinds = useRef<Set<string>>(new Set());
  const [coachDiet, setCoachDiet] = useState<{ diet: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; coachName?: string } | null>(null);
  useEffect(() => { fetch("/api/nutrition/assigned").then((r) => r.json()).then(setCoachDiet).catch(() => {}); }, []);
  const C = (v: string) => `var(--color-${v})`;

  // ── Personal library — the user's OWN saved meals + custom products (Phase B).
  // Meals: free users keep up to FREE_MEAL_LIMIT; more (and any product) is Full.
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [mealForm, setMealForm] = useState({ name: "", emoji: "🍽️", kcal: "", protein: "", carbs: "", fat: "" });
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [libMsg, setLibMsg] = useState("");
  const canSaveAnotherMeal = full || meals.length < FREE_MEAL_LIMIT;

  const loadLibrary = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([fetch("/api/nutrition/meals"), fetch("/api/nutrition/products")]);
      if (m.ok) setMeals(((await m.json()).meals ?? []) as SavedMeal[]);
      if (p.ok) setProducts(((await p.json()).products ?? []) as FoodProduct[]);
    } catch { /* offline — leave what we have */ }
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // Log a saved meal → the SAME energyIntake/protein/carbs/fat signals as a
  // manual add, so it's indistinguishable downstream.
  const logMeal = async (m: SavedMeal) => {
    setError(""); setMealMsg("");
    const jobs: [string, number, string][] = [["energyIntake", m.kcal, "kcal"], ["protein", m.protein, "g"], ["carbs", m.carbs, "g"], ["fat", m.fat, "g"]];
    try {
      for (const [kind, value, unit] of jobs) {
        if (value <= 0) continue;
        const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value, unit, source: "meal" }) });
        if (res.status === 401) { setError(t("w.recovery.nutrition.errSignIn")); return; }
        if (!res.ok) { setError(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      }
      setMealMsg(`${m.name} +${m.kcal} kcal`);
      await load(); revalidate.recovery();
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
  };

  const saveMeal = async () => {
    if (!mealForm.name.trim()) return;
    if (!canSaveAnotherMeal) { onNavigate?.("upgrade"); return; }
    setLibMsg("");
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const body = { name: mealForm.name.trim(), emoji: mealForm.emoji, kcal: num(mealForm.kcal) || undefined, protein: num(mealForm.protein), carbs: num(mealForm.carbs), fat: num(mealForm.fat) };
    try {
      const res = await fetch("/api/nutrition/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { onNavigate?.("upgrade"); return; }
      if (res.status === 401) { setLibMsg(t("w.recovery.nutrition.errSignIn")); return; }
      if (!res.ok) { setLibMsg(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      setMealForm({ name: "", emoji: "🍽️", kcal: "", protein: "", carbs: "", fat: "" });
      setShowMealBuilder(false);
      await loadLibrary();
    } catch { setLibMsg(t("w.recovery.nutrition.errNetwork")); }
  };

  const deleteMeal = async (id: string) => {
    setMeals((xs) => xs.filter((x) => x.id !== id));
    try { await fetch(`/api/nutrition/meals/${id}`, { method: "DELETE" }); } catch { /* revert on next load */ }
  };

  // Custom products — Full-only to CREATE (the free tier gets meals, not a
  // products library). Building a meal can draw macros from these.
  const [prodForm, setProdForm] = useState({ name: "", serving: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [showProdBuilder, setShowProdBuilder] = useState(false);
  const [prodSearch, setProdSearch] = useState("");

  const saveProduct = async () => {
    if (!prodForm.name.trim()) return;
    if (!full) { onNavigate?.("upgrade"); return; }
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

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) return setSignals([]);
      const data = (await res.json()) as { signals?: Row[] };
      setSignals((data.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind as Signal["kind"], value: s.value, unit: s.unit, source: s.source, ts: s.ts })));
    } catch { setSignals([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = useMemo(() => todayNutrition(signals), [signals]);
  const targets = useMemo(() => adaptiveTargets(signals, { goal }), [signals, goal]);
  const maint = useMemo(() => estimateMaintenance(signals, {}), [signals]);
  const recent = useMemo(() => dailyNutrition(signals).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(signals), [signals]);
  const personalized = maint.kcal != null;
  // Summary dashboard (08) window toggle + rolling summary; today's nudge (07).
  const [summaryWindow, setSummaryWindow] = useState<7 | 30>(30);
  const summary = useMemo(() => nutritionSummary(signals, { targets, windowDays: summaryWindow }), [signals, targets, summaryWindow]);
  const nudge = useMemo(() => nutritionNudge(today, targets), [today, targets]);
  // Time-of-day greeting (client-only) + anchors for the quick-action tiles.
  const [greeting, setGreeting] = useState("");
  useEffect(() => { const h = new Date().getHours(); setGreeting(t(h < 12 ? "w.home.today.greetMorning" : h < 18 ? "w.home.today.greetAfternoon" : "w.home.today.greetEvening")); }, [t]);
  const addRef = useRef<HTMLDivElement>(null);
  const mealsRef = useRef<HTMLDivElement>(null);
  const scrollTo = (r: React.RefObject<HTMLDivElement | null>) => r.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Last-7-calendar-days logging strip for the history streak (07).
  const week = useMemo(() => {
    const logged = new Set(dailyNutrition(signals).filter((d) => d.kcal > 0).map((d) => d.date));
    const L = ["S", "M", "T", "W", "T", "F", "S"]; const now = new Date(); const out: { label: string; on: boolean }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push({ label: L[d.getDay()]!, on: logged.has(key) }); }
    return out;
  }, [signals]);
  // First-run weigh-in (onboarding) → a bodyMass signal that sharpens the estimate.
  const logWeighIn = async (kg: number) => {
    try { await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "bodyMass", value: kg, unit: "kg", source: "manual" }) }); await load(); revalidate.recovery(); } catch { /* offline */ }
  };

  const add = async () => {
    setSaving(true); setError(""); setMealMsg("");
    // One unified entry: kcal + macros. When kcal is left blank, derive it from
    // the macros (4·4·9) so the calorie total always moves — mirrors how a preset
    // stores an explicit kcal alongside its macros.
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const protein = num(f.protein), carbs = num(f.carbs), fat = num(f.fat);
    const kcal = num(f.kcal) || protein * 4 + carbs * 4 + fat * 9;
    // Post one signal per macro, remembering which kinds already landed
    // (loggedKinds) so a retry after a partial network failure re-sends ONLY the
    // failed kinds and never double-logs. Reset once the whole meal is in.
    const jobs = ([["energyIntake", kcal, "kcal"], ["protein", protein, "g"], ["carbs", carbs, "g"], ["fat", fat, "g"]] as [string, number, string][])
      .filter(([kind, value]) => value > 0 && !loggedKinds.current.has(kind));
    if (!jobs.length) { setSaving(false); return; }
    try {
      for (const [kind, value, unit] of jobs) {
        const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value, unit, source: "manual" }) });
        if (res.status === 401) { setError(t("w.recovery.nutrition.errSignIn")); setSaving(false); return; }
        if (!res.ok) { setError(`${t("w.recovery.nutrition.errSave")} ${kind} (HTTP ${res.status}).`); setSaving(false); return; }
        loggedKinds.current.add(kind);
      }
      setF({ kcal: "", protein: "", carbs: "", fat: "" });
      setMealMsg(`+${Math.round(kcal)} kcal`);
      loggedKinds.current = new Set();
      await load(); revalidate.recovery();
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
    setSaving(false);
  };

  // Premade meal → one POST per macro (the SAME signal kinds as the manual add).
  // Free users can't log presets (canSaveMealsAndProducts === Full) — tapping a
  // locked tile routes to the upgrade screen instead.
  const logPreset = async (p: MealPreset) => {
    if (!full) { onNavigate?.("upgrade"); return; }
    setError(""); setMealMsg("");
    try {
      for (const s of mealPresetSignals(p)) {
        const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: s.kind, value: s.value, unit: s.unit, source: "preset" }) });
        if (res.status === 401) { setError(t("w.recovery.nutrition.errSignIn")); return; }
        if (!res.ok) { setError(`${t("w.recovery.nutrition.errSave")} (HTTP ${res.status}).`); return; }
      }
      setMealMsg(`${t(p.labelKey).split(/ [·–] /)[0]} +${p.kcal} kcal`);
      await load(); revalidate.recovery();
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

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, flex: "1 1 70px", minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 12px", outline: "none", textAlign: "center" as const };

  // The Today "Nutrition" sheet — a focused Add-a-meal, not the whole tracker.
  if (compact) {
    return (
      <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22 }}>{t("w.recovery.nutrition.addMealTitle")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 4 }}>{Math.round(today.kcal)} / {targets.kcal} {t("w.recovery.nutrition.kcalToday")}</div>

        <CDivider label={t("w.recovery.nutrition.logManuallyFree")} tier={t("w.account.settings.free")} />
        {/* Quadrant — kcal + protein + carbs + fat, one unified entry */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          {([
            { k: "kcal", label: t("w.recovery.nutrition.tabCalories"), unit: "kcal", color: C("chalk"), max: 1000 },
            { k: "protein", label: t("w.recovery.nutrition.protein"), unit: "g", color: C("chalk"), max: 60 },
            { k: "carbs", label: t("w.recovery.nutrition.carbs"), unit: "g", color: C("chalk"), max: 120 },
            { k: "fat", label: t("w.recovery.nutrition.fat"), unit: "g", color: C("chalk"), max: 50 },
          ] as const).map((tile) => {
            const raw = f[tile.k];
            return (
              <div key={tile.k} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "11px 13px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: tile.color }} />{tile.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                  <input value={raw} onChange={(e) => setF((s) => ({ ...s, [tile.k]: e.target.value }))} inputMode="numeric" placeholder="0" aria-label={tile.label} style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", padding: 0 }} />
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, marginTop: 12 }}>
          <button onClick={add} disabled={saving} style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "14px 12px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}><span aria-hidden style={{ fontSize: 17, fontWeight: 500 }}>＋</span>{saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.addMeal")}</button>
          <button onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: `1px solid color-mix(in srgb, var(--premium-accent) 55%, transparent)`, borderRadius: 999, padding: "14px 12px", cursor: scanning ? "default" : "pointer", color: C("chalk"), fontWeight: 700, fontSize: fs.caption, fontFamily: "var(--font-display)", opacity: scanning ? 0.6 : 1 }}>
            <span aria-hidden style={{ color: "var(--premium-accent-text)", fontSize: 12 }}>✦</span>
            {scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}
            {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase", border: `1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)`, color: "var(--premium-accent-text)", borderRadius: 999, padding: "2px 6px" }}>{t("w.account.settings.full")}</span>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ""; }} />
        {mealMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}>✓ {mealMsg}</div>}
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 10 }}>{error}</div>}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <button key={p.id} onClick={() => logPreset(p)} style={{ textAlign: "left", background: full ? C("ink2") : `color-mix(in srgb, var(--premium-accent) 10%, ${C("ink2")})`, border: `1px solid ${full ? C("line") : `color-mix(in srgb, var(--premium-accent) 30%, transparent)`}`, borderRadius: 16, padding: 14, cursor: "pointer", color: C("chalk"), opacity: full ? 1 : 0.92 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                {!full && <span style={{ fontSize: 12 }}>🔒</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: fs.body, marginTop: 8 }}>{t(p.labelKey).split(/ [·–] /)[0]}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 3 }}>~{p.kcal} kcal</div>
            </button>
          ))}
        </div>

        {onNavigate && (
          <button onClick={() => onNavigate("nutrition")} style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.recovery.nutrition.fullTracker")} →</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          {personalized && greeting && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".14em", textTransform: "uppercase", color: C("ash"), marginBottom: 2 }}>{greeting}</div>}
          <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.nutrition.title")}</h1>
        </div>
        <AuroraIcon name="heart" size={22} color={C("lime")} />
      </div>

      {/* Established users keep the compact goal segment; first-run users get the
          guided goal picker (onboarding) in the not-personalized branch below. */}
      {personalized && (
        <div style={{ display: "flex", gap: space.xxs, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4, marginTop: 16 }}>
          {GOALS.map((g) => {
            const on = goal === g.id;
            return <button key={g.id} onClick={() => setGoal(g.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.body, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{t(g.label)}</button>;
          })}
        </div>
      )}

      {coachDiet?.diet && (
        <div style={{ ...card, marginTop: 16, }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} ({t("w.recovery.nutrition.readOnly")})
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, "kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <div key={label}>
                  <div style={{ fontWeight: 800, fontSize: fs.heading }}>{val}{unit === "g" ? "g" : ""}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{t(label)}{unit === "kcal" ? " (kcal)" : ""}</div>
                </div>
              ) : null),
            )}
          </div>
          {coachDiet.diet.note && <p style={{ fontSize: fs.body, lineHeight: 1.5, marginTop: 10, color: C("chalk") }}>{coachDiet.diet.note}</p>}
        </div>
      )}

      {personalized ? (
        <>
          {/* Ring calories HERO (07/08) — the app's tick-ring idiom carries the
              calorie budget; a macro trio reads P/C/F beneath it. */}
          <div style={{ ...card, marginTop: 16, textAlign: "center", padding: "22px 18px 18px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".14em", color: C("lime") }}>{t("w.recovery.nutrition.calories")}</div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Ring value={targets.kcal > 0 ? (today.kcal / targets.kcal) * 100 : 0} color={today.kcal > targets.kcal * 1.05 ? C("red") : C("lime")} size={168} ticks={44} center={
                <span style={{ display: "block", textAlign: "center" }}>
                  <span style={{ display: "block", fontWeight: 900, fontSize: 38, letterSpacing: "-.03em", lineHeight: 1 }}>{Math.round(today.kcal)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.ofKcal").replace("{n}", String(targets.kcal))}</span>
                </span>
              } />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, padding: "0 6px" }}>
              {([["w.recovery.nutrition.protein", today.protein, targets.protein, C("blue"), "var(--blue-text)"], ["w.recovery.nutrition.carbs", today.carbs, targets.carbs, C("amber"), "var(--amber-text)"], ["w.recovery.nutrition.fat", today.fat, targets.fat, C("violet"), "var(--violet-text)"]] as const).map(([label, cur, tgt, col, colT]) => (
                <div key={label} style={{ flex: 1, maxWidth: 92 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: colT }}>{t(label)}</div>
                  <div style={{ fontWeight: 900, fontSize: 17, marginTop: 3 }}>{Math.round(cur)}<span style={{ fontSize: 10, color: C("ash"), fontWeight: 400 }}>/{tgt}g</span></div>
                  <div style={{ height: 5, borderRadius: 3, background: C("ink"), overflow: "hidden", marginTop: 5 }}><div style={{ width: `${Math.min(100, tgt > 0 ? (cur / tgt) * 100 : 0)}%`, height: "100%", background: col }} /></div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 14 }}>
              {t("w.recovery.nutrition.maintenance")} ≈ {maint.kcal} kcal{maint.weightChangeKg != null ? ` – ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
            </div>
          </div>
          <NutritionNudgeCard nudge={nudge} />
          {/* Quick-action tiles (07) — Add / Scan / Meals. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
            {([[t("w.recovery.nutrition.add"), "＋", C("lime"), () => scrollTo(addRef)], [t("w.recovery.nutrition.scanLabel"), "✦", "var(--premium-accent-text)", () => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))], [t("w.recovery.nutrition.yourMeals"), "🍽️", C("chalk"), () => scrollTo(mealsRef)]] as const).map(([label, glyph, col, onClick]) => (
              <button key={label} onClick={onClick} style={{ ...card, marginTop: 0, padding: "14px 8px", textAlign: "center", cursor: "pointer", color: C("chalk") }}>
                <div style={{ fontSize: 19, color: col }}>{glyph}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 7 }}>{label}</div>
              </button>
            ))}
          </div>
          <SummaryDashboard summary={summary} window={summaryWindow} onWindow={setSummaryWindow} goal={goal} weightChangeKg={maint.weightChangeKg} onUpgrade={() => onNavigate?.("upgrade")} full={full} />
        </>
      ) : (
        <OnboardingGoal goal={goal} setGoal={setGoal} onUpgrade={() => onNavigate?.("upgrade")} today={today} onWeighIn={logWeighIn} />
      )}

      {weight.points.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: fs.subtitle }}>{t("w.recovery.nutrition.bodyweightTrend")}</b>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: weight.ratePerWeek <= 0 ? C("lime") : C("amber") }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</span>
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
      )}

      <div ref={addRef} style={{ ...card, marginTop: 16, scrollMarginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
          <AuroraIcon name="add" size={20} color={C("lime")} />
          <b style={{ fontSize: fs.note }}>{t("w.recovery.nutrition.addToToday")}</b>
        </div>
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
          <input value={f.kcal} onChange={(e) => setF((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
          <input value={f.protein} onChange={(e) => setF((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.proteinPh")} style={numField} />
          <input value={f.carbs} onChange={(e) => setF((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.carbsPh")} style={numField} />
          <input value={f.fat} onChange={(e) => setF((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.fatPh")} style={numField} />
        </div>
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{error}</div>}
        <button onClick={add} disabled={saving} style={{ width: "100%", fontWeight: 700, fontSize: fs.subtitle, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 15, marginTop: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")}
        </button>
        {/* QUICK MEALS — one-tap premade meals. Full users log a meal on tap;
            free users see the tiles LOCKED and tapping routes to upgrade (manual
            macro entry above stays free for everyone). */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${C("line")}`, paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.recovery.nutrition.quickMeals")}</div>
            {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--premium-accent-text)", background: `color-mix(in srgb, var(--premium-accent) 16%, transparent)`, borderRadius: 999, padding: "3px 9px" }}>✦ Full</span>}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{full ? t("w.recovery.nutrition.quickMealsSub") : t("w.recovery.nutrition.quickMealsLocked")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            {MEAL_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => logPreset(p)}
                aria-label={t(p.labelKey)}
                style={{ position: "relative", display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", textAlign: "left", padding: 14, borderRadius: 15, cursor: "pointer", color: C("chalk"), background: full ? C("ink") : `linear-gradient(135deg, color-mix(in srgb, var(--premium-accent) 12%, ${C("ink")}), ${C("ink")})`, border: `1px solid ${full ? C("line") : `color-mix(in srgb, var(--premium-accent) 30%, ${C("line")})`}`, opacity: full ? 1 : 0.82 }}
              >
                {!full && <span style={{ position: "absolute", top: 10, right: 11, fontSize: 12, color: "var(--premium-accent-text)" }}>🔒</span>}
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: fs.body, lineHeight: 1.2 }}>{t(p.labelKey).split(/ [·–] /)[0]}</span>
                {t(p.labelKey).split(/ [·–] /)[1] && <span style={{ fontSize: fs.caption, color: C("ash"), lineHeight: 1.2 }}>{t(p.labelKey).split(/ [·–] /)[1]}</span>}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{p.kcal} kcal ({p.protein}p {p.carbs}c {p.fat}f)</span>
              </button>
            ))}
          </div>
          {mealMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}>✓ {t("w.recovery.nutrition.mealLogged")} — {mealMsg}</div>}
        </div>
      </div>

      {/* YOUR MEALS — the user's own saved-meal library (build + save + one-tap
          log). Free users keep up to FREE_MEAL_LIMIT; the "Save" CTA routes to
          upgrade once a free user is at the cap. */}
      <div ref={mealsRef} style={{ ...card, marginTop: 16, scrollMarginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <b style={{ fontSize: fs.note }}>{t("w.recovery.nutrition.yourMeals")}</b>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{full ? t("w.recovery.nutrition.unlimited") : `${meals.length} / ${FREE_MEAL_LIMIT}`}</span>
        </div>
        {meals.length === 0 && !showMealBuilder && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5 }}>{t("w.recovery.nutrition.yourMealsEmpty")}</div>
        )}
        {meals.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            {meals.map((m) => (
              <div key={m.id} style={{ position: "relative", background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 15, padding: 13 }}>
                <button onClick={() => deleteMeal(m.id)} aria-label={t("w.recovery.nutrition.deleteMeal")} style={{ position: "absolute", top: 8, right: 9, background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
                <div style={{ fontSize: 20 }}>{m.emoji ?? "🍽️"}</div>
                <div style={{ fontWeight: 700, fontSize: fs.body, marginTop: 6, paddingRight: 12, lineHeight: 1.2 }}>{m.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 3 }}>{m.kcal} kcal ({m.protein}p {m.carbs}c {m.fat}f)</div>
                <button onClick={() => logMeal(m)} style={{ width: "100%", marginTop: 10, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "8px 0", cursor: "pointer" }}>+ {t("w.recovery.nutrition.log")}</button>
              </div>
            ))}
          </div>
        )}
        {showMealBuilder ? (
          <div style={{ marginTop: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={mealForm.emoji} onChange={(e) => setMealForm((s) => ({ ...s, emoji: [...e.target.value][0] ?? "" }))} aria-label="emoji" style={{ ...numField, flex: "0 0 46px", fontSize: 20 }} />
              <input value={mealForm.name} onChange={(e) => setMealForm((s) => ({ ...s, name: e.target.value }))} placeholder={t("w.recovery.nutrition.mealNameHint")} aria-label={t("w.recovery.nutrition.mealName")} style={{ ...numField, flex: 1, textAlign: "left", fontFamily: "var(--font-display)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={mealForm.kcal} onChange={(e) => setMealForm((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
              <input value={mealForm.protein} onChange={(e) => setMealForm((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.proteinPh")} style={numField} />
              <input value={mealForm.carbs} onChange={(e) => setMealForm((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.carbsPh")} style={numField} />
              <input value={mealForm.fat} onChange={(e) => setMealForm((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.fatPh")} style={numField} />
            </div>
            {libMsg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{libMsg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setShowMealBuilder(false); setLibMsg(""); }} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.cancel")}</button>
              <button onClick={saveMeal} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.saveMeal")}</button>
            </div>
          </div>
        ) : canSaveAnotherMeal ? (
          <button onClick={() => setShowMealBuilder(true)} style={{ width: "100%", marginTop: 12, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>＋ {t("w.recovery.nutrition.createMeal")}</button>
        ) : (
          <button onClick={() => onNavigate?.("upgrade")} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: `color-mix(in srgb, var(--premium-accent) 12%, transparent)`, color: "var(--premium-accent-text)", border: `1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            <span aria-hidden>✦</span>{t("w.recovery.nutrition.unlockMoreMeals")}
          </button>
        )}
      </div>

      {/* YOUR PRODUCTS — a custom food library (Full). Free users see the
          upsell; Full users add foods with per-serving macros and tap one to
          drop its macros into the meal builder. The live food DB / barcode is
          the separate blocked nutrition-fooddb layer. */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <b style={{ fontSize: fs.note }}>{t("w.recovery.nutrition.yourProducts")}</b>
          {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--premium-accent-text)", background: `color-mix(in srgb, var(--premium-accent) 16%, transparent)`, borderRadius: 999, padding: "3px 9px" }}>✦ Full</span>}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{full ? t("w.recovery.nutrition.yourProductsSub") : t("w.recovery.nutrition.yourProductsLocked")}</div>
        {full && products.length > 3 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "9px 12px" }}>
            <span aria-hidden style={{ color: C("ash") }}>🔍</span>
            <input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder={t("w.recovery.nutrition.searchProducts")} aria-label={t("w.recovery.nutrition.searchProducts")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.caption }} />
          </div>
        )}
        {full && products.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {products.filter((p) => !prodSearch.trim() || p.name.toLowerCase().includes(prodSearch.trim().toLowerCase())).map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: fs.body }}>{p.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{p.servingLabel} — {p.kcal} kcal · {p.protein}p {p.carbs}c {p.fat}f</div>
                </div>
                <button onClick={() => addProductToMeal(p)} aria-label={t("w.recovery.nutrition.addToMeal")} style={{ flex: "none", width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C("lime")}`, background: "transparent", color: "var(--lime-text)", fontWeight: 800, cursor: "pointer" }}>+</button>
                <button onClick={() => deleteProduct(p.id)} aria-label={t("w.recovery.nutrition.deleteProduct")} style={{ flex: "none", background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        )}
        {full && showProdBuilder && (
          <div style={{ marginTop: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 14 }}>
            <input value={prodForm.name} onChange={(e) => setProdForm((s) => ({ ...s, name: e.target.value }))} placeholder={t("w.recovery.nutrition.productNamePh")} aria-label={t("w.recovery.nutrition.productName")} style={{ ...numField, width: "100%", textAlign: "left", fontFamily: "var(--font-display)" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={prodForm.serving} onChange={(e) => setProdForm((s) => ({ ...s, serving: e.target.value }))} placeholder={t("w.recovery.nutrition.servingPh")} style={{ ...numField, fontFamily: "var(--font-display)" }} />
              <input value={prodForm.kcal} onChange={(e) => setProdForm((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
              <input value={prodForm.protein} onChange={(e) => setProdForm((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.proteinPh")} style={numField} />
              <input value={prodForm.carbs} onChange={(e) => setProdForm((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.carbsPh")} style={numField} />
              <input value={prodForm.fat} onChange={(e) => setProdForm((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder={t("w.recovery.nutrition.fatPh")} style={numField} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <button onClick={() => setShowProdBuilder(false)} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.cancel")}</button>
              <button onClick={saveProduct} style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 12, cursor: "pointer" }}>{t("w.recovery.nutrition.saveProduct")}</button>
            </div>
          </div>
        )}
        {!showProdBuilder && (
          <button onClick={() => (full ? setShowProdBuilder(true) : onNavigate?.("upgrade"))} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, background: "transparent", color: full ? "var(--lime-text)" : "var(--premium-accent-text)", border: `1px solid ${full ? C("lime") : `color-mix(in srgb, var(--premium-accent) 45%, transparent)`}`, borderRadius: 999, padding: 12, cursor: "pointer" }}>
            {!full && <span aria-hidden>✦</span>}＋ {t("w.recovery.nutrition.addProduct")}
          </button>
        )}
      </div>

      <div style={{ ...card, marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.recentDays")}</div>
        {/* Streak week strip (07) — last 7 calendar days, lit when intake was logged. */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 12 }}>
          {week.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1 }}>
              <div style={{ width: "100%", maxWidth: 26, aspectRatio: "1", borderRadius: 8, background: d.on ? C("lime") : C("ink"), border: `1px solid ${d.on ? C("lime") : C("line")}`, display: "flex", alignItems: "center", justifyContent: "center", color: C("ink"), fontWeight: 800, fontSize: 12 }}>{d.on ? "✓" : ""}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: C("ash") }}>{d.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          {recent.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.recovery.nutrition.recentEmpty")}</div>
          ) : recent.map((d, i) => (
            <div key={d.date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: space.sm, padding: "8px 0", borderTop: i ? `1px solid ${C("line")}` : "none", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
              <span>{d.date.slice(5)}</span><span>{Math.round(d.kcal)} kcal</span>
              <span style={{ color: C("ash") }}>{Math.round(d.protein)}p {Math.round(d.carbs)}c {Math.round(d.fat)}f</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A labelled hairline divider ("──── LOG MANUALLY [FREE] ────") for the compact
// Add-a-meal sheet.
function CDivider({ label, tier, premium }: { label: string; tier?: string; premium?: boolean }) {
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" }}>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em", color: C("ash") }}>{label}</span>
        {tier && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, border: `1px solid ${premium ? `color-mix(in srgb, var(--premium-accent) 45%, transparent)` : C("line")}`, color: premium ? "var(--premium-accent-text)" : C("ash") }}>{tier}</span>}
      </span>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
    </div>
  );
}


// The coach-voiced "what now?" line (07) — one nudge under the calories hero.
function NutritionNudgeCard({ nudge }: { nudge: NutritionNudge }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const text =
    nudge.kind === "cold-start" ? t("w.recovery.nutrition.nudgeColdStart")
    : nudge.kind === "protein" ? `${nudge.gap}${t("w.recovery.nutrition.nudgeProteinSuffix")}`
    : nudge.kind === "calories-left" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeCalSuffix")}`
    : nudge.kind === "over" ? `${nudge.gap} ${t("w.recovery.nutrition.nudgeOverSuffix")}`
    : t("w.recovery.nutrition.nudgeOnTrack");
  const accent = nudge.kind === "over" ? C("red") : nudge.kind === "on-track" ? C("lime") : C("blue");
  const emoji = nudge.kind === "over" ? "⚠️" : nudge.kind === "on-track" ? "✓" : nudge.kind === "protein" ? "⚡" : "💬";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", background: C("ink2"), border: `1px solid ${C("line")}`, borderLeft: `3px solid ${accent}`, borderRadius: 20, boxShadow: "var(--shadow-card)", padding: 14, marginTop: 12 }}>
      <span aria-hidden style={{ fontSize: 18, color: accent }}>{emoji}</span>
      <div style={{ fontSize: fs.body, lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}

// The app's tick-RING (mirrors the mobile kit Ring + web Today ring) — a lit-tick
// dial with a number in the middle, so the calorie budget reads at a glance.
function Ring({ value, color, size = 44, ticks = 32, center }: { value: number; color: string; size?: number; ticks?: number; center?: React.ReactNode }) {
  const C = (v: string) => `var(--color-${v})`;
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.max(4, Math.round(size * 0.16));
  const tickW = Math.max(2, Math.round(size * 0.045));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <span key={i} style={{ position: "absolute", top: 0, left: "50%", width: tickW, height: size / 2, transformOrigin: "bottom center", transform: `translateX(-50%) rotate(${(i / ticks) * 360}deg)` }}>
          <span style={{ display: "block", width: tickW, height: tickLen, borderRadius: tickW, background: i < lit ? color : C("line") }} />
        </span>
      ))}
      <span style={{ position: "relative" }}>{center}</span>
    </div>
  );
}

// The SUMMARY dashboard (08) — goal progress, week/month stat tiles, macro
// balance and (for free users) the deep-insights ✦ Full lock.
function SummaryDashboard({ summary, window, onWindow, goal, weightChangeKg, onUpgrade, full }: { summary: NutritionSummary; window: 7 | 30; onWindow: (w: 7 | 30) => void; goal: NutritionGoal; weightChangeKg: number | null; onUpgrade: () => void; full: boolean }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const goalLabel = t(goal === "lose" ? "w.recovery.nutrition.goalLose" : goal === "gain" ? "w.recovery.nutrition.goalGain" : "w.recovery.nutrition.goalMaintain");
  const seg = (w: 7 | 30, label: string) => (
    <button onClick={() => onWindow(w)} style={{ flex: 1, padding: "7px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.caption, background: window === w ? C("lime") : "transparent", color: window === w ? C("ink") : C("ash") }}>{label}</button>
  );
  const tiles: [string, string, string, string][] = [
    [t("w.recovery.nutrition.avgIntake"), summary.avgKcal != null ? String(summary.avgKcal) : "—", t("w.recovery.nutrition.perDay"), C("lime")],
    [t("w.recovery.nutrition.adherence"), summary.adherencePct != null ? String(summary.adherencePct) : "—", t("w.recovery.nutrition.ofDays"), C("blue")],
    [t("w.recovery.nutrition.proteinHit"), `${summary.proteinHitDays}/${summary.loggedDays}`, t("w.recovery.nutrition.daysUnit"), C("amber")],
    [t("w.recovery.nutrition.protein"), summary.avgProtein != null ? `${summary.avgProtein}g` : "—", t("w.recovery.nutrition.perDay").replace("kcal", "avg"), C("violet")],
  ];
  return (
    <div style={{ ...cardStyle(C), marginTop: 16, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <b style={{ fontSize: fs.note }}>{t("w.recovery.nutrition.summary")}</b>
        <div style={{ display: "flex", gap: 3, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 3, width: 128 }}>
          {seg(7, t("w.recovery.nutrition.week"))}{seg(30, t("w.recovery.nutrition.month"))}
        </div>
      </div>
      {summary.loggedDays === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 12 }}>{t("w.recovery.nutrition.summaryEmpty")}</div>
      ) : (
        <>
          {/* Goal-progress strip (07) — the chosen goal + the measured 28-day
              weight change (the real signal we have; no invented target). */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 14px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("lime") }}>{t("w.recovery.nutrition.goalProgress")} — {goalLabel}</div>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", marginTop: 3 }}>{weightChangeKg != null ? `${weightChangeKg > 0 ? "+" : ""}${weightChangeKg.toFixed(1)} kg` : "—"}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.recovery.nutrition.per28d")}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            {tiles.map(([label, val, unit, col]) => (
              <div key={label} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 13 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: col }}>{label}</div>
                <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-.02em", marginTop: 5 }}>{val}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{unit}</div>
              </div>
            ))}
          </div>
          {summary.macroSplit && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), marginBottom: 9 }}>{t("w.recovery.nutrition.macroBalance")}</div>
              {([["w.recovery.nutrition.protein", summary.macroSplit.protein, C("blue")], ["w.recovery.nutrition.carbs", summary.macroSplit.carbs, C("amber")], ["w.recovery.nutrition.fat", summary.macroSplit.fat, C("violet")]] as const).map(([label, pct, col]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), width: 52 }}>{t(label)}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 4, background: C("ink2"), overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: col }} /></div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, width: 30, textAlign: "right" }}>{pct}%</span>
                </div>
              ))}
            </div>
          )}
          {!full && (
            <button onClick={onUpgrade} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, marginTop: 14, textAlign: "left", background: `color-mix(in srgb, var(--premium-accent) 10%, ${C("ink")})`, border: `1px solid color-mix(in srgb, var(--premium-accent) 32%, transparent)`, borderRadius: 16, padding: 13, cursor: "pointer", color: C("chalk") }}>
              <span aria-hidden style={{ color: "var(--premium-accent-text)", fontSize: 17 }}>✦</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: fs.body }}>{t("w.recovery.nutrition.deepInsights")}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{t("w.recovery.nutrition.deepInsightsSub")}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--premium-accent-text)", border: `1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)`, borderRadius: 999, padding: "3px 8px" }}>{t("w.account.settings.full")}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

// The guided 3-step onboarding (07): goal → activity + weigh-in → ✦ trial. A
// progress bar + Back/Continue drive the wizard; the weigh-in posts a real
// bodyMass signal so targets can personalize.
const ACTIVITY: { id: string; emoji: string; labelKey: string; subKey: string }[] = [
  { id: "light", emoji: "🚶", labelKey: "w.recovery.nutrition.actLight", subKey: "w.recovery.nutrition.actLightSub" },
  { id: "moderate", emoji: "🏃", labelKey: "w.recovery.nutrition.actModerate", subKey: "w.recovery.nutrition.actModerateSub" },
  { id: "high", emoji: "🔥", labelKey: "w.recovery.nutrition.actHigh", subKey: "w.recovery.nutrition.actHighSub" },
];
function OnboardingGoal({ goal, setGoal, onUpgrade, today, onWeighIn }: { goal: NutritionGoal; setGoal: (g: NutritionGoal) => void; onUpgrade: () => void; today: NutritionDay; onWeighIn: (kg: number) => void }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  const [step, setStep] = useState(0);
  const [activity, setActivity] = useState("moderate");
  const [weight, setWeight] = useState("");
  const field = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 12px", outline: "none", textAlign: "center" as const };
  const GOAL_OPTS: { id: NutritionGoal; emoji: string; label: string; sub: string }[] = [
    { id: "lose", emoji: "📉", label: t("w.recovery.nutrition.goalLose"), sub: t("w.recovery.nutrition.goalLoseSub") },
    { id: "maintain", emoji: "⚖️", label: t("w.recovery.nutrition.goalMaintain"), sub: t("w.recovery.nutrition.goalMaintainSub") },
    { id: "gain", emoji: "📈", label: t("w.recovery.nutrition.goalGain"), sub: t("w.recovery.nutrition.goalGainSub") },
  ];
  const choiceCard = (on: boolean, emoji: string, label: string, sub: string, onClick: () => void) => (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, textAlign: "left", background: C("ink2"), border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 20, boxShadow: on ? `0 0 0 1px ${C("lime")}, var(--shadow-card)` : "var(--shadow-card)", padding: 15, marginBottom: 10, cursor: "pointer", color: C("chalk") }}>
      <span style={{ fontSize: 23 }}>{emoji}</span>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: fs.bodyLg }}>{label}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{sub}</div></div>
      <span style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent" }} />
    </button>
  );
  const primary = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ width: "100%", fontWeight: 800, fontSize: fs.subtitle, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 14, marginTop: 6, cursor: "pointer" }}>{label}</button>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {step > 0 && <button onClick={() => setStep((s) => s - 1)} aria-label={t("w.recovery.nutrition.back")} style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${C("line")}`, background: "transparent", color: C("chalk"), cursor: "pointer" }}>←</button>}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".14em", textTransform: "uppercase", color: C("ash") }}>{t("w.recovery.nutrition.stepOf").replace("{n}", String(step + 1))}</div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C("ink"), overflow: "hidden", marginTop: 12 }}><div style={{ width: `${((step + 1) / 3) * 100}%`, height: "100%", background: C("lime"), transition: "width .3s" }} /></div>

      {step === 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 900, fontSize: fs.heading, letterSpacing: "-.02em" }}>{t("w.recovery.nutrition.pickGoal")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 5, marginBottom: 14 }}>{t("w.recovery.nutrition.pickGoalSub")}</div>
          {GOAL_OPTS.map((o) => choiceCard(goal === o.id, o.emoji, o.label, o.sub, () => setGoal(o.id)))}
          {primary(t("w.recovery.nutrition.continue"), () => setStep(1))}
        </div>
      )}

      {step === 1 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 900, fontSize: fs.heading, letterSpacing: "-.02em" }}>{t("w.recovery.nutrition.pickActivity")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 5, marginBottom: 14 }}>{t("w.recovery.nutrition.pickActivitySub")}</div>
          {ACTIVITY.map((a) => choiceCard(activity === a.id, a.emoji, t(a.labelKey), t(a.subKey), () => setActivity(a.id)))}
          <div style={{ ...cardStyle(C), padding: 15, marginTop: 4 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.recovery.nutrition.addWeighIn")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 5 }}>{t("w.recovery.nutrition.addWeighInSub")}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="kg" aria-label={t("w.recovery.nutrition.addWeighIn")} style={{ ...field, flex: 1 }} />
              <button onClick={() => { const kg = parseFloat(weight); if (Number.isFinite(kg) && kg > 0) onWeighIn(kg); }} style={{ fontWeight: 700, fontSize: fs.body, background: "transparent", color: "var(--lime-text)", border: `1px solid ${C("lime")}`, borderRadius: 14, padding: "0 18px", cursor: "pointer" }}>{t("w.recovery.nutrition.save")}</button>
            </div>
          </div>
          {primary(t("w.recovery.nutrition.continue"), () => setStep(2))}
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...cardStyle(C), padding: 20, textAlign: "center", background: `color-mix(in srgb, var(--premium-accent) 8%, ${C("ink2")})`, borderColor: `color-mix(in srgb, var(--premium-accent) 30%, ${C("line")})` }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--premium-accent-text)", background: `color-mix(in srgb, var(--premium-accent) 16%, transparent)`, borderRadius: 999, padding: "6px 13px" }}>✦ {t("w.account.settings.full")}</span>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", marginTop: 12 }}>{t("w.recovery.nutrition.trialTitle")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 8, lineHeight: 1.5 }}>{t("w.recovery.nutrition.trialSub")}</div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: "-.02em" }}>$9.99<span style={{ fontWeight: 400, fontSize: 13, color: C("ash") }}> {t("w.account.upgrade.per-month")}</span></div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)", marginTop: 3 }}>{t("w.recovery.nutrition.trialNote")}</div>
            </div>
            <button onClick={onUpgrade} style={{ width: "100%", fontWeight: 800, fontSize: fs.subtitle, color: "var(--premium-accent-ink)", background: "var(--premium-accent)", border: "none", borderRadius: 16, padding: 15, marginTop: 14, cursor: "pointer" }}>{t("w.recovery.nutrition.startTrial")} →</button>
          </div>
          <div style={{ ...cardStyle(C), padding: 15, marginTop: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.recovery.nutrition.todayVsTarget")}</div>
            <p style={{ fontSize: fs.body, lineHeight: 1.55, marginTop: 8 }}>{t("w.recovery.nutrition.adaptBody")}</p>
            <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
              {[[t("w.recovery.nutrition.loggedToday"), `${Math.round(today.kcal)} kcal`], [t("w.recovery.nutrition.protein"), `${Math.round(today.protein)}g`], [t("w.recovery.nutrition.carbs"), `${Math.round(today.carbs)}g`], [t("w.recovery.nutrition.fat"), `${Math.round(today.fat)}g`]].map(([l, v]) => (
                <div key={l}><div style={{ fontWeight: 900, fontSize: 17 }}>{v}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cardStyle(C: (v: string) => string) {
  return { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)" } as const;
}
