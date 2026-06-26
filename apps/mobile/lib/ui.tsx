import { useEffect, useRef, type ReactNode } from "react";
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
import { BlurView } from "expo-blur";
import { colors, fs, space } from "@hybrid/core";
import { useTheme, txt } from "./theme";

// Re-export the shared scale (same source the web client uses) so screens can
//   import { fs, space } from "../../lib/ui"  →  fontSize: fs.body, gap: space.lg
export { fs, space };
import { useTemplate } from "./template";
import { auroraScrollClearance } from "./layout";

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
} as const;

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
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, ms]);
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

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { palette } = useTheme();
  // Aurora renders a FLOATING pill nav over every screen (incl. pushed pages),
  // so the last bit of content (share buttons, sign-out, the Builder CTA) would
  // sit UNDER the bar. Reserve room for it so everything stays scrollable into
  // view. Classic keeps the tight padding (its bar is a real, laid-out tab bar).
  const aurora = useTemplate().template === "aurora";
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <GlassField />
      {/* Lift the form above the keyboard so low inputs/submit buttons aren't
          hidden when the keyboard opens (no screen had keyboard avoidance). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: aurora ? auroraScrollClearance(insets.bottom) : 48 }}
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

export function Chip({ children, color = C.lime }: { children: ReactNode; color?: string }) {
  const { palette } = useTheme();
  const aurora = useTemplate().template === "aurora";
  return (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: aurora ? 999 : 5, paddingHorizontal: aurora ? 11 : 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.semi, fontSize: fs.micro, color: txt(palette, color), textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  color = C.lime,
  disabled,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const aurora = useTemplate().template === "aurora";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        backgroundColor: color,
        borderRadius: aurora ? 999 : 12,
        paddingVertical: aurora ? 16 : 14,
        paddingHorizontal: 24,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: aurora ? F.bold : F.black, fontSize: fs.note, color: palette.onAccent }}>{label}</Text>
    </Pressable>
  );
}
