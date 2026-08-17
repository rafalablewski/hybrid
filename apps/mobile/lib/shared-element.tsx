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
import { springs, springDurationMs, durations, SHARED_ELEMENTS } from "@hybrid/core";
import { useReducedMotion } from "./use-reduced-motion";
import { FIXED_FONT_SCALE } from "./ui";

/**
 * SHARED ELEMENTS (mobile) — the thing you tapped travels into the screen it
 * opens, instead of the destination re-rendering it from scratch.
 *
 * WHY HAND-ROLLED. The web got this free from the View Transitions API, which
 * has no React Native equivalent. Reanimated ships shared transitions, but
 * adopting them here would put the app's navigation on a dependency whose peer
 * graph was inconsistent with the SDK's (expo-modules-core wanted
 * react-native-worklets ^0.7.4||^0.8.0, reanimated 4.4 required 0.9.x). This is
 * a FLIP on plain `Animated` instead: measure both ends, fly a clone between
 * them, reveal the real one on arrival. No new dependency, nothing to resolve.
 *
 * The decision held everywhere and the dependency was declared anyway — the app
 * carried react-native-reanimated (and worklets, its runtime) in package.json
 * while importing neither, so a native framework shipped inside the .app for no
 * caller, carrying exactly the version-drift risk this file declined. Both are
 * removed; if a future change genuinely wants reanimated, it arrives through
 * `npx expo install` with the whole native set, not on its own.
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
  at: number;
  /** TEXT flight: a string re-drawn at the destination's type style. */
  text?: string;
  style?: TextStyle;
  /** NODE flight: a rendered surface — the goal/plan cover, which is the same
   *  recipe at two sizes and so cannot be described by a string. Rendered at the
   *  DESTINATION's size and scaled down to the source's, exactly as the text
   *  flight is, so it is crisp where the eye ends up. */
  node?: ReactNode;
};

type Flight = Armed & { to: Rect; toStyle?: TextStyle };

type Ctx = {
  arm: (a: Omit<Armed, "at">) => void;
  claim: (name: string, to: Rect, toStyle?: TextStyle) => boolean;
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
    (name: string, to: Rect, toStyle?: TextStyle) => {
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

// Centre-to-centre everywhere: RN scales about the centre and has no
// transform-origin, so measuring centres removes the origin correction.
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

function FlyingClone({ flight, progress }: { flight: Flight; progress: Animated.Value }) {
  if (flight.node) return <FlyingSurface flight={flight} progress={progress} />;
  return <FlyingText flight={flight} progress={progress} />;
}

/**
 * A STRING in flight. Rendered at the DESTINATION's size and scaled DOWN to the
 * source's, so the type is crisp where the eye ends up rather than where it
 * started, and the destination hides its own copy until this lands.
 */
function FlyingText({ flight, progress }: { flight: Flight; progress: Animated.Value }) {
  const { rect, to, text, toStyle } = flight;
  const fromSize = Number(flight.style?.fontSize ?? 16);
  const toSize = Number(toStyle?.fontSize ?? 16);
  const startScale = toSize > 0 ? fromSize / toSize : 1;
  const from = centre(rect);
  const dest = centre(to);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [from.x - dest.x, 0] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [from.y - dest.y, 0] });
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
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={toStyle}>{text}</Text>
    </Animated.View>
  );
}

/**
 * A SURFACE in flight — a cover tile growing into the same cover at screen
 * scale.
 *
 * The opposite convention to the text flight, and deliberately: it renders the
 * SOURCE's own drawing at the SOURCE's size and scales it UP. Rendering a tile's
 * layout at poster size would keep its 96pt glyph and its 16pt title at those
 * sizes inside a box twice as big — the composition would be wrong for the
 * whole flight. Scaling the tile grows every part of it together, which is what
 * "the same object, seen closer" actually looks like. Crispness, the reason the
 * text flight goes the other way, matters far less to a gradient and a glyph,
 * and the real cover is underneath the whole time.
 *
 * So the destination is NOT hidden here. The clone flies OVER it and dissolves
 * on arrival onto the poster it has become, which also means a dropped frame or
 * a mismeasurement leaves the real cover on screen rather than a hole.
 */
function FlyingSurface({ flight, progress }: { flight: Flight; progress: Animated.Value }) {
  const { rect, to, node } = flight;
  const from = centre(rect);
  const dest = centre(to);
  const endScale = rect.width > 0 ? to.width / rect.width : 1;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dest.x - from.x] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dest.y - from.y] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, endScale] });
  // Held opaque until the last stretch, then handed to the real cover.
  const opacity = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
        zIndex: 9999,
      }}
    >
      {node}
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
 * Arm a SURFACE source — a cover tile that opens into the same cover at screen
 * scale. The caller passes what the DESTINATION looks like (`render`), not what
 * the source looks like, for the same reason the text flight re-draws at the
 * destination's type style: the clone should be crisp where the eye ends up.
 * That is only sound because the two ends are the same recipe from core, which
 * is the whole reason this pair was chosen.
 */
export function useSharedSurfaceSource() {
  const ctx = useContext(SharedCtx);
  return useCallback(
    (name: string, node: View | null, render: ReactNode) => {
      if (!ctx || !node) return;
      (node as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void })
        .measureInWindow?.((x, y, width, height) => {
          if (!width || !height) return;
          ctx.arm({ name, rect: { x, y, width, height }, node: render });
        });
    },
    [ctx],
  );
}

/* ── The person registry ─────────────────────────────────────────────────
 * Every Avatar drawn as a potential SOURCE puts its node and its face here
 * under the person's handle, so a door only has to say WHO it is opening.
 *
 * A registry rather than a ref per row for the same reason the web twin uses an
 * attribute: half the doors to a person's page are callbacks fired from deep
 * inside a post card (`onOpenProfile={(h) => …}`) with nothing to thread a ref
 * through, and the ones that could thread one would each need a component
 * extracted to hold it.
 *
 * Registered on mount and REMOVED on unmount, so a scrolled-away row cannot arm
 * a stale node. Two avatars for the same person on one screen is possible (a
 * feed with two of their posts) and the last mounted wins — they are the same
 * face, so the flight is right either way; only its start position differs.
 */
const people = new Map<string, { node: View | null; face: ReactNode }>();

/** Register this avatar as the arm-able source for `handle`. */
export function registerPerson(handle: string, node: View | null, face: ReactNode): () => void {
  people.set(handle, { node, face });
  return () => { if (people.get(handle)?.node === node) people.delete(handle); };
}

/**
 * Arm the avatar of a named person as the source of the next navigation.
 * Measured HERE rather than at registration: the list has almost certainly
 * scrolled since the row mounted, and a flight that starts where the face used
 * to be is worse than no flight.
 */
export function usePersonSource() {
  const ctx = useContext(SharedCtx);
  return useCallback((handle: string | null | undefined) => {
    if (!ctx || !handle) return;
    const entry = people.get(handle);
    const node = entry?.node as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (!node?.measureInWindow) return;
    node.measureInWindow((x, y, width, height) => {
      if (!width || !height) return;
      ctx.arm({ name: SHARED_ELEMENTS.personAvatar, rect: { x, y, width, height }, node: entry!.face });
    });
  }, [ctx]);
}

/**
 * Destination side for a SURFACE. Attach `ref` to the box the tile grows into
 * and nothing else: the clone flies OVER the real cover and dissolves onto it,
 * so unlike the text target there is no hiding to undo, and every failure case
 * — no provider, a failed measurement, a stale arm — simply leaves the cover
 * on screen where it already was.
 */
export function useSharedSurfaceTarget(name: string) {
  const ctx = useContext(SharedCtx);
  const ref = useRef<View | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    if (!ctx || claimed.current) return;
    claimed.current = true;
    const node = ref.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (!node?.measureInWindow) return;
    const id = requestAnimationFrame(() => {
      node.measureInWindow!((x, y, width, height) => {
        if (!width || !height) return;
        // No `setHidden` here, unlike the text target: the surface clone flies
        // OVER the real cover and dissolves onto it, so hiding the destination
        // would leave a hole for the whole flight — and a dropped claim leaves
        // the real cover exactly where it already was.
        ctx.claim(name, { x, y, width, height });
      });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, name]);

  return { ref };
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
