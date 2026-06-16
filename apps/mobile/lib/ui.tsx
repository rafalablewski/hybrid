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
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { colors } from "@hybrid/core";
import { useTheme, txt } from "./theme";

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
  padding = 16,
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
  return (
    <View
      style={[
        { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: border, marginBottom: 12 },
        glassShadow,
        style,
      ]}
    >
      <BlurView intensity={intensity} tint={t} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
      {accent && <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />}
      <View style={{ padding }}>{children}</View>
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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <GlassField />
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 48 }}
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
  if (glass) {
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
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
        },
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
      style={{
        fontFamily: F.mono,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        color: color ? txt(palette, color) : palette.ash,
      }}
    >
      {children}
    </Text>
  );
}

export function Mono({ children, style, color }: { children: ReactNode; style?: TextStyle; color?: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: F.mono, fontSize: 13, color: color ? txt(palette, color) : palette.ash }, style]}>
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
  return (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.semi, fontSize: 11, color: txt(palette, color), textTransform: "uppercase", letterSpacing: 0.5 }}>
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: color,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: F.black, fontSize: 15, color: palette.onAccent }}>{label}</Text>
    </Pressable>
  );
}
