import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
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
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { BlurView } from "expo-blur";
import { colors, fs, space, springs, springDurationMs, durations } from "@hybrid/core";
import { useTheme, txt } from "./theme";
import { useNavScrollProps } from "./nav-scroll";

// Re-export the shared scale (same source the web client uses) so screens can
//   import { fs, space } from "../../lib/ui"  →  fontSize: fs.body, gap: space.lg
export { fs, space };
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

// Shared depth shadow — the "lifted glass" feel (iOS shadow + Android elevation).
export const glassShadow: ViewStyle = {
  shadowColor: "#000",
  shadowOpacity: 0.5,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

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
      const anim = Animated.timing(enter, {
        toValue: 1,
        // The entrance is the tail of the stack transition, so it rides the
        // shared `sheet` spring's settle time rather than a hand-picked 240ms —
        // one source of truth with the web (@hybrid/core motion.ts).
        duration: reducedMotion ? durations.reduced : springDurationMs(springs.sheet),
        easing: reducedMotion ? Easing.linear : Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
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
 * Liquid Glass surface for React Native. BlurView frosts whatever is behind it;
 * a brand tint film + a top rim-highlight + a soft border reproduce the web
 * `.liquid-glass` look (grain is omitted — no perf-free noise primitive on RN).
 * Mirrors the @hybrid/core palette so web and mobile stay in lockstep. This is
 * the base surface for `Card` (glass by default), matching web where every
 * `<Card>` renders on glass.
 */
export function GlassCard({
  children,
  style,
  intensity = 38,
  tint,
  accent,
  padding = space.lg,
}: {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
  /** Override the blur tint; defaults to the active theme. */
  tint?: "dark" | "light";
  /** Optional left accent bar (e.g. the lime accent) matching the web cards. */
  accent?: string;
  padding?: number;
}) {
  const { scheme } = useTheme();
  const t = tint ?? scheme;
  const light = t === "light";
  const film = light ? "rgba(255,255,255,0.34)" : "rgba(22,24,22,0.34)";
  const rim = light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)";
  const border = light ? "rgba(20,30,15,0.12)" : "rgba(255,255,255,0.10)";
  // `overflow: hidden` (needed to clip the blur to the radius) would also clip
  // the drop shadow on iOS, so keep them on separate views: the OUTER view
  // carries the shadow (and matches its radius for a rounded shadow), the INNER
  // view does the clipping. Honour a caller-supplied borderRadius on both.
  const radius = typeof style?.borderRadius === "number" ? style.borderRadius : 18;
  return (
    <View style={[glassShadow, { marginBottom: space.md, borderRadius: radius }, style]}>
      <View style={{ borderRadius: radius, overflow: "hidden", borderWidth: 1, borderColor: border }}>
        <BlurView intensity={intensity} tint={t} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
        {accent && <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />}
        <View style={{ padding }}>{children}</View>
      </View>
    </View>
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

function FieldBlob({
  color,
  size,
  anchor,
  dx,
  dy,
  ms,
}: {
  color: string;
  size: number;
  anchor: ViewStyle;
  dx: number;
  dy: number;
  ms: number;
}) {
  const a = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    // Reduce Motion: hold the blob still (a stays 0 → no translate/scale) rather
    // than running the perpetual drift loop.
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, ms, reducedMotion]);
  const translateX = a.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center" },
        anchor,
        { transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    >
      {FIELD_RINGS.map((r, i) => (
        <View
          key={i}
          style={{ position: "absolute", width: size * r.f, height: size * r.f, borderRadius: (size * r.f) / 2, backgroundColor: color, opacity: r.o }}
        />
      ))}
    </Animated.View>
  );
}

/** The ambient Liquid Glass field — slow-drifting accent blobs that the glass
 *  surfaces refract. Mounted once behind every Screen (the mobile analog of the
 *  web `.lg-field`), so the BlurView cards have real content to frost. */
export function GlassField() {
  const { palette } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <FieldBlob color={palette.lime} size={340} anchor={{ left: "-16%", top: "-10%" }} dx={70} dy={90} ms={19000} />
      <FieldBlob color={palette.blue} size={300} anchor={{ right: "-18%", top: "4%" }} dx={-60} dy={110} ms={23000} />
      <FieldBlob color={palette.violet} size={380} anchor={{ left: "26%", bottom: "-22%" }} dx={-50} dy={-60} ms={27000} />
    </View>
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

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** false → render a plain flex container instead of a ScrollView, so the
   *  screen can supply its own virtualized scroller (a FlatList). The caller
   *  then owns the RefreshControl + contentContainerStyle padding (see
   *  useScreenBottomPad). */
  scroll?: boolean;
}) {
  const { palette } = useTheme();
  const padBottom = useScreenBottomPad();
  // Drive the floating nav's shrink-on-scroll from this screen's scroller too
  // (Aurora is the only template, so classic-Screen screens sit under the pill).
  const navScroll = useNavScrollProps();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <GlassField />
      {/* Lift the form above the keyboard so low inputs/submit buttons aren't
          hidden when the keyboard opens (no screen had keyboard avoidance). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ padding: 18, paddingBottom: padBottom }}
            {...navScroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={palette.lime}
                  colors={[palette.lime]}
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Loading() {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 56, alignItems: "center" }}>
      <ActivityIndicator color={palette.lime} />
    </View>
  );
}

export function Card({
  children,
  style,
  glass = true,
  accent,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Liquid Glass surface (default), matching web where `<Card>` is glass by
   *  default. Pass `glass={false}` for a solid card. */
  glass?: boolean;
  /** Optional left accent bar — only applies on glass. */
  accent?: string;
}) {
  const { palette } = useTheme();
  // Aurora gives every card the reference card radius (28 — matches the kit's
  // RADIUS.card and the /hybrid design). Callers can override via style. Classic
  // radius is untouched.
  const aurora = useTemplate().template === "aurora";
  // Aurora cards are SOLID ink2 surfaces (matching the kit's ACard + the web
  // Aurora cards). The frosted GlassCard reads as the old "liquid glass" look, so
  // under Aurora the shared Card renders solid even when `glass` is requested;
  // GlassCard stays available for deliberate glass (e.g. the shareable summary).
  if (glass && !aurora) {
    return (
      <GlassCard style={style} accent={accent}>
        {children}
      </GlassCard>
    );
  }
  return (
    <View
      style={[
        {
          backgroundColor: aurora ? palette.ink2 : palette.card,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: aurora ? 28 : 16,
          padding: space.lg,
          marginBottom: space.md,
          // soft, low depth — the kit's ACard shadow, not the heavy glass one.
          ...(aurora ? { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 } : {}),
        },
        // keep the optional left accent rail (used for admin grouping) on the solid card.
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Kicker({ children, color }: { children: ReactNode; color?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={FIXED_FONT_SCALE}
      style={{
        fontFamily: F.mono,
        fontSize: fs.micro,
        textTransform: "uppercase",
        letterSpacing: 1.2,
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
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: F.mono, fontSize: fs.body, color: color ? txt(palette, color) : palette.ash }, style]}>
      {children}
    </Text>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <Text style={{ fontFamily: F.black, fontSize: 30, color: palette.chalk, letterSpacing: -1 }}>{children}</Text>;
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  const { palette } = useTheme();
  const aurora = useTemplate().template === "aurora";
  // Default (no color) = the theme's PRIMARY accent: tint from the theme fill
  // (clay on light, chartreuse on dark) and text via the brand key so txt() maps
  // it to the theme's accent-text tone. An explicit color keeps its own hue.
  const key = color ?? C.lime;
  const fill = color ?? palette.lime;
  return (
    <View style={{ backgroundColor: `${fill}1f`, borderRadius: aurora ? 999 : 5, paddingHorizontal: aurora ? 11 : 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.micro, color: txt(palette, key), textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  color,
  variant = "fill",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  /** "outline" = a transparent ghost with a hairline border; `color` tints the
   *  label + border (muted ash/line when omitted) — e.g. destructive actions. */
  variant?: "fill" | "outline";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const aurora = useTemplate().template === "aurora";
  // Default fill = the theme's PRIMARY accent (clay on light, chartreuse on dark);
  // an explicit color still wins. Text is always the theme's onAccent ink.
  const fill = color ?? palette.lime;
  const outline = variant === "outline";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          backgroundColor: outline ? "transparent" : fill,
          borderWidth: outline ? 1 : 0,
          borderColor: color ? `${color}73` : palette.line,
          borderRadius: aurora ? 999 : 12,
          paddingVertical: aurora ? 16 : 14,
          paddingHorizontal: 24,
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: aurora ? F.bold : F.black, fontSize: fs.note, color: outline ? (color ? txt(palette, color) : palette.ash) : palette.onAccent }}>{label}</Text>
    </Pressable>
  );
}
