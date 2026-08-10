import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, fs, space, lh, leading, tracking, springs, springDurationMs, springToRN, durations, skeleton } from "@hybrid/core";
import { useTheme, txt } from "./theme";
import { useNavScrollProps } from "./nav-scroll";

// Re-export the shared scale (same source the web client uses) so screens can
//   import { fs, space } from "../../lib/ui"  →  fontSize: fs.body, gap: space.lg
// `leading` and `tracking` are the two axes that had no token until the design
// audit: every lineHeight in the app was an absolute dp (29 of them) and every
// letterSpacing a fresh guess (18 of them). Use leading(fs.body) rather than a
// number — an absolute line box is also why Dynamic Type could not work.
export { fs, space, lh, leading, tracking };
import { useTemplate } from "./template";
import { auroraScrollClearance } from "./layout";
import { useReducedMotion } from "./use-reduced-motion";

// ── Dynamic Type caps ────────────────────────────────────────────────────────
// RN already scales every <Text> with the OS "Larger Text" / Dynamic Type
// setting (allowFontScaling defaults true — we never disable it). What we add
// here is a CEILING so that surface still works at the largest accessibility
// sizes: reflowable body text keeps growing, but FIXED-HEIGHT chrome (the
// floating nav pill, count badges, dense table rows) is capped so it can't
// clip/overflow. Pass `maxFontSizeMultiplier={FIXED_FONT_SCALE}` on text inside
// a container with a hard height; leave it off (or use MAX_FONT_SCALE) anywhere
// the layout can grow to fit. See capabilities.ts → `dynamic-type`.
export const MAX_FONT_SCALE = 1.4; // reflow-safe surfaces — generous headroom
export const FIXED_FONT_SCALE = 1.15; // fixed-height chrome — must not clip

/**
 * The HIG minimum touch target, in dp. Stated once so every interactive
 * primitive can declare it instead of hoping its padding adds up.
 *
 * The design audit measured five selectable pills across five screens at
 * ~25–31dp tall, built from three horizontal paddings and four vertical ones,
 * and found exactly ONE `minHeight: 44` in the whole app. A control that is
 * visually smaller than this by design (a dense row's chevron, an inline ✕)
 * keeps its size and takes `hitSlop={HIT_SLOP}` instead — the target grows, the
 * drawing doesn't.
 */
export const HIT_TARGET = 44;

/** Companion to HIT_TARGET for controls that must stay visually small. 8dp on
 *  each side turns a 28dp glyph button into a 44dp target. */
export const HIT_SLOP = 8;

// Shared depth shadow — the "lifted glass" feel (iOS shadow + Android elevation).
// FOCUS GLOW — the primary Start CTA's lime halo (parity with web `.start-glow`
// in apps/web/app/globals.css). RN has no hover, so the pill carries a soft
// resting glow and blooms brighter on press — the same "alive, tappable" cue.
// iOS renders the coloured shadow; Android falls back to elevation. Pass the
// live accent (C.lime — pine under Kyoto Hour) so it tracks the theme.
export function startGlow(accent: string, pressed = false): ViewStyle {
  return {
    shadowColor: accent,
    // Centred offset → a uniform halo that grows on press, matching web's
    // `box-shadow: 0 0 34px` (no directional cast). Only radius/opacity bloom.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: pressed ? 0.55 : 0.32,
    shadowRadius: pressed ? 22 : 14,
    elevation: pressed ? 10 : 6,
  };
}

// SCREEN ENTRANCE — the subtle fade + 10px rise every screen plays on focus.
// Returns an animated style to spread onto the content wrapper; one source of
// truth so the shell (AuroraScreen) and the screens that own their own shell
// (Today/home) can't drift (home used to omit the Reduce-Motion guard).
//
// Deliberately runs on the JS animation driver (useNativeDriver: false). The
// same entrance previously used the native driver, but under the New
// Architecture (Fabric) a native-driver opacity animation started from
// useFocusEffect can lose the JS-start-vs-native-mount race and strand the view
// at its initial value (opacity 0). Because AuroraField (the ambient gradient)
// renders OUTSIDE this wrapper, a stranded value left the whole screen blank —
// just the gradient, no content — on some devices (e.g. iPhone 15) while faster
// ones won the race (facebook/react-native#12453). The JS driver commits through
// the standard renderer, so it always reaches the resting (visible) end state.
// This is a one-shot 240ms entrance, so the JS-thread cost is negligible.
//
// Honours Reduce Motion by SUBSTITUTING a cross-dissolve (durations.reduced),
// not by snapping to the end state: the rise is dropped, the fade is kept, so
// the screen change is still perceptible. Snapping removes that signal entirely.
export function useEntrance() {
  const enter = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useFocusEffect(
    useCallback(() => {
      enter.setValue(0);
      // The entrance is the tail of the stack transition, so it rides the
      // shared `sheet` SPRING — the same curve the web runs via its generated
      // CSS linear() easing (@hybrid/core motion.ts), not a timing approximation
      // at the spring's duration. Reduce Motion keeps the fade as a timing.
      const anim = reducedMotion
        ? Animated.timing(enter, { toValue: 1, duration: durations.reduced, easing: Easing.linear, useNativeDriver: false })
        : Animated.spring(enter, { toValue: 1, ...springToRN(springs.sheet), useNativeDriver: false });
      anim.start();
      return () => anim.stop();
    }, [enter, reducedMotion]),
  );
  // Memoised on the stable `enter` value: interpolate() registers a new node on
  // its parent Animated.Value every call, so recreating the style each render
  // would leak nodes. `enter` never changes, so this builds exactly once.
  // Under Reduce Motion the RISE is dropped and only the fade survives — that
  // is the cross-dissolve substitution. `reducedMotion` is in the deps because
  // the user can toggle it live; it changes at most once a session, so the
  // interpolate node it rebuilds is not a leak concern.
  return useMemo(
    () =>
      reducedMotion
        ? { opacity: enter }
        : {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
    [enter, reducedMotion],
  );
}

// THE HUB DISSOLVE — what a screen's CONTENT does when it shows as one of
// Today's hub tabs (Dashboard / Performance / Feed). The hub chrome above it
// (profile row + pills) holds perfectly still and the pills' flying lens owns
// the motion, so the content cross-dissolves underneath instead of replaying
// the whole-screen entrance — the same "shared element in flight" rule the web
// twin applies (globals.css THE TODAY HUB, data-nav-kind="hub"). Reduce Motion
// keeps the dissolve at the substitution duration — never an instant cut.
//
// Runs on the NATIVE driver, started from the wrapper's first onLayout. Two
// hard-won constraints meet here (proven on-device, frame-by-frame, in the
// first TestFlight build of the hub move):
//  (1) Mounting a hub tab is heavy enough to block the JS thread for the
//      fade's whole duration, so a JS-driver timing (useEntrance's choice)
//      reads its progress off wall-clock time on its first real tick and
//      snaps straight to the end — the dissolve never shows.
//  (2) A native-driver animation STARTED FROM useFocusEffect can lose the
//      start-vs-mount race on Fabric and strand the view invisible — the
//      blank-screen strand documented on useEntrance.
// Starting the native animation from onLayout threads the needle: the native
// view provably exists by the time onLayout fires, and the fade then runs off
// the JS thread no matter how busy mounting leaves it.
export function useHubDissolve(active: boolean) {
  const fade = useRef(new Animated.Value(active ? 0 : 1)).current;
  const reducedMotion = useReducedMotion();
  const started = useRef(false);
  const start = useCallback(() => {
    if (!active || started.current) return;
    started.current = true;
    Animated.timing(fade, {
      toValue: 1,
      duration: reducedMotion ? durations.reduced : durations.dissolve,
      // easings.fade — the app's crossfade curve (@hybrid/core motion.ts).
      easing: reducedMotion ? Easing.linear : Easing.bezier(0.2, 0.7, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [fade, reducedMotion, active]);
  const style = useMemo(() => ({ opacity: fade }), [fade]);
  return { style, start };
}

/** The wrapper form of useHubDissolve, for callers that switch the hub body in
 *  and out of the tree (home.tsx's dashboard, AuroraScreen's hub slot) —
 *  remounting replays the fade, and the wrapper's own onLayout is what starts
 *  it. `active: false` renders plainly (the first entry into Today already has
 *  the whole-screen entrance; stacking a second fade on it would double up).
 *  `onLayout` is forwarded because the wrapper is a real view: children that
 *  report layout.y now measure against IT, so a caller doing scroll geometry
 *  needs the wrapper's own offset to keep its sums honest. */
export function HubDissolve({ active, children, onLayout }: { active: boolean; children: ReactNode; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { style, start } = useHubDissolve(active);
  return (
    <Animated.View
      style={active ? style : undefined}
      onLayout={(e) => {
        onLayout?.(e);
        start();
      }}
    >
      {children}
    </Animated.View>
  );
}

// Static dark palette — kept for back-compat with screens that still reference
// C.* directly. New code should prefer useTheme() so it follows light/dark.
export const C = colors;

// Loaded in app/_layout.tsx
export const F = {
  reg: "Archivo_400Regular",
  semi: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_900Black",
  mono: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
  // Kyoto Hour (light) serif display — Shippori Mincho, a Japanese book face.
  // Used for hero headings via serifIf.
  serifMed: "ShipporiMincho_500Medium",
  serifSemi: "ShipporiMincho_600SemiBold",
  serifBold: "ShipporiMincho_700Bold",
  serifBlack: "ShipporiMincho_800ExtraBold",
} as const;

/** Heading face — the mobile twin of web's --font-heading. AURORA (dark) keeps
 *  the Archivo sans; KYOTO HOUR (light) swaps hero headings to the Shippori
 *  Mincho serif (mirroring globals.css's [data-theme="light"] --font-heading),
 *  mapping each Archivo weight to its nearest Mincho cut. */
export const serifIf = (scheme: "dark" | "light", archivo: string = F.black): string => {
  if (scheme !== "light") return archivo;
  switch (archivo) {
    case F.black: return F.serifBlack;
    case F.bold: return F.serifBold;
    case F.semi: return F.serifSemi;
    default: return F.serifMed;
  }
};

// Concentric rings fake a radial falloff — RN has no CSS blur or radial
// gradient (and we add no native gradient dep), so we stack a few low-opacity
// circles; the glass cards' BlurView softens them further as it frosts what's
// behind. Cheap (a handful of Views) and good enough for an ambient backdrop.
const FIELD_RINGS = [
  { f: 1, o: 0.05 },
  { f: 0.72, o: 0.06 },
  { f: 0.5, o: 0.07 },
  { f: 0.3, o: 0.09 },
];

/*
 * `GlassField` LIVED HERE and is gone with `Screen`, its only consumer. It was a
 * THIRD ambient field — three animated blobs — beside components/aurora/field's
 * AuroraField (which the rest of the app renders) and the hero's own backdrop.
 * One ground, one field.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable's two accepted `style` shapes. */
export type PressStyle = StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);

/**
 * Merge a caller's `style` with the press effect, for an ANIMATED component.
 *
 * Extracted and exported for one reason: the invariant it encodes was violated
 * in production and nothing caught it. `Animated.createAnimatedComponent` walks
 * the `style` prop to find the AnimatedValues inside it. Handed a FUNCTION it
 * can walk nothing, and it passes down a style carrying none of the caller's
 * declarations — every background, border, radius, width and flexDirection
 * silently gone, on every Pressable in the app. That shipped in build 81628102.
 *
 * So: the return value must ALWAYS be an array, and it must always contain the
 * caller's resolved style. `ui.test.ts` asserts exactly that. Typecheck cannot
 * — `style` accepts both shapes by design — and the bundle export cannot,
 * because neither one renders.
 */

export function resolvePressStyle(
  style: PressStyle | undefined,
  pressed: boolean,
  fx: StyleProp<ViewStyle> | null,
): StyleProp<ViewStyle>[] {
  const base = typeof style === "function" ? style({ pressed }) : style;
  return [base, fx];
}

/**
 * Press feedback — the ONE tap affordance both clients share (web has the
 * `.pressable` CSS utility; this is the RN twin). The surface scales to .97 on
 * the shared press spring while pressed, so a tap physically lands — RN's
 * Pressable has NO default feedback, which left the overwhelming majority of
 * taps in the app visually silent.
 *
 * A STRICT DROP-IN for Pressable, deliberately: `style` accepts the function
 * form, `children` accepts the render-prop form, and every other prop passes
 * through. That is what lets a file adopt it with one import line
 * (`import { PressScale as Pressable } from "…/lib/ui"`) instead of touching
 * every JSX site — which is the only way a sweep this size stays reviewable.
 *
 * DOWN 120ms / UP 200ms. Releasing is a recovery, not an input, so it is
 * gentler than the press. (A single symmetric spring made taps feel snatched.)
 *
 * `noScale` opts out for the few surfaces where a scale is wrong — a
 * full-screen scrim, or a child of something that already animates.
 *
 * Under Reduce Motion the scale is dropped and a small opacity dip substitutes:
 * feedback, not motion. Never nothing.
 */
export function PressScale({
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  noScale,
  ...rest
}: Omit<ComponentProps<typeof Pressable>, "style"> & {
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Skip the scale — for scrims and anything inside an animating parent. */
  noScale?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;
  // Pressable's function-form `style` needs a real `pressed` boolean, but the
  // ANIMATED component below cannot be handed a function (see the style prop) —
  // so the rare caller that uses the function form gets a React state, and
  // everyone else gets none. Tracking this unconditionally would add a
  // re-render to every press in the app for the benefit of a handful of sites.
  const isFn = typeof style === "function";
  const [isPressed, setIsPressed] = useState(false);
  // Down is quick and definite; up is a slower recovery. Timings rather than a
  // single symmetric spring, because a spring on the release reads as the
  // surface being snatched back out from under the finger.
  const to = useCallback(
    (v: number) => {
      Animated.timing(pressed, {
        toValue: v,
        duration: v === 1 ? 120 : 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [pressed],
  );
  const fx = useMemo(
    () =>
      reducedMotion || noScale
        ? { opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }
        : {
            opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
            transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
          },
    [pressed, reducedMotion, noScale],
  );
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        to(1);
        if (isFn) setIsPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0);
        if (isFn) setIsPressed(false);
        onPressOut?.(e);
      }}
      // ALWAYS an array, never a function — see resolvePressStyle for why, and
      // ui.test.ts for the guard. `disabled` skips the animated opacity so a
      // caller's static `opacity: 0.5` dim isn't overridden by the (later)
      // animated 1.
      style={resolvePressStyle(style, isPressed, disabled ? null : (fx as StyleProp<ViewStyle>))}
    >
      {children}
    </AnimatedPressable>
  );
}

/** The scroll bottom-inset a Screen reserves so content clears the floating
 *  Aurora pill nav (classic keeps the tight 48). Exported so a screen that
 *  supplies its OWN scroller (a FlatList via `Screen scroll={false}`) can apply
 *  the same clearance to its contentContainerStyle. */
export function useScreenBottomPad(): number {
  const aurora = useTemplate().template === "aurora";
  const insets = useSafeAreaInsets();
  return aurora ? auroraScrollClearance(insets.bottom) : 48;
}

/*
 * `Screen` LIVED HERE and is gone: use AuroraScreen from components/aurora/kit.
 *
 * It was a near-clone of that shell — same ambient field, same
 * KeyboardAvoidingView, same gutter-padded scroller with nav-collapse and pull-to-refresh,
 * same SafeAreaView-vs-measured-insets split for a hub tab — minus the screen
 * entrance animation, so the four screens still on it cut in where every other
 * screen faded. AuroraScreen gained an explicit `hubTab` prop to cover the one
 * caller (the Feed tab) that needed the hub shell without passing `top`.
 *
 * Two of the four call sites were `aurora ? <AuroraScreen> : <Screen>`
 * ternaries, so retiring it also deleted those classic-template branches.
 */

/**
 * A SKELETON block — a placeholder that holds the space its content will fill.
 *
 * The app had none. Every one of the 33 `<Loading />` sites was the shape
 * `if (data === null) return <Loading />` — arriving CONTENT, not an in-flight
 * action — and rendered a centred spinner, so a section collapsed to nothing and
 * then popped in fully formed. On a phone, where a list IS most of the screen,
 * that reads as a jump rather than an arrival, and it costs the user the sense
 * that anything was ever going to appear there.
 *
 * The pulse is an opacity breath on the SHARED @hybrid/core `skeleton` token —
 * the same numbers globals.css generates its .skeleton class from, so the two
 * clients cannot breathe at different rates (they matched at 1.4s by
 * coincidence, not by construction). It stops under Reduce Motion: a
 * placeholder that animates is a nicety; a placeholder that reserves space is
 * the actual job, and that part never depends on motion.
 */
export function Skeleton({ width = "100%", height = 14, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(skeleton.bright)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(skeleton.still); return; }
    const half = skeleton.pulseMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: skeleton.dim, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: skeleton.bright, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: palette.line, opacity: pulse }, style]}
    />
  );
}

/**
 * The default content placeholder — what `if (!data) return <Loading />` should
 * have been all along. Three bars at descending widths read as "a list is coming
 * here" rather than "something is happening somewhere".
 *
 * Kept under the name `Loading` deliberately: 33 call sites already say exactly
 * the right thing, and renaming them would have been churn in place of a fix.
 * A spinner is still correct for an in-flight ACTION (a saving button) — that is
 * what ActivityIndicator is for, and those sites keep it.
 */
export function Loading() {
  return (
    <View style={{ paddingVertical: space.xxl, gap: space.md }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Skeleton width="62%" height={16} />
      <Skeleton height={12} />
      <Skeleton width="84%" height={12} />
    </View>
  );
}

/**
 * The HAND-OVER from a placeholder to the thing it was holding space for.
 *
 * Skeleton → content was a SWAP on both clients: one frame of placeholder, the
 * next a fully-formed screen. Here the two states are stacked in the same box
 * and cross-fade over `durations.crossfade`, so the content arrives WHERE the
 * placeholder was rather than replacing it.
 *
 * The placeholder outlives the flag by one crossfade on purpose: unmounting it
 * the moment the data lands would leave nothing to fade out, which is the exact
 * swap this replaces. Under Reduce Motion the substitution is the shorter
 * `durations.reduced` dissolve — never an instant cut, or the arrival loses its
 * only signal. Web twin: components/aurora/skeleton.tsx `LoadSwap`.
 */
export function LoadSwap({
  loading,
  placeholder,
  children,
  fill,
  style,
}: {
  loading: boolean;
  /** What holds the space. Give it the geometry of the real thing. */
  placeholder?: ReactNode;
  /**
   * The content. Pass a FUNCTION where the body would crash without its data —
   * which is almost everywhere, because the shape these loading states are
   * written in is `if (!data) return <Loading />` and everything after that
   * guard dereferences `data`. Children only render when the data has landed,
   * so a function is never called while loading; an eagerly-built node would
   * still have been evaluated.
   *
   * That laziness is what lets a body stay where it is. The alternative — the
   * reason this adoption stalled — was moving every body into a child
   * component so it could take the data as a prop, which for these screens
   * would mean threading their derived values and mutation handlers through as
   * props too.
   */
  children: ReactNode | (() => ReactNode);
  /**
   * The content fills the swap rather than sizing to itself — for a screen
   * whose body is a virtualized list that needs a height to scroll in. Without
   * it the content sits in a plain wrapper that sizes to its children, so a
   * `flex: 1` list inside would collapse the moment it moved in here.
   */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const ms = reduced ? durations.reduced : durations.crossfade;
  const [held, setHeld] = useState(loading);
  const inOpacity = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const phOpacity = useRef(new Animated.Value(loading ? 1 : 0)).current;

  useEffect(() => {
    if (loading) {
      setHeld(true);
      inOpacity.setValue(0);
      phOpacity.setValue(1);
      return undefined;
    }
    Animated.parallel([
      Animated.timing(inOpacity, { toValue: 1, duration: ms, useNativeDriver: true }),
      Animated.timing(phOpacity, { toValue: 0, duration: ms, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setHeld(false); });
    return undefined;
  }, [loading, ms, inOpacity, phOpacity]);

  return (
    <View style={style}>
      {/* The content is laid out normally and the placeholder floats OVER it:
          the box is the content's own size the moment it exists, so the
          hand-over is a fade and not also a resize. */}
      {!loading && (
        <Animated.View style={fill ? { opacity: inOpacity, flex: 1 } : { opacity: inOpacity }}>
          {typeof children === "function" ? children() : children}
        </Animated.View>
      )}
      {held && (
        <Animated.View
          pointerEvents="none"
          style={[loading ? null : StyleSheet.absoluteFill, { opacity: phOpacity }]}
        >
          {placeholder ?? <Loading />}
        </Animated.View>
      )}
    </View>
  );
}

/** The ONE card shadow, theme-aware — the mobile twin of web's --shadow-card.
 *  Dark: soft black lift. Light (Kyoto Hour): a warm umbra — a pure-black
 *  shadow on the washi paper reads like a hole (globals.css documents the same
 *  fix for web); this mirrors its rgba(88,74,52,…) tone. */
export function cardShadow(scheme: "dark" | "light"): ViewStyle {
  return scheme === "light"
    ? { shadowColor: "#584a34", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }
    : { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 };
}

/*
 * `Card` LIVED HERE and is gone: it is now ACard in components/aurora/kit.tsx.
 *
 * The two were a genuine fork — same radius and shadow, then different padding
 * (16 vs 20), a built-in outer margin on this one that made the two impossible
 * to stack together, and, decisively, different MATERIAL: ACard drops a native
 * SwiftUI glass surface on iOS and this one never could. That put 234 cards on
 * two materials chosen by import path, so the surface changed when you tapped
 * from Today into a session. All 97 call sites now render ACard; the `accent`
 * rail moved with them and the outer margin became the explicit `cardStack`.
 */
export function Kicker({ children, color }: { children: ReactNode; color?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={FIXED_FONT_SCALE}
      style={{
        fontFamily: F.mono,
        fontSize: fs.micro,
        lineHeight: leading(fs.micro, "snug"),
        textTransform: "uppercase",
        // tracking.caps — the wider of the two eyebrow trackings, which is what
        // this primitive has always emitted. The narrower `tracking.label` (0.9)
        // is the one 216 inline kickers use; both are now named, so the choice
        // between them is a decision rather than a coin toss.
        letterSpacing: tracking.caps,
        color: color ? txt(palette, color) : palette.ash,
      }}
    >
      {children}
    </Text>
  );
}

export function Mono({ children, style, color, numberOfLines }: { children: ReactNode; style?: TextStyle; color?: string; numberOfLines?: number }) {
  const { palette } = useTheme();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={numberOfLines} style={[{ fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body), color: color ? txt(palette, color) : palette.ash }, style]}>
      {children}
    </Text>
  );
}

/*
 * `H1` LIVED HERE and is gone: use AHeading from components/aurora/kit, which
 * now reads the same rung the Hero System's `title` rank does. H1 was 30/-1 —
 * a size on neither the type ladder nor the hero ramp — with no header role and
 * no serif swap under Kyoto Hour, on two call sites.
 */

/**
 * THE STATIC TAG — a small non-interactive label ("PR", "warm-up", "4 weeks").
 *
 * This is one of exactly TWO chip shapes in the app; the other is `AChip` in
 * components/aurora/kit.tsx, which is the SELECTABLE filter. If a chip responds
 * to a tap it is an AChip and it owes the user a 44dp target; if it does not, it
 * is this.
 *
 * The design audit found eighteen chip implementations disagreeing on six axes
 * at once — fill alpha (10 / 12 / 13 / 14 / 16%), radius (5 vs pill), padding
 * (8/2, 10/3, 12/3, 12/4), size (nano vs micro), face (mono vs semi) and border
 * (none vs hairline). Two of them also painted their label with the RAW accent
 * instead of routing it through `txt()`, so they failed contrast on the Kyoto
 * Hour washi — a legibility bug hiding inside a styling inconsistency.
 *
 * `tone` is the one axis that earned a variant: `soft` is the tinted fill this
 * has always been, `outline` adds the hairline the settings tags needed to read
 * against a card of the same tint.
 */
export function Chip({
  children,
  color,
  tone = "soft",
}: {
  children: ReactNode;
  color?: string;
  tone?: "soft" | "outline";
}) {
  const { palette } = useTheme();
  // Default (no color) = the theme's PRIMARY accent: tint from the theme fill
  // (pine on light, chartreuse on dark) and text via the brand key so txt() maps
  // it to the theme's accent-text tone. An explicit color keeps its own hue.
  const key = color ?? C.lime;
  const fill = color ?? palette.lime;
  return (
    <View
      style={{
        backgroundColor: `${fill}1f`,
        borderRadius: 999,
        borderWidth: tone === "outline" ? 1 : 0,
        borderColor: `${fill}66`,
        paddingHorizontal: 11,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        numberOfLines={1}
        style={{
          fontFamily: F.semi,
          fontSize: fs.micro,
          lineHeight: leading(fs.micro, "snug"),
          color: txt(palette, key),
          textTransform: "uppercase",
          letterSpacing: tracking.label,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/*
 * `Button` LIVED HERE and is gone: use APill from components/aurora/kit, which
 * absorbed its `outline` variant and its `color` prop. The two were one button
 * split in half — this one could draw a hairline ghost for a destructive action
 * but not the `light` or glass-`soft` fills; APill could do those but had no way
 * to express a destructive outline, and no accessibility contract at all. Each
 * did something the other couldn't, which is exactly how a codebase ends up
 * keeping both.
 */
