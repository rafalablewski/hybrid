"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition, adaptiveTargets, estimateMaintenance, dailyNutrition, weightTrend,
  isFullAccess,
  type NutritionGoal, type Signal,
} from "@hybrid/core";
import { fs, space, LINE, LIME, LIME_HEX, ASH, tip, txt } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "w.recovery.nutrition.goalLose" }, { id: "maintain", label: "w.recovery.nutrition.goalMaintain" }, { id: "gain", label: "w.recovery.nutrition.goalGain" },
];
type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };

/** AURORA Nutrition (web) — rounded macro tracker, same adaptive-targets engine
 *  + /api/signals logging + bodyweight trend as the classic. */
export default function AuroraNutrition({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const revalidate = useRevalidate();
  const { t } = useLang();
  // Free (casual) users log macros manually; scanning a label and saving
  // meals/products is a Full feature (see canScanFoodLabel / canSaveMealsAndProducts).
  const full = isFullAccess(usePersona());
  const [signals, setSignals] = useState<Signal[]>([]);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    setSaving(true); setError("");
    const entries: [string, string, string][] = [["energyIntake", f.kcal, "kcal"], ["protein", f.protein, "g"], ["carbs", f.carbs, "g"], ["fat", f.fat, "g"]];
    try {
      let any = false;
      for (const [kind, v, unit] of entries) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        any = true;
        const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value: n, unit, source: "manual" }) });
        if (res.status === 401) { setError(t("w.recovery.nutrition.errSignIn")); setSaving(false); return; }
        if (!res.ok) { setError(`${t("w.recovery.nutrition.errSave")} ${kind} (HTTP ${res.status}).`); setSaving(false); return; }
      }
      if (any) { setF({ kcal: "", protein: "", carbs: "", fat: "" }); await load(); revalidate.recovery(); }
    } catch { setError(t("w.recovery.nutrition.errNetwork")); }
    setSaving(false);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, flex: "1 1 70px", minWidth: 0, boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 12px", outline: "none", textAlign: "center" as const };

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
            {t("w.recovery.nutrition.assignedBy")} {coachDiet.coachName ?? t("w.recovery.nutrition.yourCoach")} · {t("w.recovery.nutrition.readOnly")}
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}>
            {([["w.recovery.nutrition.energy", coachDiet.diet.kcal, "kcal"], ["w.recovery.nutrition.protein", coachDiet.diet.protein, "g"], ["w.recovery.nutrition.carbs", coachDiet.diet.carbs, "g"], ["w.recovery.nutrition.fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <div key={label}>
                  <div style={{ fontWeight: 800, fontSize: fs.heading }}>{val}{unit === "g" ? "g" : ""}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{t(label)}{unit === "kcal" ? " · kcal" : ""}</div>
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
              {t("w.recovery.nutrition.maintenance")} ≈ {maint.kcal} kcal · {targets.basis}{maint.weightChangeKg != null ? ` · ${t("w.recovery.nutrition.weightTrendLc")} ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
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
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis unit="kg" tick={{ fill: ASH, fontSize: fs.micro }} stroke={LINE} domain={["dataMin - 1", "dataMax + 1"]} />
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
        <button onClick={add} disabled={saving} style={{ width: "100%", fontWeight: 700, fontSize: fs.subtitle, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: 15, marginTop: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? t("w.recovery.nutrition.adding") : t("w.recovery.nutrition.add")}
        </button>
        {full ? (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C("line")}`, paddingTop: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.recovery.nutrition.proTitle")}</div>
            <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap" }}>
              {[t("w.recovery.nutrition.proScan"), t("w.recovery.nutrition.proSaveMeals"), t("w.recovery.nutrition.proSaveProducts")].map((l) => (
                <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 12px" }}>{l}</span>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 10, lineHeight: 1.5 }}>{t("w.recovery.nutrition.proSoon")}</div>
          </div>
        ) : (
          <button onClick={() => onNavigate?.("upgrade")} style={{ width: "100%", textAlign: "left", marginTop: 12, cursor: "pointer", border: `1px solid ${C("lime")}`, background: "linear-gradient(135deg, rgba(199,239,0,.12), rgba(60,120,126,.05))", borderRadius: 16, padding: 14, color: C("chalk") }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: fs.body }}><span>🔒</span>{t("w.recovery.nutrition.proTitle")}</div>
            <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{t("w.recovery.nutrition.proBody")}</div>
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.caption, color: C("lime-t") }}>✦ {t("w.recovery.nutrition.proCta")} →</div>
          </button>
        )}
      </div>

      <div style={{ ...card, marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.recovery.nutrition.recentDays")}</div>
        <div style={{ marginTop: 10 }}>
          {recent.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.recovery.nutrition.recentEmpty")}</div>
          ) : recent.map((d, i) => (
            <div key={d.date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: space.sm, padding: "8px 0", borderTop: i ? `1px solid ${C("line")}` : "none", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
              <span>{d.date.slice(5)}</span><span>{Math.round(d.kcal)} kcal</span>
              <span style={{ color: C("ash") }}>{Math.round(d.protein)}p · {Math.round(d.carbs)}c · {Math.round(d.fat)}f</span>
            </div>
          ))}
        </div>
      </div>
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
