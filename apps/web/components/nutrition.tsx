"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  todayNutrition,
  adaptiveTargets,
  estimateMaintenance,
  dailyNutrition,
  weightTrend,
  type NutritionGoal,
  type Signal,
} from "@hybrid/core";
import {
  INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED,
  disp, cond, mono, tip, Mono, Card, ChartFrame, txt,
} from "@/lib/ui";

const GOALS: { id: NutritionGoal; label: string }[] = [
  { id: "lose", label: "Lose" },
  { id: "maintain", label: "Maintain" },
  { id: "gain", label: "Gain" },
];

type Row = { userId: string; kind: string; value: number; unit: string; source: string; ts: string };

export default function Nutrition() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [goal, setGoal] = useState<NutritionGoal>("maintain");
  const [f, setF] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) return setSignals([]);
      const data = (await res.json()) as { signals?: Row[] };
      setSignals((data.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind as Signal["kind"], value: s.value, unit: s.unit, source: s.source, ts: s.ts })));
    } catch {
      setSignals([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = useMemo(() => todayNutrition(signals), [signals]);
  const targets = useMemo(() => adaptiveTargets(signals, { goal }), [signals, goal]);
  const maint = useMemo(() => estimateMaintenance(signals, {}), [signals]);
  const recent = useMemo(() => dailyNutrition(signals).slice(0, 7), [signals]);
  const weight = useMemo(() => weightTrend(signals), [signals]);
  // Targets are only shown once we can estimate maintenance from the athlete's
  // own data (a weigh-in or enough intake history). Otherwise we'd be showing a
  // population default dressed up as a personal target — so we prompt instead.
  const personalized = maint.kcal != null;

  const add = async () => {
    setSaving(true);
    setError("");
    const entries: [string, string, string][] = [
      ["energyIntake", f.kcal, "kcal"],
      ["protein", f.protein, "g"],
      ["carbs", f.carbs, "g"],
      ["fat", f.fat, "g"],
    ];
    try {
      let any = false;
      for (const [kind, v, unit] of entries) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        any = true;
        const res = await fetch("/api/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, value: n, unit, source: "manual" }),
        });
        if (res.status === 401) { setError("Sign in to log nutrition (demo mode doesn't persist)."); setSaving(false); return; }
        if (!res.ok) { setError(`Couldn't save ${kind} (HTTP ${res.status}).`); setSaving(false); return; }
      }
      if (any) { setF({ kcal: "", protein: "", carbs: "", fat: "" }); await load(); }
    } catch {
      setError("Network error — try again.");
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      {/* goal */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Goal</Mono>
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGoal(g.id)}
            style={{ ...cond, fontSize: 13, fontWeight: 700, padding: "6px 16px", borderRadius: 999, cursor: "pointer", border: `1px solid ${goal === g.id ? LIME : LINE}`, background: goal === g.id ? `${LIME}1a` : "transparent", color: txt(goal === g.id ? LIME : ASH) }}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartFrame title="Today vs adaptive target" kicker="macros" c={LIME}>
          {personalized ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Bar label="Energy" cur={today.kcal} target={targets.kcal} unit="kcal" color={LIME} />
                <Bar label="Protein" cur={today.protein} target={targets.protein} unit="g" color={VIOLET} />
                <Bar label="Carbs" cur={today.carbs} target={targets.carbs} unit="g" color={BLUE} />
                <Bar label="Fat" cur={today.fat} target={targets.fat} unit="g" color={AMBER} />
              </div>
              <Mono s={{ fontSize: 11, display: "block", marginTop: 14, lineHeight: 1.5 }}>
                Maintenance ≈ {maint.kcal} kcal · {targets.basis}
                {maint.weightChangeKg != null ? ` · weight trend ${maint.weightChangeKg > 0 ? "+" : ""}${maint.weightChangeKg.toFixed(1)}kg/28d` : ""}
              </Mono>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>
                Your targets adapt to you — they&apos;re not pre-set. Add a weigh-in (in a weekly
                check-in) and log a few days of intake, and we&apos;ll estimate your maintenance from
                your own energy balance and set goal-aware macros.
              </Mono>
              <div style={{ display: "flex", gap: 18 }}>
                <Today2 label="Logged today" value={`${Math.round(today.kcal)} kcal`} />
                <Today2 label="Protein" value={`${Math.round(today.protein)}g`} />
                <Today2 label="Carbs" value={`${Math.round(today.carbs)}g`} />
                <Today2 label="Fat" value={`${Math.round(today.fat)}g`} />
              </div>
            </div>
          )}
        </ChartFrame>

        <ChartFrame title="Add to today" kicker="manual macros" c={VIOLET}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="kcal" value={f.kcal} onChange={(v) => setF((s) => ({ ...s, kcal: v }))} />
            <Field label="protein (g)" value={f.protein} onChange={(v) => setF((s) => ({ ...s, protein: v }))} />
            <Field label="carbs (g)" value={f.carbs} onChange={(v) => setF((s) => ({ ...s, carbs: v }))} />
            <Field label="fat (g)" value={f.fat} onChange={(v) => setF((s) => ({ ...s, fat: v }))} />
          </div>
          {error && <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={RED}>{error}</Mono>}
          <button
            onClick={add}
            disabled={saving}
            style={{ ...disp, fontWeight: 800, fontSize: 14, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 10, padding: "11px 22px", marginTop: 12, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add →"}
          </button>
          <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }}>
            Food search + barcode is a separate, blocked layer (needs a food-DB partner) — see Capabilities.
          </Mono>
        </ChartFrame>
      </div>

      {weight.points.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ChartFrame title="Bodyweight trend" kicker={`${weight.ratePerWeek > 0 ? "+" : ""}${weight.ratePerWeek} kg/wk`} c={weight.ratePerWeek <= 0 ? LIME : AMBER}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weight.points} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis unit="kg" tick={{ fill: ASH, fontSize: 11 }} stroke={LINE} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [`${v} kg`, n === "smoothed" ? "trend" : "raw"]} />
                <Line type="monotone" dataKey="raw" stroke={ASH} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="smoothed" stroke={LIME} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }}>
              <span style={{ color: txt(LIME) }}>—</span> trend (smoothed) · <span style={{ color: txt(ASH) }}>—</span> daily reading. Daily weight is noisy; the trend is the signal.
            </Mono>
          </ChartFrame>
        </div>
      )}

      <Card style={{ marginTop: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Recent days</Mono>
        <div style={{ marginTop: 10 }}>
          {recent.length === 0 ? (
            <Mono s={{ fontSize: 13 }}>Nothing logged yet — add today&apos;s macros above.</Mono>
          ) : (
            recent.map((d, i) => (
              <div key={d.date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8, padding: "8px 0", borderTop: i ? `1px solid ${LINE}` : "none", ...mono, fontSize: 13 }}>
                <span style={{ color: CHALK }}>{d.date.slice(5)}</span>
                <span style={{ color: CHALK }}>{Math.round(d.kcal)} kcal</span>
                <span style={{ color: txt(ASH) }}>{Math.round(d.protein)}p · {Math.round(d.carbs)}c · {Math.round(d.fat)}f</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Bar({ label, cur, target, unit, color }: { label: string; cur: number; target: number; unit: string; color: string }) {
  const pct = target > 0 ? Math.min(1, cur / target) : 0;
  const over = cur > target * 1.05;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <Mono s={{ fontSize: 12 }} c={CHALK}>{label}</Mono>
        <Mono s={{ fontSize: 12 }}>{Math.round(cur)} / {target} {unit}</Mono>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: INK2, overflow: "hidden" }}>
        <div style={{ width: `${pct * 100}%`, height: 8, background: over ? RED : color }} />
      </div>
    </div>
  );
}

function Today2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 18, color: CHALK }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{label}</Mono>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        style={{ ...mono, fontSize: 14, width: "100%", boxSizing: "border-box", background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", outline: "none" }}
      />
    </div>
  );
}
