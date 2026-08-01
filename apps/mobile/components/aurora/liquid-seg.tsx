import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../lib/theme";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "./swiftui";
import { withAlpha } from "./kit";

/**
 * LIQUID SEGMENTED CONTROL — the iOS 26 two-state selection, shared by the
 * Today hub switcher and the This-week date filter (twin of
 * apps/web/components/aurora/liquid-seg.tsx).
 *
 * The system control's behaviour, reconstructed for RN screens:
 *  - AT REST the selection is a quiet, near-solid NEUTRAL pill inside the
 *    track — no permanent glassiness, no accent fill.
 *  - ON TOUCH (press the selected segment, or start dragging) the pill
 *    inflates past the track's edges and crossfades to a clear glass lens
 *    with a hairline rim. Drag scrubs it across the segments; release
 *    commits the one under the lens and the glass condenses back to a pill.
 *  - A TAP on another segment sends the lens over glassy IN FLIGHT — it
 *    lands as the solid pill.
 *
 * Motion is SwiftUI's default spring (response 0.55 / dampingFraction 0.75 →
 * stiffness ≈ 130, damping ≈ 17), so the travel reads native, not eased.
 *
 * THE LENS MATERIAL: on iOS the inflated lens is REAL SwiftUI `glassEffect`
 * via GlassSurface — the system's material, not a blur imitation — always on,
 * no user toggle. On Android a translucent RN lens keeps the identical
 * interaction. Honours Reduce Motion: springs collapse to instant moves, no
 * inflation.
 *
 * Segments are equal-width. An item may `intercept` selection (the date
 * filter's Month segment opens its picker sheet instead of taking the pill).
 */

export type LiquidSegItem = {
  key: string;
  /** The segment's accessible name. */
  label: string;
  /** Draw the segment's content; `on` = selected, or under the lens mid-drag. */
  render: (on: boolean) => ReactNode;
  /** Replace selection (e.g. open a sheet). The pill springs back home. */
  intercept?: () => void;
};

// How far the lens grows past the track under touch, matching the reference:
// beyond the top/bottom edges, and a little wider than its segment.
const GROW_Y = 7;
const GROW_X = 16;

export function LiquidSeg({
  items,
  index,
  onSelect,
  segHeight = 36,
  pad = 4,
  trackStyle,
}: {
  items: LiquidSegItem[];
  index: number;
  onSelect: (i: number) => void;
  segHeight?: number;
  pad?: number;
  trackStyle?: ViewStyle;
}) {
  const { palette: C, scheme } = useTheme();
  const nativeGlass = LIQUID_GLASS_SUPPORTED;
  const reduced = useReducedMotion();

  const [trackW, setTrackW] = useState(0);
  const thumbW = trackW > 0 ? (trackW - 2 * pad) / items.length : 0;
  /** The segment the lens is over mid-drag; null when idle (selection rules). */
  const [under, setUnder] = useState<number | null>(null);

  const x = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;

  // Mutable mirrors for the PanResponder (created once, reads fresh values).
  const geo = useRef({ trackX: 0, trackW: 0, thumbW: 0, index: 0, dragX: 0 });
  geo.current.trackW = trackW;
  geo.current.thumbW = thumbW;
  geo.current.index = index;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const dragging = useRef(false);
  const trackRef = useRef<View>(null);

  const springX = (to: number, thenSettleLens: boolean) => {
    Animated.spring(x, { toValue: to, useNativeDriver: true, stiffness: 130, damping: 17, mass: 1 }).start(
      ({ finished }) => {
        // The in-flight glass condenses back into the pill as it lands.
        if (finished && thenSettleLens && !dragging.current) {
          Animated.timing(lift, { toValue: 0, duration: 220, useNativeDriver: true }).start();
        }
      },
    );
  };

  // Place (first layout) or spring (selection change) the pill into its slot.
  const placed = useRef(false);
  useEffect(() => {
    if (thumbW <= 0) return;
    const to = index * thumbW;
    if (!placed.current || reduced) {
      placed.current = true;
      x.setValue(to);
      lift.setValue(0);
      return;
    }
    springX(to, true);
  }, [index, thumbW, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const liftTo = (v: number, ms = 160) => {
    if (reducedRef.current) return;
    Animated.timing(lift, { toValue: v, duration: ms, useNativeDriver: true }).start();
  };

  const commit = (i: number) => {
    const it = itemsRef.current[i];
    if (!it) return;
    if (i !== geo.current.index) {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    }
    if (it.intercept) {
      // The pill never lands here — spring home while the intercept opens.
      springX(geo.current.index * geo.current.thumbW, true);
      it.intercept();
      return;
    }
    if (i === geo.current.index) {
      springX(i * geo.current.thumbW, true);
      return;
    }
    onSelectRef.current(i);
  };

  // Drag-to-scrub. The responder only wakes on a clear horizontal move, so
  // vertical scrolling through the screen still wins.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderGrant: () => {
          dragging.current = true;
          trackRef.current?.measureInWindow((px) => {
            geo.current.trackX = px;
          });
          liftTo(1, 140);
        },
        onPanResponderMove: (_e, g) => {
          const { trackX, trackW: tw, thumbW: w } = geo.current;
          if (w <= 0) return;
          const local = g.moveX - trackX - pad;
          const to = Math.min(Math.max(local - w / 2, 0), tw - 2 * pad - w);
          geo.current.dragX = to;
          if (!reducedRef.current) x.setValue(to);
          const i = Math.min(itemsRef.current.length - 1, Math.max(0, Math.floor((local + 0.0001) / w)));
          setUnder((cur) => (cur === i ? cur : i));
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          const { thumbW: w, dragX } = geo.current;
          const i = w > 0 ? Math.min(itemsRef.current.length - 1, Math.max(0, Math.round(dragX / w))) : geo.current.index;
          setUnder(null);
          liftTo(0, 200);
          commit(i);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          setUnder(null);
          liftTo(0, 200);
          springX(geo.current.index * geo.current.thumbW, true);
        },
      }),
    [pad], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Inflation: past the track's edges vertically, a little wider than the slot.
  const inflateX = thumbW > 0 ? (thumbW + GROW_X) / thumbW : 1;
  const inflateY = (segHeight + 2 * GROW_Y) / segHeight;

  // The rest pill is deliberately NEUTRAL — the reference look — not the brand
  // chartreuse: a near-solid step of the text colour over the track.
  const restFill = withAlpha(C.chalk, scheme === "light" ? 0.14 : 0.24);
  const simFill = scheme === "light" ? "rgba(255,255,255,0.45)" : withAlpha(C.chalk, 0.1);
  const simRim = scheme === "light" ? "rgba(255,255,255,0.85)" : withAlpha(C.chalk, 0.4);

  return (
    <View
      ref={trackRef}
      accessibilityRole="tablist"
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
      style={[{ flexDirection: "row", position: "relative", padding: pad, borderRadius: 999 }, trackStyle]}
    >
      {thumbW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: pad,
            top: pad,
            height: segHeight,
            width: thumbW,
            borderRadius: 999,
            transform: [
              { translateX: x },
              { scaleX: lift.interpolate({ inputRange: [0, 1], outputRange: [1, inflateX] }) },
              { scaleY: lift.interpolate({ inputRange: [0, 1], outputRange: [1, inflateY] }) },
            ],
            shadowColor: "#000",
            shadowOpacity: scheme === "light" ? 0.16 : 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          {/* rest state: the quiet neutral pill */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 999, backgroundColor: restFill, opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
            ]}
          />
          {/* touched state: the clear glass lens */}
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 999, opacity: lift }]}>
            {nativeGlass ? (
              <GlassSurface radius={Math.round(segHeight / 2)} />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: 999, backgroundColor: simFill, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: simRim },
                ]}
              />
            )}
          </Animated.View>
        </Animated.View>
      )}
      {items.map((it, i) => {
        const on = under === null ? i === index : under === i;
        return (
          <Pressable
            key={it.key}
            onPress={() => commit(i)}
            onPressIn={() => {
              if (i === index) liftTo(1, 140);
            }}
            onPressOut={() => {
              if (!dragging.current) liftTo(0, 200);
            }}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: i === index }}
            style={{ flex: 1, height: segHeight, borderRadius: 999, alignItems: "center", justifyContent: "center" }}
          >
            {it.render(on)}
          </Pressable>
        );
      })}
    </View>
  );
}
