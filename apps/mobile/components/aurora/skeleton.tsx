import { useEffect, useRef } from "react";
import { Animated, View, Easing, type ViewStyle, type DimensionValue } from "react-native";
import { useTheme } from "../../lib/theme";
import { space } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { ACard } from "./kit";

/**
 * Loading skeletons (mobile). The CORE screens used to render their zero/empty
 * state (or a bare "…") while the FIRST fetch was still in flight — so a cold
 * start flashed "nothing logged yet" / an offline-looking blank for a beat
 * before the real data popped in. Showing a shaped, shimmering skeleton instead
 * makes the app feel instant and never falsely empty. Pure RN Animated (no deps),
 * theme-aware, and stilled under Reduce Motion.
 */

/** A single shimmering block. */
export function Skeleton({ width = "100%", height = 14, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const { palette: C } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(0.7); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: C.line, opacity: pulse }, style]} />;
}

/** A card-shaped skeleton: a short label + a couple of lines. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <ACard style={{ marginBottom: 12 }}>
      <Skeleton width={90} height={10} radius={5} />
      <View style={{ marginTop: 12, gap: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? "55%" : "100%"} height={13} />
        ))}
      </View>
    </ACard>
  );
}

/** A row of stat tiles (parity with the AStat grids). */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <ACard key={i} style={{ flex: 1, minWidth: 150, padding: 18 }}>
          <Skeleton width={64} height={9} radius={5} />
          <Skeleton width={80} height={26} radius={8} style={{ marginTop: 10 }} />
        </ACard>
      ))}
    </View>
  );
}

/** A list of row-shaped skeletons. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
    </View>
  );
}
