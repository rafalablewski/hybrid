"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition, adaptiveTargets, estimateMaintenance, dailyNutrition, weightTrend,
  type NutritionGoal, type Signal,
} from "@hybrid/core";
import { LINE, LIME, ASH, tip, txt } from "@/lib/ui";
import { AuroraIcon } from "./icons";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "Lose" }, { id: "maintain", label: "Maintain" }, { id: "gain", label: "Gain" },
];
type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };

/** AURORA Nutrition (web) — rounded macro tracker, same adaptive-targets engine
 *  + /api/signals logging + bodyweight trend as the classic. */
export default function AuroraNutrition() {
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
        if (res.status === 401) { setError("Sign in to log nutrition (demo mode doesn't persist)."); setSaving(false); return; }
        if (!res.ok) { setError(`Couldn't save ${kind} (HTTP ${res.status}).`); setSaving(false); return; }
      }
      if (any) { setF({ kcal: "", protein: "", carbs: "", fat: "" }); await load(); }
    } catch { setError("Network error — try again."); }
    setSaving(false);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: 14, width: "100%", boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "12px 12px", outline: "none", textAlign: "center" as const };

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Nutrition</h1>
        <AuroraIcon name="heart" size={22} color={C("lime")} />
      </div>

      <div style={{ display: "flex", gap: 4, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4, marginTop: 16 }}>
        {GOALS.map((g) => {
          const on = goal === g.id;
          return <button key={g.id} onClick={() => setGoal(g.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: on ? C("lime") : "transparent", color: on ? C("ink") : C("ash") }}>{g.label}</button>;
        })}
      </div>

      {coachDiet?.diet && (
        <div style={{ ...card, marginTop: 16, }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("violet") }}>
            Assigned by {coachDiet.coachName ?? "your coach"} · read-only
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}>
            {([["Energy", coachDiet.diet.kcal, "kcal"], ["Protein", coachDiet.diet.protein, "g"], ["Carbs", coachDiet.diet.carbs, "g"], ["Fat", coachDiet.diet.fat, "g"]] as const).map(
              ([label, val, unit]) => (val != null ? (
                <div key={label}>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{val}{unit === "g" ? "g" : ""}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: C("ash") }}>{label}{unit === "kcal" ? " · kcal" : ""}</div>
                </div>
              ) : null),
            )}
          </div>
          {coachDiet.diet.note && <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10, color: C("chalk") }}>{coachDiet.diet.note}</p>}
        </div>
      )}

      {personalized ? (
        <>
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>Calories</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
              <span style={{ fontWeight: 900, fontSize: 40 }}>{Math.round(today.kcal)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash") }}>/ {targets.kcal}</span>
            </div>
            <Bar cur={today.kcal} target={targets.kcal} color={C("lime")} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 10 }}>
              Maintenance ≈ {maint.kcal} kcal · {targets.basis}{maint.weightChangeKg != null ? ` · weight trend ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
            </div>
          </div>
          <MacroRow label="Protein" cur={today.protein} target={targets.protein} color={C("blue")} />
          <MacroRow label="Carbs" cur={today.carbs} target={targets.carbs} color={C("amber")} />
          <MacroRow label="Fat" cur={today.fat} target={targets.fat} color={C("violet")} />
        </>
      ) : (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>Today vs adaptive target</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>Your targets adapt to you — add a weigh-in (in a weekly check-in) and log a few days of intake, and we&apos;ll estimate your maintenance and set goal-aware macros.</p>
          <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
            {[["Logged today", `${Math.round(today.kcal)} kcal`], ["Protein", `${Math.round(today.protein)}g`], ["Carbs", `${Math.round(today.carbs)}g`], ["Fat", `${Math.round(today.fat)}g`]].map(([l, v]) => (
              <div key={l}><div style={{ fontWeight: 900, fontSize: 17 }}>{v}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>{l}</div></div>
            ))}
          </div>
        </div>
      )}

      {weight.points.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 16 }}>Bodyweight trend</b>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: weight.ratePerWeek <= 0 ? C("lime") : C("amber") }}>{weight.ratePerWeek > 0 ? "+" : ""}{weight.ratePerWeek} kg/wk</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weight.points} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis unit="kg" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [`${v} kg`, n === "smoothed" ? "trend" : "raw"]} />
                <Line type="monotone" dataKey="raw" stroke={ASH} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="smoothed" stroke={LIME} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AuroraIcon name="add" size={20} color={C("violet")} />
          <b style={{ fontSize: 15 }}>Add to today</b>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={f.kcal} onChange={(e) => setF((s) => ({ ...s, kcal: e.target.value }))} inputMode="numeric" placeholder="kcal" style={numField} />
          <input value={f.protein} onChange={(e) => setF((s) => ({ ...s, protein: e.target.value }))} inputMode="numeric" placeholder="protein" style={numField} />
          <input value={f.carbs} onChange={(e) => setF((s) => ({ ...s, carbs: e.target.value }))} inputMode="numeric" placeholder="carbs" style={numField} />
          <input value={f.fat} onChange={(e) => setF((s) => ({ ...s, fat: e.target.value }))} inputMode="numeric" placeholder="fat" style={numField} />
        </div>
        {error && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("red"), marginTop: 8 }}>{error}</div>}
        <button onClick={add} disabled={saving} style={{ width: "100%", fontWeight: 700, fontSize: 16, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: 15, marginTop: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Adding…" : "Add"}
        </button>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 10, lineHeight: 1.5 }}>
          Food search + barcode is a separate, blocked layer (needs a food-DB partner) — see Capabilities.
        </div>
      </div>

      <div style={{ ...card, marginTop: 16, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue") }}>Recent days</div>
        <div style={{ marginTop: 10 }}>
          {recent.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C("ash") }}>Nothing logged yet — add today&apos;s macros above.</div>
          ) : recent.map((d, i) => (
            <div key={d.date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8, padding: "8px 0", borderTop: i ? `1px solid ${C("line")}` : "none", fontFamily: "var(--font-mono)", fontSize: 13 }}>
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
  const C = (v: string) => `var(--color-${v})`;
  return (
    <div style={{ display: "flex", alignItems: "center", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 16, marginTop: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        <Bar cur={cur} target={target} color={color} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginLeft: 14 }}>{Math.round(cur)}/{target}g</span>
    </div>
  );
}
