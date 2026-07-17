"use client";

import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import {
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  paceClock,
  fs,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

/* Chart strokes are SVG presentation attrs (can't resolve CSS vars) — raw
 * hexes mirror globals.css: lime, --blue-text, --amber-text, --red-text. */
export const KIND_STROKE: Record<ExerciseWidgetCard["kind"], string> = {
  strength: "#c6f84f",
  cardio: "#6cb6bd",
  conditioning: "#d0cd94",
};
export const UP_HEX = "#c6f84f";
export const DOWN_HEX = "#e58a5c";

/** "213 kg" → { v: "213", u: "kg" } so the number can lead and the unit recede. */
const splitVal = (s: string): { v: string; u: string } => {
  const i = s.lastIndexOf(" ");
  return i < 0 ? { v: s, u: "" } : { v: s.slice(0, i), u: s.slice(i + 1) };
};

/** The stock-ticker delta — plain coloured text, no pill (variant B). */
export function TickerDelta({ deltaPct, improving, size = fs.micro }: { deltaPct: number | null; improving: boolean | null; size?: number }) {
  if (deltaPct == null || improving == null) return null;
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: size, fontWeight: 700, color: improving ? "var(--lime-text)" : "var(--red-text)", whiteSpace: "nowrap" }}>
      {improving ? "▲" : "▼"} {Math.abs(deltaPct)}%
    </span>
  );
}

/** Full-bleed sparkline — the card's material, not an illustration in it. */
function Spark({ values, stroke, reversed, id }: { values: number[]; stroke: string; reversed?: boolean; id: string }) {
  const data = values.map((y) => ({ y }));
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["auto", "auto"]} reversed={reversed} />
        <Area type="monotone" dataKey="y" stroke={stroke} strokeWidth={2.2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function headline(card: ExerciseWidgetCard, units: WeightUnit, t: (k: string) => string): { v: string; u: string; label: string } {
  if (card.metric === "pace") return { v: paceClock(card.value), u: "/km", label: t("w.home.exw.bestPace") };
  if (card.metric === "e1rm") return { ...splitVal(fmtWeight(card.value, units)), label: t("w.home.exw.bestE1rm") };
  if (card.metric === "time") return { v: String(card.value), u: "min", label: t("w.home.exw.time") };
  return { ...splitVal(fmtTonnage(card.value, units)), label: t("w.home.exw.volume") };
}

const KIND_KEY: Record<ExerciseWidgetCard["kind"], string> = {
  strength: "w.home.exw.kindStrength",
  cardio: "w.home.exw.kindCardio",
  conditioning: "w.home.exw.kindConditioning",
};

/**
 * EXERCISES — the Today favourites rail (variant B, "the chart is the card").
 * Swipeable full-bleed cards, one per purpose; tap opens the exercise page.
 * Prototype: reference/exercises-widget-preview-ive.html.
 */
export default function ExerciseWidgetRail({
  sessions,
  onOpen,
  onAll,
}: {
  sessions: LoggedSession[];
  onOpen: (name: string) => void;
  onAll: () => void;
}) {
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units } = useLoggerPrefs();
  const cards = useMemo(() => exerciseWidgetCards(sessions, { bw }), [sessions, bw]);
  if (cards.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 10px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.home.exw.kicker")}</div>
        <button onClick={onAll} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--lime-text)", padding: 0 }}>
          {t("w.home.exw.all")} ›
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 -4px", padding: "4px 4px 6px" }}>
        {cards.map((card) => {
          const h = headline(card, units, t);
          const stroke = KIND_STROKE[card.kind];
          return (
            <button
              key={card.name}
              onClick={() => onOpen(card.name)}
              aria-label={`${card.name} — ${h.v} ${h.u}`}
              style={{
                flex: "0 0 min(86%, 340px)", scrollSnapAlign: "center", cursor: "pointer", textAlign: "left",
                position: "relative", height: 200, overflow: "hidden", padding: 0,
                background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28,
                boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", color: C("chalk"), fontFamily: "var(--font-display)",
              }}
            >
              <div style={{ position: "absolute", inset: "16px 18px auto 18px", zIndex: 2 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: fs.bodyLg, fontWeight: 600 }}>{card.name}</span>
                  <TickerDelta deltaPct={card.deltaPct} improving={card.improving} />
                </div>
                <div style={{ marginTop: 8, fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1 }}>
                  {h.v}
                  <span style={{ fontSize: fs.bodyLg, fontWeight: 500, color: C("ash"), marginLeft: 5 }}>{h.u}</span>
                </div>
                <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
                  {t(KIND_KEY[card.kind])} – {h.label}
                </div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 92 }}>
                <Spark values={card.spark} stroke={stroke} reversed={card.metric === "pace"} id={`exw-${card.name.replace(/\W/g, "")}`} />
              </div>
            </button>
          );
        })}
        <button
          onClick={onAll}
          style={{
            flex: "0 0 40%", scrollSnapAlign: "center", cursor: "pointer",
            display: "grid", placeItems: "center", alignContent: "center", gap: 8,
            background: C("ink2"), border: `1px dashed ${C("line")}`, borderRadius: 28,
            color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "center", lineHeight: 1.6, minHeight: 200,
          }}
        >
          <span style={{ fontSize: 22, color: "var(--lime-text)" }}>＋</span>
          <span>{t("w.home.exw.allCard")}</span>
        </button>
      </div>
    </div>
  );
}
