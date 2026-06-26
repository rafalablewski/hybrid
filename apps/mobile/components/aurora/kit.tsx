import { type ReactNode, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { auroraScrollClearance } from "../../lib/layout";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";
import { GlassSurface, GlassSegment } from "./swiftui";
import { useLiquidGlass } from "../../lib/liquid-glass";

/**
 * AURORA template UI kit (mobile). Soft, rounded primitives adapted from the
 * mobile Figma design — big corner radii, pill buttons, a floating-card feel —
 * but built on the HYBRID brand tokens (lime accent, ink surfaces, Archivo type)
 * via the shared theme palette, so the new look stays on-brand and theme-aware.
 */
export const RADIUS = { card: 28, field: 16, pill: 999 } as const;

/** Append an alpha byte to a `#RRGGBB` brand token → `#RRGGBBAA` (passthrough
 *  for anything that isn't a 6-digit hex). */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** Ambient AURORA backdrop — soft accent gradients that bleed in from the edges
 *  and fade to transparent, giving the rounded screens a smooth gradient wash
 *  (the classic Aurora look). Built from layered `LinearGradient`s rather than
 *  hard-edged blobs so it reads as a gradient, not discs — the RN parity of the
 *  web `.lg-field` (which blurs its blobs 70px to the same effect). Renders in
 *  both modes: with Liquid Glass on it's the colour the glass cards refract;
 *  with it off it's the plain Aurora gradient. Exported so screens that own
 *  their own shell (e.g. the live logger) can drop the same backdrop behind
 *  their content. */
export function AuroraField() {
  const { palette } = useTheme();
  const fill = StyleSheet.absoluteFill;
  return (
    <View pointerEvents="none" style={[fill, { overflow: "hidden" }]}>
      {/* Lime — bleeds from the top-left corner. */}
      <LinearGradient
        colors={[withAlpha(palette.lime, 0.14), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.9 }}
        style={fill}
      />
      {/* Violet — bleeds from the bottom-left. */}
      <LinearGradient
        colors={[withAlpha(palette.violet, 0.16), "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.9, y: 0.15 }}
        style={fill}
      />
      {/* Blue — a faint depth glow from the right edge. */}
      <LinearGradient
        colors={["transparent", withAlpha(palette.blue, 0.1)]}
        start={{ x: 0.25, y: 0.4 }}
        end={{ x: 1, y: 0.4 }}
        style={fill}
      />
    </View>
  );
}

export function AuroraScreen({
  children,
  scroll = true,
  center = false,
  padding = 24,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  // Subtle entrance — content fades + rises on every screen ENTRY (push or tab
  // switch), so navigation feels like motion, not a hard cut. Re-runs on focus.
  const enter = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useFocusEffect(
    useCallback(() => {
      // Reduce Motion: show the screen at rest (no fade/rise) instead of animating.
      if (reducedMotion) {
        enter.setValue(1);
        return;
      }
      enter.setValue(0);
      const anim = Animated.timing(enter, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      anim.start();
      return () => anim.stop();
    }, [enter, reducedMotion]),
  );
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
  const body = scroll ? (
    <ScrollView
      // Clear the floating Aurora pill nav so the last content row never hides
      // under the bar — derived from the real bar height + safe-area inset (one
      // source of truth in lib/layout), not a hand-copied magic number.
      contentContainerStyle={{ padding, paddingBottom: auroraScrollClearance(insets.bottom), flexGrow: center ? 1 : undefined, justifyContent: center ? "center" : undefined }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.lime} colors={[palette.lime]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, justifyContent: center ? "center" : "flex-start" }}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <AuroraField />
      {/* Lift fields above the keyboard so low inputs / submit buttons (login,
          builder, check-in, nutrition…) aren't hidden when it opens. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>{body}</Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The circular brand mark used across the auth flow (HYBRID dot). */
export function AuroraMark({ size = 64 }: { size?: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: palette.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: F.black, fontSize: size * 0.42, color: palette.chalk }}>
        H<Text style={{ color: txt(palette, palette.lime) }}>.</Text>
      </Text>
    </View>
  );
}

/**
 * Readiness/score DIAL — a glanceable ring of ticks (Apple-Watch-ish), so a
 * headline number reads as a *shape* at a glance, not digits to parse. Built
 * from plain Views (no react-native-svg dep, matching the icon approach): N
 * ticks evenly rotated around the centre, the first `value%` lit in `color`.
 */
export function Ring({
  value,
  size = 46,
  ticks = 32,
  color,
  track,
  children,
}: {
  value: number;
  size?: number;
  ticks?: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.round(size * 0.16);
  const tickW = Math.max(2, Math.round(size * 0.045));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: "absolute", width: size, height: size, alignItems: "center", transform: [{ rotate: `${(i / ticks) * 360}deg` }] }}
        >
          <View style={{ width: tickW, height: tickLen, borderRadius: tickW, backgroundColor: i < lit ? color : track }} />
        </View>
      ))}
      {children}
    </View>
  );
}

/** Dependency-free SPARKLINE — scaled bars, latest highlighted. A 2-second read
 *  of a trend where a lone number can't show direction. */
export function Spark({
  series,
  color,
  height = 26,
  width,
}: {
  series: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  const { palette } = useTheme();
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 2, width }}>
      {series.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4 + ((v - min) / range) * (height - 4),
            borderRadius: 2,
            backgroundColor: i === series.length - 1 ? color : `${color}55`,
          }}
        />
      ))}
    </View>
  );
}

export function ACard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { palette } = useTheme();
  const { active: glass } = useLiquidGlass();
  // When Liquid Glass is active (iOS + toggle on) the surface is a native SwiftUI
  // layer dropped behind the content (transparent RN base so the glass refracts
  // the screen field); otherwise the solid ink2 card. The glass clips itself to
  // the same radius, so honour a caller-supplied borderRadius.
  const radius = typeof style?.borderRadius === "number" ? style.borderRadius : RADIUS.card;
  return (
    <View
      style={[
        {
          backgroundColor: glass ? "transparent" : palette.ink2,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: RADIUS.card,
          padding: 20,
          // A touch of depth — soft, low, lifted off the field (not the heavy
          // classic glass shadow). Keeps cards reading as floating surfaces.
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 3,
        },
        style,
      ]}
    >
      {glass && <GlassSurface radius={radius} />}
      {children}
    </View>
  );
}

type PillVariant = "primary" | "light" | "soft";

export function APill({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const { active: glass } = useLiquidGlass();
  // The bright primary/light fills stay on brand on every client. The neutral
  // `soft` pill becomes a native Liquid Glass surface when active (iOS + toggle
  // on): transparent RN base + GlassSurface behind the label; ink2 otherwise.
  const glassSoft = variant === "soft" && glass;
  const bg =
    variant === "primary" ? palette.lime : variant === "light" ? palette.chalk : glassSoft ? "transparent" : palette.ink2;
  const fg = variant === "soft" ? palette.chalk : palette.onAccent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: bg,
          borderRadius: RADIUS.pill,
          paddingVertical: 18,
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
          borderWidth: variant === "soft" ? 1 : 0,
          borderColor: palette.line,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {glassSoft && <GlassSurface radius={RADIUS.pill} />}
      <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function AField({
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address";
  /** Optional leading icon (e.g. mail/lock); secure fields also show an eye. */
  icon?: AuroraIconName;
}) {
  const { palette } = useTheme();
  // Secure fields start masked; the eye toggles visibility.
  const [visible, setVisible] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        backgroundColor: palette.ink2,
        borderWidth: 1,
        borderColor: palette.line,
        borderRadius: RADIUS.field,
        paddingHorizontal: 18,
        marginBottom: 13,
      }}
    >
      {icon && <AuroraIcon name={icon} size={20} color={palette.ash} />}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.ash}
        accessibilityLabel={placeholder}
        secureTextEntry={secure ? !visible : false}
        keyboardType={keyboard ?? "default"}
        autoCapitalize="none"
        style={{ flex: 1, fontFamily: F.reg, fontSize: fs.note, color: palette.chalk, paddingVertical: 17 }}
      />
      {secure && (
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}>
          <AuroraIcon name="eye" size={20} color={visible ? palette.lime : palette.ash} />
        </Pressable>
      )}
    </View>
  );
}

/** Rounded segmented pill control (e.g. lb/kg, Day/Week/Month). */
export function ASegment<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { id: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  const { palette } = useTheme();
  const { active: glass } = useLiquidGlass();
  // When active (iOS + toggle on) a real SwiftUI segmented Picker (tinted with
  // the brand lime); the RN pill segment below is the fallback everywhere else.
  if (glass) {
    return <GlassSegment options={options} value={value} onPick={onPick} accent={palette.lime} />;
  }
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: palette.ink2,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: palette.line,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onPick(o.id)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 11,
              borderRadius: RADIUS.pill,
              backgroundColor: on ? palette.lime : "transparent",
            }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: on ? palette.onAccent : palette.ash }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AHeading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: F.black, fontSize: 30, color: palette.chalk, lineHeight: 36, letterSpacing: -0.5 }, style]}>
      {children}
    </Text>
  );
}

export function ASub({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  return (
    <Text style={[{ fontFamily: F.reg, fontSize: fs.note, color: palette.ash, lineHeight: 22 }, style]}>
      {children}
    </Text>
  );
}
