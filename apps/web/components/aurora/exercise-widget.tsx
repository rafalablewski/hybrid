"use client";

import { useMemo } from "react";
import { useRef } from "react";
import {
  SHARED_ELEMENTS,
  THEMES,
  exerciseCardReading,
  exerciseStripBars,
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  formatDisciplinePace,
  movementsTrained,
  paceClock,
  fs,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import HistoryStrip from "./history-strip";
import { useChartScrub, SCRUB_STYLE_IN_RAIL } from "./chart-scrub";
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
/** A strip point's date, in the card's own quiet voice. */
const fmtStripDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

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

/** A rate in ITS DISCIPLINE'S convention — "/km" running, "/100m" swimming,
 *  "/500m" rowing, "km/h" cycling. `formatDisciplinePace` is the one function
 *  that knows; the card used to print a hard-coded "/km" and showed a swimmer
 *  "38:36 /km" while the Endurance lane below it printed the same rate as
 *  "3:52 /100m". A card with no resolved discipline keeps the /km fallback,
 *  which is what the canonical value already is. Parity: mobile paceParts. */
function paceParts(card: ExerciseWidgetCard): { v: string; u: string } {
  return card.discipline ? splitVal(formatDisciplinePace(card.value, card.discipline)) : { v: paceClock(card.value), u: "/km" };
}

function headline(card: ExerciseWidgetCard, units: WeightUnit, t: (k: string) => string): { v: string; u: string; label: string } {
  if (card.metric === "pace") return { ...paceParts(card), label: t("w.home.exw.bestPace") };
  if (card.metric === "weight") return { ...splitVal(fmtWeight(card.value, units)), label: t("w.home.exw.heaviest") };
  if (card.metric === "time") return { v: String(card.value), u: "min", label: t("w.home.exw.time") };
  return { ...splitVal(fmtTonnage(card.value, units)), label: t("w.home.exw.volume") };
}


/**
 * One favourite's card — name, the window's headline figure, its eight-week
 * strip, then the metric and its delta.
 *
 * The card is a BUTTON that opens the movement's page, and the strip inside it
 * is a chart you can hold. A press therefore has to declare which it meant, and
 * the dwell does it: a tap ends before `HOLD_MS` and opens the page, a hold
 * passes it and reads the strip instead (the click that would have followed is
 * cancelled). A mouse gets both at once — hover to read, click to open.
 *
 * Held, the card answers in the slots it already has: the FIGURE becomes that
 * point's, and the footer's metric name becomes its date. The strip is 24px
 * tall; a pinned pill would cover the card.
 */
function Card({ card, units, theme, t, onOpen }: {
  card: ExerciseWidgetCard;
  units: WeightUnit;
  theme: Theme;
  t: (k: string) => string;
  onOpen: (name: string) => void;
}) {
  const h = headline(card, units, t);
  const stroke = kindStroke(theme, card.kind);
  const scrub = useChartScrub(card.spark.length, "band", undefined, { inButton: true });
  const read = scrub.index >= 0 ? exerciseCardReading(card, scrub.index, units) : null;
  const when = read?.weekStart
    ? card.sparkBy === "week"
      ? t("chart.weekOf").replace("{date}", fmtStripDate(read.weekStart))
      : fmtStripDate(read.weekStart)
    : "";
  return (
    <button
      className="pressable"
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
        minHeight: 132, display: "flex", flexDirection: "column", gap: 8,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        boxShadow: "var(--shadow-card)", padding: "12px 12px 12px",
        color: C("chalk"), fontFamily: "var(--font-display)",
      }}
    >
      {/* The name gets the whole row. The delta used to sit beside it
          and cost "Standing Overhead Press" its last words in a 200px
          card; it reads as well from the footer, where the kind word
          used to be. Mirrors mobile. */}
      <span style={{ display: "block", width: "100%", fontWeight: 700, fontSize: fs.body, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</span>
      <span data-shared-hero aria-live="polite" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1, width: "fit-content", color: read?.best ? "var(--lime-text)" : C("chalk") }}>
        {read ? read.value : h.v}
        <span style={{ fontSize: 10, fontWeight: 400, color: C("ash"), marginLeft: 4 }}>{read ? read.unit : h.u}</span>
      </span>
      <span {...scrub.bind} style={{ ...SCRUB_STYLE_IN_RAIL, display: "block", position: "relative", width: "100%", marginTop: "auto" }}>
        <HistoryStrip bars={exerciseStripBars(card)} color={stroke} held={scrub.index} />
      </span>
      {/* The footer says the metric and its window, then the delta.
          The KIND word ("Strength") is gone: the purpose was already
          encoded twice — the strip is drawn in kindStroke's chartreuse
          for a lift and teal for cardio, and the metric name entails it
          ("Heaviest" is only ever a lift, "Best pace" only ever
          cardio). Three channels for one fact is not reinforcement; it
          is the slot a real fact could have used. Colour keeps the
          visual channel and the metric name the text one, so nothing
          here is colour-only. Mirrors mobile. */}
      <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, width: "100%", fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash") }}>
        <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{read ? when : h.label}</span>
        {!read && <TickerDelta deltaPct={card.deltaPct} improving={card.improving} size={9.5} />}
      </span>
    </button>
  );
}

/**
 * EXERCISES — the Today favourites rail (variant B, "the chart is the card").
 * Swipeable full-bleed cards, one per purpose; tap opens the exercise page.
 * Prototype: reference/exercises-widget-preview-ive.html.
 */
export default function ExerciseWidgetRail({
  sessions,
  onOpen,
  onAll,
  /** True when the Endurance lanes render on this screen. A discipline that
   *  already has a lane keeps its five tiles of depth there and is left out of
   *  this rail's auto-fill, so a swim is not a card AND a lane reading two
   *  different figures in two different units. An explicit favourite still
   *  appears — see core exerciseWidgetCards. */
  deferToLanes = false,
}: {
  sessions: LoggedSession[];
  onOpen: (name: string) => void;
  onAll: () => void;
  deferToLanes?: boolean;
}) {
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units } = useLoggerPrefs();
  const { theme } = useTheme();
  const cards = useMemo(() => exerciseWidgetCards(sessions, { bw, deferToLanes }), [sessions, bw, deferToLanes]);
  // The head's coverage denominator — movements trained inside the rail's OWN
  // 8-week window, so the fraction is a fraction of the same thing the cards
  // are rather than two scopes in one sentence.
  const trained = useMemo(() => movementsTrained(sessions), [sessions]);
  if (cards.length === 0) return null;

  return (
    <div>
      {/* Explore-standard head — one head tier across the PROGRESS cluster,
          and the right slot carries ONE item: the rail's COVERAGE of the
          movements trained in its own window. It used to quote the This-week
          card's volume column whole, which restated a figure a screen above it
          and spent the slot on a fact the reader already had — while the one
          they did NOT have, that this rail is a selection rather than their
          whole log, had nowhere to go. A quote must add a fraction. The
          "All ›" action lives in the rail's trailing ghost tile, per the
          one-exit rule. Mirrors mobile. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.exw.title")}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap" }}>
          {t("w.home.group.metaMoves").replace("{a}", String(cards.length)).replace("{b}", String(trained))}
        </span>
      </div>
      {/* Full-bleed rail: negative margins the width of the shell gutter
          (--page-pad-x) pull the scroll clip to the true screen edge. Cards
          wear the cluster's ONE TILE SKELETON (consistency wave 2): name row →
          figure → chart zone → footer meta, radius 16, the shared HistoryStrip
          as the chart. The 340×200 radius-28 sparkline hero retired with it —
          the rail lost theatre and the cluster gained a single voice. */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 12px))", padding: "2px var(--page-pad-x, 12px) 6px" }}>
        {cards.map((card) => (
          <Card key={card.name} card={card} units={units} theme={theme} t={t} onOpen={onOpen} />
        ))}
        {/* The rail's exit — the trailing ghost tile, at tile scale. */}
        <button className="pressable"
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
