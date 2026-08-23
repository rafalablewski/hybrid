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
import { colors, fs, space, lh, leading, tracking, trackFigure, TABULAR_NUMS, resolveText, type TextToken, springs, springDurationMs, springToRN, durations, skeleton , ALPHA} from "@hybrid/core";
import { useTheme, txt } from "./theme";
import { useNavScrollProps } from "./nav-scroll";

// Re-export the shared scale (same source the web client uses) so screens can
//   import { fs, space } from "../../lib/ui"  →  fontSize: fs.body, gap: space.lg
// `leading` and `tracking` are the two axes that had no token until the design
// audit: every lineHeight in the app was an absolute dp (29 of them) and every
// letterSpacing a fresh guess (18 of them). Use leading(fs.body) rather than a
// number — an absolute line box is also why Dynamic Type could not work — and
// tracking(size) rather than a dp, because a letterSpacing is a proportion of the
// size it sits on and an absolute one means something different at every rung.
export { fs, space, lh, leading, tracking, trackFigure };
import type { ThemePalette as Palette } from "@hybrid/core";
import { faceFor } from "./faces";
import { auroraScrollClearance } from "./layout";
import { useReducedMotion } from "./use-reduced-motion";
import { RADIUS } from "../components/aurora/kit";
import { withAlpha } from "../components/aurora/field";

// ── Dynamic Type caps ────────────────────────────────────────────────────────
// RN already scales every <Text> with the OS "Larger Text" / Dynamic Type
// setting (allowFontScaling defaults true — we never disable it). What we add
// here is a CEILING so that surface still works at the largest accessibility
// sizes: reflowable body text keeps growing, but FIXED-HEIGHT chrome (the
// floating nav pill, count badges, dense table rows) is capped so it can't
// clip/overflow. Pass `maxFontSizeMultiplier={FIXED_FONT_SCALE}` on text inside
// a container with a hard height; leave it off (or use MAX_FONT_SCALE) anywhere
// the layout can grow to fit. See capabilities.ts → `dynamic-type`.
//
// THE CLAMP IS THE EXCEPTION AND IT IS ENFORCED AS ONE. This policy was prose
// for months and drifted the way prose does — 1.15 is the value you see in the
// file you are copying from, so it spread by imitation until three quarters of
// the app's text refused the reader's own text-size setting. Two HARD rules in
// design-tokens.test.ts now hold it: a FIXED_FONT_SCALE clamp must live in a
// component that declares a hard height (or reads a height token), and neither
// cap may be written as a bare number.
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
// live accent (C.lime) so it tracks the token.
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

/**
 * A ONE-SHOT ENTRANCE FOR A ROW THAT APPEARS INSIDE AN ALREADY-FOCUSED SCREEN —
 * and, deliberately, the one kind of motion that CANNOT be silently absent.
 *
 * `useEntrance` above is keyed to screen FOCUS, so it is no use to a row that
 * arrives mid-screen. The obvious alternative for those is `animateListChange`
 * (LayoutAnimation), and it is still the right tool for the surrounding reflow:
 * one call animates every consequence of a commit, including the rows below
 * closing a gap, which no per-row animation can reach.
 *
 * But LayoutAnimation is a REQUEST to native, and on the New Architecture it is
 * a request that can be declined. React Native 0.85.3 gates it behind two
 * feature flags (JS `isLayoutAnimationEnabled`, C++ `enableLayoutAnimationsOnIOS`),
 * its own source still calls iOS Fabric support "conditionally enabled (pending
 * fully shipping; this is a temporary state)", `Platform.isDisableAnimations`
 * can switch it off wholesale, and the surface that needs it most here — the
 * live logger — is presented as a `fullScreenModal`, which is its own view
 * controller and the configuration Fabric handles least well. Every one of those
 * fails the same way: silently, with no error, looking exactly like a design
 * that simply has no animation.
 *
 * This does not ask. `Animated` is independent of LayoutAnimation, of the
 * feature flags, and of the surface: it commits through the ordinary renderer,
 * so there is nothing to decline. If the row mounts, it moves.
 *
 * ON THE JS DRIVER, AND THAT IS THE WHOLE POINT OF THIS PARAGRAPH. The obvious
 * choice here is `useNativeDriver: true` — UI thread, immune to a JS stall — and
 * it is the WRONG one, for a reason this codebase has already paid for on
 * device. `useEntrance` above ran exactly that and had to be changed: under
 * Fabric, a native-driver OPACITY animation started from JS can lose the
 * JS-start-vs-native-mount race and strand the view at its initial value, which
 * is opacity 0 (facebook/react-native#12453). It shipped as a blank screen on
 * an iPhone 15 while faster devices won the race.
 *
 * Here the stranded value would be an INVISIBLE BANKED SET — the precise bug
 * this row exists to fix, reintroduced in a worse form and only on some phones.
 * A frame of jank if the JS thread is busy is a trade worth making against
 * that; a one-shot spring on one row costs nothing measurable, and the fade is
 * the part that must land, every time, on every device.
 *
 * So the two are used TOGETHER and neither is redundant: LayoutAnimation makes
 * the neighbours travel where it is honoured, and this makes the arriving row
 * travel whether it is honoured or not.
 *
 * NOTE ON MOUNTING. This fires on mount, so the caller must actually mount:
 * two branches of a ternary that both render a `<View>` reconcile as the SAME
 * view and update in place. Rendering one branch as a distinct COMPONENT is
 * what guarantees the remount — React always remounts across a type change —
 * which is why the logger's ledger row is its own component.
 *
 * Reduce Motion substitutes the cross-dissolve rather than snapping, matching
 * `useEntrance` and `animateListChange`: the rise is dropped, the fade is kept,
 * so the arrival is still perceptible.
 */
export function useRowEntrance(distance = 8): { opacity: Animated.Value; transform?: { translateY: Animated.AnimatedInterpolation<number> }[] } {
  const enter = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const anim = reducedMotion
      ? Animated.timing(enter, { toValue: 1, duration: durations.reduced, easing: Easing.linear, useNativeDriver: false })
      : Animated.spring(enter, { toValue: 1, ...springToRN(springs.slide), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
    // Mount-only: `enter` is stable, and re-running on a Reduce Motion toggle
    // would replay the entrance of every row already on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useMemo(
    () =>
      reducedMotion
        ? { opacity: enter }
        : {
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }],
          },
    [enter, reducedMotion, distance],
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
// C.* directly. New code should prefer useTheme().
export const C = colors;

// Loaded in app/_layout.tsx
export const F = {
  reg: "Sohne_400Buch",
  semi: "Sohne_500Kraftig",
  bold: "Sohne_600Halbfett",
  /**
   * `black` IS HALBFETT NOW — the same binary `bold` resolves to, and the
   * collapse is the correction rather than an accident of mapping.
   *
   * It was Dreiviertelfett (700, a 0.16em stem) across 298 call sites, which
   * made the heaviest cut in the family the app's DEFAULT: more sites than the
   * regular (258) and the medium (81) combined, with 62 of them at `fs.body` or
   * below. On a near-black ground light strokes irradiate — they bleed outward
   * and every weight reads heavier than it measures — so that is a 2.2dp stroke
   * at reading size with the counters of `a`, `e` and `s` closing up. Heavy type
   * at reading size is not emphasis, it is mud.
   *
   * The type system's rule is now explicit (`weight` in core theme/typography.ts):
   * ON THIS GROUND THE LADDER STOPS AT 600, both cuts. An alias resolving above
   * it would be 298 call sites quietly contradicting the system they belong to.
   *
   * THE COLLAPSE IS THE POINT, not a cost being absorbed. `bold` and `black`
   * pointing at one binary says exactly what the rule says: on `ink` there is no
   * weight above Halbfett. A site that was leaning on the step between them was
   * leaning on a distinction the system no longer has — and the honest fix for
   * those is a named style (`ty(C, "hero")`, `ty(C, "title")`), not a heavier
   * face. That migration is tracked as `weight-ladder-migration` in
   * capabilities.ts, with the counts.
   *
   * DREIVIERTELFETT IS GONE FROM THE APP. It was kept for one style — the
   * Wrapped's cover titles — on the reasoning that a LIT surface wants a heavier
   * cut. The premise was false: `HERO_TAKEOVER_INK` is #0a0b09, DARKER than
   * `ink`. There is no lit full-bleed surface in this product, so the 700 had no
   * legal home and stopped being bundled. `black` is an alias for the 600 and
   * the ladder has three weights.
   */
  black: "Sohne_600Halbfett",
  mono: "SohneMono_400Buch",
  monoMed: "SohneMono_500Kraftig",
  monoBold: "SohneMono_600Halbfett",
  /**
   * THE EDITORIAL VOICE — ITC Garamond Book, and the only alias here with a cap
   * on how often it may appear. ONE element per screen, never under 24dp, never
   * a figure or a control, English only. Reach for `ty(C, "editorial")` rather
   * than this alias: the token carries the size, leading and tracking that make
   * the pairing work, and a hand-rolled `fontFamily: F.serif` throws all three
   * away. There is no italic because nothing needs one yet.
   */
  serif: "ITCGaramondStd_400Bk",
} as const;

/**
 * THE NAMED TYPE STYLES, RESOLVED FOR REACT NATIVE — `ty(C, "kicker")`.
 *
 * `@hybrid/core` theme/typography.ts holds the styles as DATA: a cut, a weight,
 * a size rung, a leading role, a tracking role and an ink role. This turns one
 * into a real RN TextStyle against the live palette, which is the last mile the
 * core cannot do — RN has no weight axis for a custom face, and ink is a theme
 * concern that changes per surface.
 *
 * The (family, weight) → binary map lives in `./faces.ts`, which is pure data
 * so the design-token guard can import it without pulling React Native in. It
 * is lossy today and deliberately so — see the note there.
 */

/**
 * A named style as an RN TextStyle. `color` overrides the token's ink ROLE —
 * pass it for an accent, leave it for the role the style declares.
 */
export function ty(palette: Palette, token: TextToken, color?: string): TextStyle {
  const r = resolveText(token);
  return {
    fontFamily: faceFor(r.fontFamily, r.fontWeight) ?? F.reg,
    fontSize: r.fontSize,
    lineHeight: r.lineHeight,
    letterSpacing: r.letterSpacing,
    color: color ?? (r.ink === "primary" ? palette.chalk : palette.ash),
    ...(r.tabular ? { fontVariant: [TABULAR_NUMS] as TextStyle["fontVariant"] } : null),
    ...(r.upper ? { textTransform: "uppercase" as const } : null),
  };
}

/**
 * A FIGURE'S NUMERALS — spread this into any text style that draws a number
 * that sits in a column, updates, or animates. The argument is in core
 * `scale.ts` beside `TABULAR_NUMS`; the short version is that a proportional
 * `1` is narrower than an `8`, so a column does not line up and a rolling digit
 * resizes its own slot mid-turn.
 *
 * Spread it FIRST, so the rare caller that genuinely wants proportional figures
 * (a number inside a sentence) can still say so after it.
 */
export const TABULAR: TextStyle = { fontVariant: [TABULAR_NUMS] };

/**
 * THE SAME SIX FACES, UNDER THE NAMES CORE TEXT KNOWS THEM BY.
 *
 * `F` holds ALIASES, not font names. `useFonts({ Sohne_600Halbfett })` hands
 * expo-font the key as a *family alias* and expo-font makes it work by
 * SWIZZLING `UIFont.fontNames(forFamilyName:)` — React Native's text path asks
 * that method, gets the alias resolved to the font's real PostScript name, and
 * draws Söhne. Nothing else on the system asks that method.
 *
 * SwiftUI does not. `@expo/ui`'s `font({ family })` modifier ends in
 * `Font.custom(family, size:)`, which goes to Core Text directly — and Core
 * Text has never heard of "Sohne_600Halbfett" (the binary's PostScript name is
 * `TestSohne-Halbfett`; the alias only ever existed in expo-font's own dictionary).
 * An unresolvable name in `Font.custom` does not throw and does not warn: it
 * QUIETLY DRAWS SAN FRANCISCO. So every native leaf in swiftui.tsx that was
 * "given the caller's own face" — the nutrition head's meal switcher
 * ("Breakfast ⌄"), the logger's timer capsule, its set-type menu, the
 * satellite's word, the quick-sport stepper — has been rendering the SYSTEM
 * font next to Söhne everywhere else on the same screen. The prop was passed,
 * the screenshots kept showing the wrong face, and nothing in the codebase
 * disagreed, because the failure is a silent fallback three layers down.
 *
 * These are the `name` table's ID-6 (PostScript) entries of the .otf files in
 * `assets/fonts`, which is what `CTFontManagerRegisterFontsForURL` registers
 * them under. `native-face.test.ts` parses those files and fails if any entry
 * here stops matching — the map is not allowed to be a guess.
 *
 * THEY SAY `TestSohne` BECAUSE THAT IS WHAT THE BINARIES SAY. The evaluation
 * cuts carry that PostScript name; the retail files will carry `Sohne-*`, and
 * swapping them means editing these seven strings and nothing else. The guard
 * reads the name out of the file, so getting it wrong fails the build rather
 * than drawing San Francisco on a native leaf.
 */
export const F_POSTSCRIPT: Record<string, string> = {
  [F.reg]: "TestSohne-Buch",
  [F.semi]: "TestSohne-Kraftig",
  [F.bold]: "TestSohne-Halbfett",
  [F.mono]: "TestSohneMono-Buch",
  [F.monoMed]: "TestSohneMono-Kraftig",
  [F.monoBold]: "TestSohneMono-Halbfett",
  [F.serif]: "ITCGaramondStd-Bk",
};

/**
 * An `F` alias → the name to hand SwiftUI. Call it at EVERY `font({ family })`
 * in the native kit and nowhere else: callers keep passing `F.bold`, because a
 * call site that has to remember which of two names a face goes by is a call
 * site that will forget. An unmapped family passes through unchanged — a face
 * we do not load is the caller's business, not this map's.
 */
export function nativeFace(family: string): string {
  return F_POSTSCRIPT[family] ?? family;
}

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
 *  Aurora pill nav. Exported so a screen that supplies its OWN scroller (a
 *  FlatList via `Screen scroll={false}`) can apply the same clearance to its
 *  contentContainerStyle. It used to branch on the template flag and fall back
 *  to a tight 48 — an arm that could not be reached, since there has only ever
 *  been one template. */
export function useScreenBottomPad(): number {
  const insets = useSafeAreaInsets();
  return auroraScrollClearance(insets.bottom);
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

/** The ONE card shadow — the mobile twin of web's --shadow-card: a soft black
 *  lift. */
export function cardShadow(): ViewStyle {
  // NOT THE SAME NUMBERS AS WEB'S `--shadow-card`, and deliberately so — audit/12
  // §10 L6 listed the two as a drift to reconcile, and they are not one. CSS has
  // a SPREAD term the RN shadow model has no equivalent for: the web value's
  // `-12px` pulls the shadow in hard, which is why it needs 0.55 opacity to read
  // at all. Matching the two opacities would make the two platforms look LESS
  // alike, not more. Tuned per renderer, to the same intent.
  return { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 };
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
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={{
        fontFamily: F.mono,
        fontSize: fs.micro,
        lineHeight: leading(fs.micro, "snug"),
        textTransform: "uppercase",
        // tracking(fs.micro, "caps") — the wider of the two eyebrow trackings, which is what
        // this primitive has always emitted. The narrower `tracking(fs.micro, "label")` (0.9)
        // is the one 216 inline kickers use; both are now named, so the choice
        // between them is a decision rather than a coin toss.
        letterSpacing: tracking(fs.micro, "caps"),
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
 * a size on neither the type ladder nor the hero ramp — with no header role,
 * on two call sites.
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
 * instead of routing it through `txt()` — a legibility bug hiding inside a
 * styling inconsistency.
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
        backgroundColor: withAlpha(fill, ALPHA.fill),
        borderRadius: RADIUS.pill,
        borderWidth: tone === "outline" ? 1 : 0,
        borderColor: withAlpha(fill, ALPHA.rim),
        paddingHorizontal: 11,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{
          fontFamily: F.semi,
          fontSize: fs.micro,
          lineHeight: leading(fs.micro, "snug"),
          color: txt(palette, key),
          textTransform: "uppercase",
          letterSpacing: tracking(fs.micro, "label"),
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
