import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Easing, View, Text, type TextStyle } from "react-native";
import { springs, springDurationMs, durations } from "@hybrid/core";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * SHARED ELEMENTS (mobile) — the thing you tapped travels into the screen it
 * opens, instead of the destination re-rendering it from scratch.
 *
 * WHY HAND-ROLLED. The web gets this free from the View Transitions API, which
 * has no React Native equivalent. Reanimated ships shared transitions, but
 * adopting them here would put the app's navigation on a dependency whose peer
 * graph is currently inconsistent (expo-modules-core wants react-native-worklets
 * ^0.7.4||^0.8.0, reanimated 4.4 requires 0.9.x). This is a FLIP on plain
 * `Animated` instead: measure both ends, fly a clone between them, reveal the
 * real one on arrival. No new dependency, and nothing to resolve first.
 *
 * HOW IT WORKS. The source measures itself on press and parks its rect + text
 * style here. The destination measures itself on mount; if a matching source is
 * waiting, an overlay clone flies from one rect to the other while the real
 * destination text stays hidden, then swaps at the end. Every step is optional —
 * a missed measurement, a stale arm, or Reduce Motion just means no flight and
 * the ordinary screen transition carries the change. It can degrade, it can't
 * break navigation.
 *
 * The clone is positioned by its CENTRE and scaled by the font-size ratio.
 * RN scales around the centre and has no `transform-origin`, so centre-to-centre
 * removes the origin correction entirely — and it renders at the DESTINATION
 * size scaled down, so the text is crisp where the eye ends up rather than
 * where it started.
 */

/** How long an armed source stays valid. If the destination never mounts (a
 *  cancelled nav, a slow screen), the arm expires rather than firing late into
 *  an unrelated screen. */
const ARM_TTL_MS = 1200;

type Rect = { x: number; y: number; width: number; height: number };

type Armed = {
  name: string;
  rect: Rect;
  text: string;
  style: TextStyle;
  at: number;
};

type Flight = Armed & { to: Rect; toStyle: TextStyle };

type Ctx = {
  arm: (a: Omit<Armed, "at">) => void;
  claim: (name: string, to: Rect, toStyle: TextStyle) => boolean;
  /** Names currently mid-flight — the destination hides its own text for these. */
  flying: string | null;
};

const SharedCtx = createContext<Ctx | null>(null);

export function SharedElementProvider({ children }: { children: ReactNode }) {
  const armedRef = useRef<Armed | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const arm = useCallback((a: Omit<Armed, "at">) => {
    armedRef.current = { ...a, at: Date.now() };
  }, []);

  const claim = useCallback(
    (name: string, to: Rect, toStyle: TextStyle) => {
      const a = armedRef.current;
      armedRef.current = null;
      if (!a || a.name !== name) return false;
      if (Date.now() - a.at > ARM_TTL_MS) return false;
      // Reduce Motion: no flight. The screen transition already substitutes a
      // cross-dissolve, which is the perceptible signal; a figure sliding across
      // the screen is exactly the motion the setting asks us not to draw.
      if (reduced) return false;
      if (!to.height || !a.rect.height) return false;

      setFlight({ ...a, to, toStyle });
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: springDurationMs(springs.zoom),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setFlight(null);
      });
      return true;
    },
    [progress, reduced],
  );

  const value = useMemo<Ctx>(
    () => ({ arm, claim, flying: flight?.name ?? null }),
    [arm, claim, flight],
  );

  return (
    <SharedCtx.Provider value={value}>
      {children}
      {flight ? <FlyingClone flight={flight} progress={progress} /> : null}
    </SharedCtx.Provider>
  );
}

function FlyingClone({ flight, progress }: { flight: Flight; progress: Animated.Value }) {
  const { rect, to, text, toStyle } = flight;
  const fromSize = Number(flight.style.fontSize ?? 16);
  const toSize = Number(toStyle.fontSize ?? 16);
  const startScale = toSize > 0 ? fromSize / toSize : 1;

  // Centre-to-centre: RN scales about the centre and has no transform-origin,
  // so measuring centres removes the origin correction entirely.
  const fromCx = rect.x + rect.width / 2;
  const fromCy = rect.y + rect.height / 2;
  const toCx = to.x + to.width / 2;
  const toCy = to.y + to.height / 2;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [fromCx - toCx, 0] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [fromCy - toCy, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [startScale, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: to.x,
        top: to.y,
        width: to.width,
        height: to.height,
        justifyContent: "center",
        transform: [{ translateX }, { translateY }, { scale }],
        zIndex: 9999,
      }}
    >
      <Text numberOfLines={1} style={toStyle}>{text}</Text>
    </Animated.View>
  );
}

/** Arm a source before navigating. No-op outside the provider. */
export function useSharedElementSource() {
  const ctx = useContext(SharedCtx);
  return useCallback(
    (name: string, node: View | Text | null, text: string, style: TextStyle) => {
      if (!ctx || !node) return;
      // measureInWindow gives window coordinates, which is the same space the
      // provider's absolutely-positioned overlay lives in.
      (node as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void })
        .measureInWindow?.((x, y, width, height) => {
          if (!width || !height) return;
          ctx.arm({ name, rect: { x, y, width, height }, text, style });
        });
    },
    [ctx],
  );
}

/**
 * Destination side. Attach `ref` to the element and spread `style` — while a
 * clone is flying to this spot the real text is hidden, then revealed on
 * arrival. Returns `hidden: false` in every degraded case, so a missing
 * provider or a failed measurement simply shows the text immediately.
 */
export function useSharedElementTarget(name: string, text: string, style: TextStyle) {
  const ctx = useContext(SharedCtx);
  const ref = useRef<Text | null>(null);
  const [hidden, setHidden] = useState(false);
  const claimed = useRef(false);

  useEffect(() => {
    if (!ctx || claimed.current) return;
    claimed.current = true;
    const node = ref.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (!node?.measureInWindow) return;
    // A frame's grace so the destination has laid out before we measure it.
    const id = requestAnimationFrame(() => {
      node.measureInWindow!((x, y, width, height) => {
        if (!width || !height) return;
        if (ctx.claim(name, { x, y, width, height }, style)) {
          setHidden(true);
          // Reveal as the clone lands. Timed off the same spring, so the swap
          // happens under the arriving text rather than before it.
          setTimeout(() => setHidden(false), springDurationMs(springs.zoom) - durations.fast);
        }
      });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, name]);

  return { ref, hidden };
}
