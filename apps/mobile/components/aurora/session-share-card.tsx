/**
 * THE SESSION SHARE CARD — one composition, deliberately made for a feed.
 *
 * WHY IT IS NOT A SCREENSHOT. The summary used to share itself by capturing
 * whichever full-screen panel the athlete had stopped on. That sounded like it
 * removed a drift (one tree, no second layout to keep in step) and instead
 * imposed one: if every panel must double as a 9:16 post, every panel has to
 * FILL a 9:16 frame, and the panels that had less to say were padded with black
 * until they did. Four of the summary's screens were mostly empty ink for that
 * reason alone.
 *
 * So the document downstairs is now sized to its content — nothing stretches —
 * and sharing is this: ONE card, composed once, showing the things worth
 * posting. It leads with the body, because a lit anatomical figure is the one
 * picture no other training app produces, and it is legible at the size a feed
 * actually renders it.
 *
 * Every figure comes from the same values the document reads (`sessionMuscleMap`,
 * the device-true receipt), so the card cannot disagree with the screen it was
 * made from — which was the real guarantee worth keeping.
 *
 * SIZING: every dimension is a fraction of `width`, so one component serves the
 * on-screen preview and the capture. `captureRef` runs at the device pixel
 * ratio, so a phone-width card exports near 1080px wide.
 */
import { forwardRef, useMemo } from "react";
import { View, Text } from "react-native";
import {
  brand,
  BODY_FIGURES,
  sessionMuscleGlows,
  fmtWeight,
  type SessionMuscleMap,
  type WeightUnit,
} from "@hybrid/core";
import { BodyFigures } from "./body-map";
import { withAlpha } from "./field";
import { F, TABULAR } from "../../lib/ui";
import { useTheme } from "../../lib/theme";

/** How many muscles the card names. Three is a sentence; six is a table. */
const CARD_MUSCLES = 3;

export interface SessionShareFigures {
  /** the session's own defining figure, already formatted ("10.2 t") */
  headline: string;
  /** what that figure IS ("volume moved") */
  headlineLabel: string;
  /** the short figure row along the foot */
  stats: { label: string; value: string }[];
  /** the record line, when the session set one */
  record?: string | null;
  /** "Wed, 19 Aug" — composed by the caller, which owns the locale */
  stamp: string;
  title: string;
}

export const SessionShareCard = forwardRef<
  View,
  {
    figures: SessionShareFigures;
    map: SessionMuscleMap;
    units: WeightUnit;
    width: number;
    locale?: string;
  }
>(({ figures, map, units, width, locale }, ref) => {
  const C = useTheme().palette;
  const pad = width * 0.082;
  const intensityOf = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of sessionMuscleGlows(map)) out[g.muscle] = g.intensity;
    return out;
  }, [map]);
  const named = map.muscles.slice(0, CARD_MUSCLES);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width,
        height: Math.round((width * 16) / 9),
        backgroundColor: C.ink,
        padding: pad,
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* ── MASTHEAD ── */}
      <View>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.black, fontSize: width * 0.052, color: C.chalk }}>
            {brand.name.toUpperCase()}
            <Text style={{ color: C.lime }}>.</Text>
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: width * 0.028, color: C.ash }}>
            {figures.stamp.toUpperCase()}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={{ fontFamily: F.black, fontSize: width * 0.078, color: C.chalk, marginTop: width * 0.055, lineHeight: width * 0.085 }}
        >
          {figures.title}
        </Text>
      </View>

      {/* ── THE BODY — the reason this card is worth posting ── */}
      <View style={{ alignItems: "center" }}>
        <View style={{ width: width * 0.78 }}>
          <BodyFigures figures={BODY_FIGURES} intensityOf={intensityOf} gap={width * 0.05} />
        </View>
        {named.length > 0 && (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: F.mono,
              fontSize: width * 0.031,
              color: C.lime,
              marginTop: width * 0.035,
            }}
          >
            {/* A spaced en dash, never a middot — house rule. */}
            {named.map((m) => `${m.short.toUpperCase()} ${m.pct}%`).join("  –  ")}
          </Text>
        )}
      </View>

      {/* ── THE FIGURES ── */}
      <View>
        {figures.record ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: F.mono, fontSize: width * 0.03, color: C.amber, marginBottom: width * 0.03 }}
          >
            {figures.record.toUpperCase()}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={[TABULAR, { fontFamily: F.black, fontSize: width * 0.155, color: C.chalk }]}>
            {figures.headline}
          </Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: width * 0.029, color: C.ash, marginTop: width * 0.008 }}>
          {figures.headlineLabel.toUpperCase()}
        </Text>
        <View
          style={{
            flexDirection: "row",
            marginTop: width * 0.05,
            paddingTop: width * 0.038,
            borderTopWidth: 1,
            borderTopColor: withAlpha(C.chalk, 0.14),
          }}
        >
          {figures.stats.map((s) => (
            <View key={s.label} style={{ flex: 1 }}>
              <Text style={[TABULAR, { fontFamily: F.black, fontSize: width * 0.052, color: C.chalk }]}>{s.value}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: width * 0.026, color: C.ash, marginTop: width * 0.006 }}>
                {s.label.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});
SessionShareCard.displayName = "SessionShareCard";

/** Kept beside the card so a caller formatting a muscle tonnage for the card's
 *  accessibility text uses the card's own units and locale. */
export const shareMuscleText = (map: SessionMuscleMap, units: WeightUnit, locale?: string): string =>
  map.muscles
    .slice(0, CARD_MUSCLES)
    .map((m) => `${m.short} ${fmtWeight(m.volumeKg, units, undefined, locale)}`)
    .join(", ");
