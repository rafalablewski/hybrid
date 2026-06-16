"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  weeklyVolumeTrend,
  weeklyMuscleSets,
  exerciseTable,
  volumeStatus,
  volumeAdvice,
  resolveLandmarks,
  type LoggedSession,
  type ExercisePeriod,
  type TrendDir,
  type MuscleGroup,
  type ExerciseTableRow,
} from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, RED, disp, mono, tip, Mono, Card, ChartFrame } from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const TREND_GLYPH: Record<TrendDir, { g: string; c: string }> = {
  up: { g: "▲", c: LIME },
  down: { g: "▼", c: AMBER },
  flat: { g: "→", c: ASH },
};
const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads", glutes: "Glutes", posterior: "Posterior", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps",
};

const PERIODS: { id: ExercisePeriod; label: string }[] = [
  { id: "8w", label: "8 wk" },
  { id: "6m", label: "6 mo" },
  { id: "1y", label: "1 yr" },
  { id: "all", label: "All" },
];

export default function Trends({
  sessions,
  onOpenExercise,
  onOpenVolume,
}: {
  sessions: LoggedSession[];
  onOpenExercise?: (name: string) => void;
  onOpenVolume?: () => void;
}) {
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  const [sort, setSort] = useState<{ k: keyof ExerciseTableRow; dir: 1 | -1 }>({ k: "volume", dir: -1 });
  const [selMuscle, setSelMuscle] = useState<MuscleGroup | null>(null);
  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), iw), [sessions, iw]);
  const table = useMemo(() => exerciseTable(sessions, period, Date.now(), iw), [sessions, period, iw]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, landmarks: lm }), [sessions, iw, lm]);
  const muscles = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, landmarks: lm }), [sessions, iw, lm]);
  const trained = muscles.some((m) => m.sets > 0);

  // Default the per-muscle trend to the most-actionable muscle, else the biggest.
  const focusMuscle = selMuscle ?? advice[0]?.muscle ?? [...muscles].sort((a, b) => b.sets - a.sets)[0]?.muscle ?? "chest";
  const muscleWeeks = useMemo(() => weeklyMuscleSets(sessions, focusMuscle, 8, Date.now(), iw), [sessions, focusMuscle, iw]);

  const sortedTable = useMemo(() => {
    const arr = [...table];
    const { k, dir } = sort;
    arr.sort((a, b) => (k === "name" ? dir * a.name.localeCompare(b.name) : dir * ((a[k] as number) - (b[k] as number))));
    return arr;
  }, [table, sort]);
  const sortBy = (k: keyof ExerciseTableRow) =>
    setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  const weekData = weeks.map((w) => ({ w: fmtWeek(w.weekStart), sets: w.sets, t: Math.round(w.tonnage / 100) / 10 }));

  if (!trained) {
    return (
      <div style={{ maxWidth: 760 }}>
        <Header />
        <Card style={{ textAlign: "center", padding: 40 }}>
          <Mono s={{ fontSize: 14 }}>No strength training logged yet. Log some lifts and your volume trends, muscle breakdown and per-exercise analytics show up here.</Mono>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1000 }}>
      <Header />

      {/* Volume trend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ChartFrame title="Weekly working sets" kicker="Last 8 weeks · warm-ups excluded" c={LIME}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} width={32} />
              <Tooltip contentStyle={tip} formatter={(v) => `${v} sets`} />
              <Bar dataKey="sets" fill={LIME} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Weekly tonnage" kicker="Last 8 weeks · ×100 kg" c={BLUE}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} width={32} />
              <Tooltip contentStyle={tip} formatter={(v) => `${(Number(v) / 10).toFixed(1)} t`} />
              <Bar dataKey="t" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      {/* Muscle breakdown (compact) — links to the Volume screen for detail */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Muscle breakdown · this week</Mono>
          {onOpenVolume && (
            <button onClick={onOpenVolume} style={{ ...mono, fontSize: 12, color: LIME, background: "none", border: "none", cursor: "pointer" }}>
              Volume detail →
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {muscles.map((m) => {
            const c = m.zone === "overreaching" ? RED : m.zone === "under" ? AMBER : m.zone === "peak" ? BLUE : LIME;
            const on = m.muscle === focusMuscle;
            return (
              <button key={m.muscle} onClick={() => setSelMuscle(m.muscle)} title="Show this muscle's 8-week trend"
                style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${on ? c : `${c}55`}`, background: `${c}${on ? "2e" : "14"}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", outline: on ? `1px solid ${c}` : "none" }}>
                <Mono s={{ fontSize: 12, color: CHALK }}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</Mono>
                <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: c }}>{m.sets}</span>
              </button>
            );
          })}
        </div>
        {/* Per-muscle 8-week trend for the selected muscle */}
        <div style={{ marginTop: 14 }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 4 }}>{MUSCLE_LABEL[focusMuscle] ?? focusMuscle} · weekly sets · 8 wk</Mono>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={muscleWeeks.map((s, i) => ({ w: fmtWeek(weeks[i]?.weekStart ?? ""), sets: s }))}>
              <CartesianGrid stroke={LINE} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 10 }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: 10 }} width={26} allowDecimals={false} />
              <Tooltip contentStyle={tip} formatter={(v) => `${v} sets`} />
              <Bar dataKey="sets" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {advice.length > 0 && (
          <Mono s={{ fontSize: 12, color: ASH, display: "block", marginTop: 10 }}>
            {advice.filter((a) => a.action === "add").length > 0 && `Add volume: ${advice.filter((a) => a.action === "add").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}. `}
            {advice.filter((a) => a.action === "reduce").length > 0 && `Ease off: ${advice.filter((a) => a.action === "reduce").map((a) => MUSCLE_LABEL[a.muscle]).join(", ")}.`}
          </Mono>
        )}
      </Card>

      {/* Exercise analytics table */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Exercise analytics</Mono>
          <div style={{ display: "flex", gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{ ...mono, fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer", color: period === p.id ? LIME : ASH, background: period === p.id ? `${LIME}1a` : "transparent", border: `1px solid ${period === p.id ? LIME : LINE}` }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: 8, paddingBottom: 6, borderBottom: `1px solid ${LINE}` }}>
            {([["exercise", "name"], ["freq", "sessions"], ["best e1RM", "bestE1rm"], ["volume", "volume"], ["trend", null]] as const).map(([h, k]) => (
              <button key={h} disabled={!k} onClick={() => k && sortBy(k)}
                style={{ ...mono, fontSize: 10, textTransform: "uppercase", textAlign: "left", background: "none", border: "none", padding: 0, cursor: k ? "pointer" : "default", color: k && sort.k === k ? LIME : ASH }}>
                {h}{k && sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
              </button>
            ))}
          </div>
          {sortedTable.map((r) => {
            const tr = TREND_GLYPH[r.trend];
            return (
              <button
                key={r.name}
                onClick={() => onOpenExercise?.(r.name)}
                style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", gap: 8, padding: "9px 0", borderTop: `1px solid ${LINE}`, background: "none", border: "none", borderTopColor: LINE, cursor: onOpenExercise ? "pointer" : "default", textAlign: "left", width: "100%" }}
              >
                <Mono s={{ fontSize: 13, color: onOpenExercise ? LIME : CHALK }}>{r.name}</Mono>
                <Mono s={{ fontSize: 13 }}>{r.sessions}×</Mono>
                <Mono s={{ fontSize: 13 }} c={r.kind === "strength" ? CHALK : ASH}>{r.kind === "strength" ? `${r.bestE1rm} kg` : "–"}</Mono>
                <Mono s={{ fontSize: 13 }}>{r.kind === "cardio" ? `${r.volume} km` : `${(r.volume / 1000).toFixed(1)} t`}</Mono>
                <span style={{ ...mono, fontSize: 13, color: tr.c }}>{tr.g}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 26 }}>Trends</div>
      <Mono s={{ fontSize: 13, display: "block", marginTop: 4 }}>
        Volume over time, muscle breakdown and per-exercise analytics — drill into any lift for its full dashboard.
      </Mono>
    </div>
  );
}
