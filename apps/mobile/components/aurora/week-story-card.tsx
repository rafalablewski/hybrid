import { forwardRef } from "react";
import { View, Text } from "react-native";
import { ALPHA, brand } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { withAlpha } from "./field";

/**
 * THE WEEK, AS A 9:16 STORY — the same frame the session's card uses, because
 * they leave the app through the same door and land in the same place.
 *
 * IT CARRIES THE PARAGRAPH, and that is the whole reason it is a different card
 * from the one it replaces. The old week card was a tag, three figures and a
 * list: legible to the athlete who trained the week and mute to everyone else,
 * because "9.0 t / 4 / 8.2 km" says nothing to a person who has to reconstruct
 * a week from it. The narration is what makes the card readable by somebody who
 * was not there — and it is the SAME paragraph the summary screen prints, from
 * the same resolver, so the app never describes one week two ways.
 *
 * EVERY SIZE IS A FRACTION OF THE WIDTH, exactly as the session card does it:
 * the card is captured at export width and previewed at sheet width, and a
 * fixed type scale would break at one of the two. The 9:16 is Instagram's and
 * TikTok's story ratio, which is what "shareable" means in practice.
 *
 * That is also why the display type is `F.black` rather than the takeover 700,
 * matching the app's other story cards: the display-weight floor is read off
 * the SOURCE, and a size expressed as a fraction of the card's width is not
 * something a guard can check. The figures here land near 65px, far above the
 * floor — but a rule that cannot be verified is a rule that drifts, so the card
 * uses the weight its sibling uses rather than asking for an exemption.
 */
export interface WeekStoryFigures {
  /** "17 Aug – 23 Aug" — the week this is. */
  stamp: string;
  /** The week's own figure and what it is: the clock both halves paid into. */
  lead: { value: string; label: string };
  /** The two halves, each with its own figure. Either may be absent — a pure
   *  lifter's card carries one. */
  halves: { label: string; value: string }[];
  /** The paragraph, already resolved (lib/week-words). */
  words: string[];
  /** Named results, biggest first. */
  records: { name: string; value: string }[];
}

export const WeekStoryCard = forwardRef<View, { figures: WeekStoryFigures; width: number; tracked: string }>(
  ({ figures, width, tracked }, ref) => {
    const C = useTheme().palette;
    const pad = width * 0.082;
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
        {/* The Aurora membrane, as one soft disc — the same lit ground every
            story card in the app stands on. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -width * 0.2, right: -width * 0.25,
            width: width * 0.95, height: width * 0.95,
            borderRadius: width * 0.475,
            backgroundColor: withAlpha(C.lime, ALPHA.fill),
          }}
        />

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

          {/* THE WEEK'S FIGURE — the numerals are the object, the label
              annotates them, exactly as the widget on the screen sets it. */}
          <Text
            numberOfLines={1}
            style={{ fontFamily: F.black, fontSize: width * 0.155, color: C.chalk, marginTop: width * 0.07, letterSpacing: -width * 0.004 }}
          >
            {figures.lead.value}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: width * 0.028, color: C.ash, letterSpacing: width * 0.003, marginTop: width * 0.012 }}>
            {figures.lead.label.toUpperCase()}
          </Text>

          {/* THE TWO HALVES, on the card's own edges. */}
          {figures.halves.length > 0 && (
            <View style={{ flexDirection: "row", marginTop: width * 0.075 }}>
              {figures.halves.map((h, i) => (
                <View key={h.label} style={{ flex: 1, alignItems: i === 0 ? "flex-start" : "flex-end" }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: width * 0.072, color: C.chalk }}>{h.value}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: width * 0.026, color: C.ash, letterSpacing: width * 0.002, marginTop: width * 0.012 }}>
                    {h.label.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── THE WEEK, READ OUT ──
            The part somebody who was not there can actually read. */}
        <View>
          {figures.words.map((line) => (
            <Text
              key={line}
              style={{ fontFamily: F.reg, fontSize: width * 0.042, lineHeight: width * 0.062, color: C.chalk, marginBottom: width * 0.022 }}
            >
              {line}
            </Text>
          ))}
        </View>

        {/* ── WHAT CAME OUT OF IT ── */}
        <View>
          {figures.records.length > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: width * 0.045, marginBottom: width * 0.05 }}>
              {figures.records.slice(0, 3).map((r) => (
                <View key={r.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: width * 0.022 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: width * 0.04, color: C.chalk, flex: 1 }}>{r.name}</Text>
                  <Text style={{ fontFamily: F.monoBold, fontSize: width * 0.04, color: C.lime }}>{r.value}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={{ fontFamily: F.mono, fontSize: width * 0.028, color: C.ash }}>{tracked}</Text>
        </View>
      </View>
    );
  },
);
WeekStoryCard.displayName = "WeekStoryCard";
