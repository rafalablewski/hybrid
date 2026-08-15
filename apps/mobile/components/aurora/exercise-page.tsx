import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Animated, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Svg, { G, Path, Polyline, Rect, Circle, Defs, LinearGradient, Stop, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { useLocalSearchParams } from "expo-router";
import {
  SHARED_ELEMENTS,
  exercisePageModel,
  exerciseSlideGeometry,
  exerciseSlideReading,
  fmtWeight,
  fmtTonnage,
  paceClock,
  kgToUnit,
  type ChartReading,
  type ExercisePageSlide,
  type ExercisePeriod,
  type ScrubMode,
  type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useSharedElementTarget } from "../../lib/shared-element";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { ChartReadout, readoutSide, useChartScrub } from "./chart-scrub";
import { AuroraScreen } from "./kit";
import { kindStroke, TickerDelta } from "./exercise-widget";
import AuroraExerciseAnatomy from "./exercise-anatomy";

// Chart-only raw hexes (mirror web exercise-page): the CVD-validated deep
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

/**
 * What a chart needs to answer a held finger: how many points it has, how they
 * occupy the width, and — per index — the figure (from core, where the units
 * live) and the sentence naming it (from here, where the language lives).
 *
 * A slide with no series to read (a scatter, a surface, the rep-max grid, the
 * consistency map, the meter rows) simply gets none, and its chart never binds
 * the gesture. Parity: the same type in the web twin.
 */
interface Held {
  count: number;
  mode: ScrubMode;
  read: (i: number) => ChartReading | null;
  when: (i: number) => string;
}
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
        improving: s.lastDeltaSec != null ? s.lastDeltaSec < 0 : null,
        label: t("w.analyze.exp.runDeltas"),
      };
  }
}

/* ── slide charts — full-bleed, one faint reference, corner date labels ── */

function CornerLabels({ C, l, r }: { C: Palette; l?: string; r?: string }) {
  if (!l && !r) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, paddingTop: 2 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{l}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{r}</Text>
    </View>
  );
}

function TrendChart({ C, data, stroke, reversed, id, held }: { C: Palette; data: { x: string; y: number; pr?: boolean }[]; stroke: string; reversed?: boolean; id: string; held?: Held }) {
  const W = 353, H = 220, T = 14, B = 8;
  const scrub = useChartScrub(held?.count ?? 0, held?.mode ?? "point");
  const n = data.length;
  if (n < 2) return null;
  let lo = Math.min(...data.map((d) => d.y)), hi = Math.max(...data.map((d) => d.y));
  const pad = (hi - lo) * 0.14 || 1;
  lo -= pad; hi += pad;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return reversed ? T + f * (H - T - B) : H - B - f * (H - T - B);
  };
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${X(i)},${Y(d.y)}`).join(" ");
  const mid = (lo + hi) / 2;
  const hit = held && scrub.index >= 0 && scrub.index < n ? scrub.index : -1;
  const read = hit >= 0 ? held!.read(hit) : null;
  return (
    <View {...(held ? scrub.bind : {})}>
      <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.18} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <SvgLine x1={0} x2={W} y1={Y(mid)} y2={Y(mid)} stroke={C.line} strokeDasharray="3 4" />
        <Path d={`${line} L${W},${H - B} L0,${H - B} Z`} fill={`url(#${id})`} />
        <Path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) =>
          d.pr ? <Circle key={i} cx={Math.min(X(i), W - 6)} cy={Y(d.y)} r={4.5} fill={stroke} stroke={C.ink} strokeWidth={2} /> : null,
        )}
        <Circle cx={Math.min(X(n - 1), W - 6)} cy={Y(data[n - 1]!.y)} r={4} fill={stroke} stroke={C.ink} strokeWidth={2} />
        {hit >= 0 && (
          <>
            <SvgLine x1={X(hit)} x2={X(hit)} y1={0} y2={H} stroke={C.ash} strokeWidth={1} strokeOpacity={0.55} />
            <Circle cx={Math.min(X(hit), W - 6)} cy={Y(data[hit]!.y)} r={5} fill={C.chalk} stroke={C.ink} strokeWidth={2} />
          </>
        )}
      </Svg>
      <CornerLabels C={C} l={data[0]?.x} r={data[n - 1]?.x} />
      {!!read && <ChartReadout read={read} C={C} side={readoutSide(hit, held!.count)} when={held!.when(hit)} />}
    </View>
  );
}

function TonnageChart({ C, weeks, units, t, held }: { C: Palette; weeks: { baseKg: number; hardKg: number }[]; units: WeightUnit; t: (k: string) => string; held?: Held }) {
  const W = 353, H = 220, T = 14, B = 8;
  const scrub = useChartScrub(held?.count ?? 0, held?.mode ?? "band");
  const n = weeks.length;
  const totals = weeks.map((w) => kgToUnit(w.baseKg + w.hardKg, units));
  const hi = Math.max(...totals, 1) * 1.08;
  const bw = W / n - 6;
  const Y = (v: number) => H - B - (v / hi) * (H - T - B);
  const hit = held && scrub.index >= 0 && scrub.index < n ? scrub.index : -1;
  const read = hit >= 0 ? held!.read(hit) : null;
  return (
    <View {...(held ? scrub.bind : {})}>
      <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
        {weeks.map((w, i) => {
          const x = (i + 0.5) * (W / n) - bw / 2;
          const base = kgToUnit(w.baseKg, units), tot = totals[i]!;
          const yb = Y(base), yt = Y(tot);
          return (
            // Held, every week but the finger's recedes — the chart answers one
            // question at a time.
            <G key={i} opacity={hit >= 0 && i !== hit ? 0.4 : 1}>
              <Rect x={x} y={yb} width={bw} height={H - B - yb} fill={DEEP_BASE} rx={2} />
              {tot > base ? <Rect x={x} y={yt} width={bw} height={Math.max(0, yb - yt - 2)} fill={DEEP_HARD} rx={3} /> : null}
            </G>
          );
        })}
      </Svg>
      <CornerLabels C={C} l={t("w.analyze.exp.weeksAgo").replace("{n}", String(n))} r={t("w.analyze.exp.now")} />
      {!!read && <ChartReadout read={read} C={C} side={readoutSide(hit, held!.count)} when={held!.when(hit)} />}
      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        {[{ c: DEEP_BASE, l: t("w.analyze.ex.tonnageBase") }, { c: DEEP_HARD, l: t("w.analyze.ex.tonnageHard") }].map((i) => (
          <View key={i.l} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: i.c }} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{i.l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MinutesChart({ C, weeks, stroke, t, held }: { C: Palette; weeks: { minutes: number }[]; stroke: string; t: (k: string) => string; held?: Held }) {
  const W = 353, H = 220, T = 14, B = 8;
  const scrub = useChartScrub(held?.count ?? 0, held?.mode ?? "band");
  const n = weeks.length;
  const hi = Math.max(...weeks.map((w) => w.minutes), 1) * 1.08;
  const bw = W / n - 6;
  const hit = held && scrub.index >= 0 && scrub.index < n ? scrub.index : -1;
  const read = hit >= 0 ? held!.read(hit) : null;
  return (
    <View {...(held ? scrub.bind : {})}>
      <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
        {weeks.map((w, i) => {
          const x = (i + 0.5) * (W / n) - bw / 2;
          const y = H - B - (w.minutes / hi) * (H - T - B);
          return <Rect key={i} x={x} y={y} width={bw} height={H - B - y} fill={stroke} rx={2.5} opacity={hit >= 0 && i !== hit ? 0.4 : 1} />;
        })}
      </Svg>
      <CornerLabels C={C} l={t("w.analyze.exp.weeksAgo").replace("{n}", String(n))} r={t("w.analyze.exp.now")} />
      {!!read && <ChartReadout read={read} C={C} side={readoutSide(hit, held!.count)} when={held!.when(hit)} />}
    </View>
  );
}

function DeltasChart({ C, runs, held }: { C: Palette; runs: { date: string; deltaSec: number }[]; held?: Held }) {
  const W = 353, H = 200, T = 26, B = 26;
  const scrub = useChartScrub(held?.count ?? 0, held?.mode ?? "band");
  const n = runs.length;
  if (n === 0) return null;
  const mid = (H - B + T) / 2;
  const hi = Math.max(...runs.map((r) => Math.abs(r.deltaSec)), 1) * 1.15;
  const bw = W / n - 12;
  const up = txt(C, C.lime), down = txt(C, C.red);
  const hit = held && scrub.index >= 0 && scrub.index < n ? scrub.index : -1;
  const read = hit >= 0 ? held!.read(hit) : null;
  return (
    <View {...(held ? scrub.bind : {})}>
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <SvgLine x1={0} x2={W} y1={mid} y2={mid} stroke={C.line} />
      {runs.map((r, i) => {
        const x = (i + 0.5) * (W / n) - bw / 2;
        const h = (Math.abs(r.deltaSec) / hi) * (mid - T);
        const faster = r.deltaSec < 0;
        return (
          <G key={i} opacity={hit >= 0 && i !== hit ? 0.4 : 1}>
            <Rect x={x} y={faster ? mid + 2 : mid - 2 - h} width={bw} height={h} rx={2.5} fill={faster ? up : down} />
            <SvgText
              x={x + bw / 2}
              y={faster ? mid + h + 16 : mid - h - 8}
              textAnchor="middle"
              fontFamily={F.monoBold}
              fontSize={9.5}
              fill={faster ? up : down}
            >
              {`${r.deltaSec > 0 ? "+" : ""}${r.deltaSec}`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
    {!!read && <ChartReadout read={read} C={C} side={readoutSide(hit, held!.count)} when={held!.when(hit)} />}
    </View>
  );
}

/** thin typographic meter rows (zones / load mix / pace curve) */
function MeterRows({ C, rows, color }: { C: Palette; rows: { label: string; pct: number; value: string }[]; color: string }) {
  const hi = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <View style={{ paddingTop: 24, paddingBottom: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Text style={{ width: 64, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{r.label}</Text>
          <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: C.line, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 2, width: `${(r.pct / hi) * 100}%`, backgroundColor: color, opacity: 0.45 + (r.pct / hi) * 0.55 }} />
          </View>
          <Text style={{ width: 56, textAlign: "right", fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

type SlideOf<K extends ExercisePageSlide["kind"]> = Extract<ExercisePageSlide, { kind: K }>;

/* ── deep-dive slides — the retired dashboard's charts, unboxed & full-bleed ── */

function RepMaxGrid({ C, slide, units, t }: { C: Palette; slide: SlideOf<"repMax">; units: WeightUnit; t: (k: string) => string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 16, paddingBottom: 6 }}>
      {slide.cells.map((cell, i) => (
        <View key={i} style={{ width: "18%", flexGrow: 1, minWidth: 62, borderRadius: 16, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: cell?.recent ? C.lime : C.line, ...(cell ? null : { borderStyle: "dashed" as const }) }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, letterSpacing: tracking.label }}>{i + 1}RM</Text>
          <Text style={{ fontFamily: F.black, fontSize: 16, marginVertical: 3, color: cell ? (cell.recent ? txt(C, C.lime) : C.chalk) : C.ash }}>{cell ? Math.round(kgToUnit(cell.loadKg, units)) : "–"}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{cell ? fmtDate(cell.when) : t("w.analyze.ex.repmaxTry")}</Text>
        </View>
      ))}
    </View>
  );
}

function ScatterChart({ C, slide, stroke, units, t }: { C: Palette; slide: SlideOf<"loadReps">; stroke: string; units: WeightUnit; t: (k: string) => string }) {
  const map = slide.map;
  const W = 353, H = 220, L = 30, R = 8, T = 12, B = 20;
  const topIso = map.isolines[map.isolines.length - 1] ?? map.maxLoadKg;
  const yMax = Math.max(map.maxLoadKg, topIso) * 1.06;
  const yMin = Math.min(...map.points.map((p) => p.loadKg)) * 0.9;
  const X = (r: number) => L + ((r - 0.5) * (W - L - R)) / 12;
  const Y = (kg: number) => T + ((yMax - kg) * (H - T - B)) / (yMax - yMin || 1);
  // reduced-density axes (web draws every step): step sized so ~3-4 lines fit
  const rawStep = (yMax - yMin) / 3.5;
  const gridStep = rawStep > 30 ? 40 : rawStep > 15 ? 20 : rawStep > 7 ? 10 : 5;
  const gridLines: number[] = [];
  for (let g = Math.ceil(yMin / gridStep) * gridStep; g < yMax; g += gridStep) gridLines.push(g);
  const repTicks = [1, 3, 5, 8, 10, 12];
  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H }}>
        {gridLines.map((g) => (
          <G key={g}>
            <SvgLine x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
            <SvgText x={L - 6} y={Y(g) + 3} textAnchor="end" fontFamily={F.mono} fontSize={9} fill={C.ash} opacity={0.7}>{Math.round(kgToUnit(g, units))}</SvgText>
          </G>
        ))}
        {repTicks.map((r) => (
          <SvgText key={r} x={X(r)} y={H - 4} textAnchor="middle" fontFamily={F.mono} fontSize={9} fill={C.ash} opacity={0.7}>{r}</SvgText>
        ))}
        {map.isolines.map((iso) => {
          let d = "";
          for (let r = 0.6; r <= 12.4; r += 0.3) {
            const kg = iso / (1 + r / 30);
            if (kg < yMin || kg > yMax) continue;
            d += `${d ? "L" : "M"}${X(r).toFixed(1)},${Y(kg).toFixed(1)}`;
          }
          const labelY = Y(Math.min(yMax * 0.985, iso / (1 + 0.6 / 30)));
          return (
            <G key={iso}>
              <Path d={d} fill="none" stroke={C.ash} strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} />
              <SvgText x={L + 6} y={labelY - 5} fontFamily={F.mono} fontSize={9} fill={C.ash} opacity={0.7}>{Math.round(kgToUnit(iso, units))}</SvgText>
            </G>
          );
        })}
        {map.points.map((p, i) => (
          <Circle key={i} cx={X(p.reps) + ((i % 5) - 2) * 1.6} cy={Y(p.loadKg)} r={p.recent ? 3.6 : 2.8} fill={p.recent ? stroke : C.ash} opacity={p.recent ? 1 : 0.45} />
        ))}
      </Svg>
      <CornerLabels C={C} l={`${Math.round(kgToUnit(yMin, units))}–${Math.round(kgToUnit(yMax, units))} ${units}`} r={`1–12 ${t("w.analyze.ex.mapReps")}`} />
    </View>
  );
}

function SurfaceChart({ C, slide, t }: { C: Palette; slide: SlideOf<"surface">; t: (k: string) => string }) {
  const s = slide.surface;
  const weeks = s.weeks.length, bins = s.bins.length;
  const ix = 24, iy = 11, zh = 48, ox = 30, oy = 76, W = 460, H = 220;
  const px = (w: number, b: number) => ox + w * ix + b * ix * 0.72;
  const py = (w: number, b: number) => oy + b * iy * 1.6 + w * iy * 0.52;
  const nodes: React.ReactNode[] = [];
  for (let b = 0; b < bins; b++)
    for (let w = weeks - 1; w >= 0; w--) {
      const v = s.grid[b]?.[w] ?? 0;
      const h = (v / s.maxKg) * zh + 2;
      const x = px(w, b), y = py(w, b);
      const c = RAMP[Math.min(4, Math.floor((v / s.maxKg) * 4.99))]!;
      const wdt = ix * 0.56, dep = iy * 0.9;
      nodes.push(
        <Path key={`f${b}-${w}`} d={`M${x},${y - h} l0,${h} l${wdt},${-dep * 0.5} l0,${-h} Z`} fill={c} opacity={0.55} />,
        <Path key={`s${b}-${w}`} d={`M${x + wdt},${y - h - dep * 0.5} l0,${h} l${wdt * 0.6},${dep * 0.35} l0,${-h} Z`} fill={c} opacity={0.32} />,
        <Path key={`t${b}-${w}`} d={`M${x},${y - h} l${wdt},${-dep * 0.5} l${wdt * 0.6},${dep * 0.35} l${-wdt},${dep * 0.5} Z`} fill={c} stroke={C.ink} strokeWidth={0.6} />,
      );
    }
  // reduced-density week marks (web labels every other week): first / middle / last
  const weekTicks = Array.from(new Set([0, Math.floor((weeks - 1) / 2), weeks - 1]));
  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H }}>
        {nodes}
        {s.bins.map((bn, b) => (
          <SvgText key={bn} x={px(weeks - 1, b) + ix * 1.5} y={py(weeks - 1, b) + 8} fontFamily={F.mono} fontSize={10} fill={C.ash} opacity={0.7}>{`${bn} ${t("w.analyze.ex.surfaceReps")}`}</SvgText>
        ))}
        {weekTicks.map((w) => (
          <SvgText key={w} x={px(w, 0) - 4} y={py(w, 0) - zh - 10} fontFamily={F.mono} fontSize={10} fill={C.ash} opacity={0.7}>{`W${w + 1}`}</SvgText>
        ))}
      </Svg>
      <CornerLabels C={C} l={`W1 → W${weeks}`} r={`${s.bins.join(" / ")} ${t("w.analyze.ex.surfaceReps")}`} />
    </View>
  );
}

function PaceCurveChart({ C, slide, stroke, t }: { C: Palette; slide: SlideOf<"paceCurve">; stroke: string; t: (k: string) => string }) {
  const bands = slide.bands;
  if (bands.length < 2)
    return <MeterRows C={C} color={stroke} rows={bands.map((b) => ({ label: b.label, pct: b.bestAllSec ? 1 / b.bestAllSec : 0, value: b.bestAllSec ? paceClock(b.bestAllSec) : "–" }))} />;
  const secs = bands.flatMap((b) => [b.bestAllSec, b.bestRecentSec]).filter((v): v is number => v != null);
  const min = Math.min(...secs), max = Math.max(...secs), range = max - min || 1;
  const W = 353, H = 190, L = 10, R = 10, T = 14, B = 10;
  const X = (i: number) => L + (i * (W - L - R)) / (bands.length - 1);
  const Y = (v: number) => T + ((v - min) * (H - T - B)) / range; // reversed: faster on top
  const recentPts = bands.map((b, i) => (b.bestRecentSec != null ? `${X(i)},${Y(b.bestRecentSec)}` : null)).filter(Boolean).join(" ");
  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H }}>
        <Polyline points={bands.map((b, i) => `${X(i)},${Y(b.bestAllSec ?? max)}`).join(" ")} fill="none" stroke={C.ash} strokeWidth={2} strokeLinejoin="round" />
        {recentPts.length > 0 && <Polyline points={recentPts} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />}
        {bands.map((b, i) => (
          <Circle key={i} cx={X(i)} cy={Y(b.bestAllSec ?? max)} r={2.5} fill={C.ash} />
        ))}
        {bands.map((b, i) => (b.bestRecentSec != null ? <Circle key={`r${i}`} cx={X(i)} cy={Y(b.bestRecentSec)} r={3.5} fill={stroke} stroke={C.ink} strokeWidth={1} /> : null))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, paddingTop: 4 }}>
        {bands.map((b) => (
          <Text key={b.label} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textAlign: "center" }}>{b.label}{"\n"}{b.bestAllSec != null ? paceClock(b.bestAllSec) : "–"}</Text>
        ))}
      </View>
      <Text style={{ marginTop: 10, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.ex.paceCurveRecent")} — {t("w.analyze.ex.paceCurveAll")}</Text>
    </View>
  );
}

function CompareChart({ C, slide, units, t }: { C: Palette; slide: SlideOf<"compare">; units: WeightUnit; t: (k: string) => string }) {
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
          { l: t("w.analyze.ex.cmpDistance"), cur: `${compare.cur.distanceKm}`, was: `${compare.prev.distanceKm}`, good: compare.cur.distanceKm >= compare.prev.distanceKm, same: compare.cur.distanceKm === compare.prev.distanceKm },
          { l: t("w.analyze.ex.cmpRuns"), cur: String(compare.cur.runs), was: String(compare.prev.runs), good: compare.cur.runs >= compare.prev.runs, same: compare.cur.runs === compare.prev.runs },
          { l: t("w.analyze.ex.cmpAvgPace"), cur: compare.cur.avgPaceSec != null ? paceClock(compare.cur.avgPaceSec) : "–", was: compare.prev.avgPaceSec != null ? paceClock(compare.prev.avgPaceSec) : "–", good: (compare.cur.avgPaceSec ?? Infinity) <= (compare.prev.avgPaceSec ?? Infinity), same: compare.cur.avgPaceSec === compare.prev.avgPaceSec },
          { l: t("w.analyze.ex.cmpBestPace"), cur: compare.cur.bestPaceSec != null ? paceClock(compare.cur.bestPaceSec) : "–", was: compare.prev.bestPaceSec != null ? paceClock(compare.prev.bestPaceSec) : "–", good: (compare.cur.bestPaceSec ?? Infinity) <= (compare.prev.bestPaceSec ?? Infinity), same: compare.cur.bestPaceSec === compare.prev.bestPaceSec },
        ];

  const all = [...compare.weeklyCur, ...compare.weeklyPrev];
  const max = Math.max(...all, 1);
  const W = 353, H = 130, L = 6, R = 6, T = 10, B = 8;
  const X = (i: number) => L + (i * (W - L - R)) / (compare.weeks - 1);
  const Y = (v: number) => T + ((max - v) * (H - T - B)) / max;

  return (
    <View>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H }}>
        <SvgLine x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={C.line} strokeWidth={1} />
        <Polyline points={compare.weeklyPrev.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={C.ash} strokeWidth={2} strokeLinejoin="round" />
        <Polyline points={compare.weeklyCur.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={C.violet} strokeWidth={2.5} strokeLinejoin="round" />
        {compare.weeklyCur.map((v, i) => <Circle key={i} cx={X(i)} cy={Y(v)} r={3} fill={C.violet} stroke={C.ink} strokeWidth={1} />)}
      </Svg>
      <CornerLabels C={C} l={t("w.analyze.ex.comparePrev")} r={t("w.analyze.ex.compareCur")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16 }}>
        {tiles.map((tile) => (
          <View key={tile.l} style={{ width: "50%", paddingVertical: 8, paddingRight: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{tile.cur}</Text>
              {!tile.same && <Text style={{ fontFamily: F.monoBold, fontSize: fs.nano, color: txt(C, tile.good ? C.blue : C.red) }}>{tile.good ? "▲" : "▼"}</Text>}
            </View>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: 3 }} numberOfLines={1}>{tile.l} – {t("w.analyze.ex.compareWas")} {tile.was}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const heatColor = (level: number, C: Palette): string => {
  if (level <= 0) return C.line;
  if (level >= 4) return C.lime;
  const op = level === 1 ? 0.28 : level === 2 ? 0.5 : 0.74;
  return `${C.lime}${Math.round(op * 255).toString(16).padStart(2, "0")}`;
};

function ConsistencyHeat({ C, slide, foot, t }: { C: Palette; slide: SlideOf<"consistency">; foot: string; t: (k: string) => string }) {
  const d = slide.detail;
  if (d.activeDays === 0) return <ConsistencyDots C={C} weekly={slide.weekly} foot={foot} />;
  const stats = [
    { v: String(d.weekStreak), l: t("w.analyze.ex.weekStreak") },
    { v: String(d.perWeek), l: t("w.analyze.ex.perWeek") },
    { v: String(d.longestGapDays), l: t("w.analyze.ex.longestGap") },
    { v: String(d.activeDays), l: t("w.analyze.ex.activeDays") },
  ];
  return (
    <View style={{ paddingTop: 16 }}>
      <View style={{ flexDirection: "row", gap: 2.5 }}>
        {d.heat.map((col, ci) => (
          <View key={ci} style={{ flex: 1, gap: 2.5 }}>
            {col.map((cell, ri) => (
              <View key={ri} style={{ aspectRatio: 1, borderRadius: 2, backgroundColor: heatColor(cell.level, C) }} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        {stats.map((st) => (
          <View key={st.l} style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{st.v}</Text>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ marginTop: 3, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }} numberOfLines={1}>{st.l}</Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 12, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{foot}</Text>
    </View>
  );
}

function ConsistencyDots({ C, weekly, foot }: { C: Palette; weekly: number[]; foot: string }) {
  const steps = [0, 0.26, 0.52, 0.88];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 24 }}>
      {weekly.map((w, i) => (
        <View key={i} style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: w > 0 ? C.lime : C.line, opacity: w > 0 ? steps[Math.min(w, 3)]! + 0.12 : 1 }} />
      ))}
      <Text style={{ width: "100%", marginTop: 12, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{foot}</Text>
    </View>
  );
}

function SlideChart({ C, slide, stroke, units, t }: { C: Palette; slide: ExercisePageSlide; stroke: string; units: WeightUnit; t: (k: string) => string }) {
  // What a held finger reads on THIS slide — the figure from core (units), the
  // sentence from here (language). A slide core reports no geometry for is one
  // whose cells already name themselves, and it binds no gesture.
  const geo = exerciseSlideGeometry(slide);
  const held: Held | undefined = geo
    ? {
        count: geo.count,
        mode: geo.mode,
        read: (i) => exerciseSlideReading(slide, i, units),
        when: (i) => {
          const r = exerciseSlideReading(slide, i, units);
          const d = r?.weekStart ? fmtDate(r.weekStart) : "";
          return geo.by === "week" ? t("chart.weekOf").replace("{date}", d) : d;
        },
      }
    : undefined;
  switch (slide.kind) {
    case "weightTrend":
      return <TrendChart C={C} id="exp-weight" data={slide.points.map((p) => ({ x: fmtDate(p.date), y: Math.round(kgToUnit(p.weightKg, units)), pr: p.pr }))} stroke={stroke} held={held} />;
    case "paceTrend":
      return <TrendChart C={C} id="exp-pace" data={slide.points.map((p) => ({ x: fmtDate(p.date), y: p.secPerKm }))} stroke={stroke} reversed held={held} />;
    case "tonnage":
      return <TonnageChart C={C} weeks={slide.weeks} units={units} t={t} held={held} />;
    case "zones":
      return <MeterRows C={C} color={stroke} rows={slide.zones.map((z) => ({ label: z.zone === "<60" ? "<60%" : `${z.zone}%+`, pct: z.share, value: `${Math.round(z.share * 100)}%` }))} />;
    case "repMax":
      return <RepMaxGrid C={C} slide={slide} units={units} t={t} />;
    case "loadReps":
      return <ScatterChart C={C} slide={slide} stroke={stroke} units={units} t={t} />;
    case "surface":
      return <SurfaceChart C={C} slide={slide} t={t} />;
    case "compare":
      return <CompareChart C={C} slide={slide} units={units} t={t} />;
    case "weeklyMinutes":
      return <MinutesChart C={C} weeks={slide.weeks} stroke={stroke} t={t} held={held} />;
    case "paceCurve":
      return <PaceCurveChart C={C} slide={slide} stroke={stroke} t={t} />;
    case "runDeltas":
      return <DeltasChart C={C} runs={slide.runs} held={held} />;
    case "consistency":
      return <ConsistencyHeat C={C} slide={slide} foot={t("w.analyze.exp.consistencyFoot")} t={t} />;
  }
}

/**
 * The individual exercise page (variant B): no boxes — one hero number pairs
 * with one full-bleed chart and follows the swipe; hairline segments, a quiet
 * ALL STATS expansion and a typographic substats row. Parity:
 * apps/web/components/aurora/exercise-page.tsx.
 */
export default function AuroraExercisePage() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const params = useLocalSearchParams<{ name?: string }>();
  const name = typeof params.name === "string" ? params.name : "";
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);
  const bw = useBodyweightLookup();
  const { units, countWarmupsInVolume } = useLoggerPrefs();
  const [period, setPeriod] = useState<ExercisePeriod>("8w");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [pagerW, setPagerW] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const heroOpacity = useRef(new Animated.Value(1)).current;

  const model = useMemo(
    () => exercisePageModel(sessions, name, period, { bw, countWarmupsInVolume }),
    [sessions, name, period, bw, countWarmupsInVolume],
  );
  const slides = model.slides;
  const stroke = kindStroke(C, model.kind);
  const active = Math.min(page, slides.length - 1);
  const hero = slideHero(slides[showAll ? 0 : active]!, units, t);
  // SHARED ELEMENT (destination). The figure the tapped card was showing flies
  // here and scales up instead of being re-rendered — one continuous truth
  // rather than a page that re-fetches. `hidden` masks the real text only while
  // the clone is inbound; every degraded path (no provider, failed measurement,
  // Reduce Motion) returns false and shows it immediately.
  const heroStyle = { fontFamily: F.black, fontSize: 48, letterSpacing: -1, lineHeight: 52, color: C.chalk } as const;
  const heroShared = useSharedElementTarget(SHARED_ELEMENTS.exerciseHero, hero.v, heroStyle);

  useEffect(() => {
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }, [name, period]);

  // the number follows the swipe — quiet crossfade on page change
  const onPagerEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pagerW) return;
    const i = Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / pagerW));
    if (i === page) return;
    Animated.sequence([
      Animated.timing(heroOpacity, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(heroOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setPage(i), 100);
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
    <AuroraScreen refreshing={refreshing} onRefresh={refetch} hero={{ rank: "title", title: name }} backLabel={t("w.analyze.exp.back")}>

      {/* HOW IT'S DONE — looping animation + muscles worked + form cues (gym
          lifts only; cardio/custom names render nothing). */}
      <AuroraExerciseAnatomy name={name} />

      <View style={{ flexDirection: "row", gap: 16, marginTop: 16, paddingHorizontal: 2 }}>
        {PERIODS.map((p) => {
          const on = period === p.id;
          return (
            <Pressable key={p.id} onPress={() => setPeriod(p.id)} hitSlop={8} style={{ paddingVertical: 4, borderBottomWidth: 2, borderBottomColor: on ? C.lime : "transparent" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? C.chalk : C.ash }}>{t(p.key)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* HERO — one number, paired with the visible chart */}
      <Animated.View style={{ marginTop: 16, marginHorizontal: 2, minHeight: 84, opacity: heroOpacity }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <Text ref={heroShared.ref} style={[heroStyle, heroShared.hidden ? { opacity: 0 } : null]}>{hero.v}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.subtitle, color: C.ash }}>{hero.u}</Text>
          <View style={{ marginLeft: "auto" }}>
            <TickerDelta deltaPct={hero.deltaPct ?? null} improving={hero.improving ?? null} size={fs.caption} />
          </View>
        </View>
        <Text style={{ marginTop: 10, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{hero.label}</Text>
      </Animated.View>

      {!showAll ? (
        <View onLayout={(e) => setPagerW(e.nativeEvent.layout.width)} style={{ marginTop: 10 }}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagerEnd}
          >
            {slides.map((slide) => (
              <View key={slide.kind} style={{ width: pagerW || 1 }}>
                <SlideChart C={C} slide={slide} stroke={stroke} units={units} t={t} />
              </View>
            ))}
          </ScrollView>
          {/* hairline segment indicator */}
          <View style={{ flexDirection: "row", gap: 6, alignSelf: "center", width: 132, marginTop: 16 }}>
            {slides.map((sl, i) => (
              <View key={sl.kind} style={{ height: 2, flex: 1, borderRadius: 2, backgroundColor: i === active ? C.lime : C.line }} />
            ))}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          {slides.map((slide, i) => (
            <View key={slide.kind} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, paddingTop: i === 0 ? 6 : 22, paddingBottom: 24 }}>
              {i > 0 ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash, marginBottom: 16 }}>
                  {slideHero(slide, units, t).label}
                </Text>
              ) : null}
              <SlideChart C={C} slide={slide} stroke={stroke} units={units} t={t} />
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => { setShowAll(!showAll); setPage(0); pagerRef.current?.scrollTo({ x: 0, animated: false }); }}
        accessibilityRole="button"
        style={{ alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12, marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>
          {showAll ? t("w.analyze.exp.less") : t("w.analyze.exp.allStats")}
        </Text>
      </Pressable>

      {/* quiet substats — typography over one hairline */}
      <View style={{ flexDirection: "row", marginTop: 20, marginHorizontal: 2, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
        {substats.map((st) => (
          <View key={st.l} style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{st.v}</Text>
            <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{st.l}</Text>
          </View>
        ))}
      </View>

      {/* BEST SET + velocity — quiet typography over one hairline (the rest of
          the retired dashboard lives IN the slide pager above). */}
      {s.kind === "strength" && s.bestSet && (
        <View style={{ marginTop: 16, marginHorizontal: 2, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.ex.bestSet")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, marginTop: 8 }}>{fmtWeight(s.bestSet.load, units)} × {s.bestSet.reps}<Text style={{ color: C.ash }}> – {t("w.analyze.ex.e1rmLabel")} {fmtWeight(s.bestSet.e1rm, units)} – {fmtDate(s.bestSet.when)}</Text></Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{s.totalReps} {t("w.analyze.ex.repsTail")} {fmtWeight(s.heaviestLoad, units)} {t("w.analyze.ex.allTimeBest")} {fmtWeight(s.bestE1rmAllTime, units)}</Text>
          {s.velocity && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{t("w.analyze.ex.velocityProfile")} <Text style={{ color: txt(C, C.lime) }}>{fmtWeight(s.velocity.e1rm, units)}</Text> – {t("w.analyze.ex.velEstPre")} {s.velocity.r2} – {s.velocity.n} {t("w.analyze.ex.velEstTail")}</Text>
          )}
        </View>
      )}
    </AuroraScreen>
  );
}
