"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  exerciseHistory, exerciseDashboard, paceClock, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type ExerciseStats, type WeightUnit,
} from "@hybrid/core";
import { fs, space, LINE, LIME, ASH, BLUE, tip, mono } from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.ex.period8w" }, { id: "6m", key: "w.analyze.ex.period6m" }, { id: "1y", key: "w.analyze.ex.period1y" }, { id: "all", key: "w.analyze.ex.periodAll" }];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;

function Stat({ label, value, c }: { label: string; value: string | number; c?: string }) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 24, color: c ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, color: C("ash") }}>{label}</div>
    </div>
  );
}

/** AURORA Exercises (web) — per-movement dashboard reusing the exact engine +
 *  recharts e1RM/pace charts, in the rounded Aurora style. */
export default function AuroraExercises({ sessions, focus }: { sessions: LoggedSession[]; focus?: string }) {
  const { t } = useLang();
  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [period, setPeriod] = useState<ExercisePeriod>("all");
  useEffect(() => { if (focus) setSelected(focus); }, [focus]);
  const active = selected || history[0]?.name || "";
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const { countWarmupsInVolume: iw, units } = useLoggerPrefs();
  const isMobile = useIsMobile();
  const stats = useMemo(() => (active ? exerciseDashboard(sessions, active, period, Date.now(), iw) : null), [sessions, active, period, iw]);
  const input = { fontFamily: "var(--font-mono)", fontSize: fs.body, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "10px 12px", width: "100%", boxSizing: "border-box" as const };

  if (history.length === 0) {
    return (
      <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
        <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 16px" }}>{t("w.analyze.ex.title")}</h1>
        <div style={{ ...card, textAlign: "center", padding: 40 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, color: C("ash") }}>{t("w.analyze.ex.empty")}</span></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk"), display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 280px) 1fr", gap: space.xl, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        <h1 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{t("w.analyze.ex.title")}</h1>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.analyze.ex.search")} style={input} />
        <div style={{ display: "flex", flexDirection: "column", gap: space.xxs, maxHeight: 560, overflowY: "auto" }}>
          {filtered.map((e) => {
            const on = e.name === active;
            return (
              <button key={e.name} onClick={() => setSelected(e.name)} style={{ textAlign: "left", background: on ? `color-mix(in srgb, ${C("lime")} 10%, transparent)` : "transparent", border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 14, padding: "9px 12px", cursor: "pointer", color: C("chalk") }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: on ? 700 : 400 }}>{e.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{e.kind} · {e.count}×</div>
              </button>
            );
          })}
          {filtered.length === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: 8, color: C("ash") }}>{t("w.analyze.ex.noMatch")}</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.ms }}>
          <div style={{ fontWeight: 800, fontSize: 22 }}>{active}</div>
          <div style={{ display: "flex", gap: space.xxs }}>
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "5px 13px", borderRadius: 999, cursor: "pointer", color: period === p.id ? C("ink") : C("ash"), background: period === p.id ? C("lime") : "transparent", border: `1px solid ${period === p.id ? C("lime") : C("line")}` }}>{t(p.key)}</button>
            ))}
          </div>
        </div>
        {stats && <Dashboard stats={stats} units={units} />}
      </div>
    </div>
  );
}

function Dashboard({ stats, units }: { stats: ExerciseStats; units: WeightUnit }) {
  const { t } = useLang();
  if (stats.kind === "cardio") {
    const paceData = stats.pace.map((p) => ({ w: fmtDate(p.date), pace: p.secPerKm }));
    if (stats.efforts === 0) return <div style={{ ...card, textAlign: "center", padding: 32 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.analyze.ex.noRuns")}</span></div>;
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: space.md }}>
          <Stat label={t("w.analyze.ex.runs")} value={stats.efforts} /><Stat label={t("w.analyze.ex.distance")} value={`${stats.distanceKm} km`} c={C("lime")} /><Stat label={t("w.analyze.ex.longest")} value={`${stats.longestKm} km`} /><Stat label={t("w.analyze.ex.bestPace")} value={stats.bestPaceSecPerKm != null ? paceClock(stats.bestPaceSecPerKm) : "–"} c={C("lime")} />
        </div>
        {paceData.length > 1 && (
          <div style={card}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginBottom: 10 }}>{t("w.analyze.ex.paceTitle")}</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={paceData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} /><Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} /><Line type="monotone" dataKey="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );
  }

  const e1rmData = stats.e1rm.map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) }));
  if (stats.workingSets === 0) return <div style={{ ...card, textAlign: "center", padding: 32 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.analyze.ex.noWorkingSets")}</span></div>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: space.md }}>
        <Stat label={t("w.analyze.ex.bestE1rm")} value={fmtWeight(stats.bestE1rm, units)} c={C("lime")} /><Stat label={t("w.analyze.ex.workingSets")} value={stats.workingSets} /><Stat label={t("w.analyze.ex.volume")} value={fmtTonnage(stats.volume, units)} /><Stat label={t("w.analyze.ex.sessions")} value={stats.sessions} />
      </div>
      {e1rmData.length > 1 ? (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime"), marginBottom: 10 }}>{t("w.analyze.ex.e1rmTitle")}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={e1rmData}><CartesianGrid stroke={LINE} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} domain={["auto", "auto"]} width={44} /><Tooltip contentStyle={tip} formatter={(v) => `${v} ${units}`} /><Line type="monotone" dataKey="e1rm" stroke={LIME} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div style={card}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.analyze.ex.e1rmTrend")}</span></div>}
      {stats.bestSet && (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.analyze.ex.bestSet")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, marginTop: 8 }}>{fmtWeight(stats.bestSet.load, units)} × {stats.bestSet.reps} <span style={{ color: C("ash") }}>· {t("w.analyze.ex.e1rmLabel")} {fmtWeight(stats.bestSet.e1rm, units)} · {fmtDate(stats.bestSet.when)}</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8 }}>{stats.totalReps} {t("w.analyze.ex.repsTail")} {fmtWeight(stats.heaviestLoad, units)} {t("w.analyze.ex.allTimeBest")} {fmtWeight(stats.bestE1rmAllTime, units)}</div>
        </div>
      )}
      {stats.velocity && (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.ex.velocityProfile")}</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--lime-text)", marginTop: 8 }}>{fmtWeight(stats.velocity.e1rm, units)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4 }}>{t("w.analyze.ex.velEstPre")} {stats.velocity.r2} · {stats.velocity.n} {t("w.analyze.ex.velEstTail")}</div>
        </div>
      )}
    </>
  );
}
