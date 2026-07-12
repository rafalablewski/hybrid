"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition, adaptiveTargets, estimateMaintenance, dailyNutrition, weightTrend,
  isFullAccess, MEAL_PRESETS, mealPresetSignals,
  type NutritionGoal, type Signal, type MealPreset,
} from "@hybrid/core";
import { fs, space, LINE_HEX, LIME_HEX, ASH, tip } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "w.recovery.nutrition.goalLose" }, { id: "maintain", label: "w.recovery.nutrition.goalMaintain" }, { id: "gain", label: "w.recovery.nutrition.goalGain" },
];
type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };

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
      setMealMsg(`${t(p.labelKey).split(" · ")[0]} +${p.kcal} kcal`);
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

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;
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
          <button onClick={() => (full ? fileRef.current?.click() : onNavigate?.("upgrade"))} disabled={scanning} style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: `1px solid color-mix(in srgb, ${C("violet")} 55%, transparent)`, borderRadius: 999, padding: "14px 12px", cursor: scanning ? "default" : "pointer", color: C("chalk"), fontWeight: 700, fontSize: fs.caption, fontFamily: "var(--font-display)", opacity: scanning ? 0.6 : 1 }}>
            <span aria-hidden style={{ color: "var(--violet-text)", fontSize: 12 }}>✦</span>
            {scanning ? t("w.recovery.nutrition.scanning") : t("w.recovery.nutrition.scanLabel")}
            {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase", border: `1px solid color-mix(in srgb, ${C("violet")} 40%, transparent)`, color: "var(--violet-text)", borderRadius: 999, padding: "2px 6px" }}>{t("w.account.settings.full")}</span>}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) scanFile(file); e.target.value = ""; }} />
        {mealMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}>✓ {mealMsg}</div>}
        {error && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 10 }}>{error}</div>}

        <CDivider label={t("w.recovery.nutrition.premadeMealsFull")} tier={t("w.account.settings.full")} premium />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {MEAL_PRESETS.map((p) => (
            <button key={p.id} onClick={() => logPreset(p)} style={{ textAlign: "left", background: full ? C("ink2") : `color-mix(in srgb, ${C("violet")} 10%, ${C("ink2")})`, border: `1px solid ${full ? C("line") : `color-mix(in srgb, ${C("violet")} 30%, transparent)`}`, borderRadius: 16, padding: 14, cursor: "pointer", color: C("chalk"), opacity: full ? 1 : 0.92 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                {!full && <span style={{ fontSize: 12 }}>🔒</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: fs.body, marginTop: 8 }}>{t(p.labelKey).split(" · ")[0]}</div>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>{t("w.recovery.nutrition.title")}</h1>
        <AuroraIcon name="heart" size={22} color={C("lime")} />
      </div>

      <div style={{ display: "flex", gap: space.xxs, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4, marginTop: 16 }}>
        {GOALS.map((g) => {
          const on = goal === g.id;
          return <button key={g.id} onClick={() => setGoal(g.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: fs.body, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{t(g.label)}</button>;
        })}
      </div>

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
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.recovery.nutrition.calories")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: space.sm, marginTop: 6 }}>
              <span style={{ fontWeight: 900, fontSize: 40 }}>{Math.round(today.kcal)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>/ {targets.kcal}</span>
            </div>
            <Bar cur={today.kcal} target={targets.kcal} color={C("lime")} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 10 }}>
              {t("w.recovery.nutrition.maintenance")} ≈ {maint.kcal} kcal, {targets.basis}{maint.weightChangeKg != null ? `, ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
            </div>
          </div>
          <MacroRow label="w.recovery.nutrition.protein" cur={today.protein} target={targets.protein} color={C("blue")} />
          <MacroRow label="w.recovery.nutrition.carbs" cur={today.carbs} target={targets.carbs} color={C("amber")} />
          <MacroRow label="w.recovery.nutrition.fat" cur={today.fat} target={targets.fat} color={C("violet")} />
        </>
      ) : (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.recovery.nutrition.todayVsTarget")}</div>
          <p style={{ fontSize: fs.bodyLg, lineHeight: 1.6, marginTop: 10 }}>{t("w.recovery.nutrition.adaptBody")}</p>
          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            {[[t("w.recovery.nutrition.loggedToday"), `${Math.round(today.kcal)} kcal`], [t("w.recovery.nutrition.protein"), `${Math.round(today.protein)}g`], [t("w.recovery.nutrition.carbs"), `${Math.round(today.carbs)}g`], [t("w.recovery.nutrition.fat"), `${Math.round(today.fat)}g`]].map(([l, v]) => (
              <div key={l}><div style={{ fontWeight: 900, fontSize: 17 }}>{v}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{l}</div></div>
            ))}
          </div>
        </div>
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

      <div style={{ ...card, marginTop: 16 }}>
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
            {!full && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--violet-text)", background: `color-mix(in srgb, ${C("violet")} 16%, transparent)`, borderRadius: 999, padding: "3px 9px" }}>✦ Full</span>}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{full ? t("w.recovery.nutrition.quickMealsSub") : t("w.recovery.nutrition.quickMealsLocked")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            {MEAL_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => logPreset(p)}
                aria-label={t(p.labelKey)}
                style={{ position: "relative", display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", textAlign: "left", padding: 14, borderRadius: 15, cursor: "pointer", color: C("chalk"), background: full ? C("ink") : `linear-gradient(135deg, color-mix(in srgb, ${C("violet")} 12%, ${C("ink")}), ${C("ink")})`, border: `1px solid ${full ? C("line") : `color-mix(in srgb, ${C("violet")} 30%, ${C("line")})`}`, opacity: full ? 1 : 0.82 }}
              >
                {!full && <span style={{ position: "absolute", top: 10, right: 11, fontSize: 12, color: "var(--violet-text)" }}>🔒</span>}
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: fs.body, lineHeight: 1.2 }}>{t(p.labelKey).split(" · ")[0]}</span>
                {t(p.labelKey).split(" · ")[1] && <span style={{ fontSize: fs.caption, color: C("ash"), lineHeight: 1.2 }}>{t(p.labelKey).split(" · ")[1]}</span>}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{p.kcal} kcal ({p.protein}p {p.carbs}c {p.fat}f)</span>
              </button>
            ))}
          </div>
          {mealMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", marginTop: 10 }}>✓ {t("w.recovery.nutrition.mealLogged")} — {mealMsg}</div>}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.recentDays")}</div>
        <div style={{ marginTop: 10 }}>
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
        {tier && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, border: `1px solid ${premium ? `color-mix(in srgb, ${C("violet")} 45%, transparent)` : C("line")}`, color: premium ? "var(--violet-text)" : C("ash") }}>{tier}</span>}
      </span>
      <span style={{ flex: 1, height: 1, background: C("line") }} />
    </div>
  );
}

function Bar({ cur, target, color }: { cur: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(1, cur / target) : 0;
  const over = cur > target * 1.05;
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--color-ink)", overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: over ? "var(--color-red)" : color }} />
    </div>
  );
}

function MacroRow({ label, cur, target, color }: { label: string; cur: number; target: number; color: string }) {
  const { t } = useLang();
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", alignItems: "center", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 16, marginTop: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{t(label)}</div>
        <Bar cur={cur} target={target} color={color} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginLeft: 14 }}>{Math.round(cur)}/{target}g</span>
    </div>
  );
}
