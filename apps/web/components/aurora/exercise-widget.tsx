"use client";

import { useMemo } from "react";
import { useRef } from "react";
import {
  SHARED_ELEMENTS,
  THEMES,
  exerciseStripBars,
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  paceClock,
  progressParentage,
  fs,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import HistoryStrip from "./history-strip";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/use-theme";
import { armSharedElement } from "@/lib/shared-element";

const C = (v: string) => `var(--color-${v})`;

/* Chart strokes are SVG presentation attrs (can't resolve CSS vars) — so they
 * resolve from the core THEMES palette per theme: Aurora keeps the dark accents
 * (chartreuse / lifted teal / sand), Kyoto Hour uses pine / sage-text /
 * amber-text so the chart material matches the washi palette instead of
 * dragging dark-theme teal onto light paper. Parity: the mobile
 * kindStroke(C, kind), which resolves the same channels via the palette. */
export const kindStroke = (theme: Theme, kind: ExerciseWidgetCard["kind"]): string =>
  kind === "strength" ? THEMES[theme].accent : kind === "cardio" ? THEMES[theme].accentText.blue : THEMES[theme].accentText.amber;
/** improvement / regression bar fills (exercise-page deltas chart). */
export const upHex = (theme: Theme): string => THEMES[theme].accent;
export const downHex = (theme: Theme): string => THEMES[theme].accentText.red;

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
  // WAVE-3 PARENTAGE: the head quotes the This-week card's VOLUME column —
  // the figure this rail breaks down per movement. Same activitySummary, same
  // week range (core progress-parentage.ts), so the two can never disagree.
  const parentage = useMemo(() => progressParentage(sessions, { bw }), [sessions, bw]);
  if (cards.length === 0) return null;

  return (
    <div>
      {/* Explore-standard head — one head tier across the PROGRESS cluster,
          and the right slot carries ONE item: the FACT this rail decomposes
          (wave-3 parentage — the This-week card's volume column, quoted from
          the same core summary). The "All ›" action lives in the rail's
          trailing ghost tile, per the one-exit rule. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.exw.title")}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".06em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>
          {t("w.home.group.metaWeek").replace("{v}", fmtTonnage(parentage.tonnageKg, units))}
        </span>
      </div>
      {/* Full-bleed rail: negative margins the width of the shell gutter
          (--page-pad-x) pull the scroll clip to the true screen edge. Cards
          wear the cluster's ONE TILE SKELETON (consistency wave 2): name row →
          figure → chart zone → footer meta, radius 16, the shared HistoryStrip
          as the chart. The 340×200 radius-28 sparkline hero retired with it —
          the rail lost theatre and the cluster gained a single voice. */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "2px var(--page-pad-x, 16px) 6px" }}>
        {cards.map((card) => {
          const h = headline(card, units, t);
          const stroke = kindStroke(theme, card.kind);
          return (
            <button
              key={card.name}
              // SHARED ELEMENT: the headline figure travels into the exercise
              // page's hero rather than the page re-rendering it. Only the
              // TAPPED card may claim the name — a rail of cards all declaring
              // it would collide and silently kill the transition — so it is
              // armed here, imperatively, before the navigation starts.
              onClick={(e) => {
                armSharedElement(
                  e.currentTarget.querySelector<HTMLElement>("[data-shared-hero]"),
                  SHARED_ELEMENTS.exerciseHero,
                );
                onOpen(card.name);
              }}
              aria-label={`${card.name} — ${h.v} ${h.u}`}
              style={{
                flex: "0 0 200px", scrollSnapAlign: "start", cursor: "pointer", textAlign: "left",
                minHeight: 132, display: "flex", flexDirection: "column", gap: 7,
                background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
                boxShadow: "var(--shadow-card)", padding: "11px 12px 12px",
                color: C("chalk"), fontFamily: "var(--font-display)",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, width: "100%" }}>
                <span style={{ fontWeight: 700, fontSize: fs.body, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</span>
                <TickerDelta deltaPct={card.deltaPct} improving={card.improving} size={9.5} />
              </span>
              <span data-shared-hero style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, width: "fit-content" }}>
                {h.v}
                <span style={{ fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 }}>{h.u}</span>
              </span>
              <span style={{ display: "block", width: "100%", marginTop: "auto" }}>
                <HistoryStrip bars={exerciseStripBars(card)} color={stroke} />
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 6, width: "100%", fontFamily: "var(--font-mono)", fontSize: 9.5, color: C("ash") }}>
                <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.label}</span>
                <span style={{ whiteSpace: "nowrap" }}>{t(KIND_KEY[card.kind])}</span>
              </span>
            </button>
          );
        })}
        {/* The rail's exit — the trailing ghost tile, at tile scale. */}
        <button
          onClick={onAll}
          style={{
            flex: "0 0 132px", scrollSnapAlign: "start", cursor: "pointer",
            display: "grid", placeItems: "center", alignContent: "center", gap: 8,
            background: "none", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, borderRadius: 16,
            fontFamily: "var(--font-mono)", fontSize: fs.micro, textAlign: "center", lineHeight: 1.6, minHeight: 132,
          }}
        >
          <span style={{ fontSize: 18, color: C("ash") }}>＋</span>
          <span style={{ fontWeight: 600, color: "var(--lime-text)" }}>{t("w.home.exw.allCard")}</span>
        </button>
      </div>
    </div>
  );
}
