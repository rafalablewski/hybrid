"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  weeklyVolumeTrend, weeklyMuscleSets, exerciseTable, volumeStatus, volumeAdvice, resolveLandmarks, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type TrendDir, type MuscleGroup, type ExerciseTableRow,
} from "@hybrid/core";
import { fs, space, LINE, LIME, ASH, BLUE, tip, mono } from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const C = (v: string) => `var(--color-${v})`;
const TREND_GLYPH: Record<TrendDir, { g: string; c: string }> = { up: { g: "▲", c: "lime" }, down: { g: "▼", c: "amber" }, flat: { g: "→", c: "ash" } };
const MUSCLE_LABEL: Record<string, string> = { quads: "Quads", glutes: "Glutes", posterior: "Posterior", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps" };
const PERIODS: { id: ExercisePeriod; label: string }[] = [{ id: "8w", label: "8 wk" }, { id: "6m", label: "6 mo" }, { id: "1y", label: "1 yr" }, { id: "all", label: "All" }];
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/** AURORA Trends (web) — full bespoke analytics hub reusing the exact engines +
 *  recharts volume/tonnage/muscle bars. */
export default function AuroraTrends({ sessions, onOpenExercise, onOpenVolume }: { sessions: LoggedSession[]; onOpenExercise?: (name: string) => void; onOpenVolume?: () => void }) {
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  const [selMuscle, setSelMuscle] = useState<MuscleGroup | null>(null);
  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume, units = prefs.units, fr = prefs.fractionalVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw), [sessions, iw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw), [sessions, period, iw]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const muscles = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const trained = muscles.some((m) => m.sets > 0);
  const focusMuscle = selMuscle ?? advice[0]?.muscle ?? [...muscles].sort((a, b) => b.sets - a.sets)[0]?.muscle ?? "chest";
  const muscleWeeks = useMemo(() => weeklyMuscleSets(sessions, focusMuscle, 8, Date.now(), iw, fr), [sessions, focusMuscle, iw, fr]);
  const sortedTable = useMemo(() => { const arr = [...table]; const { k, dir } = sort; arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number)))); return arr; }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const weekData = weeks.map((w) => ({ w: fmtWeek(w.weekStart), sets: w.sets, t: Number(((units === "kg" ? w.tonnage : kgToUnit(w.tonnage, "lb")) / 1000).toFixed(1)) }));
  const muscleZone = (z: string) => (z === "overreaching" ? "red" : z === "under" ? "amber" : z === "peak" ? "blue" : "lime");
  const frameHead = (color: string, kicker: string) => <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color), marginBottom: 10 }}>{kicker}</div>;

  if (!trained) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 16px" }}>Trends</h1>
        <div style={{ ...card, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>No strength training logged yet. Log some lifts and your volume trends, muscle breakdown and per-exercise analytics show up here.</span></div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg, maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0 }}>Trends</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: space.lg }}>
        <div style={card}>{frameHead("lime", "Weekly working sets · last 8 wk")}
          <ResponsiveContainer width="100%" height={200}><BarChart data={weekData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={32} /><Tooltip contentStyle={tip} formatter={(v) => `${v} sets`} /><Bar dataKey="sets" fill={LIME} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        <div style={card}>{frameHead("blue", `Weekly tonnage · ${units === "kg" ? "tonnes" : "k lb"}`)}
          <ResponsiveContainer width="100%" height={200}><BarChart data={weekData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={32} /><Tooltip contentStyle={tip} formatter={(v) => `${v} ${units === "kg" ? "t" : "k lb"}`} /><Bar dataKey="t" fill={BLUE} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue") }}>Muscle breakdown · this week</span>
          {onOpenVolume && <button onClick={onOpenVolume} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), background: "none", border: "none", cursor: "pointer" }}>Volume detail →</button>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 12 }}>
          {muscles.map((m) => { const c = C(muscleZone(m.zone)); const on = m.muscle === focusMuscle; return (
            <button key={m.muscle} onClick={() => setSelMuscle(m.muscle)} style={{ display: "flex", alignItems: "center", gap: space.xs, border: `1px solid ${on ? c : `color-mix(in srgb, ${c} 40%, transparent)`}`, background: `color-mix(in srgb, ${c} ${on ? 18 : 8}%, transparent)`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk") }}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 800, color: c }}>{m.sets}</span>
            </button>
          ); })}
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4, color: C("ash") }}>{MUSCLE_LABEL[focusMuscle] ?? focusMuscle} · weekly sets · 8 wk</div>
          <ResponsiveContainer width="100%" height={120}><BarChart data={muscleWeeks.map((s, i) => ({ w: fmtWeek(weeks[i]?.weekStart ?? ""), sets: s }))}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.nano }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.nano }} width={26} allowDecimals={false} /><Tooltip contentStyle={tip} formatter={(v) => `${v} sets`} /><Bar dataKey="sets" fill={BLUE} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        {advice.length > 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 10 }}>
            {advice.filter((a) => a.action === "add").length > 0 && `Add volume: ${advice.filter((a) => a.action === "add").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}. `}
            {advice.filter((a) => a.action === "reduce").length > 0 && `Ease off: ${advice.filter((a) => a.action === "reduce").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}.`}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.ms }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>Exercise analytics</span>
          <div style={{ display: "flex", gap: space.xxs }}>
            {PERIODS.map((p) => <button key={p.id} onClick={() => setPeriod(p.id)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "4px 12px", borderRadius: 999, cursor: "pointer", color: period === p.id ? C("ink") : C("ash"), background: period === p.id ? C("lime") : "transparent", border: `1px solid ${period === p.id ? C("lime") : C("line")}` }}>{p.label}</button>)}
          </div>
        </div>
        <div style={{ marginTop: 12, overflowX: "auto", maxWidth: "100%" }}>
          <div style={{ minWidth: 420 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: space.sm, paddingBottom: 6, borderBottom: `1px solid ${C("line")}` }}>
              {([["exercise", "name"], ["freq", "sessions"], ["best e1RM", "bestE1rm"], ["volume", "volume"], ["trend", null]] as const).map(([h, k]) => (
                <button key={h} disabled={!k} onClick={() => k && sortBy(k)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", textAlign: "left", background: "none", border: "none", padding: 0, cursor: k ? "pointer" : "default", color: k && sort.k === k ? C("lime") : C("ash") }}>{h}{k && sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
              ))}
            </div>
            {sortedTable.map((r) => { const tr = TREND_GLYPH[r.trend]; return (
              <button key={r.name} onClick={() => onOpenExercise?.(r.name)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: space.sm, padding: "9px 0", border: "none", borderTop: `1px solid ${C("line")}`, background: "none", cursor: onOpenExercise ? "pointer" : "default", textAlign: "left", width: "100%", fontFamily: "var(--font-mono)", fontSize: fs.body }}>
                <span style={{ color: onOpenExercise ? C("lime") : C("chalk") }}>{r.name}</span>
                <span>{r.sessions}×</span>
                <span style={{ color: r.kind === "strength" ? C("chalk") : C("ash") }}>{r.kind === "strength" ? fmtWeight(r.bestE1rm, units) : "–"}</span>
                <span>{r.kind === "cardio" ? `${r.volume} km` : fmtTonnage(r.volume, units)}</span>
                <span style={{ color: C(tr.c) }}>{tr.g}</span>
              </button>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
