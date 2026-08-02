import { useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
  SHARED_ELEMENTS,
  exerciseStripBars,
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  paceClock,
  progressParentage,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import HistoryStrip from "./history-strip";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useSharedElementSource } from "../../lib/shared-element";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { RADIUS, withAlpha } from "./kit";

/** purpose → stroke, theme-aware: lime/blue follow the theme accents, the
 *  conditioning sand + ticker red ride accentText (parity with the web
 *  kindStroke(theme, kind), which resolves the same channels per theme). */
export const kindStroke = (C: Palette, kind: ExerciseWidgetCard["kind"]): string =>
  kind === "strength" ? C.lime : kind === "cardio" ? txt(C, C.blue) : txt(C, C.amber);

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
 * Parity: apps/web/components/aurora/exercise-widget.tsx; prototype
 * reference/exercises-widget-preview-ive.html.
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units } = useLoggerPrefs();
  const cards = useMemo(() => exerciseWidgetCards(sessions, { bw }), [sessions, bw]);
  // WAVE-3 PARENTAGE: the head quotes the This-week card's VOLUME column —
  // the figure this rail breaks down per movement. Same activitySummary, same
  // week range (core progress-parentage.ts), so the two can never disagree.
  const parentage = useMemo(() => progressParentage(sessions, { bw }), [sessions, bw]);
  // One ref per card's headline figure — only the tapped card is ever measured.
  const heroRefs = useRef<Record<string, Text | null>>({});
  const armHero = useSharedElementSource();
  if (cards.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head — one head tier across the PROGRESS cluster,
          and the right slot carries ONE item: the FACT this rail decomposes
          (wave-3 parentage — the This-week card's volume column, quoted from
          the same core summary). The "All ›" action lives in the rail's
          trailing ghost tile, per the one-exit rule. Mirrors web. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginHorizontal: 2 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.home.exw.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.7, textTransform: "uppercase", color: C.ash }}>
          {t("w.home.group.metaWeek").replace("{v}", fmtTonnage(parentage.tonnageKg, units))}
        </Text>
      </View>
      {/* Full-bleed rail — negative margins the width of AuroraScreen's 16dp
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
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: 16 }}
      >
        {cards.map((card) => {
          const h = headline(card, units, t);
          const stroke = kindStroke(C, card.kind);
          const heroStyle = { fontFamily: F.mono, fontSize: 26, letterSpacing: -0.8, color: C.chalk } as const;
          return (
            <Pressable
              key={card.name}
              // SHARED ELEMENT: the headline figure flies into the exercise
              // page's hero rather than the page re-rendering it. Measured at
              // press time; if the destination never claims it the arm expires
              // and the ordinary screen transition carries the change.
              onPress={() => {
                armHero(SHARED_ELEMENTS.exerciseHero, heroRefs.current[card.name] ?? null, h.v, heroStyle);
                onOpen(card.name);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${card.name} — ${h.v} ${h.u}`}
              style={{
                width: 200, minHeight: 132, gap: 8,
                backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
                paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{card.name}</Text>
                <TickerDelta deltaPct={card.deltaPct} improving={card.improving} size={9.5} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text ref={(n) => { heroRefs.current[card.name] = n; }} style={heroStyle}>{h.v}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{h.u}</Text>
              </View>
              <View style={{ marginTop: "auto" }}>
                <HistoryStrip bars={exerciseStripBars(card)} color={stroke} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: 9.5, color: C.ash }}>{h.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.ash }}>{t(KIND_KEY[card.kind])}</Text>
              </View>
            </Pressable>
          );
        })}
        {/* The rail's exit — the trailing ghost tile, at tile scale. */}
        <Pressable
          onPress={onAll}
          accessibilityRole="button"
          style={{ width: 132, minHeight: 132, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: withAlpha(C.ash, 0.4), borderStyle: "dashed", borderRadius: RADIUS.field, paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 18, color: C.ash }}>＋</Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: txt(C, C.lime), textAlign: "center", lineHeight: 16 }}>{t("w.home.exw.allCard")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
