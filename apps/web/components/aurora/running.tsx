"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  runTotals, runStats, weeklyMileage, paceEffortSplit, pacedRunMoves, paceSeries, paceClock, type LoggedSession,
} from "@hybrid/core";
import { LINE, LIME, ASH, BLUE, AMBER, RED, tip, mono } from "@/lib/ui";
import { AuroraIcon } from "./icons";

const fmtWeek = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;

function Stat({ label, value, c }: { label: string; value: string | number; c?: string }) {
  return <div style={card}><div style={{ fontWeight: 800, fontSize: 26, color: c ?? C("chalk") }}>{value}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, color: C("ash") }}>{label}</div></div>;
}
const head = (color: string, k: string) => <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C(color), marginBottom: 10 }}>{k}</div>;

/** AURORA Running (web) — full bespoke cardio analytics reusing the exact engine
 *  + recharts mileage/pace charts. */
export default function AuroraRunning({ sessions }: { sessions: LoggedSession[] }) {
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const stats = useMemo(() => runStats(sessions), [sessions]);
  const mileage = useMemo(() => weeklyMileage(sessions, 8), [sessions]);
  const split = useMemo(() => paceEffortSplit(sessions), [sessions]);
  const paceMoves = useMemo(() => pacedRunMoves(sessions), [sessions]);
  const [move, setMove] = useState("");
  const active = paceMoves.includes(move) ? move : (paceMoves[0] ?? "");

  if (totals.efforts === 0) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, margin: "0 0 16px" }}>Running</h1>
        <div style={{ ...card, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C("ash") }}>No cardio logged yet. Log a run or row (with distance + minutes) and your mileage, pace and easy/hard split show up here.</span></div>
      </div>
    );
  }

  const mileageData = mileage.map((w) => ({ w: fmtWeek(w.weekStart), km: w.km }));
  const paceData = active ? paceSeries(sessions, active).map((p) => ({ w: fmtWeek(p.date), pace: p.secPerKm })) : [];
  const splitTotal = split.easy + split.moderate + split.hard;
  const hasEffort = splitTotal > 0;
  const easyPct = hasEffort ? Math.round((split.easy / splitTotal) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Running</h1>
        <AuroraIcon name="navigation" size={24} color={C("blue")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${easyPct != null ? 4 : 3}, 1fr)`, gap: 14 }}>
        <Stat label="Runs" value={totals.efforts} /><Stat label="Distance" value={`${totals.distanceKm} km`} c={C("blue")} /><Stat label="Time" value={`${Math.round(totals.minutes / 6) / 10} h`} />{easyPct != null && <Stat label="Easy %" value={`${easyPct}%`} c={C("lime")} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={card}>{head("blue", "Weekly mileage · last 8 wk")}
          <ResponsiveContainer width="100%" height={200}><BarChart data={mileageData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} /><Tooltip contentStyle={tip} formatter={(v) => `${v} km`} /><Bar dataKey="km" fill={BLUE} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        {paceData.length > 1 && (
          <div style={card}>{head("blue", `${active} · pace · lower is faster`)}
            <ResponsiveContainer width="100%" height={200}><LineChart data={paceData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: 11 }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: 11 }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} /><Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} /><Line type="monotone" dataKey="pace" name="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
          </div>
        )}
      </div>

      {hasEffort && (
        <div style={card}>
          {head("lime", "Pace zones · minutes (from pace)")}
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: C("ink") }}>
            {([["easy", split.easy, C("lime")], ["moderate", split.moderate, C("amber")], ["hard", split.hard, C("red")]] as const).map(([k, v, c]) => v > 0 && <div key={k} style={{ width: `${(v / splitTotal) * 100}%`, background: c }} />)}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
            <Legend c={C("lime")} label={`Easy · ${split.easy} min`} /><Legend c={C("amber")} label={`Steady · ${split.moderate} min`} /><Legend c={C("red")} label={`Hard · ${split.hard} min`} />
          </div>
        </div>
      )}

      {paceMoves.length > 1 && (
        <div style={card}>
          {head("ash", "Pace chart move")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {paceMoves.map((m) => { const on = active === m; return <button key={m} onClick={() => setMove(m)} style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "6px 14px", borderRadius: 999, cursor: "pointer", color: on ? C("ink") : C("ash"), background: on ? C("blue") : "transparent", border: `1px solid ${on ? C("blue") : C("line")}` }}>{m}</button>; })}
          </div>
        </div>
      )}

      <div style={card}>
        {head("blue", "By movement")}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, paddingBottom: 6, borderBottom: `1px solid ${C("line")}` }}>
          {["move", "runs", "km", "longest", "best pace"].map((h) => <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", color: C("ash") }}>{h}</span>)}
        </div>
        {stats.map((r) => (
          <div key={r.move} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderTop: `1px solid ${C("line")}`, fontFamily: "var(--font-mono)", fontSize: 13 }}>
            <span style={{ color: C("chalk") }}>{r.move}</span><span style={{ color: C("ash") }}>{r.efforts}</span><span style={{ color: C("ash") }}>{r.distanceKm}</span><span style={{ color: C("ash") }}>{r.longestKm || "–"}</span>
            <span style={{ color: r.bestPaceSecPerKm != null ? C("blue") : C("ash") }}>{r.bestPaceSecPerKm != null ? `${paceClock(r.bestPaceSecPerKm)} /km` : "–"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} /><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>{label}</span></div>;
}
