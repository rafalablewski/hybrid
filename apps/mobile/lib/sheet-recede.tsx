import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { Animated, Easing } from "react-native";
import { motion, springs, springDurationMs, durations } from "@hybrid/core";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * SHEET PRESENTATION — the presenting screen recedes while a sheet is up.
 *
 * A sheet renders inside a native Modal (its own window on iOS), so it cannot
 * reach the shell it is covering. Like NavScrollProvider — RN has no global
 * scroll event, so screens publish to a shared value — sheets publish "I am
 * open" here and the root shell subscribes. Mounted once, at the root.
 *
 * The recede is what lets the scrim drop from motion.scrimFlat (0.6) to
 * motion.scrimWithRecede (0.28): with the screen behind visibly pushed back,
 * heavy dimming is no longer what separates the two planes, and a lighter scrim
 * keeps the context readable.
 *
 * Reference-counted, so a sheet opened from inside another sheet doesn't
 * un-recede the shell when only the inner one closes.
 *
 * Driven on the JS driver deliberately: borderRadius is not native-drivable, and
 * mixing drivers across one Animated.Value throws. This is a one-shot ~378ms
 * animation, so the JS-thread cost is the same negligible trade the screen
 * entrance already makes (see lib/ui.tsx useEntrance).
 */
type SheetRecede = {
  /** 0 = at rest, 1 = fully receded. */
  progress: Animated.Value;
  open: () => void;
  close: () => void;
};

const Ctx = createContext<SheetRecede | null>(null);

export function SheetRecedeProvider({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  const count = useRef(0);
  const reduced = useReducedMotion();

  const run = useCallback(
    (to: number) => {
      Animated.timing(progress, {
        toValue: to,
        // Reduce Motion SUBSTITUTES a short dissolve; useRecedeStyle drops the
        // scale so only the dim crossfades. It is never removed outright.
        duration: reduced ? durations.reduced : springDurationMs(springs.sheet),
        easing: reduced ? Easing.linear : Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [progress, reduced],
  );

  const value = useMemo<SheetRecede>(
    () => ({
      progress,
      open: () => {
        count.current += 1;
        if (count.current === 1) run(1);
      },
      close: () => {
        count.current = Math.max(0, count.current - 1);
        if (count.current === 0) run(0);
      },
    }),
    [progress, run],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Publish open/close from a sheet. Safe (no-op) outside the provider. */
export function useSheetRecede(): Pick<SheetRecede, "open" | "close"> {
  const ctx = useContext(Ctx);
  const noop = useMemo(() => ({ open: () => {}, close: () => {} }), []);
  return ctx ?? noop;
}

/**
 * The animated style for the shell that recedes. Spread onto the Animated.View
 * wrapping the navigator; it needs `overflow: "hidden"` for the corner radius to
 * clip, and something dark behind it for those corners to read against.
 */
export function useRecedeStyle() {
  const ctx = useContext(Ctx);
  const reduced = useReducedMotion();
  return useMemo(() => {
    if (!ctx) return null;
    const { progress } = ctx;
    // Under Reduce Motion the positional part is dropped — the dim overlay
    // (useRecedeDim) still crossfades, so the state change stays perceptible.
    if (reduced) return { borderRadius: 0 } as const;
    return {
      borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [0, motion.recedeRadius] }),
      transform: [
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, motion.recedeScale] }) },
      ],
    };
  }, [ctx, reduced]);
}

/**
 * Opacity for the dim overlay inside the receding host. RN's `filter` support is
 * uneven across platforms, so the brightness drop is drawn as a black wash
 * rather than a filter — same result, no platform gamble.
 */
export function useRecedeDim(): Animated.AnimatedInterpolation<number> | null {
  const ctx = useContext(Ctx);
  return useMemo(
    () =>
      ctx
        ? ctx.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1 - motion.recedeBrightness],
          })
        : null,
    [ctx],
  );
}
