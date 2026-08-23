import { useMemo, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  SHARED_ELEMENTS,
  exerciseCardFigure,
  exerciseWidgetCards,
  movementsTrained,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
  ALPHA,
} from "@hybrid/core";
import RailTail from "./rail-tail";
import ExerciseFavouritesSheet from "./exercise-favourites-sheet";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useExerciseFavourites } from "../../lib/exercise-favourites";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useSharedElementSource } from "../../lib/shared-element";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { APanel, GUTTER, RADIUS, withAlpha } from "./kit";
import { AuroraExerciseAvatar } from "./exercise-media";

/** purpose → stroke, theme-aware: lime/blue follow the theme accents, the
 *  conditioning sand + ticker red ride accentText (parity with the web
 *  kindStroke(theme, kind), which resolves the same channels per theme). */
export const kindStroke = (C: Palette, kind: ExerciseWidgetCard["kind"]): string =>
  kind === "strength" ? C.lime : kind === "cardio" ? txt(C, C.blue) : txt(C, C.amber);

/** The stock-ticker delta — plain coloured text, no pill.
 *
 *  Exported because the exercise PAGE prints the same delta for its own hero,
 *  and two drawings of one signed percentage is how the arrow ends up pointing
 *  the wrong way on one of them. */
export function TickerDelta({ deltaPct, improving, size = fs.micro }: { deltaPct: number | null; improving: boolean | null; size?: number }) {
  const { palette: C } = useTheme();
  if (deltaPct == null || improving == null) return null;
  return (
    <Text style={{ fontFamily: F.monoBold, fontSize: size, color: improving ? txt(C, C.lime) : txt(C, C.red) }}>
      {improving ? "▲" : "▼"} {Math.abs(deltaPct)}%
    </Text>
  );
}

/** A figure and its unit, in the card's own convention — one core formatter for
 *  the headline AND its baseline, so the two can never print different units.
 *  It is the function that knows a swim reads "/100m" and the road "/km". */
function headline(card: ExerciseWidgetCard, units: WeightUnit, t: (k: string) => string): { v: string; u: string; label: string } {
  const { value, unit } = exerciseCardFigure(card, card.value, units);
  const label =
    card.metric === "pace" ? t("w.home.exw.bestPace")
    : card.metric === "weight" ? t("w.home.exw.heaviest")
    : card.metric === "time" ? t("w.home.exw.time")
    : t("w.home.exw.volume");
  return { v: value, u: unit, label };
}

/**
 * One favourite's card — the mark, the name, the window's figure with its
 * change, and the figure that change was measured FROM.
 *
 * ── THE CHART IS GONE, AND WHAT REPLACED IT IS NOT A SMALLER CHART ────────
 *
 * The card carried an eight-bar strip of the last eight sessions, normalised
 * onto a floored band so the shape would show. That normalisation is the whole
 * problem: the bars encode a RELATIVE nudge, not a load, so the shortest is not
 * zero and the tallest is not a record, and nobody can read 62.5 → 70 kg off
 * them. It cost 24dp of a 132dp card, drew kind as colour for the third time on
 * one surface, and everything it was actually good for lived behind a 120ms
 * press-and-hold — a chart that must be held to be read is a chart that is not
 * being read.
 *
 * IN ITS PLACE, THE COMPARISON ITSELF. The bars only ever meant "is this going
 * up?", and two numbers answer that exactly: what it is, and what it was. The
 * delta moves up beside the figure it describes (it sat a row down and 100dp
 * away, reading as a footnote), and the baseline takes the line underneath.
 *
 * ── WHY THE BASELINE IS `prevValue` AND NOT `spark[0]` ────────────────────
 *
 * Because the card prints a percentage, and the two must be the same
 * comparison. `deltaPct` measures this window against the previous one;
 * `spark[0]` is the first point of the SPARK, which falls back to all-time
 * points when the window is thin and can predate the window entirely. Printing
 * that beside this percentage would put two baselines on one card and invite
 * the reader to check the arithmetic and find it wrong. Core exposes
 * `prevValue` for exactly this, and the two are null together by construction.
 *
 * ── THE LABEL SURVIVES ONLY WHERE IT IS STILL THE BEST THING TO SAY ───────
 *
 * "Heaviest – 8 weeks" was labelling the obvious on a card the athlete pinned
 * themselves — but it also carried the WINDOW, which nothing else on the rail
 * says. So the from-line carries the window instead ("from 62.5 kg – prev. 8
 * weeks"), and the old label is kept as the fallback for a movement with no
 * previous window, where there is no baseline to print and the metric name is
 * still the most useful thing the line can hold.
 *
 * The card remains a BUTTON that opens the movement's page, and it no longer
 * has to disambiguate a press: with the strip gone there is no second gesture
 * to tell a tap apart from, so the 120ms dwell went with it.
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
  const heroStyle = { fontFamily: F.mono, fontSize: fs.display, letterSpacing: tracking(fs.display), color: C.chalk } as const;
  const open = () => {
    armHero(SHARED_ELEMENTS.exerciseHero, heroRefs.current[card.name] ?? null, h.v, heroStyle);
    onOpen(card.name);
  };
  // The baseline, in the SAME formatter as the headline above it.
  const from = card.prevValue == null ? null : exerciseCardFigure(card, card.prevValue, units);
  const foot = from
    ? t("w.home.exw.fromPrev").replace("{v}", `${from.value}${from.unit ? ` ${from.unit}` : ""}`)
    : h.label;

  return (
    <APanel
      // SHARED ELEMENT: the headline figure flies into the exercise
      // page's hero rather than the page re-rendering it. Measured at
      // press time; if the destination never claims it the arm expires
      // and the ordinary screen transition carries the change.
      onPress={open}
      a11y={`${card.name} — ${h.v} ${h.u} — ${foot}`}
      style={{ width: 200, minHeight: 96, gap: 8 }}
    >
      {/* THE LIFT'S MARK, then its name. This rail was the last lift surface in
          the app with no picture of the lift on it at all, which is the one
          place a mark earns most: you swipe a rail, and an implement is what
          lets you find the barbell card without reading four of them.

          Ash, not the kind's colour. The strip that used to draw kind as colour
          has gone, so the mark is now the only place purpose is drawn — and one
          channel for one fact is the argument this card's own note always made,
          it just used to be making it against three. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AuroraExerciseAvatar name={card.name} size={24} glyph={14} tint={C.ash} />
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{card.name}</Text>
      </View>

      {/* THE FIGURE, and its change on the same baseline. The delta describes
          this number, so it sits beside it. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text ref={(n) => { heroRefs.current[card.name] = n; }} style={heroStyle}>{h.v}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{h.u}</Text>
        <View style={{ flex: 1 }} />
        <TickerDelta deltaPct={card.deltaPct} improving={card.improving} size={fs.micro} />
      </View>

      {/* WHERE IT CAME FROM — the delta's own baseline, so the percentage above
          can be checked rather than trusted. Falls back to the metric name on a
          movement with no previous window. */}
      <View style={{ marginTop: "auto" }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{foot}</Text>
      </View>
    </APanel>
  );
}

/**
 * EXERCISES — the Today favourites rail (variant B, "the chart is the card").
 * Swipeable full-bleed cards, one per purpose; tap opens the exercise page.
 * Prototype: reference/exercises-widget-preview-ive.html.
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
  const { palette: C } = useTheme();
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
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.home.exw.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), textTransform: "uppercase", color: C.ash }}>
          {t("w.home.group.metaMoves").replace("{a}", String(cards.length)).replace("{b}", String(trained))}
        </Text>
      </View>
      {/* Full-bleed rail — negative margins the width of AuroraScreen's 12dp
          gutter pull the scroll clip to the true screen edge, with matching
          internal padding so resting cards stay on the column. Cards wear the
          cluster's tile skeleton — name row → figure → footer meta, radius 16 —
          minus the chart zone, which went when the bars did (see Card). The
          340×200 sparkline hero had retired one wave earlier; the strip that
          replaced it has now gone the same way, and the card is 96dp instead of
          132. Mirrors web. */}
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
          style={{ width: 132, minHeight: 132, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: withAlpha(C.ash, ALPHA.rim), borderStyle: "dashed", borderRadius: RADIUS.field, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: fs.title, color: C.ash }}>＋</Text>
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
