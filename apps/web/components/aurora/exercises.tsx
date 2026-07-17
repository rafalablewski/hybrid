"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  exerciseHistory, exerciseDashboard, paceClock, fmtWeight, fmtTonnage, kgToUnit,
  e1rmTrendWithPRs, repMaxMatrix, loadRepsScatter, weeklyTonnage, intensityDistribution,
  tonnageSurface, exerciseConsistency, paceCurve, recentRunDeltas, blockCompare,
  type LoggedSession, type ExercisePeriod, type ExerciseStats, type WeightUnit,
  type HeatCell, type BlockCompare, type ExerciseConsistency as Consistency,
} from "@hybrid/core";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, ASH, BLUE, RED, VIOLET, tip, mono } from "@/lib/ui";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

const PERIODS: { id: ExercisePeriod; key: string }[] = [{ id: "8w", key: "w.analyze.ex.period8w" }, { id: "6m", key: "w.analyze.ex.period6m" }, { id: "1y", key: "w.analyze.ex.period1y" }, { id: "all", key: "w.analyze.ex.periodAll" }];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;
// Chart-only raw hexes (SVG presentation attrs can't resolve CSS vars). The
// base/hard pair is the CVD-validated deep variant of chartreuse/sand.
const DEEP_BASE = "#84a01e", DEEP_HARD = "#bd871e";
const kicker = { fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase" as const, letterSpacing: ".12em", color: C("ash"), marginBottom: 10 };

function Stat({ label, value, c }: { label: string; value: string | number; c?: string }) {
  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 24, color: c ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, color: C("ash") }}>{label}</div>
    </div>
  );
}

function LegendRow({ items }: { items: { c: string; label: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>
          {i.dashed
            ? <span style={{ width: 14, borderTop: `2px dashed ${i.c}`, display: "inline-block" }} />
            : <span style={{ width: 10, height: 10, borderRadius: 3, background: i.c, display: "inline-block" }} />}
          {i.label}
        </span>
      ))}
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
  const bw = useBodyweightLookup();
  const isMobile = useIsMobile();
  const stats = useMemo(() => (active ? exerciseDashboard(sessions, active, period, Date.now(), iw, bw) : null), [sessions, active, period, iw, bw]);
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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{e.kind} – {e.count}×</div>
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
        {stats && <Dashboard stats={stats} units={units} sessions={sessions} name={active} period={period} bw={bw} />}
      </div>
    </div>
  );
}

function Dashboard({ stats, units, sessions, name, period, bw }: { stats: ExerciseStats; units: WeightUnit; sessions: LoggedSession[]; name: string; period: ExercisePeriod; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const consistency = useMemo(() => exerciseConsistency(sessions, name, 26), [sessions, name]);
  const compare = useMemo(() => blockCompare(sessions, name, 8, Date.now(), bw), [sessions, name, bw]);

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
            <div style={kicker}>{t("w.analyze.ex.paceTitle")}</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={paceData}><CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" /><XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} /><YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} /><Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} /><Line type="monotone" dataKey="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <PaceCurveCard sessions={sessions} name={name} />
        <RunDeltasCard sessions={sessions} name={name} />
        <ConsistencyCard c={consistency} />
        <CompareCard compare={compare} units={units} />
      </>
    );
  }

  if (stats.workingSets === 0) return <div style={{ ...card, textAlign: "center", padding: 32 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>{t("w.analyze.ex.noWorkingSets")}</span></div>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: space.md }}>
        <Stat label={t("w.analyze.ex.bestE1rm")} value={fmtWeight(stats.bestE1rm, units)} c={C("lime")} /><Stat label={t("w.analyze.ex.workingSets")} value={stats.workingSets} /><Stat label={t("w.analyze.ex.volume")} value={fmtTonnage(stats.volume, units)} /><Stat label={t("w.analyze.ex.sessions")} value={stats.sessions} />
      </div>
      <PrTrendCard sessions={sessions} name={name} period={period} bw={bw} units={units} />
      {stats.bestSet && (
        <div style={card}>
          <div style={{ ...kicker, color: C("lime"), marginBottom: 0 }}>{t("w.analyze.ex.bestSet")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, marginTop: 8 }}>{fmtWeight(stats.bestSet.load, units)} × {stats.bestSet.reps} <span style={{ color: C("ash") }}>– {t("w.analyze.ex.e1rmLabel")} {fmtWeight(stats.bestSet.e1rm, units)} – {fmtDate(stats.bestSet.when)}</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8 }}>{stats.totalReps} {t("w.analyze.ex.repsTail")} {fmtWeight(stats.heaviestLoad, units)} {t("w.analyze.ex.allTimeBest")} {fmtWeight(stats.bestE1rmAllTime, units)}</div>
        </div>
      )}
      {stats.velocity && (
        <div style={card}>
          <div style={{ ...kicker, marginBottom: 0 }}>{t("w.analyze.ex.velocityProfile")}</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--lime-text)", marginTop: 8 }}>{fmtWeight(stats.velocity.e1rm, units)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4 }}>{t("w.analyze.ex.velEstPre")} {stats.velocity.r2} – {stats.velocity.n} {t("w.analyze.ex.velEstTail")}</div>
        </div>
      )}
      <RepMaxCard sessions={sessions} name={name} units={units} bw={bw} />
      <TonnageCard sessions={sessions} name={name} units={units} bw={bw} />
      <ZonesCard sessions={sessions} name={name} period={period} bw={bw} />
      <ScatterCard sessions={sessions} name={name} units={units} bw={bw} />
      <SurfaceCard sessions={sessions} name={name} units={units} bw={bw} />
      <ConsistencyCard c={consistency} />
      <CompareCard compare={compare} units={units} />
    </>
  );
}

// ---------------------------------------------------------------- 1. PR trend

function PrTrendCard({ sessions, name, period, bw, units }: { sessions: LoggedSession[]; name: string; period: ExercisePeriod; bw: ReturnType<typeof useBodyweightLookup>; units: WeightUnit }) {
  const { t } = useLang();
  const trend = useMemo(() => e1rmTrendWithPRs(sessions, name, period, Date.now(), bw), [sessions, name, period, bw]);
  const data = trend.map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)), pr: p.pr }));
  if (data.length < 2) return <div style={card}><span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.analyze.ex.e1rmTrend")}</span></div>;
  return (
    <div style={card}>
      <div style={{ ...kicker, color: C("lime") }}>{t("w.analyze.ex.prTrendTitle")}</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
          <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
          <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} domain={["auto", "auto"]} width={44} />
          <Tooltip contentStyle={tip} formatter={(v, _n, item) => `${v} ${units}${(item?.payload as { pr?: boolean })?.pr ? ` – ${t("w.analyze.ex.pr")}` : ""}`} />
          <Line
            type="monotone" dataKey="e1rm" stroke={LIME_HEX} strokeWidth={2.5}
            dot={(p: { cx?: number; cy?: number; payload?: { pr?: boolean }; index?: number }) =>
              p.payload?.pr
                ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5.5} fill={LIME_HEX} stroke={C("ink")} strokeWidth={2} />
                : <circle key={p.index} cx={p.cx} cy={p.cy} r={3} fill={C("ink2")} stroke={LIME_HEX} strokeWidth={2} />}
          />
        </LineChart>
      </ResponsiveContainer>
      <LegendRow items={[{ c: LIME_HEX, label: t("w.analyze.ex.allTimePr") }]} />
    </div>
  );
}

// ---------------------------------------------------------- 2. rep-max matrix

function RepMaxCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const cells = useMemo(() => repMaxMatrix(sessions, name, Date.now(), bw), [sessions, name, bw]);
  if (cells.every((c) => c === null)) return null;
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.repmaxTitle")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 88px), 1fr))", gap: space.sm }}>
        {cells.map((cell, i) =>
          cell ? (
            <div key={i} title={`${fmtWeight(cell.loadKg, units)} × ${cell.reps} – ${t("w.analyze.ex.e1rmLabel")} ${fmtWeight(cell.e1rm, units)} – ${fmtDate(cell.when)}`} style={{ background: cell.recent ? `color-mix(in srgb, ${C("lime")} 14%, transparent)` : C("ink"), border: `1px solid ${cell.recent ? C("lime") : C("line")}`, borderRadius: 16, padding: "12px 6px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), letterSpacing: ".08em" }}>{i + 1}RM</div>
              <div style={{ fontWeight: 800, fontSize: 18, margin: "5px 0 2px", color: cell.recent ? "var(--lime-text)" : C("chalk") }}>{Math.round(kgToUnit(cell.loadKg, units))}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{fmtDate(cell.when)}</div>
            </div>
          ) : (
            <div key={i} style={{ border: `1px dashed ${C("line")}`, borderRadius: 16, padding: "12px 6px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), letterSpacing: ".08em" }}>{i + 1}RM</div>
              <div style={{ fontWeight: 800, fontSize: 18, margin: "5px 0 2px", color: C("ash") }}>–</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.ex.repmaxTry")}</div>
            </div>
          ),
        )}
      </div>
      <LegendRow items={[{ c: LIME_HEX, label: t("w.analyze.ex.repmaxRecent") }, { c: C("line"), label: t("w.analyze.ex.repmaxOlder") }]} />
    </div>
  );
}

// ------------------------------------------------------- 4. weekly tonnage

function TonnageCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const rows = useMemo(() => weeklyTonnage(sessions, name, 12, Date.now(), bw), [sessions, name, bw]);
  if (rows.every((r) => r.baseKg + r.hardKg === 0)) return null;
  const data = rows.map((r, i) => ({ w: `W${i + 1}`, base: Math.round(kgToUnit(r.baseKg, units)), hard: Math.round(kgToUnit(r.hardKg, units)), baseKg: r.baseKg, hardKg: r.hardKg }));
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.tonnageTitle")}</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
          <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={48} tickFormatter={(v: number) => fmtTonnage(v / (units === "kg" ? 1 : 2.2046226218), units)} />
          <Tooltip contentStyle={tip} formatter={(_v, key, item) => fmtTonnage(key === "base" ? (item?.payload as { baseKg: number }).baseKg : (item?.payload as { hardKg: number }).hardKg, units)} />
          <Bar dataKey="base" stackId="t" fill={DEEP_BASE} name={t("w.analyze.ex.tonnageBase")} />
          <Bar dataKey="hard" stackId="t" fill={DEEP_HARD} name={t("w.analyze.ex.tonnageHard")} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <LegendRow items={[{ c: DEEP_BASE, label: t("w.analyze.ex.tonnageBase") }, { c: DEEP_HARD, label: t("w.analyze.ex.tonnageHard") }]} />
    </div>
  );
}

// --------------------------------------------------- 5. intensity distribution

function ZonesCard({ sessions, name, period, bw }: { sessions: LoggedSession[]; name: string; period: ExercisePeriod; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const zones = useMemo(() => intensityDistribution(sessions, name, period, Date.now(), bw), [sessions, name, period, bw]);
  const total = zones.reduce((a, z) => a + z.count, 0);
  if (total === 0) return null;
  const tags = [t("w.analyze.ex.zoneSpeed"), t("w.analyze.ex.zoneVolume"), t("w.analyze.ex.zoneBuild"), t("w.analyze.ex.zoneStrength"), t("w.analyze.ex.zonePeak")];
  const labels = ["< 60%", "60–70%", "70–80%", "80–90%", "90%+"];
  const max = Math.max(...zones.map((z) => z.share), 0.01);
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.zonesTitle")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: space.sm, alignItems: "end" }}>
        {zones.map((z, i) => (
          <div key={z.zone} title={`${z.count} × (${Math.round(z.share * 100)}%)`} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, marginBottom: 6 }}>{Math.round(z.share * 100)}%</div>
            <div style={{ height: Math.max(4, (z.share / max) * 120), borderRadius: "6px 6px 0 0", background: C("lime"), opacity: 0.5 + i * 0.12 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 8 }}>{labels[i]}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 2 }}>{tags[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------ 3. load×reps map

function ScatterCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const map = useMemo(() => loadRepsScatter(sessions, name, Date.now(), bw), [sessions, name, bw]);
  if (map.points.length < 5) return null;
  const W = 720, H = 300, L = 46, R = 12, T = 14, B = 34;
  const topIso = map.isolines[map.isolines.length - 1] ?? map.maxLoadKg;
  const yMax = Math.max(map.maxLoadKg, topIso) * 1.06;
  const yMin = Math.min(...map.points.map((p) => p.loadKg)) * 0.9;
  const X = (r: number) => L + ((r - 0.5) * (W - L - R)) / 12;
  const Y = (kg: number) => T + ((yMax - kg) * (H - T - B)) / (yMax - yMin || 1);
  const gridStep = yMax - yMin > 120 ? 40 : yMax - yMin > 60 ? 20 : 10;
  const gridLines: number[] = [];
  for (let g = Math.ceil(yMin / gridStep) * gridStep; g < yMax; g += gridStep) gridLines.push(g);
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.mapTitle")}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {gridLines.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke={LINE_HEX} strokeDasharray="3 4" />
            <text x={L - 8} y={Y(g) + 3} textAnchor="end" fill={ASH} style={{ ...mono, fontSize: 9 }}>{Math.round(kgToUnit(g, units))}</text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
          <text key={r} x={X(r)} y={H - 12} textAnchor="middle" fill={ASH} style={{ ...mono, fontSize: 9 }}>{r}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 1} textAnchor="middle" fill={ASH} style={{ ...mono, fontSize: 8, letterSpacing: ".1em" }}>{t("w.analyze.ex.mapReps").toUpperCase()}</text>
        {map.isolines.map((iso) => {
          let d = "";
          for (let r = 0.6; r <= 12.4; r += 0.2) {
            const kg = iso / (1 + r / 30);
            if (kg < yMin || kg > yMax) continue;
            d += `${d ? "L" : "M"}${X(r).toFixed(1)},${Y(kg).toFixed(1)}`;
          }
          const labelY = Y(Math.min(yMax * 0.985, iso / (1 + 0.6 / 30)));
          return (
            <g key={iso}>
              <path d={d} fill="none" stroke={ASH} strokeWidth={1.3} strokeDasharray="5 5" opacity={0.7} />
              <text x={L + 6} y={labelY - 5} fill={ASH} style={{ ...mono, fontSize: 9 }}>{Math.round(kgToUnit(iso, units))}</text>
            </g>
          );
        })}
        {map.points.map((p, i) => (
          <circle key={i} cx={X(p.reps) + ((i % 5) - 2) * 2.5} cy={Y(p.loadKg)} r={p.recent ? 4.5 : 3.5} fill={p.recent ? LIME_HEX : ASH} opacity={p.recent ? 1 : 0.45}>
            <title>{`${fmtWeight(p.loadKg, units)} × ${p.reps}`}</title>
          </circle>
        ))}
      </svg>
      <LegendRow items={[{ c: LIME_HEX, label: t("w.analyze.ex.mapRecent") }, { c: ASH, label: t("w.analyze.ex.mapOlder") }, { c: ASH, label: t("w.analyze.ex.mapIso"), dashed: true }]} />
    </div>
  );
}

// ------------------------------------------------------ 6. tonnage landscape

const RAMP = ["#33420f", "#4c6414", "#6f8f1c", "#9cc32d", "#c6f84f"];

function SurfaceCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw: ReturnType<typeof useBodyweightLookup> }) {
  const { t } = useLang();
  const s = useMemo(() => tonnageSurface(sessions, name, 12, Date.now(), bw), [sessions, name, bw]);
  if (s.maxKg === 0) return null;
  const weeks = s.weeks.length, bins = s.bins.length;
  const ix = 52, iy = 23, zh = 100, ox = 80, oy = 160, W = 960, H = 460;
  const px = (w: number, b: number) => ox + w * ix + b * ix * 0.72;
  const py = (w: number, b: number) => oy + b * iy * 1.6 + w * iy * 0.52;
  const cols: React.ReactNode[] = [];
  for (let b = 0; b < bins; b++)
    for (let w = weeks - 1; w >= 0; w--) {
      const v = s.grid[b]?.[w] ?? 0;
      const h = (v / s.maxKg) * zh + 4;
      const x = px(w, b), y = py(w, b);
      const c = RAMP[Math.min(4, Math.floor((v / s.maxKg) * 4.99))]!;
      const wdt = ix * 0.56, dep = iy * 0.9;
      cols.push(
        <g key={`${b}-${w}`}>
          <path d={`M${x},${y - h} l0,${h} l${wdt},${-dep * 0.5} l0,${-h} Z`} fill={c} opacity={0.55} />
          <path d={`M${x + wdt},${y - h - dep * 0.5} l0,${h} l${wdt * 0.6},${dep * 0.35} l0,${-h} Z`} fill={c} opacity={0.32} />
          <path d={`M${x},${y - h} l${wdt},${-dep * 0.5} l${wdt * 0.6},${dep * 0.35} l${-wdt},${dep * 0.5} Z`} fill={c} stroke={C("ink")} strokeWidth={0.75}>
            <title>{`${s.bins[b]} – ${fmtTonnage(v, units)}`}</title>
          </path>
        </g>,
      );
    }
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.surfaceTitle")}</div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: 560 }}>
          {cols}
          {s.bins.map((bn, b) => (
            <text key={bn} x={px(weeks - 1, b) + ix * 1.5} y={py(weeks - 1, b) + 12} fill={ASH} style={{ ...mono, fontSize: 10 }}>{bn} {t("w.analyze.ex.surfaceReps")}</text>
          ))}
          {Array.from({ length: Math.ceil(weeks / 2) }, (_, i) => i * 2).map((w) => (
            <text key={w} x={px(w, 0) - 4} y={py(w, 0) - zh - 22} fill={ASH} style={{ ...mono, fontSize: 10 }}>W{w + 1}</text>
          ))}
        </svg>
      </div>
      <LegendRow items={[{ c: RAMP[4]!, label: t("w.analyze.ex.surfaceHigh") }, { c: RAMP[1]!, label: t("w.analyze.ex.surfaceLow") }]} />
    </div>
  );
}

// -------------------------------------------------------- 8. consistency

function heatBg(level: HeatCell["level"]): string {
  switch (level) {
    case 1: return "color-mix(in srgb, var(--color-lime) 28%, transparent)";
    case 2: return "color-mix(in srgb, var(--color-lime) 50%, transparent)";
    case 3: return "color-mix(in srgb, var(--color-lime) 74%, transparent)";
    case 4: return "var(--color-lime)";
    default: return "var(--color-line)";
  }
}

function ConsistencyCard({ c }: { c: Consistency }) {
  const { t } = useLang();
  if (c.activeDays === 0) return null;
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.consistencyTitle")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))", gap: space.sm, marginBottom: 14 }}>
        {[
          { v: c.weekStreak, l: t("w.analyze.ex.weekStreak"), c: "var(--lime-text)" },
          { v: c.perWeek, l: t("w.analyze.ex.perWeek") },
          { v: c.longestGapDays, l: t("w.analyze.ex.longestGap") },
          { v: c.activeDays, l: t("w.analyze.ex.activeDays") },
        ].map((s) => (
          <div key={s.l} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: s.c ?? C("chalk") }}>{s.v}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateRows: "repeat(7,1fr)", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 3, height: 118 }}>
        {c.heat.map((col, ci) =>
          col.map((cell, ri) => (
            <div key={`${ci}-${ri}`} title={`${cell.date} – ${cell.count}×`} style={{ borderRadius: 2.5, background: heatBg(cell.level) }} />
          )),
        )}
      </div>
      <LegendRow items={[{ c: "var(--color-line)", label: t("w.analyze.ex.heatRest") }, { c: "color-mix(in srgb, var(--color-lime) 28%, transparent)", label: t("w.analyze.ex.heatLight") }, { c: "color-mix(in srgb, var(--color-lime) 74%, transparent)", label: t("w.analyze.ex.heatSolid") }, { c: "var(--color-lime)", label: t("w.analyze.ex.heatBig") }]} />
    </div>
  );
}

// --------------------------------------------------------- 9. pace curve

function PaceCurveCard({ sessions, name }: { sessions: LoggedSession[]; name: string }) {
  const { t } = useLang();
  const bands = useMemo(() => paceCurve(sessions, name, Date.now()), [sessions, name]);
  if (bands.length < 2) return null;
  const data = bands.map((b) => ({ w: b.label, all: b.bestAllSec, recent: b.bestRecentSec }));
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.paceCurveTitle")}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
          <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
          <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} reversed domain={["auto", "auto"]} tickFormatter={(v: number) => paceClock(v)} width={48} />
          <Tooltip contentStyle={tip} formatter={(v) => (v == null ? "–" : `${paceClock(Number(v))} /km`)} />
          <Line type="monotone" dataKey="all" stroke={ASH} strokeWidth={2} dot={{ r: 3 }} name={t("w.analyze.ex.paceCurveAll")} />
          <Line type="monotone" dataKey="recent" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4 }} connectNulls name={t("w.analyze.ex.paceCurveRecent")} />
        </LineChart>
      </ResponsiveContainer>
      <LegendRow items={[{ c: BLUE, label: t("w.analyze.ex.paceCurveRecent") }, { c: ASH, label: t("w.analyze.ex.paceCurveAll") }]} />
    </div>
  );
}

// ---------------------------------------------------- 9b. recent-run deltas

function RunDeltasCard({ sessions, name }: { sessions: LoggedSession[]; name: string }) {
  const { t } = useLang();
  const d = useMemo(() => recentRunDeltas(sessions, name, 10, Date.now()), [sessions, name]);
  if (d.avgSec == null || d.runs.length < 3) return null;
  const maxAbs = Math.max(...d.runs.map((r) => Math.abs(r.deltaSec)), 1);
  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.runDeltasTitle")}</div>
      <div style={{ position: "relative", height: 140 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: `1.5px dashed ${C("line")}` }} />
        <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-100%)", fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.ex.runDeltasAvg")} {paceClock(d.avgSec)} /km</span>
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: 8 }}>
          {d.runs.map((r, i) => {
            const frac = Math.abs(r.deltaSec) / maxAbs;
            const faster = r.deltaSec <= 0;
            return (
              <div key={i} title={`${fmtDate(r.date)} – ${r.km} km – ${paceClock(r.secPerKm)} /km (${faster ? "-" : "+"}${Math.abs(r.deltaSec)}s)`} style={{ flex: 1, position: "relative" }}>
                <div style={{ position: "absolute", left: "18%", right: "18%", ...(faster ? { bottom: "50%", height: `${Math.max(3, frac * 46)}%` } : { top: "50%", height: `${Math.max(3, frac * 46)}%` }), borderRadius: 4, background: faster ? BLUE : RED }} />
              </div>
            );
          })}
        </div>
      </div>
      <LegendRow items={[{ c: BLUE, label: t("w.analyze.ex.runDeltasFaster") }, { c: RED, label: t("w.analyze.ex.runDeltasSlower") }]} />
    </div>
  );
}

// --------------------------------------------------------- 10. block compare

function DeltaChip({ good, children }: { good: boolean; children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, borderRadius: 999, padding: "3px 9px", background: `color-mix(in srgb, ${good ? C("blue") : C("red")} 22%, transparent)`, color: good ? "var(--blue-text)" : "var(--red-text)" }}>{children}</span>
  );
}

function CompareCard({ compare, units }: { compare: BlockCompare; units: WeightUnit }) {
  const { t } = useLang();
  const anyPrev = compare.weeklyPrev.some((v) => v > 0);
  const anyCur = compare.weeklyCur.some((v) => v > 0);
  if (!anyPrev || !anyCur) return null;

  const tiles =
    compare.kind === "strength"
      ? [
          { l: t("w.analyze.ex.bestE1rm"), cur: fmtWeight(compare.cur.bestE1rm, units), was: fmtWeight(compare.prev.bestE1rm, units), delta: compare.cur.bestE1rm - compare.prev.bestE1rm, good: compare.cur.bestE1rm >= compare.prev.bestE1rm, fmt: (d: number) => fmtWeight(Math.abs(d), units) },
          { l: t("w.analyze.ex.cmpVolume"), cur: fmtTonnage(compare.cur.volumeKg, units), was: fmtTonnage(compare.prev.volumeKg, units), delta: compare.cur.volumeKg - compare.prev.volumeKg, good: compare.cur.volumeKg >= compare.prev.volumeKg, fmt: (d: number) => fmtTonnage(Math.abs(d), units) },
          { l: t("w.analyze.ex.cmpHardSets"), cur: String(compare.cur.hardSets), was: String(compare.prev.hardSets), delta: compare.cur.hardSets - compare.prev.hardSets, good: compare.cur.hardSets >= compare.prev.hardSets, fmt: (d: number) => String(Math.abs(d)) },
          { l: t("w.analyze.ex.cmpSessions"), cur: String(compare.cur.sessions), was: String(compare.prev.sessions), delta: compare.cur.sessions - compare.prev.sessions, good: compare.cur.sessions >= compare.prev.sessions, fmt: (d: number) => String(Math.abs(d)) },
        ]
      : [
          { l: t("w.analyze.ex.cmpDistance"), cur: `${compare.cur.distanceKm} km`, was: `${compare.prev.distanceKm} km`, delta: compare.cur.distanceKm - compare.prev.distanceKm, good: compare.cur.distanceKm >= compare.prev.distanceKm, fmt: (d: number) => `${Math.round(Math.abs(d) * 10) / 10} km` },
          { l: t("w.analyze.ex.cmpRuns"), cur: String(compare.cur.runs), was: String(compare.prev.runs), delta: compare.cur.runs - compare.prev.runs, good: compare.cur.runs >= compare.prev.runs, fmt: (d: number) => String(Math.abs(d)) },
          { l: t("w.analyze.ex.cmpAvgPace"), cur: compare.cur.avgPaceSec != null ? paceClock(compare.cur.avgPaceSec) : "–", was: compare.prev.avgPaceSec != null ? paceClock(compare.prev.avgPaceSec) : "–", delta: (compare.cur.avgPaceSec ?? 0) - (compare.prev.avgPaceSec ?? 0), good: (compare.cur.avgPaceSec ?? Infinity) <= (compare.prev.avgPaceSec ?? Infinity), fmt: (d: number) => `${Math.abs(d)}s/km` },
          { l: t("w.analyze.ex.cmpBestPace"), cur: compare.cur.bestPaceSec != null ? paceClock(compare.cur.bestPaceSec) : "–", was: compare.prev.bestPaceSec != null ? paceClock(compare.prev.bestPaceSec) : "–", delta: (compare.cur.bestPaceSec ?? 0) - (compare.prev.bestPaceSec ?? 0), good: (compare.cur.bestPaceSec ?? Infinity) <= (compare.prev.bestPaceSec ?? Infinity), fmt: (d: number) => `${Math.abs(d)}s/km` },
        ];

  const weekly = compare.weeklyCur.map((v, i) => ({
    w: `W${i + 1}`,
    cur: compare.kind === "strength" ? Math.round(kgToUnit(v, units)) : v,
    prev: compare.kind === "strength" ? Math.round(kgToUnit(compare.weeklyPrev[i] ?? 0, units)) : compare.weeklyPrev[i] ?? 0,
    curKg: v, prevKg: compare.weeklyPrev[i] ?? 0,
  }));
  const fmtWeekly = (kg: number) => (compare.kind === "strength" ? fmtTonnage(kg, units) : `${kg} km`);

  return (
    <div style={card}>
      <div style={kicker}>{t("w.analyze.ex.compareTitle")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: space.sm, marginBottom: 14 }}>
        {tiles.map((tile) => (
          <div key={tile.l} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{tile.cur}</div>
              {tile.delta !== 0 && <DeltaChip good={tile.good}>{tile.delta > 0 ? "+" : "-"}{tile.fmt(tile.delta)}</DeltaChip>}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 4 }}>{tile.l} – {t("w.analyze.ex.compareWas")} {tile.was}</div>
          </div>
        ))}
      </div>
      <div style={{ ...kicker, marginBottom: 6 }}>{compare.kind === "strength" ? t("w.analyze.ex.compareWeekly") : t("w.analyze.ex.compareWeeklyKm")}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={weekly}>
          <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
          <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
          <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} width={48} tickFormatter={(v: number) => (compare.kind === "strength" ? fmtTonnage(v / (units === "kg" ? 1 : 2.2046226218), units) : `${v}`)} />
          <Tooltip contentStyle={tip} formatter={(_v, key, item) => fmtWeekly(key === "cur" ? (item?.payload as { curKg: number }).curKg : (item?.payload as { prevKg: number }).prevKg)} />
          <Line type="monotone" dataKey="prev" stroke={ASH} strokeWidth={2} dot={{ r: 3 }} name={t("w.analyze.ex.comparePrev")} />
          <Line type="monotone" dataKey="cur" stroke={VIOLET} strokeWidth={2.5} dot={{ r: 4 }} name={t("w.analyze.ex.compareCur")} />
        </LineChart>
      </ResponsiveContainer>
      <LegendRow items={[{ c: VIOLET, label: t("w.analyze.ex.compareCur") }, { c: ASH, label: t("w.analyze.ex.comparePrev") }]} />
    </div>
  );
}
