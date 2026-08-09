import { type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { HUB_MASTHEAD, HUB_MASTHEAD_HEIGHT, hubTitleType, type HubMetaTone } from "@hybrid/core";
import { useNavScroll } from "../../lib/nav-scroll";
import { useTheme, txt } from "../../lib/theme";
import { F, serifIf, FIXED_FONT_SCALE, MAX_FONT_SCALE } from "../../lib/ui";

/**
 * THE HUB MASTHEAD — mobile.
 *
 * The head of every Today-hub tab, and the ONLY way one may be drawn. The
 * numbers (type, gaps, the collapse) live in packages/core/src/hub-masthead.ts
 * and are shared verbatim with the web twin (apps/web/components/aurora/
 * hub-masthead.tsx), so the two clients cannot drift the way they had.
 *
 * A tab passes DATA and cannot pass style. That is deliberate: the three heads
 * diverged precisely because each screen could reach for its own `fontSize` and
 * its own `marginTop`, and a component that accepts a style prop is a
 * convention, not a contract.
 *
 * THE SPACING IS THE COMPONENT'S, not the screen's. It emits its own margin
 * above (below the segmented control) and below (to the first content row), so
 * the pills-to-head and head-to-content distances are the same on all three
 * tabs no matter which screen renders it — which is what 16 / 0 / 12 was not.
 */
export function HubMasthead({
  /** Left of the meta row: where you are in time, or in the plan. Optional —
   *  the row keeps its height either way. */
  eyebrow,
  /** Right of the meta row: ONE state value, never a second sentence. */
  meta,
  metaTone = "plain",
  title,
  /** Rendered inline after the title (the Kyoto Hour hanko). Decorative only —
   *  anything with meaning belongs in a slot of its own. */
  mark,
}: {
  eyebrow?: string | null;
  meta?: string | null;
  metaTone?: HubMetaTone;
  title: string;
  mark?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const type = hubTitleType(title);

  // THE COLLAPSE, for all three tabs. Every hub view already publishes its
  // offset to this signal to collapse the floating nav (the dashboard's own
  // ScrollView, AuroraScreen for Performance, the FlatList for Feed), so
  // subscribing here gives the other two the compression Dashboard alone had,
  // with no second listener and no chance of three different rates. Null
  // outside a provider, in which case the head simply doesn't move.
  const collapse = useNavScroll()?.collapse;
  const titleScale = collapse
    ? collapse.interpolate({ inputRange: [0, 1], outputRange: [1, HUB_MASTHEAD.collapse.titleScale] })
    : 1;
  const metaFade = collapse ? collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1;

  const metaColor = metaTone === "accent" ? txt(C, C.amber) : metaTone === "fresh" ? txt(C, C.lime) : C.ash;
  const metaType = {
    fontFamily: F.mono,
    fontSize: HUB_MASTHEAD.meta.size,
    letterSpacing: HUB_MASTHEAD.meta.tracking,
    textTransform: "uppercase" as const,
    lineHeight: HUB_MASTHEAD.meta.height,
  };

  return (
    <View style={{ marginTop: HUB_MASTHEAD.gap.control, marginBottom: HUB_MASTHEAD.gap.below, minHeight: HUB_MASTHEAD_HEIGHT }}>
      {/* THE META ROW — always rendered, always this tall. An athlete with no
          season, no phase and nobody training keeps the row and therefore keeps
          the title's y; that is the job the space character used to do. */}
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          height: HUB_MASTHEAD.meta.height,
          opacity: metaFade,
        }}
      >
        {/* The LEFT slot truncates and the right one never does: a clipped
            season is readable, a clipped phase is not. */}
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={[metaType, { flexShrink: 1, color: C.ash }]}>
          {eyebrow ?? ""}
        </Text>
        {meta ? (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={[metaType, { color: metaColor }]}>
            {meta}
          </Text>
        ) : null}
      </Animated.View>

      {/* THE TITLE. transformOrigin has no RN equivalent, so the row is
          left-aligned and scaled about its own left edge via alignSelf — the
          title shrinks toward the margin rather than toward the centre. */}
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: HUB_MASTHEAD.gap.meta,
          alignSelf: "flex-start",
          transform: [{ scale: titleScale }],
        }}
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          numberOfLines={type.maxLines}
          style={{
            fontFamily: serifIf(scheme, F.black),
            fontSize: type.size,
            lineHeight: type.lineHeight,
            letterSpacing: type.tracking,
            color: C.chalk,
          }}
        >
          {title}
        </Text>
        {mark}
      </Animated.View>
    </View>
  );
}

export default HubMasthead;
