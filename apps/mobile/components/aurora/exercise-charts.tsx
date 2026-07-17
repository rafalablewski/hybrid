import { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Path, Polyline, Circle, Line as SvgLine } from "react-native-svg";
import {
  e1rmTrendWithPRs, repMaxMatrix, loadRepsScatter, weeklyTonnage, intensityDistribution,
  tonnageSurface, exerciseConsistency, paceCurve, recentRunDeltas, blockCompare,
  paceClock, fmtWeight, fmtTonnage, kgToUnit,
  type LoggedSession, type ExercisePeriod, type WeightUnit, type HeatCell, type BlockCompare,
} from "@hybrid/core";
import type { BodyweightInput } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ACard, RADIUS } from "./kit";

// Chart-only raw hexes (mirrors web aurora/exercises.tsx): the CVD-validated
// deep chartreuse/sand pair for stacked tonnage, and the lime landscape ramp.
const DEEP_BASE = "#84a01e", DEEP_HARD = "#bd871e";
const RAMP = ["#33420f", "#4c6414", "#6f8f1c", "#9cc32d", "#c6f84f"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Kicker({ children, color }: { children: React.ReactNode; color?: string }) {
  const { palette: C } = useTheme();
  return <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: color ?? C.ash }}>{children}</Text>;
}

function LegendRow({ items }: { items: { c: string; label: string }[] }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: i.c }} />
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MiniTile({ v, l, c }: { v: string | number; l: string; c?: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ fontFamily: F.black, fontSize: 18, color: c ?? C.chalk }}>{v}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.6, marginTop: 3, textAlign: "center" }} numberOfLines={1}>{l}</Text>
    </View>
  );
}

/** All the v2 analytics cards for one movement — strength or cardio flavour.
 *  The exact mirror of the web aurora/exercises.tsx card stack, computed from
 *  the SAME @hybrid/core aggregators. */
export default function ExerciseAnalytics({ sessions, name, kind, period, units, bw }: {
  sessions: LoggedSession[]; name: string; kind: "strength" | "cardio" | "conditioning";
  period: ExercisePeriod; units: WeightUnit; bw?: BodyweightInput;
}) {
  const consistency = useMemo(() => exerciseConsistency(sessions, name, 26), [sessions, name]);
  const compare = useMemo(() => blockCompare(sessions, name, 8, Date.now(), bw), [sessions, name, bw]);
  if (kind === "cardio")
    return (
      <>
        <PaceCurveCard sessions={sessions} name={name} />
        <RunDeltasCard sessions={sessions} name={name} />
        <ConsistencyCard c={consistency} />
        <CompareCard compare={compare} units={units} />
      </>
    );
  return (
    <>
      <PrTrendCard sessions={sessions} name={name} period={period} units={units} bw={bw} />
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

function PrTrendCard({ sessions, name, period, units, bw }: { sessions: LoggedSession[]; name: string; period: ExercisePeriod; units: WeightUnit; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const trend = useMemo(() => e1rmTrendWithPRs(sessions, name, period, Date.now(), bw), [sessions, name, period, bw]);
  if (trend.length < 2) return null;
  const vals = trend.map((p) => kgToUnit(p.e1rm, units));
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const W = 340, H = 150, L = 6, R = 6, T = 12, B = 8;
  const X = (i: number) => L + (i * (W - L - R)) / (trend.length - 1);
  const Y = (v: number) => T + ((max - v) * (H - T - B)) / range;
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker color={txt(C, C.lime)}>{t("w.analyze.ex.prTrendTitle")}</Kicker>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{Math.round(vals[vals.length - 1] ?? 0)} {units}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{Math.round(min)}–{Math.round(max)} {units}</Text>
      </View>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H, marginTop: 6 }}>
        <Polyline points={vals.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={C.lime} strokeWidth={2.5} strokeLinejoin="round" />
        {trend.map((p, i) =>
          p.pr
            ? <Circle key={i} cx={X(i)} cy={Y(vals[i] ?? 0)} r={5} fill={C.lime} stroke={C.ink} strokeWidth={2} />
            : <Circle key={i} cx={X(i)} cy={Y(vals[i] ?? 0)} r={2.5} fill={C.ink2} stroke={C.lime} strokeWidth={1.5} />,
        )}
      </Svg>
      <LegendRow items={[{ c: C.lime, label: t("w.analyze.ex.allTimePr") }]} />
    </ACard>
  );
}

// ---------------------------------------------------------- 2. rep-max matrix

function RepMaxCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const cells = useMemo(() => repMaxMatrix(sessions, name, Date.now(), bw), [sessions, name, bw]);
  if (cells.every((c) => c === null)) return null;
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.repmaxTitle")}</Kicker>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {cells.map((cell, i) => (
          <View key={i} style={{ width: "18%", flexGrow: 1, minWidth: 58, borderRadius: RADIUS.field, paddingVertical: 10, alignItems: "center", borderWidth: 1, ...(cell ? { backgroundColor: cell.recent ? `${C.lime}24` : C.ink, borderColor: cell.recent ? C.lime : C.line } : { borderColor: C.line, borderStyle: "dashed" as const }) }}>
            <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.6 }}>{i + 1}RM</Text>
            <Text style={{ fontFamily: F.black, fontSize: 16, marginVertical: 3, color: cell ? (cell.recent ? txt(C, C.lime) : C.chalk) : C.ash }}>{cell ? Math.round(kgToUnit(cell.loadKg, units)) : "–"}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 7, color: C.ash }}>{cell ? fmtDate(cell.when) : t("w.analyze.ex.repmaxTry")}</Text>
          </View>
        ))}
      </View>
      <LegendRow items={[{ c: C.lime, label: t("w.analyze.ex.repmaxRecent") }, { c: C.line, label: t("w.analyze.ex.repmaxOlder") }]} />
    </ACard>
  );
}

// ------------------------------------------------------- 4. weekly tonnage

function TonnageCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const rows = useMemo(() => weeklyTonnage(sessions, name, 12, Date.now(), bw), [sessions, name, bw]);
  if (rows.every((r) => r.baseKg + r.hardKg === 0)) return null;
  const max = Math.max(...rows.map((r) => r.baseKg + r.hardKg), 1);
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.tonnageTitle")}</Kicker>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{fmtTonnage(rows[rows.length - 1] ? rows[rows.length - 1]!.baseKg + rows[rows.length - 1]!.hardKg : 0, units)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>max {fmtTonnage(max, units)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 96, gap: 4, marginTop: 8 }}>
        {rows.map((r, i) => {
          const total = r.baseKg + r.hardKg;
          const hBase = (r.baseKg / max) * 88;
          const hHard = (r.hardKg / max) * 88;
          return (
            <View key={i} style={{ flex: 1, alignItems: "stretch", justifyContent: "flex-end" }}>
              {r.hardKg > 0 && <View style={{ height: Math.max(2, hHard), borderRadius: 3, backgroundColor: DEEP_HARD, marginBottom: 2 }} />}
              <View style={{ height: total > 0 ? Math.max(2, hBase) : 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: total > 0 ? DEEP_BASE : C.line }} />
            </View>
          );
        })}
      </View>
      <LegendRow items={[{ c: DEEP_BASE, label: t("w.analyze.ex.tonnageBase") }, { c: DEEP_HARD, label: t("w.analyze.ex.tonnageHard") }]} />
    </ACard>
  );
}

// --------------------------------------------------- 5. intensity distribution

function ZonesCard({ sessions, name, period, bw }: { sessions: LoggedSession[]; name: string; period: ExercisePeriod; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const zones = useMemo(() => intensityDistribution(sessions, name, period, Date.now(), bw), [sessions, name, period, bw]);
  if (zones.reduce((a, z) => a + z.count, 0) === 0) return null;
  const tags = [t("w.analyze.ex.zoneSpeed"), t("w.analyze.ex.zoneVolume"), t("w.analyze.ex.zoneBuild"), t("w.analyze.ex.zoneStrength"), t("w.analyze.ex.zonePeak")];
  const labels = ["<60%", "60–70", "70–80", "80–90", "90%+"];
  const max = Math.max(...zones.map((z) => z.share), 0.01);
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.zonesTitle")}</Kicker>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
        {zones.map((z, i) => (
          <View key={z.zone} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: C.chalk, marginBottom: 5 }}>{Math.round(z.share * 100)}%</Text>
            <View style={{ alignSelf: "stretch", height: Math.max(4, (z.share / max) * 92), borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: C.lime, opacity: 0.5 + i * 0.12 }} />
            <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.chalk, marginTop: 6 }}>{labels[i]}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 6.5, color: C.ash, marginTop: 1, textAlign: "center" }} numberOfLines={1}>{tags[i]?.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </ACard>
  );
}

// ------------------------------------------------------ 3. load×reps map

function ScatterCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const map = useMemo(() => loadRepsScatter(sessions, name, Date.now(), bw), [sessions, name, bw]);
  if (map.points.length < 5) return null;
  const W = 340, H = 210, L = 30, R = 6, T = 10, B = 22;
  const topIso = map.isolines[map.isolines.length - 1] ?? map.maxLoadKg;
  const yMax = Math.max(map.maxLoadKg, topIso) * 1.06;
  const yMin = Math.min(...map.points.map((p) => p.loadKg)) * 0.9;
  const X = (r: number) => L + ((r - 0.5) * (W - L - R)) / 12;
  const Y = (kg: number) => T + ((yMax - kg) * (H - T - B)) / (yMax - yMin || 1);
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.mapTitle")}</Kicker>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H, marginTop: 8 }}>
        {map.isolines.map((iso) => {
          let d = "";
          for (let r = 0.6; r <= 12.4; r += 0.3) {
            const kg = iso / (1 + r / 30);
            if (kg < yMin || kg > yMax) continue;
            d += `${d ? "L" : "M"}${X(r).toFixed(1)},${Y(kg).toFixed(1)}`;
          }
          return <Path key={iso} d={d} fill="none" stroke={C.ash} strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} />;
        })}
        {map.points.map((p, i) => (
          <Circle key={i} cx={X(p.reps) + ((i % 5) - 2) * 1.6} cy={Y(p.loadKg)} r={p.recent ? 3.6 : 2.8} fill={p.recent ? C.lime : C.ash} opacity={p.recent ? 1 : 0.45} />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{Math.round(kgToUnit(yMin, units))}–{Math.round(kgToUnit(yMax, units))} {units}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>1–12 {t("w.analyze.ex.mapReps")}</Text>
      </View>
      <LegendRow items={[{ c: C.lime, label: t("w.analyze.ex.mapRecent") }, { c: C.ash, label: t("w.analyze.ex.mapOlder") }, { c: C.ash, label: t("w.analyze.ex.mapIso") }]} />
    </ACard>
  );
}

// ------------------------------------------------------ 6. tonnage landscape

function SurfaceCard({ sessions, name, units, bw }: { sessions: LoggedSession[]; name: string; units: WeightUnit; bw?: BodyweightInput }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const s = useMemo(() => tonnageSurface(sessions, name, 12, Date.now(), bw), [sessions, name, bw]);
  if (s.maxKg === 0) return null;
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
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.surfaceTitle")}</Kicker>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H, marginTop: 6 }}>{nodes}</Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>W1 → W{weeks}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{s.bins.join(" / ")} {t("w.analyze.ex.surfaceReps")}</Text>
      </View>
      <LegendRow items={[{ c: RAMP[4]!, label: `${t("w.analyze.ex.surfaceHigh")} (max ${fmtTonnage(s.maxKg, units)})` }, { c: RAMP[1]!, label: t("w.analyze.ex.surfaceLow") }]} />
    </ACard>
  );
}

// -------------------------------------------------------- 8. consistency

function heatColor(level: HeatCell["level"], C: Palette): string {
  if (level === 0) return C.line;
  if (level === 4) return C.lime;
  const op = level === 1 ? 0.28 : level === 2 ? 0.5 : 0.74;
  return `${C.lime}${Math.round(op * 255).toString(16).padStart(2, "0")}`;
}

function ConsistencyCard({ c }: { c: ReturnType<typeof exerciseConsistency> }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (c.activeDays === 0) return null;
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.consistencyTitle")}</Kicker>
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 10 }}>
        <MiniTile v={c.weekStreak} l={t("w.analyze.ex.weekStreak")} c={txt(C, C.lime)} />
        <MiniTile v={c.perWeek} l={t("w.analyze.ex.perWeek")} />
        <MiniTile v={c.longestGapDays} l={t("w.analyze.ex.longestGap")} />
        <MiniTile v={c.activeDays} l={t("w.analyze.ex.activeDays")} />
      </View>
      <View style={{ flexDirection: "row", gap: 2.5, marginTop: 12 }}>
        {c.heat.map((col, ci) => (
          <View key={ci} style={{ flex: 1, gap: 2.5 }}>
            {col.map((cell, ri) => (
              <View key={ri} style={{ aspectRatio: 1, borderRadius: 2, backgroundColor: heatColor(cell.level, C) }} />
            ))}
          </View>
        ))}
      </View>
      <LegendRow items={[{ c: C.line, label: t("w.analyze.ex.heatRest") }, { c: `${C.lime}47`, label: t("w.analyze.ex.heatLight") }, { c: `${C.lime}bd`, label: t("w.analyze.ex.heatSolid") }, { c: C.lime, label: t("w.analyze.ex.heatBig") }]} />
    </ACard>
  );
}

// --------------------------------------------------------- 9. pace curve

function PaceCurveCard({ sessions, name }: { sessions: LoggedSession[]; name: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bands = useMemo(() => paceCurve(sessions, name, Date.now()), [sessions, name]);
  if (bands.length < 2) return null;
  const secs = bands.flatMap((b) => [b.bestAllSec, b.bestRecentSec]).filter((v): v is number => v != null);
  const min = Math.min(...secs), max = Math.max(...secs), range = max - min || 1;
  const W = 340, H = 150, L = 6, R = 6, T = 12, B = 20;
  const X = (i: number) => L + (i * (W - L - R)) / (bands.length - 1);
  const Y = (v: number) => T + ((v - min) * (H - T - B)) / range; // reversed: faster on top
  const recentPts = bands.map((b, i) => (b.bestRecentSec != null ? `${X(i)},${Y(b.bestRecentSec)}` : null)).filter(Boolean).join(" ");
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker color={txt(C, C.blue)}>{t("w.analyze.ex.paceCurveTitle")}</Kicker>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H, marginTop: 8 }}>
        <Polyline points={bands.map((b, i) => `${X(i)},${Y(b.bestAllSec ?? max)}`).join(" ")} fill="none" stroke={C.ash} strokeWidth={2} strokeLinejoin="round" />
        {recentPts.length > 0 && <Polyline points={recentPts} fill="none" stroke={C.blue} strokeWidth={2.5} strokeLinejoin="round" />}
        {bands.map((b, i) => (
          <Circle key={i} cx={X(i)} cy={Y(b.bestAllSec ?? max)} r={2.5} fill={C.ash} />
        ))}
        {bands.map((b, i) => (b.bestRecentSec != null ? <Circle key={`r${i}`} cx={X(i)} cy={Y(b.bestRecentSec)} r={3.5} fill={C.blue} stroke={C.ink} strokeWidth={1} /> : null))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {bands.map((b) => (
          <Text key={b.label} style={{ fontFamily: F.mono, fontSize: 8, color: C.ash }}>{b.label}{"\n"}{b.bestAllSec != null ? paceClock(b.bestAllSec) : "–"}</Text>
        ))}
      </View>
      <LegendRow items={[{ c: C.blue, label: t("w.analyze.ex.paceCurveRecent") }, { c: C.ash, label: t("w.analyze.ex.paceCurveAll") }]} />
    </ACard>
  );
}

// ---------------------------------------------------- 9b. recent-run deltas

function RunDeltasCard({ sessions, name }: { sessions: LoggedSession[]; name: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const d = useMemo(() => recentRunDeltas(sessions, name, 10, Date.now()), [sessions, name]);
  if (d.avgSec == null || d.runs.length < 3) return null;
  const maxAbs = Math.max(...d.runs.map((r) => Math.abs(r.deltaSec)), 1);
  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker color={txt(C, C.blue)}>{t("w.analyze.ex.runDeltasTitle")}</Kicker>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, marginTop: 6 }}>{t("w.analyze.ex.runDeltasAvg")} {paceClock(d.avgSec)} /km</Text>
      <View style={{ height: 100, marginTop: 8, justifyContent: "center" }}>
        <View style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed" }} />
        <View style={{ flexDirection: "row", gap: 6, height: "100%" }}>
          {d.runs.map((r, i) => {
            const frac = Math.abs(r.deltaSec) / maxAbs;
            const faster = r.deltaSec <= 0;
            return (
              <View key={i} style={{ flex: 1 }}>
                <View style={{ position: "absolute", left: "16%", right: "16%", borderRadius: 3, backgroundColor: faster ? C.blue : C.red, ...(faster ? { bottom: "50%", height: `${Math.max(3, frac * 44)}%` } : { top: "50%", height: `${Math.max(3, frac * 44)}%` }) }} />
              </View>
            );
          })}
        </View>
      </View>
      <LegendRow items={[{ c: C.blue, label: t("w.analyze.ex.runDeltasFaster") }, { c: C.red, label: t("w.analyze.ex.runDeltasSlower") }]} />
    </ACard>
  );
}

// --------------------------------------------------------- 10. block compare

function CompareCard({ compare, units }: { compare: BlockCompare; units: WeightUnit }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const anyPrev = compare.weeklyPrev.some((v) => v > 0);
  const anyCur = compare.weeklyCur.some((v) => v > 0);
  if (!anyPrev || !anyCur) return null;

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
  const W = 340, H = 130, L = 6, R = 6, T = 10, B = 8;
  const X = (i: number) => L + (i * (W - L - R)) / (compare.weeks - 1);
  const Y = (v: number) => T + ((max - v) * (H - T - B)) / max;

  return (
    <ACard style={{ marginTop: 14 }}>
      <Kicker>{t("w.analyze.ex.compareTitle")}</Kicker>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {tiles.map((tile) => (
          <View key={tile.l} style={{ width: "47%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.chalk }}>{tile.cur}</Text>
              {!tile.same && <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: tile.good ? `${C.blue}38` : `${C.red}33` }}><Text style={{ fontFamily: F.bold, fontSize: 9, color: txt(C, tile.good ? C.blue : C.red) }}>{tile.good ? "▲" : "▼"}</Text></View>}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, marginTop: 3 }} numberOfLines={1}>{tile.l} – {t("w.analyze.ex.compareWas")} {tile.was}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.8, marginTop: 12, textTransform: "uppercase" }}>{compare.kind === "strength" ? t("w.analyze.ex.compareWeekly") : t("w.analyze.ex.compareWeeklyKm")}</Text>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", aspectRatio: W / H, marginTop: 6 }}>
        <SvgLine x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={C.line} strokeWidth={1} />
        <Polyline points={compare.weeklyPrev.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={C.ash} strokeWidth={2} strokeLinejoin="round" />
        <Polyline points={compare.weeklyCur.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={C.violet} strokeWidth={2.5} strokeLinejoin="round" />
        {compare.weeklyCur.map((v, i) => <Circle key={i} cx={X(i)} cy={Y(v)} r={3} fill={C.violet} stroke={C.ink} strokeWidth={1} />)}
      </Svg>
      <LegendRow items={[{ c: C.violet, label: t("w.analyze.ex.compareCur") }, { c: C.ash, label: t("w.analyze.ex.comparePrev") }]} />
    </ACard>
  );
}
