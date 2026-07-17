import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  exerciseWidgetCards,
  fmtWeight,
  fmtTonnage,
  paceClock,
  type ExerciseWidgetCard,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { RADIUS } from "./kit";

/** purpose → stroke, theme-aware: lime/blue follow the theme accents, the
 *  conditioning sand + ticker red ride accentText (parity with web KIND_STROKE). */
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

/** Full-bleed sparkline — the card's material, not an illustration in it. */
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
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <Path d={line} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={X(n - 1) - 4} cy={Y(values[n - 1]!)} r={3.5} fill={stroke} />
    </Svg>
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bw = useBodyweightLookup();
  const { units } = useLoggerPrefs();
  const { width } = useWindowDimensions();
  const cards = useMemo(() => exerciseWidgetCards(sessions, { bw }), [sessions, bw]);
  if (cards.length === 0) return null;

  const cardW = Math.min(340, Math.round(width * 0.78));

  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 2 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.home.exw.kicker")}</Text>
        <Pressable onPress={onAll} accessibilityRole="button" hitSlop={10}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.home.exw.all")} ›</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: 2 }}
      >
        {cards.map((card) => {
          const h = headline(card, units, t);
          const stroke = kindStroke(C, card.kind);
          return (
            <Pressable
              key={card.name}
              onPress={() => onOpen(card.name)}
              accessibilityRole="button"
              accessibilityLabel={`${card.name} — ${h.v} ${h.u}`}
              style={{ width: cardW, height: 200, overflow: "hidden", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card }}
            >
              <View style={{ position: "absolute", top: 16, left: 18, right: 18, zIndex: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{card.name}</Text>
                  <TickerDelta deltaPct={card.deltaPct} improving={card.improving} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 8 }}>
                  <Text style={{ fontFamily: F.black, fontSize: 34, letterSpacing: -0.5, color: C.chalk }}>{h.v}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}>{h.u}</Text>
                </View>
                <Text style={{ marginTop: 6, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>
                  {t(KIND_KEY[card.kind])} – {h.label}
                </Text>
              </View>
              <Spark values={card.spark} stroke={stroke} reversed={card.metric === "pace"} id={`exw-${card.name.replace(/\W/g, "")}`} />
            </Pressable>
          );
        })}
        <Pressable
          onPress={onAll}
          accessibilityRole="button"
          style={{ width: Math.round(cardW * 0.5), height: 200, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: RADIUS.card, paddingHorizontal: 14 }}
        >
          <Text style={{ fontSize: 22, color: txt(C, C.lime) }}>＋</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, textAlign: "center", lineHeight: 17 }}>{t("w.home.exw.allCard")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
