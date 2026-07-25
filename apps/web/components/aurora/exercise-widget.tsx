"use client";

import { useMemo } from "react";
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
import { useTheme, type Theme } from "@/lib/use-theme";

const C = (v: string) => `var(--color-${v})`;

/* Chart strokes are SVG presentation attrs (can't resolve CSS vars) — raw
 * hexes mirror globals.css per THEME: Aurora keeps the dark accents
 * (chartreuse / lifted teal / sand), Kyoto Hour uses pine / sage-text /
 * amber-text so the chart material matches the washi palette instead of
 * dragging dark-theme teal onto light paper. Parity: the mobile
 * kindStroke(C, kind), which resolves the same channels via the palette. */
export const kindStroke = (theme: Theme, kind: ExerciseWidgetCard["kind"]): string =>
  theme === "light"
    ? kind === "strength" ? "#44584c" : kind === "cardio" ? "#4f5c3a" : "#875427"
    : kind === "strength" ? "#c6f84f" : kind === "cardio" ? "#6cb6bd" : "#d0cd94";
/** improvement / regression bar fills (exercise-page deltas chart). */
export const upHex = (theme: Theme): string => (theme === "light" ? "#44584c" : "#c6f84f");
export const downHex = (theme: Theme): string => (theme === "light" ? "#a3442f" : "#e58a5c");

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

/** Full-bleed sparkline — the card's material, not an illustration in it.
 *  Hand-rolled SVG mirroring the mobile Spark EXACTLY (same 340×92 path math,
 *  the domain padded 18% so a flat/zero baseline floats INSIDE the card, round
 *  joins + caps, an end dot). The previous recharts version pinned the series
 *  minimum to the card's bottom border — the half-clipped stroke read as a
 *  broken card edge and the area wash as a torn gradient on the washi theme. */
function Spark({ values, stroke, reversed, id }: { values: number[]; stroke: string; reversed?: boolean; id: string }) {
  const W = 340, H = 92, T = 10;
  const n = values.length;
  if (n < 2) return null;
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.18 || 1;
  lo -= pad; hi += pad;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return reversed ? T + f * (H - T) : H - f * (H - T);
  };
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${X(i)},${Y(v)}`).join(" ");
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={X(n - 1) - 4} cy={Y(values[n - 1]!)} r={3.5} fill={stroke} />
    </svg>
  );
}

function headline(card: ExerciseWidgetCard, units: WeightUnit, t: (k: string) => string): { v: string; u: string; label: string } {
  if (card.metric === "pace") return { v: paceClock(card.value), u: "/km", label: t("w.home.exw.bestPace") };
  if (card.metric === "weight") return { ...splitVal(fmtWeight(card.value, units)), label: t("w.home.exw.heaviest") };
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
  const { theme } = useTheme();
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
      {/* Full-bleed rail: negative margins the width of the shell gutter
          (--page-pad-x) pull the scroll clip to the true screen edge; the
          centre-snap then centres cards on the physical screen. */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "4px var(--page-pad-x, 16px) 6px" }}>
        {cards.map((card) => {
          const h = headline(card, units, t);
          const stroke = kindStroke(theme, card.kind);
          return (
            <button
              key={card.name}
              onClick={() => onOpen(card.name)}
              aria-label={`${card.name} — ${h.v} ${h.u}`}
              style={{
                flex: "0 0 min(86%, 340px)", scrollSnapAlign: "center", cursor: "pointer", textAlign: "left",
                position: "relative", height: 200, overflow: "hidden", padding: 0,
                background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28,
                boxShadow: "var(--shadow-card)", color: C("chalk"), fontFamily: "var(--font-display)",
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
            background: "none", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, borderRadius: 28,
            fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "center", lineHeight: 1.6, minHeight: 200,
          }}
        >
          <span style={{ fontSize: 22, color: C("ash") }}>＋</span>
          <span style={{ fontWeight: 600, color: "var(--lime-text)" }}>{t("w.home.exw.allCard")}</span>
        </button>
      </div>
    </div>
  );
}
