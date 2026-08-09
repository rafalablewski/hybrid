import { useMemo, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  SHARED_ELEMENTS,
  exerciseCardReading,
  exerciseStripBars,
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  formatDisciplinePace,
  movementsTrained,
  paceClock,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import HistoryStrip from "./history-strip";
import { useChartScrub } from "./chart-scrub";
import RailTail from "./rail-tail";
import ExerciseFavouritesSheet from "./exercise-favourites-sheet";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useExerciseFavourites } from "../../lib/exercise-favourites";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useSharedElementSource } from "../../lib/shared-element";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, fs, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { GUTTER, RADIUS, withAlpha } from "./kit";

/** purpose → stroke, theme-aware: lime/blue follow the theme accents, the
 *  conditioning sand + ticker red ride accentText (parity with the web
 *  kindStroke(theme, kind), which resolves the same channels per theme). */
export const kindStroke = (C: Palette, kind: ExerciseWidgetCard["kind"]): string =>
  kind === "strength" ? C.lime : kind === "cardio" ? txt(C, C.blue) : txt(C, C.amber);

/** How long a finger must rest on a card's strip before it answers instead of
 *  opening the page. The web twin's HOLD_MS. */
const HOLD_MS = 120;

/** A strip point's date, in the card's own quiet voice. */
const fmtStripDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/** "213 kg" → parts so the number can lead and the unit recede. */
const splitVal = (s: string): { v: string; u: string } => {
  const i = s.lastIndexOf(" ");
  return i < 0 ? { v: s, u: "" } : { v: s.slice(0, i), u: s.slice(i + 1) };
};

/** The stock-ticker delta — plain coloured text, no pill (variant B). */
export function TickerDelta({ deltaPct, improving, size = fs.micro }: { deltaPct: number | null; improving: boolean | null; size?: number }) {
  const { palette: C } = useTheme();
  if (deltaPct == null || improving == null) return null;
  return (
    <Text style={{ fontFamily: F.monoBold, fontSize: size, color: improving ? txt(C, C.lime) : txt(C, C.red) }}>
      {improving ? "▲" : "▼"} {Math.abs(deltaPct)}%
    </Text>
  );
}

/** A rate in ITS DISCIPLINE'S convention — "/km" running, "/100m" swimming,
 *  "/500m" rowing, "km/h" cycling. `formatDisciplinePace` is the one function
 *  that knows; the card used to print a hard-coded "/km" and showed a swimmer
 *  "38:36 /km" while the Endurance lane below it printed the same rate as
 *  "3:52 /100m". A card with no resolved discipline keeps the /km fallback,
 *  which is what the canonical value already is. */
function paceParts(card: ExerciseWidgetCard): { v: string; u: string } {
  if (!card.discipline) return { v: paceClock(card.value), u: "/km" };
  const s = formatDisciplinePace(card.value, card.discipline);
  const i = s.lastIndexOf(" ");
  return i < 0 ? { v: s, u: "" } : { v: s.slice(0, i), u: s.slice(i + 1) };
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
 * the dwell does it: a tap ends before the hold and opens the page, a hold
 * passes it and reads the strip instead. Parity: the web twin's `Card`, where
 * the same dwell separates a tap from a read (and a mouse gets both at once —
 * hover to read, click to open).
 *
 * Held, the card answers in the slots it already has: the FIGURE becomes that
 * point's, and the footer's metric name becomes its date. The strip is 24dp
 * tall; a pinned pill would cover the card.
 */
function Card({ card, units, C, t, onOpen, armHero, heroRefs }: {
  card: ExerciseWidgetCard;
  units: WeightUnit;
  C: Palette;
  t: (k: string) => string;
  onOpen: (name: string) => void;
  armHero: ReturnType<typeof useSharedElementSource>;
  heroRefs: { current: Record<string, Text | null> };
}) {
  const h = headline(card, units, t);
  const stroke = kindStroke(C, card.kind);
  const heroStyle = { fontFamily: F.mono, fontSize: 26, letterSpacing: -1, color: C.chalk } as const;
  const open = () => {
    armHero(SHARED_ELEMENTS.exerciseHero, heroRefs.current[card.name] ?? null, h.v, heroStyle);
    onOpen(card.name);
  };
  const scrub = useChartScrub(card.spark.length, "band", undefined, { holdMs: HOLD_MS, onTap: open });
  const read = scrub.index >= 0 ? exerciseCardReading(card, scrub.index, units) : null;
  const when = read?.weekStart
    ? card.sparkBy === "week"
      ? t("chart.weekOf").replace("{date}", fmtStripDate(read.weekStart))
      : fmtStripDate(read.weekStart)
    : "";
  return (
    <Pressable
      // SHARED ELEMENT: the headline figure flies into the exercise
      // page's hero rather than the page re-rendering it. Measured at
      // press time; if the destination never claims it the arm expires
      // and the ordinary screen transition carries the change.
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${card.name} — ${h.v} ${h.u}`}
      style={{
        width: 200, minHeight: 132, gap: 8,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
      }}
    >
      {/* The name gets the whole row. The delta used to sit beside it
          and cost "Standing Overhead Press" its last words on a narrow
          device; it reads as well from the footer, where the kind word
          used to be. */}
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{card.name}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text ref={(n) => { heroRefs.current[card.name] = n; }} style={[heroStyle, read?.best ? { color: txt(C, C.lime) } : null]}>
          {read ? read.value : h.v}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{read ? read.unit : h.u}</Text>
      </View>
      <View {...scrub.bind} style={{ marginTop: "auto" }}>
        <HistoryStrip bars={exerciseStripBars(card)} color={stroke} held={scrub.index} />
      </View>
      {/* The footer says the metric and its window, then the delta.
          The KIND word ("Strength") is gone: the purpose was already
          encoded twice — the strip is drawn in kindStroke's chartreuse
          for a lift and teal for cardio, and the metric name entails it
          ("Heaviest" is only ever a lift, "Best pace" only ever
          cardio). Three channels for one fact is not reinforcement; it
          is the slot a real fact could have used. Colour keeps the
          visual channel and the metric name the text one, so nothing
          here is colour-only. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 10, color: C.ash }}>{read ? when : h.label}</Text>
        {!read && <TickerDelta deltaPct={card.deltaPct} improving={card.improving} size={9.5} />}
      </View>
    </Pressable>
  );
}

/**
 * EXERCISES — the Today favourites rail (variant B, "the chart is the card").
 * Swipeable full-bleed cards, one per purpose; tap opens the exercise page.
 * Parity: apps/web/components/aurora/exercise-widget.tsx; prototype
 * reference/exercises-widget-preview-ive.html.
 *
 * THE RAIL IS PINNABLE. Auto-fill (one card per purpose, most-trained first) is
 * a guess about what the athlete cares about; the lift they are actually
 * chasing this block is a choice. The tail carries BOTH doors — a dashed "+"
 * that opens the pin sheet and changes what this rail shows, and the shared
 * RailTail that just goes to the exercises list. They used to be one tile
 * marked "＋ All exercises & favourites", which promised an add and performed a
 * navigation. Pins live per-device (lib/exercise-favourites) and lead the rail
 * in pin order; core's exerciseWidgetCards fills the rest.
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units } = useLoggerPrefs();
  const favourites = useExerciseFavourites();
  const [adding, setAdding] = useState(false);
  const cards = useMemo(
    () => exerciseWidgetCards(sessions, { bw, deferToLanes, favourites }),
    [sessions, bw, deferToLanes, favourites],
  );
  // The head's coverage denominator — movements trained inside the rail's OWN
  // 8-week window, so the fraction is a fraction of the same thing the cards
  // are rather than two scopes in one sentence.
  const trained = useMemo(() => movementsTrained(sessions), [sessions]);
  // One ref per card's headline figure — only the tapped card is ever measured.
  const heroRefs = useRef<Record<string, Text | null>>({});
  const armHero = useSharedElementSource();
  if (cards.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head — one head tier across the PROGRESS cluster,
          and the right slot carries ONE item: the rail's COVERAGE of the
          movements trained in its own window. It used to quote the This-week
          card's volume column whole, which restated a figure 400dp above it
          and spent the slot on a fact the reader already had — while the one
          they did NOT have, that this rail is a selection rather than their
          whole log, had nowhere to go. A quote must add a fraction. The
          "All ›" action lives in the rail's trailing tail, per the
          one-exit rule. Mirrors web. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, marginHorizontal: 2 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.home.exw.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
          {t("w.home.group.metaMoves").replace("{a}", String(cards.length)).replace("{b}", String(trained))}
        </Text>
      </View>
      {/* Full-bleed rail — negative margins the width of AuroraScreen's 12dp
          gutter pull the scroll clip to the true screen edge, with matching
          internal padding so resting cards stay on the column. Cards wear the
          cluster's ONE TILE SKELETON (consistency wave 2): name row → figure →
          chart zone → footer meta, radius 16, the shared HistoryStrip as the
          chart. The 340×200 sparkline hero retired with it — the rail lost
          theatre and the cluster gained a single voice. Mirrors web. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ marginHorizontal: -GUTTER }}
        contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: GUTTER }}
      >
        {cards.map((card) => (
          <Card key={card.name} card={card} units={units} C={C} t={t} onOpen={onOpen} armHero={armHero} heroRefs={heroRefs} />
        ))}
        {/* THE ADD DOOR — the dashed ghost tile, at tile scale.
            #365 retired this rail's dashed ＋ for three good reasons: a dashed
            box is the "empty slot / drop here" idiom, ＋ means ADD while that
            tile only navigated, and it spent chartreuse — the reserved "go"
            colour — on a standing link. The second reason is the load-bearing
            one, and it no longer holds: this ＋ genuinely ADDS, opening the pin
            sheet so the chosen movement is a card in this rail before the sheet
            is even closed. Which turns the other two around — "drop here" is
            exactly what an add slot means, and lime on a real action is the
            colour doing its job rather than decorating a link. The EXIT beside
            it is the shared RailTail, per that same rule. Mirrors web. */}
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t("w.home.exw.addCard")} – ${t("w.home.exw.title")}`}
          style={{ width: 132, minHeight: 132, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: withAlpha(C.ash, 0.4), borderStyle: "dashed", borderRadius: RADIUS.field, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 18, color: C.ash }}>＋</Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: txt(C, C.lime), textAlign: "center", lineHeight: leading(fs.micro) }}>{t("w.home.exw.addCard")}</Text>
        </Pressable>
        {/* THE SEE-ALL DOOR (#365's exit) — the shared RailTail, so this rail's
            exit is drawn like every other rail's: chromeless, carrying no thing
            of its own. It only DISPLAYS the exercises list; it never touches
            the pins. The ADD tile beside it keeps its box precisely because it
            DOES carry a thing — an action — which is the distinction #365 drew.
            Mirrors web. */}
        <RailTail
          onOpen={onAll}
          a11y={`${t("w.explore.seeAll")} – ${t("w.home.exw.title")}`}
          w={132} minHeight={132}
        />
      </ScrollView>
      <ExerciseFavouritesSheet visible={adding} onClose={() => setAdding(false)} sessions={sessions} />
    </View>
  );
}
