import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Animated, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Svg, { G, Path, Rect, Circle, Defs, LinearGradient, Stop, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { useLocalSearchParams } from "expo-router";
import {
  exercisePageModel,
  fmtWeight,
  fmtTonnage,
  paceClock,
  kgToUnit,
  type ExercisePageSlide,
  type ExercisePeriod,
  type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { AuroraScreen, ABack } from "./kit";
import { kindStroke, TickerDelta } from "./exercise-widget";

// Chart-only raw hexes (mirror aurora/exercise-charts.tsx / web exercise-page).
const DEEP_BASE = "#84a01e", DEEP_HARD = "#bd871e";

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
    case "e1rmTrend": {
      const { v, u } = splitVal(fmtWeight(s.bestE1rm, units));
      return { v, u, deltaPct: s.deltaPct, improving: s.improving, label: t("w.analyze.exp.e1rm") };
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
    case "loadMix":
      return {
        v: s.topLoadKg != null ? String(Math.round(kgToUnit(s.topLoadKg, units))) : "–",
        u: units,
        label: t("w.analyze.exp.loadMix"),
      };
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

function TrendChart({ C, data, stroke, reversed, id }: { C: Palette; data: { x: string; y: number; pr?: boolean }[]; stroke: string; reversed?: boolean; id: string }) {
  const W = 353, H = 220, T = 14, B = 8;
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
  return (
    <View>
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
      </Svg>
      <CornerLabels C={C} l={data[0]?.x} r={data[n - 1]?.x} />
    </View>
  );
}

function TonnageChart({ C, weeks, units, t }: { C: Palette; weeks: { baseKg: number; hardKg: number }[]; units: WeightUnit; t: (k: string) => string }) {
  const W = 353, H = 220, T = 14, B = 8;
  const n = weeks.length;
  const totals = weeks.map((w) => kgToUnit(w.baseKg + w.hardKg, units));
  const hi = Math.max(...totals, 1) * 1.08;
  const bw = W / n - 6;
  const Y = (v: number) => H - B - (v / hi) * (H - T - B);
  return (
    <View>
      <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
        {weeks.map((w, i) => {
          const x = (i + 0.5) * (W / n) - bw / 2;
          const base = kgToUnit(w.baseKg, units), tot = totals[i]!;
          const yb = Y(base), yt = Y(tot);
          return (
            <G key={i}>
              <Rect x={x} y={yb} width={bw} height={H - B - yb} fill={DEEP_BASE} rx={2} />
              {tot > base ? <Rect x={x} y={yt} width={bw} height={Math.max(0, yb - yt - 2)} fill={DEEP_HARD} rx={3} /> : null}
            </G>
          );
        })}
      </Svg>
      <CornerLabels C={C} l={t("w.analyze.exp.weeksAgo").replace("{n}", String(n))} r={t("w.analyze.exp.now")} />
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

function DeltasChart({ C, runs }: { C: Palette; runs: { date: string; deltaSec: number }[] }) {
  const W = 353, H = 200, T = 26, B = 26;
  const n = runs.length;
  if (n === 0) return null;
  const mid = (H - B + T) / 2;
  const hi = Math.max(...runs.map((r) => Math.abs(r.deltaSec)), 1) * 1.15;
  const bw = W / n - 12;
  const up = txt(C, C.lime), down = txt(C, C.red);
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <SvgLine x1={0} x2={W} y1={mid} y2={mid} stroke={C.line} />
      {runs.map((r, i) => {
        const x = (i + 0.5) * (W / n) - bw / 2;
        const h = (Math.abs(r.deltaSec) / hi) * (mid - T);
        const faster = r.deltaSec < 0;
        return (
          <G key={i}>
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
  );
}

/** thin typographic meter rows (zones / load mix / pace curve) */
function MeterRows({ C, rows, color }: { C: Palette; rows: { label: string; pct: number; value: string }[]; color: string }) {
  const hi = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <View style={{ paddingTop: 22, paddingBottom: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
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
  switch (slide.kind) {
    case "e1rmTrend":
      return <TrendChart C={C} id="exp-e1rm" data={slide.points.map((p) => ({ x: fmtDate(p.date), y: Math.round(kgToUnit(p.e1rm, units)), pr: p.pr }))} stroke={stroke} />;
    case "paceTrend":
      return <TrendChart C={C} id="exp-pace" data={slide.points.map((p) => ({ x: fmtDate(p.date), y: p.secPerKm }))} stroke={stroke} reversed />;
    case "tonnage":
      return <TonnageChart C={C} weeks={slide.weeks} units={units} t={t} />;
    case "zones":
      return <MeterRows C={C} color={stroke} rows={slide.zones.map((z) => ({ label: z.zone === "<60" ? "<60%" : `${z.zone}%+`, pct: z.share, value: `${Math.round(z.share * 100)}%` }))} />;
    case "loadMix":
      return <MeterRows C={C} color={stroke} rows={slide.loads.map((l) => ({ label: fmtWeight(l.loadKg, units), pct: l.share, value: `${Math.round(l.share * 100)}%` }))} />;
    case "paceCurve":
      return <MeterRows C={C} color={stroke} rows={slide.bands.map((b) => ({ label: b.label, pct: b.bestAllSec ? 1 / b.bestAllSec : 0, value: b.bestAllSec ? paceClock(b.bestAllSec) : "–" }))} />;
    case "runDeltas":
      return <DeltasChart C={C} runs={slide.runs} />;
    case "consistency":
      return <ConsistencyDots C={C} weekly={slide.weekly} foot={t("w.analyze.exp.consistencyFoot")} />;
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
  const substats: { v: string; l: string }[] =
    s.kind === "cardio"
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
    <AuroraScreen refreshing={refreshing} onRefresh={refetch}>
      {/* header — a bare back and the name; hairlines are the only structure */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ABack label={t("w.analyze.exp.back")} />
        <Text style={{ fontFamily: F.black, fontSize: 20, letterSpacing: -0.3, color: C.chalk }}>{name}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 18, marginTop: 14, paddingHorizontal: 2 }}>
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
      <Animated.View style={{ marginTop: 18, marginHorizontal: 2, minHeight: 84, opacity: heroOpacity }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <Text style={{ fontFamily: F.black, fontSize: 48, letterSpacing: -1, lineHeight: 52, color: C.chalk }}>{hero.v}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.subtitle, color: C.ash }}>{hero.u}</Text>
          <View style={{ marginLeft: "auto" }}>
            <TickerDelta deltaPct={hero.deltaPct ?? null} improving={hero.improving ?? null} size={fs.caption} />
          </View>
        </View>
        <Text style={{ marginTop: 10, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{hero.label}</Text>
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
            <View key={slide.kind} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, paddingTop: i === 0 ? 6 : 22, paddingBottom: 26 }}>
              {i > 0 ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 14 }}>
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
        style={{ alignSelf: "center", paddingVertical: 8, paddingHorizontal: 14, marginTop: 18 }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>
          {showAll ? t("w.analyze.exp.less") : t("w.analyze.exp.allStats")}
        </Text>
      </Pressable>

      {/* quiet substats — typography over one hairline */}
      <View style={{ flexDirection: "row", marginTop: 20, marginHorizontal: 2, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.line }}>
        {substats.map((st) => (
          <View key={st.l} style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{st.v}</Text>
            <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: fs.nano - 1, letterSpacing: 0.8, textTransform: "uppercase", color: C.ash }}>{st.l}</Text>
          </View>
        ))}
      </View>
    </AuroraScreen>
  );
}
