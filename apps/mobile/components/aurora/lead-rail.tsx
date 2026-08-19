import type { ReactNode } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { space } from "../../lib/ui";
import { GUTTER } from "./kit";

/**
 * THE LEAD RAIL — the three cards the You tab opens with, side by side.
 *
 * They used to be three stacked full-width cards, and between them they ate the
 * whole first screen: the model's headline, the questionnaire's progress and
 * the "complete your profile" nudge pushed the cover, the avatar and the name —
 * the thing the tab is NAMED for — below the fold on every phone. Stacking them
 * also implied a ranking none of them has over the others; they are three
 * parallel invitations, not a sequence.
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
