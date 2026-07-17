"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  repMaxMatrix, loadRepsScatter, tonnageSurface, exerciseConsistency, paceCurve, blockCompare,
  paceClock, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type WeightUnit, type HeatCell, type BlockCompare,
  type ExerciseConsistency as Consistency, type BodyweightInput,
} from "@hybrid/core";
import { fs, space, LINE_HEX, LIME_HEX, ASH, BLUE, VIOLET, tip, mono } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
const C = (v: string) => `var(--color-${v})`;
export const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18 } as const;
export const kicker = { fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase" as const, letterSpacing: ".12em", color: C("ash"), marginBottom: 10 };

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

/** The v2 analytics cards that the exercise page's slides DON'T already cover —
 *  rendered below the page's substats as its deep-dive stack. (e1RM/PR trend,
 *  weekly tonnage, %e1RM zones, pace trend and run deltas live as slides; the
 *  rep-max matrix, load×reps map, tonnage landscape, consistency heat calendar,
 *  recent-vs-all pace curve and block compare live here.) The exact mirror of
 *  mobile aurora/exercise-charts.tsx, computed from the SAME @hybrid/core
 *  aggregators. */
export default function ExerciseAnalytics({ sessions, name, kind, units, bw }: {
  sessions: LoggedSession[]; name: string; kind: "strength" | "cardio" | "conditioning";
  units: WeightUnit; bw?: BodyweightInput;
}) {
  const consistency = useMemo(() => exerciseConsistency(sessions, name, 26), [sessions, name]);
  const compare = useMemo(() => blockCompare(sessions, name, 8, Date.now(), bw), [sessions, name, bw]);
  if (kind === "cardio")
    return (
      <>
        <PaceCurveCard sessions={sessions} name={name} />
        <ConsistencyCard c={consistency} />
        <CompareCard compare={compare} units={units} />
      </>
    );
  return (
    <>
      <RepMaxCard sessions={sessions} name={name} units={units} bw={bw} />
      <ScatterCard sessions={sessions} name={name} units={units} bw={bw} />
      <SurfaceCard sessions={sessions} name={name} units={units} bw={bw} />
      <ConsistencyCard c={consistency} />
      <CompareCard compare={compare} units={units} />
    </>
  );
}

// ---------------------------------------------------------- 2. rep-max matrix

function RepMaxCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
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

// ------------------------------------------------------ 3. load×reps map

function ScatterCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
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

function SurfaceCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
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
