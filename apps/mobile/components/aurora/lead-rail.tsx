import type { ReactNode } from "react";
import { View, Text, ScrollView, useWindowDimensions } from "react-native";
import { ALPHA } from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, leading, tracking, trackFigure, F, TABULAR } from "../../lib/ui";
import { GUTTER, APressCard } from "./kit";
import { ArrowGlyph } from "./cta-label";
import { withAlpha } from "./field";

/**
 * THE LEAD RAIL — the cards the You tab opens with, side by side.
 *
 * They used to be three stacked full-width cards, and between them they ran
 * ~326dp before the cover banner began: 41% of the visible content area on a
 * 6.7-inch screen and the whole of it on a 4.7-inch one, where the athlete
 * scrolled to reach their own face. Stacking also implied a ranking none of
 * them has over the others; they are parallel invitations into three different
 * screens, not a sequence.
 *
 * Laid inline they read as what they are: a set. One card at a time holds the
 * eye, the next one peeks so the row announces itself as scrollable, and the
 * identity block is back where a profile starts.
 *
 * FULL-BLEED, per the screen-level slider rule: negative margins the width of
 * AuroraScreen's 12dp gutter pull the scroll clip to the true screen edge, with
 * MATCHING internal padding so a resting card still aligns with the content
 * column. Same idiom as the exercise-widget rail (the golden standard).
 */

/** The gap between lead cards, and the unit the snap grid is built on. */
const GAP = space.md;

/**
 * How much of the NEXT card stays on screen at rest. Wide enough to read as a
 * card edge rather than a rendering seam — the whole job of the peek is to say
 * "there is more here" without a caption saying it.
 */
const PEEK = 28;

/** The width one lead card occupies — the content column, less the peek. */
export function useLeadCardWidth(): number {
  const { width } = useWindowDimensions();
  return Math.round(width - GUTTER * 2 - PEEK);
}

/**
 * THE LEAD CARD — one skeleton, worn by every card in the rail.
 *
 * Stacked, the three cards could disagree quietly. Side by side they cannot,
 * and the first pass at this rail proved it: the two model cards were near-
 * copies of each other that had already drifted (one tracked its 18dp figure
 * with `tracking.display`, the other with `trackFigure` — same size, two rules),
 * and the profile nudge was a third shape entirely: its title a rung larger at
 * fs.subtitle, its body in the SYSTEM font because it never named a family, no
 * kicker, its own hand-drawn card chrome instead of APressCard, no accessible
 * name, and a 44dp icon tile that pushed its text column 56dp right of the
 * other two — so the three kickers, titles and left edges all landed in
 * different places in a row whose whole job is to read as one set.
 *
 * That is the drift the project's own rule names ("use the shared components,
 * never a local copy — the drift is the whole problem"), so there is now one
 * component and the differences that remain are the ones that mean something:
 *
 *   THE FIGURE IS OPTIONAL. Two of these cards carry a number; the third
 *     carries a sentence, because it is an invitation rather than a reading and
 *     inventing a figure for it would be fabricating a measurement.
 *
 *   THE ACCENT IS OPTIONAL. One card asks the athlete to DO something and wears
 *     the lime rim and wash for it. That is the whole of its distinction now —
 *     the icon tile went, since a tile in front of one card's title and not the
 *     other two's is exactly the marker-before-a-label the app retired
 *     everywhere else.
 */
export function LeadCard({
  kicker,
  title,
  figure,
  unit,
  delta,
  deltaInk,
  body,
  meta,
  accent,
  onPress,
  a11yLabel,
  inline,
}: {
  /** The mono uppercase eyebrow. Every lead card opens with one. */
  kicker: string;
  title?: string | null;
  /** The card's one figure, already formatted. Omit on a card carrying prose. */
  figure?: string | null;
  unit?: string | null;
  delta?: string | null;
  deltaInk?: string;
  /** A sentence where a figure would go — the invitation cards' line. */
  body?: string | null;
  /** The mono provenance line under the figure. */
  meta?: string | null;
  /** The lime rim + wash: this card asks for an action rather than reporting. */
  accent?: boolean;
  onPress: () => void;
  a11yLabel: string;
  /** Inside the rail, which owns the width, the gap and the bottom margin. */
  inline?: boolean;
}) {
  const { palette: C } = useTheme();
  return (
    <APressCard
      solid
      onPress={onPress}
      a11yLabel={a11yLabel}
      style={[
        inline ? { flex: 1 } : { marginBottom: space.lg },
        accent ? { borderColor: C.lime, backgroundColor: withAlpha(C.lime, ALPHA.wash) } : null,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps"), textTransform: "uppercase", color: C.ash }}>
            {kicker}
          </Text>
          {/* THE CLAIM'S OWN SHAPE, KEPT: subject on one line, figure on the
              next. A first cut joined them — `${title} ${figure}` — which reads
              fine on a ceiling ("Quads 20") and is gibberish on the two claims
              whose subject is a question: "What took the most off you 83". The
              figure also lost its unit that way, so 83 could have been sets. */}
          {title ? (
            <Text numberOfLines={2} style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, marginTop: space.xxs }}>
              {title}
            </Text>
          ) : null}
          {figure ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2, flexWrap: "wrap" }}>
              {/* Tracked and line-boxed by the SIZE, like every other figure in
                  the app — `trackFigure` and a tight leading. The lead figures
                  had neither: one took the house TITLE tightening (a flat -0.5,
                  which is what `tracking(fs.title)` is for) and both sat in a
                  1.5 reading line box, so the app's smallest hero figure was
                  the one place its figure rules did not reach. */}
              <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: trackFigure(fs.title), lineHeight: leading(fs.title, "flush"), color: C.chalk, ...TABULAR }}>
                {figure}
              </Text>
              {unit ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{unit}</Text> : null}
              {delta ? (
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: deltaInk ?? C.ash, ...TABULAR }}>{delta}</Text>
              ) : null}
            </View>
          ) : null}
          {body ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: space.xxs }}>
              {body}
            </Text>
          ) : null}
          {meta ? (
            <Text style={{ marginTop: space.xxs, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash }}>
              {meta}
            </Text>
          ) : null}
        </View>
        <ArrowGlyph size={16} color={txt(C, C.lime)} />
      </View>
    </APressCard>
  );
}

/**
 * Lays its children out as a snapping horizontal rail. Each child is wrapped at
 * the card width; the row stretches on the cross axis, so every card is as tall
 * as the tallest one and the rail has a single baseline top and bottom.
 */
export function LeadRail({ children }: { children: ReactNode }) {
  const w = useLeadCardWidth();
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  if (items.length === 0) return null;
  // ONE card left standing → no rail. A snap grid with a single stop is a
  // scroll view that cannot scroll, and the peek would be an empty promise.
  if (items.length === 1) return <View style={{ marginBottom: space.lg }}>{items[0]}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={w + GAP}
      snapToAlignment="start"
      style={{ marginHorizontal: -GUTTER, marginBottom: space.lg }}
      contentContainerStyle={{ gap: GAP, paddingHorizontal: GUTTER, alignItems: "stretch" }}
    >
      {items.map((child, i) => (
        <View key={i} style={{ width: w }}>{child}</View>
      ))}
    </ScrollView>
  );
}
