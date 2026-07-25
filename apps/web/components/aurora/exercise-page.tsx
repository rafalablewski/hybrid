"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, BarChart, Bar, Cell, LineChart, Line, ResponsiveContainer, XAxis, YAxis, ReferenceLine, Tooltip } from "recharts";
import {
  exercisePageModel,
  fmtWeight,
  fmtTonnage,
  paceClock,
  kgToUnit,
  fs,
  space,
  type ExercisePageSlide,
  type ExercisePeriod,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { tip, mono, ASH, VIOLET } from "@/lib/ui";
import { kindStroke, TickerDelta, upHex, downHex } from "./exercise-widget";
import AuroraExerciseAnatomy from "./exercise-anatomy";
import { useTheme } from "@/lib/use-theme";

const C = (v: string) => `var(--color-${v})`;
const LINE_HEX = "#2a2d2a", INK_HEX = "#0c0d0c";
// Chart-only raw hexes (mirror mobile exercise-page): the CVD-validated deep
// chartreuse/sand pair for stacked tonnage, and the lime landscape ramp.
const DEEP_BASE = "#84a01e", DEEP_HARD = "#bd871e";
const RAMP = ["#33420f", "#4c6414", "#6f8f1c", "#9cc32d", "#c6f84f"];

const PERIODS: { id: ExercisePeriod; key: string }[] = [
  { id: "8w", key: "w.analyze.ex.period8w" },
  { id: "6m", key: "w.analyze.ex.period6m" },
  { id: "1y", key: "w.analyze.ex.period1y" },
  { id: "all", key: "w.analyze.ex.periodAll" },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const splitVal = (s: string): { v: string; u: string } => {
  const i = s.lastIndexOf(" ");
  return i < 0 ? { v: s, u: "" } : { v: s.slice(0, i), u: s.slice(i + 1) };
};

interface Hero {
  v: string;
  u: string;
  deltaPct?: number | null;
  improving?: boolean | null;
  label: string;
}

function slideHero(s: ExercisePageSlide, units: WeightUnit, t: (k: string) => string): Hero {
  switch (s.kind) {
    case "weightTrend": {
      const { v, u } = splitVal(fmtWeight(s.bestWeight, units));
      return { v, u, deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.exp.heaviest") };
    }
    case "tonnage": {
      const { v, u } = splitVal(fmtTonnage(s.avgWeekKg, units));
      return { v, u: `${u} ${t("w.analyze.exp.perWeek")}`, deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.exp.tonnage") };
    }
    case "zones":
      return {
        v: s.topZone ? String(Math.round(s.topZone.share * 100)) : "–",
        u: "%",
        label: `${t("w.analyze.exp.zones")} ${s.topZone ? (s.topZone.zone === "<60" ? "<60" : s.topZone.zone + "+") : ""}% e1RM`,
      };
    case "weeklyMinutes":
      return {
        v: String(s.avgWeekMin),
        u: `min ${t("w.analyze.exp.perWeek")}`,
        deltaPct: s.deltaPct,
        improving: s.improving,
        label: t("w.analyze.exp.weeklyMinutes"),
      };
    case "repMax":
      return { ...splitVal(fmtWeight(s.heaviestKg, units)), label: t("w.analyze.ex.repmaxTitle") };
    case "loadReps":
      return { v: String(s.workingSets), u: "", label: t("w.analyze.ex.mapTitle") };
    case "surface":
      return { ...splitVal(fmtTonnage(s.peakKg, units)), label: t("w.analyze.ex.surfaceTitle") };
    case "compare":
      return s.compare.kind === "strength"
        ? { ...splitVal(fmtTonnage(s.compare.cur.volumeKg, units)), deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.ex.compareTitle") }
        : { v: String(s.compare.cur.distanceKm), u: "km", deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.ex.compareTitle") };
    case "consistency":
      return { v: String(s.weeksTrained), u: `${t("w.analyze.exp.of")} ${s.weeksTotal}`, label: t("w.analyze.exp.consistency") };
    case "paceTrend":
      return { v: s.bestSec != null ? paceClock(s.bestSec) : "–", u: "/km", deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.exp.paceTrend") };
    case "paceCurve":
      return { v: s.fastestBandSec != null ? paceClock(s.fastestBandSec) : "–", u: "/km", label: t("w.analyze.exp.paceCurve") };
    case "runDeltas":
      return {
        v: s.lastDeltaSec != null ? `${s.lastDeltaSec > 0 ? "+" : ""}${s.lastDeltaSec}` : "–",
        u: "s",
        deltaPct: null,
        improving: s.lastDeltaSec != null ? s.lastDeltaSec < 0 : null,
        label: t("w.analyze.exp.runDeltas"),
      };
  }
}

/* ── slide charts — full-bleed, one faint reference, corner date labels ── */

function CornerLabels({ l, r }: { l?: string; r?: string }) {
  if (!l && !r) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), padding: "2px 2px 0" }}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
}

function TrendChart({ data, stroke, reversed, fmt, id }: { data: { x: string; y: number; pr?: boolean }[]; stroke: string; reversed?: boolean; fmt: (v: number) => string; id: string }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data} margin={{ top: 14, right: 6, bottom: 4, left: 6 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="x" hide />
          <YAxis hide domain={["auto", "auto"]} reversed={reversed} />
          <Tooltip contentStyle={tip} formatter={(v) => fmt(Number(v))} />
          <Area
            type="monotone" dataKey="y" stroke={stroke} strokeWidth={2.5} fill={`url(#${id})`} isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; payload?: { pr?: boolean }; index?: number }) =>
              p.payload?.pr
                ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4.5} fill={stroke} stroke={INK_HEX} strokeWidth={2} />
                : <g key={p.index} />}
            activeDot={{ r: 4, fill: stroke, stroke: INK_HEX, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <CornerLabels l={data[0]?.x} r={data.at(-1)?.x} />
    </>
  );
}

function TonnageChart({ weeks, units, t }: { weeks: { baseKg: number; hardKg: number }[]; units: WeightUnit; t: (k: string) => string }) {
  const data = weeks.map((w, i) => ({ i, base: Math.round(kgToUnit(w.baseKg, units)), hard: Math.round(kgToUnit(w.hardKg, units)), baseKg: w.baseKg, hardKg: w.hardKg }));
  return (
    <>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 14, right: 0, bottom: 4, left: 0 }} barCategoryGap="18%">
          <XAxis dataKey="i" hide />
          <YAxis hide />
          <Tooltip contentStyle={tip} formatter={(_v, key, item) => fmtTonnage(key === "base" ? (item?.payload as { baseKg: number }).baseKg : (item?.payload as { hardKg: number }).hardKg, units)} />
          <Bar dataKey="base" stackId="t" fill={DEEP_BASE} name={t("w.analyze.ex.tonnageBase")} isAnimationActive={false} radius={[2, 2, 2, 2]} />
          <Bar dataKey="hard" stackId="t" fill={DEEP_HARD} name={t("w.analyze.ex.tonnageHard")} isAnimationActive={false} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <CornerLabels l={t("w.analyze.exp.weeksAgo").replace("{n}", String(weeks.length))} r={t("w.analyze.exp.now")} />
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: DEEP_BASE }} />{t("w.analyze.ex.tonnageBase")}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: DEEP_HARD }} />{t("w.analyze.ex.tonnageHard")}</span>
      </div>
    </>
  );
}

function MinutesChart({ weeks, stroke, t }: { weeks: { minutes: number }[]; stroke: string; t: (k: string) => string }) {
  const data = weeks.map((w, i) => ({ i, y: w.minutes }));
  return (
    <>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 14, right: 0, bottom: 4, left: 0 }} barCategoryGap="18%">
          <XAxis dataKey="i" hide />
          <YAxis hide />
          <Tooltip contentStyle={tip} formatter={(v) => `${v} min`} />
          <Bar dataKey="y" fill={stroke} isAnimationActive={false} radius={[3, 3, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
      <CornerLabels l={t("w.analyze.exp.weeksAgo").replace("{n}", String(weeks.length))} r={t("w.analyze.exp.now")} />
    </>
  );
}

function DeltasChart({ runs }: { runs: { date: string; deltaSec: number }[] }) {
  const { theme } = useTheme();
  const data = runs.map((r) => ({ x: fmtDate(r.date), y: r.deltaSec }));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 24, right: 6, bottom: 4, left: 6 }} barCategoryGap="28%">
        <XAxis dataKey="x" hide />
        <YAxis hide />
        <ReferenceLine y={0} stroke={LINE_HEX} />
        <Tooltip contentStyle={tip} formatter={(v) => `${Number(v) > 0 ? "+" : ""}${v} s/km`} />
        <Bar dataKey="y" isAnimationActive={false} radius={[3, 3, 3, 3]}>
          {data.map((d, i) => <Cell key={i} fill={d.y < 0 ? upHex(theme) : downHex(theme)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** thin typographic meter rows (zones / load mix / pace curve) */
function MeterRows({ rows, color }: { rows: { label: string; pct: number; value: string }[]; color: string }) {
  const hi = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div style={{ padding: "22px 0 8px" }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "64px 1fr 56px", alignItems: "center", gap: 12, marginTop: 14 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{r.label}</span>
          <span style={{ height: 3, borderRadius: 2, background: C("line"), overflow: "hidden", display: "block" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 2, width: `${(r.pct / hi) * 100}%`, background: color, opacity: 0.45 + (r.pct / hi) * 0.55 }} />
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "right" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type SlideOf<K extends ExercisePageSlide["kind"]> = Extract<ExercisePageSlide, { kind: K }>;

/* ── deep-dive slides — the retired dashboard's charts, unboxed & full-bleed ── */

function RepMaxGrid({ slide, units, t }: { slide: SlideOf<"repMax">; units: WeightUnit; t: (k: string) => string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 88px), 1fr))", gap: 8, padding: "16px 0 6px" }}>
      {slide.cells.map((cell, i) => (
        <div
          key={i}
          title={cell ? `${fmtWeight(cell.loadKg, units)} × ${cell.reps} – ${t("w.analyze.ex.e1rmLabel")} ${fmtWeight(cell.e1rm, units)} – ${fmtDate(cell.when)}` : undefined}
          style={{ border: `1px ${cell ? "solid" : "dashed"} ${cell?.recent ? C("lime") : C("line")}`, borderRadius: 14, padding: "12px 6px", textAlign: "center" }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), letterSpacing: ".08em" }}>{i + 1}RM</div>
          <div style={{ fontWeight: 800, fontSize: 18, margin: "5px 0 2px", color: cell ? (cell.recent ? "var(--lime-text)" : C("chalk")) : C("ash") }}>{cell ? Math.round(kgToUnit(cell.loadKg, units)) : "–"}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{cell ? fmtDate(cell.when) : t("w.analyze.ex.repmaxTry")}</div>
        </div>
      ))}
    </div>
  );
}

function ScatterChart({ slide, stroke, units, t }: { slide: SlideOf<"loadReps">; stroke: string; units: WeightUnit; t: (k: string) => string }) {
  const map = slide.map;
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 8 }}>
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
        <circle key={i} cx={X(p.reps) + ((i % 5) - 2) * 2.5} cy={Y(p.loadKg)} r={p.recent ? 4.5 : 3.5} fill={p.recent ? stroke : ASH} opacity={p.recent ? 1 : 0.45}>
          <title>{`${fmtWeight(p.loadKg, units)} × ${p.reps}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function SurfaceChart({ slide, t }: { slide: SlideOf<"surface">; t: (k: string) => string }) {
  const s = slide.surface;
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
          <path d={`M${x},${y - h} l${wdt},${-dep * 0.5} l${wdt * 0.6},${dep * 0.35} l${-wdt},${dep * 0.5} Z`} fill={c} stroke={INK_HEX} strokeWidth={0.75} />
        </g>,
      );
    }
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: 460 }}>
        {cols}
        {s.bins.map((bn, b) => (
          <text key={bn} x={px(weeks - 1, b) + ix * 1.5} y={py(weeks - 1, b) + 12} fill={ASH} style={{ ...mono, fontSize: 10 }}>{bn} {t("w.analyze.ex.surfaceReps")}</text>
        ))}
        {Array.from({ length: Math.ceil(weeks / 2) }, (_, i) => i * 2).map((w) => (
          <text key={w} x={px(w, 0) - 4} y={py(w, 0) - zh - 22} fill={ASH} style={{ ...mono, fontSize: 10 }}>W{w + 1}</text>
        ))}
      </svg>
    </div>
  );
}

function PaceCurveChart({ slide, stroke, t }: { slide: SlideOf<"paceCurve">; stroke: string; t: (k: string) => string }) {
  const bands = slide.bands;
  if (bands.length < 2)
    return <MeterRows color={stroke} rows={bands.map((b) => ({ label: b.label, pct: b.bestAllSec ? 1 / b.bestAllSec : 0, value: b.bestAllSec ? paceClock(b.bestAllSec) : "–" }))} />;
  const data = bands.map((b) => ({ w: b.label, all: b.bestAllSec, recent: b.bestRecentSec }));
  return (
    <>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 14, right: 6, bottom: 4, left: 6 }}>
          <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} tickLine={false} axisLine={false} />
          <YAxis hide reversed domain={["auto", "auto"]} />
          <Tooltip contentStyle={tip} formatter={(v) => (v == null ? "–" : `${paceClock(Number(v))} /km`)} />
          <Line type="monotone" dataKey="all" stroke={ASH} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} name={t("w.analyze.ex.paceCurveAll")} />
          <Line type="monotone" dataKey="recent" stroke={stroke} strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} name={t("w.analyze.ex.paceCurveRecent")} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.ex.paceCurveRecent")} — {t("w.analyze.ex.paceCurveAll")}</div>
    </>
  );
}

function CompareChart({ slide, units, t }: { slide: SlideOf<"compare">; units: WeightUnit; t: (k: string) => string }) {
  const compare = slide.compare;
  const tiles =
    compare.kind === "strength"
      ? [
          { l: t("w.analyze.ex.bestE1rm"), cur: String(Math.round(kgToUnit(compare.cur.bestE1rm, units))), was: String(Math.round(kgToUnit(compare.prev.bestE1rm, units))), good: compare.cur.bestE1rm >= compare.prev.bestE1rm, same: compare.cur.bestE1rm === compare.prev.bestE1rm },
          { l: t("w.analyze.ex.cmpVolume"), cur: fmtTonnage(compare.cur.volumeKg, units), was: fmtTonnage(compare.prev.volumeKg, units), good: compare.cur.volumeKg >= compare.prev.volumeKg, same: compare.cur.volumeKg === compare.prev.volumeKg },
          { l: t("w.analyze.ex.cmpHardSets"), cur: String(compare.cur.hardSets), was: String(compare.prev.hardSets), good: compare.cur.hardSets >= compare.prev.hardSets, same: compare.cur.hardSets === compare.prev.hardSets },
          { l: t("w.analyze.ex.cmpSessions"), cur: String(compare.cur.sessions), was: String(compare.prev.sessions), good: compare.cur.sessions >= compare.prev.sessions, same: compare.cur.sessions === compare.prev.sessions },
        ]
      : [
          { l: t("w.analyze.ex.cmpDistance"), cur: `${compare.cur.distanceKm} km`, was: `${compare.prev.distanceKm} km`, good: compare.cur.distanceKm >= compare.prev.distanceKm, same: compare.cur.distanceKm === compare.prev.distanceKm },
          { l: t("w.analyze.ex.cmpRuns"), cur: String(compare.cur.runs), was: String(compare.prev.runs), good: compare.cur.runs >= compare.prev.runs, same: compare.cur.runs === compare.prev.runs },
          { l: t("w.analyze.ex.cmpAvgPace"), cur: compare.cur.avgPaceSec != null ? paceClock(compare.cur.avgPaceSec) : "–", was: compare.prev.avgPaceSec != null ? paceClock(compare.prev.avgPaceSec) : "–", good: (compare.cur.avgPaceSec ?? Infinity) <= (compare.prev.avgPaceSec ?? Infinity), same: compare.cur.avgPaceSec === compare.prev.avgPaceSec },
          { l: t("w.analyze.ex.cmpBestPace"), cur: compare.cur.bestPaceSec != null ? paceClock(compare.cur.bestPaceSec) : "–", was: compare.prev.bestPaceSec != null ? paceClock(compare.prev.bestPaceSec) : "–", good: (compare.cur.bestPaceSec ?? Infinity) <= (compare.prev.bestPaceSec ?? Infinity), same: compare.cur.bestPaceSec === compare.prev.bestPaceSec },
        ];
  const weekly = compare.weeklyCur.map((v, i) => ({
    w: `W${i + 1}`,
    cur: compare.kind === "strength" ? Math.round(kgToUnit(v, units)) : v,
    prev: compare.kind === "strength" ? Math.round(kgToUnit(compare.weeklyPrev[i] ?? 0, units)) : compare.weeklyPrev[i] ?? 0,
    curKg: v, prevKg: compare.weeklyPrev[i] ?? 0,
  }));
  const fmtWeekly = (kg: number) => (compare.kind === "strength" ? fmtTonnage(kg, units) : `${kg} km`);
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={weekly} margin={{ top: 14, right: 6, bottom: 4, left: 6 }}>
          <XAxis dataKey="w" hide />
          <YAxis hide />
          <Tooltip contentStyle={tip} formatter={(_v, key, item) => fmtWeekly(key === "cur" ? (item?.payload as { curKg: number }).curKg : (item?.payload as { prevKg: number }).prevKg)} />
          <Line type="monotone" dataKey="prev" stroke={ASH} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} name={t("w.analyze.ex.comparePrev")} />
          <Line type="monotone" dataKey="cur" stroke={VIOLET} strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} name={t("w.analyze.ex.compareCur")} />
        </LineChart>
      </ResponsiveContainer>
      <CornerLabels l={t("w.analyze.ex.comparePrev")} r={t("w.analyze.ex.compareCur")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginTop: 14 }}>
        {tiles.map((tile) => (
          <div key={tile.l} style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: fs.subtitle, fontWeight: 700 }}>{tile.cur}</span>
              {!tile.same && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, fontWeight: 700, color: tile.good ? "var(--blue-text)" : "var(--red-text)" }}>{tile.good ? "▲" : "▼"}</span>}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash"), marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tile.l} – {t("w.analyze.ex.compareWas")} {tile.was}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const heatBg = (level: number): string => {
  if (level <= 0) return "var(--color-line)";
  if (level >= 4) return "var(--color-lime)";
  const pct = level === 1 ? 28 : level === 2 ? 50 : 74;
  return `color-mix(in srgb, var(--color-lime) ${pct}%, transparent)`;
};

function ConsistencyHeat({ slide, foot, t }: { slide: SlideOf<"consistency">; foot: string; t: (k: string) => string }) {
  const d = slide.detail;
  if (d.activeDays === 0) return <ConsistencyDots weekly={slide.weekly} foot={foot} />;
  const stats = [
    { v: String(d.weekStreak), l: t("w.analyze.ex.weekStreak") },
    { v: String(d.perWeek), l: t("w.analyze.ex.perWeek") },
    { v: String(d.longestGapDays), l: t("w.analyze.ex.longestGap") },
    { v: String(d.activeDays), l: t("w.analyze.ex.activeDays") },
  ];
  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: "grid", gridTemplateRows: "repeat(7,1fr)", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 3, height: 118 }}>
        {d.heat.map((col, ci) =>
          col.map((cell, ri) => (
            <div key={`${ci}-${ri}`} title={`${cell.date} – ${cell.count}×`} style={{ borderRadius: 2.5, background: heatBg(cell.level) }} />
          )),
        )}
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        {stats.map((st) => (
          <div key={st.l} style={{ flex: 1 }}>
            <div style={{ fontSize: fs.subtitle, fontWeight: 700 }}>{st.v}</div>
            <div style={{ marginTop: 3, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash") }}>{st.l}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{foot}</div>
    </div>
  );
}

function ConsistencyDots({ weekly, foot }: { weekly: number[]; foot: string }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "24px 0 0" }}>
      {weekly.map((w, i) => (
        <i key={i} style={{ width: 9, height: 9, borderRadius: 999, background: w > 0 ? `color-mix(in srgb, ${C("lime")} ${[0, 26, 52, 88][Math.min(w, 3)]}%, ${C("ink")})` : C("line") }} />
      ))}
      <span style={{ flexBasis: "100%", marginTop: 12, fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{foot}</span>
    </div>
  );
}

function SlideChart({ slide, stroke, units, t }: { slide: ExercisePageSlide; stroke: string; units: WeightUnit; t: (k: string) => string }) {
  switch (slide.kind) {
    case "weightTrend":
      return <TrendChart id={`exp-weight`} data={slide.points.map((p) => ({ x: fmtDate(p.date), y: Math.round(kgToUnit(p.weightKg, units)), pr: p.pr }))} stroke={stroke} fmt={(v) => `${v} ${units}`} />;
    case "paceTrend":
      return <TrendChart id={`exp-pace`} data={slide.points.map((p) => ({ x: fmtDate(p.date), y: p.secPerKm }))} stroke={stroke} reversed fmt={(v) => `${paceClock(v)} /km`} />;
    case "tonnage":
      return <TonnageChart weeks={slide.weeks} units={units} t={t} />;
    case "zones":
      return (
        <MeterRows
          color={stroke}
          rows={slide.zones.map((z) => ({ label: z.zone === "<60" ? "<60%" : `${z.zone}%+`, pct: z.share, value: `${Math.round(z.share * 100)}%` }))}
        />
      );
    case "repMax":
      return <RepMaxGrid slide={slide} units={units} t={t} />;
    case "loadReps":
      return <ScatterChart slide={slide} stroke={stroke} units={units} t={t} />;
    case "surface":
      return <SurfaceChart slide={slide} t={t} />;
    case "compare":
      return <CompareChart slide={slide} units={units} t={t} />;
    case "weeklyMinutes":
      return <MinutesChart weeks={slide.weeks} stroke={stroke} t={t} />;
    case "paceCurve":
      return <PaceCurveChart slide={slide} stroke={stroke} t={t} />;
    case "runDeltas":
      return <DeltasChart runs={slide.runs} />;
    case "consistency":
      return <ConsistencyHeat slide={slide} foot={t("w.analyze.exp.consistencyFoot")} t={t} />;
  }
}

/**
 * The individual exercise page (variant B): no boxes — one hero number pairs
 * with one full-bleed chart and follows the swipe; hairline segments, a quiet
 * ALL STATS expansion and a typographic substats row. Prototype:
 * reference/exercises-widget-preview-ive.html.
 */
export default function AuroraExercisePage({
  sessions,
  name,
  onBack,
}: {
  sessions: LoggedSession[];
  name: string;
  onBack: () => void;
}) {
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units, countWarmupsInVolume } = useLoggerPrefs();
  const { theme } = useTheme();
  const [period, setPeriod] = useState<ExercisePeriod>("8w");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [heroFade, setHeroFade] = useState(false);
  const pagerRef = useRef<HTMLDivElement>(null);

  const model = useMemo(
    () => exercisePageModel(sessions, name, period, { bw, countWarmupsInVolume }),
    [sessions, name, period, bw, countWarmupsInVolume],
  );
  const slides = model.slides;
  const stroke = kindStroke(theme, model.kind);
  const active = Math.min(page, slides.length - 1);
  const hero = slideHero(slides[showAll ? 0 : active]!, units, t);

  // the number follows the swipe — quiet crossfade on page change
  const flip = (i: number) => {
    if (i === page) return;
    setHeroFade(true);
    setTimeout(() => { setPage(i); setHeroFade(false); }, 150);
  };
  useEffect(() => { setPage(0); pagerRef.current?.scrollTo({ left: 0 }); }, [name, period]);

  const scrollBy = (dir: 1 | -1) => {
    const el = pagerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const s = model.stats;
  // duration movements (conditioning + minutes-only cardio): the dashboard's
  // strength/cardio aggregates read 0 for them, so the row speaks in minutes
  const minSlide = model.slides.find((sl) => sl.kind === "weeklyMinutes");
  const consSlide = model.slides.find((sl) => sl.kind === "consistency");
  const substats: { v: string; l: string }[] = minSlide && minSlide.kind === "weeklyMinutes"
    ? [
        { v: String(model.sessionsInPeriod), l: t("w.analyze.ex.sessions") },
        { v: `${minSlide.weeks.reduce((a, w) => a + w.minutes, 0)} min`, l: t("w.analyze.exp.minutes") },
        ...(consSlide && consSlide.kind === "consistency"
          ? [{ v: `${consSlide.weeksTrained}/${consSlide.weeksTotal}`, l: t("w.analyze.exp.weeksTrained") }]
          : []),
      ]
    : s.kind === "cardio"
      ? [
          { v: String(s.efforts), l: t("w.analyze.ex.runs") },
          { v: `${s.distanceKm} km`, l: t("w.analyze.ex.distance") },
          { v: `${s.longestKm} km`, l: t("w.analyze.ex.longest") },
          { v: s.bestPaceSecPerKm != null ? paceClock(s.bestPaceSecPerKm) : "–", l: t("w.analyze.ex.bestPace") },
        ]
      : [
          { v: String(s.workingSets), l: t("w.analyze.ex.workingSets") },
          { v: fmtTonnage(s.volume, units), l: t("w.analyze.ex.volume") },
          { v: String(s.sessions), l: t("w.analyze.ex.sessions") },
          { v: s.bestSet ? `${Math.round(kgToUnit(s.bestSet.load, units))}×${s.bestSet.reps}` : "–", l: t("w.analyze.ex.bestSet") },
        ];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* header — a bare ‹ and the name; hairlines are the only structure here */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={onBack} aria-label={t("w.analyze.exp.back")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 22, padding: "6px 10px 6px 0", lineHeight: 1 }}>
          ‹
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.01em", margin: 0 }}>{name}</h1>
      </div>

      {/* HOW IT'S DONE — looping animation + muscles worked + form cues (gym
          lifts only; cardio/custom names render nothing). */}
      <AuroraExerciseAnatomy name={name} />

      <div style={{ display: "flex", gap: 18, margin: "18px 2px 6px" }}>
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: period === p.id ? C("chalk") : C("ash"), borderBottom: `2px solid ${period === p.id ? C("lime") : "transparent"}` }}>
            {t(p.key)}
          </button>
        ))}
      </div>

      {/* HERO — one number, paired with the visible chart */}
      <div style={{ margin: "18px 2px 4px", minHeight: 84, opacity: heroFade ? 0 : 1, transition: "opacity .15s ease" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 50, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1 }}>
          {hero.v}
          <span style={{ fontSize: fs.subtitle, fontWeight: 500, color: C("ash"), letterSpacing: 0 }}>{hero.u}</span>
          <span style={{ marginLeft: "auto" }}>
            <TickerDelta deltaPct={hero.deltaPct ?? null} improving={hero.improving ?? null} size={fs.caption} />
          </span>
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{hero.label}</div>
      </div>

      {!showAll ? (
        <>
          <div style={{ position: "relative" }}>
            <div
              ref={pagerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                flip(Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
              }}
              style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
            >
              {slides.map((slide, i) => (
                <div key={slide.kind} style={{ flex: "0 0 100%", scrollSnapAlign: "center", minWidth: 0 }}>
                  {Math.abs(i - active) <= 1 ? <SlideChart slide={slide} stroke={stroke} units={units} t={t} /> : <div style={{ height: 230 }} />}
                </div>
              ))}
            </div>
            {active > 0 && (
              <button onClick={() => scrollBy(-1)} aria-label={t("w.analyze.exp.prev")} style={{ position: "absolute", left: -6, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: C("chalk"), fontSize: 20, opacity: 0.35 }}>
                ‹
              </button>
            )}
            {active < slides.length - 1 && (
              <button onClick={() => scrollBy(1)} aria-label={t("w.analyze.exp.next")} style={{ position: "absolute", right: -6, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: C("chalk"), fontSize: 20, opacity: 0.35 }}>
                ›
              </button>
            )}
          </div>
          {/* hairline segment indicator */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "16px auto 0", width: 132 }}>
            {slides.map((sl, i) => (
              <i key={sl.kind} style={{ height: 2, flex: 1, borderRadius: 2, background: i === active ? C("lime") : C("line"), transition: "background .25s ease" }} />
            ))}
          </div>
        </>
      ) : (
        <div>
          {slides.map((slide, i) => (
            <div key={slide.kind} style={{ borderTop: i === 0 ? "none" : `1px solid ${C("line")}`, padding: i === 0 ? "6px 0 26px" : "22px 0 26px" }}>
              {i > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 14 }}>
                  {slideHero(slide, units, t).label}
                </div>
              )}
              <SlideChart slide={slide} stroke={stroke} units={units} t={t} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", justifyContent: "center", marginTop: 18 }}>
        <button
          onClick={() => { setShowAll(!showAll); setPage(0); pagerRef.current?.scrollTo({ left: 0 }); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), padding: "8px 14px" }}
        >
          {showAll ? t("w.analyze.exp.less") : t("w.analyze.exp.allStats")}
        </button>
      </div>

      {/* quiet substats — typography over one hairline */}
      <div style={{ display: "flex", margin: `${space.lg}px 2px 0`, paddingTop: 18, borderTop: `1px solid ${C("line")}` }}>
        {substats.map((st) => (
          <div key={st.l} style={{ flex: 1 }}>
            <div style={{ fontSize: fs.subtitle, fontWeight: 700 }}>{st.v}</div>
            <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash") }}>{st.l}</div>
          </div>
        ))}
      </div>

      {/* BEST SET + velocity — quiet typography over one hairline (the rest of
          the retired dashboard lives IN the slide pager above). */}
      {s.kind === "strength" && s.bestSet && (
        <div style={{ margin: "18px 2px 0", paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)" }}>{t("w.analyze.ex.bestSet")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.note, marginTop: 8 }}>{fmtWeight(s.bestSet.load, units)} × {s.bestSet.reps} <span style={{ color: C("ash") }}>– {t("w.analyze.ex.e1rmLabel")} {fmtWeight(s.bestSet.e1rm, units)} – {fmtDate(s.bestSet.when)}</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8 }}>{s.totalReps} {t("w.analyze.ex.repsTail")} {fmtWeight(s.heaviestLoad, units)} {t("w.analyze.ex.allTimeBest")} {fmtWeight(s.bestE1rmAllTime, units)}</div>
          {s.velocity && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 8 }}>{t("w.analyze.ex.velocityProfile")} <span style={{ color: "var(--lime-text)" }}>{fmtWeight(s.velocity.e1rm, units)}</span> – {t("w.analyze.ex.velEstPre")} {s.velocity.r2} – {s.velocity.n} {t("w.analyze.ex.velEstTail")}</div>
          )}
        </div>
      )}
    </div>
  );
}
