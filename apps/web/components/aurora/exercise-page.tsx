"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, ReferenceLine, Tooltip } from "recharts";
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
import { tip } from "@/lib/ui";
import { KIND_STROKE, TickerDelta, UP_HEX, DOWN_HEX } from "./exercise-widget";

const C = (v: string) => `var(--color-${v})`;
const LINE_HEX = "#2a2d2a", INK_HEX = "#0c0d0c";
// The CVD-validated deep chartreuse/sand pair (mirrors aurora/exercises.tsx).
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

function DeltasChart({ runs }: { runs: { date: string; deltaSec: number }[] }) {
  const data = runs.map((r) => ({ x: fmtDate(r.date), y: r.deltaSec }));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 24, right: 6, bottom: 4, left: 6 }} barCategoryGap="28%">
        <XAxis dataKey="x" hide />
        <YAxis hide />
        <ReferenceLine y={0} stroke={LINE_HEX} />
        <Tooltip contentStyle={tip} formatter={(v) => `${Number(v) > 0 ? "+" : ""}${v} s/km`} />
        <Bar dataKey="y" isAnimationActive={false} radius={[3, 3, 3, 3]}>
          {data.map((d, i) => <Cell key={i} fill={d.y < 0 ? UP_HEX : DOWN_HEX} />)}
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
    case "e1rmTrend":
      return <TrendChart id={`exp-e1rm`} data={slide.points.map((p) => ({ x: fmtDate(p.date), y: Math.round(kgToUnit(p.e1rm, units)), pr: p.pr }))} stroke={stroke} fmt={(v) => `${v} ${units}`} />;
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
    case "loadMix":
      return (
        <MeterRows
          color={stroke}
          rows={slide.loads.map((l) => ({ label: fmtWeight(l.loadKg, units), pct: l.share, value: `${Math.round(l.share * 100)}%` }))}
        />
      );
    case "paceCurve":
      return (
        <MeterRows
          color={stroke}
          rows={slide.bands.map((b) => ({ label: b.label, pct: b.bestAllSec ? 1 / b.bestAllSec : 0, value: b.bestAllSec ? paceClock(b.bestAllSec) : "–" }))}
        />
      );
    case "runDeltas":
      return <DeltasChart runs={slide.runs} />;
    case "consistency":
      return <ConsistencyDots weekly={slide.weekly} foot={t("w.analyze.exp.consistencyFoot")} />;
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
  const stroke = KIND_STROKE[model.kind];
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
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* header — a bare ‹ and the name; hairlines are the only structure here */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={onBack} aria-label={t("w.analyze.exp.back")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 22, padding: "6px 10px 6px 0", lineHeight: 1 }}>
          ‹
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.01em", margin: 0 }}>{name}</h1>
      </div>

      <div style={{ display: "flex", gap: 18, margin: "14px 2px 6px" }}>
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
    </div>
  );
}
