import { type ReactNode, useState } from "react";
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
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, F, serifIf, useEntrance } from "../../lib/ui";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";
import { GlassSurface, GlassSegment, LIQUID_GLASS_SUPPORTED } from "./swiftui";

/**
 * AURORA template UI kit (mobile). Soft, rounded primitives adapted from the
 * mobile Figma design — big corner radii, pill buttons, a floating-card feel —
 * but built on the HYBRID brand tokens (lime accent, ink surfaces, Archivo type)
 * via the shared theme palette, so the new look stays on-brand and theme-aware.
 */
export const RADIUS = { card: 28, field: 16, pill: 999 } as const;

/** Append an alpha byte to a `#RRGGBB` brand token → `#RRGGBBAA` (passthrough
 *  for anything that isn't a 6-digit hex). */
export function withAlpha(hex: string, alpha: number): string {
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
  const { palette, scheme } = useTheme();
  const fill = StyleSheet.absoluteFill;
  // KYOTO HOUR (light): the lime/violet/blue accent wash turns the warm paper
  // green/cold, so the calm theme gets warm, low-chroma washi tones with a
  // whisper of pine instead. Aurora (dark) keeps its accent glow. (Parity with
  // web's [data-theme=light] .lg-field retint.)
  const japandi = scheme === "light";
  const c1 = japandi ? "#e7e0cc" : palette.lime;
  const c2 = japandi ? "#e3dcc8" : palette.violet;
  const c3 = japandi ? "#d9ddd0" : palette.blue;
  return (
    <View pointerEvents="none" style={[fill, { overflow: "hidden" }]}>
      {/* warm sand / lime — bleeds from the top-left corner. */}
      <LinearGradient
        colors={[withAlpha(c1, japandi ? 0.5 : 0.14), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.9 }}
        style={fill}
      />
      {/* warm clay / violet — bleeds from the bottom-left. */}
      <LinearGradient
        colors={[withAlpha(c2, japandi ? 0.45 : 0.16), "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.9, y: 0.15 }}
        style={fill}
      />
      {/* warm stone / blue — a faint depth glow from the right edge. */}
      <LinearGradient
        colors={["transparent", withAlpha(c3, japandi ? 0.4 : 0.1)]}
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
  // 16dp side gutter — matches the web app-shell's mobile gutter (16px) so a
  // card fills the same share of the screen on both clients. Wider cards, less
  // dead space at the edges.
  padding = 16,
  refreshing,
  onRefresh,
  stickyTop,
  stickyTopReserve = 0,
  onScrollY,
  top,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Content rendered ABOVE the screen's own body, inside the same scroller —
   *  the slot Today's hub uses to hand a screen its profile header + tab pills
   *  when the screen is showing as one of Today's tabs rather than as its own
   *  destination. Unlike `stickyTop` this is ordinary content: it scrolls away
   *  with everything else, and it reserves no space when absent. */
  top?: ReactNode;
  /** A rail drawn OVER the scroll view at the screen's top edge — never in its
   *  content, so nothing below it moves as the rail appears. The overlay is
   *  laid out from this screen's border box, so it reaches up under the status
   *  bar and the rail itself pads its content down by the safe-area inset (the
   *  shape Today's pill rail already uses). Ignored when `scroll` is false. */
  stickyTop?: ReactNode;
  /** Space (dp) reserved at the top of the content for a `stickyTop` that is
   *  ALWAYS visible. A transient rail overlays — that's the point of it — but a
   *  permanent one would sit on the screen head and cover the back button, so
   *  those screens push their content down by the bar's height instead. */
  stickyTopReserve?: number;
  /** Live scroll offset, for a `stickyTop` that captures on scroll. Chained
   *  after the nav pill's own listener so the pill still hides on scroll. */
  onScrollY?: (y: number) => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  // Drives the floating nav's shrink-on-scroll (full at the top, compact once
  // scrolled) — spread onto the ScrollView so every AuroraScreen collapses it.
  const navScroll = useNavScrollProps();
  // Subtle entrance — content fades + rises on every screen ENTRY (push or tab
  // switch), so navigation feels like motion, not a hard cut. Re-runs on focus.
  // Shared hook (lib/ui) so this and Today can't drift, and so the JS-driver fix
  // for the Fabric blank-screen strand lives in exactly one place.
  const enterStyle = useEntrance();
  const body = scroll ? (
    <ScrollView
      // Clear the floating Aurora pill nav so the last content row never hides
      // under the bar — derived from the real bar height + safe-area inset (one
      // source of truth in lib/layout), not a hand-copied magic number.
      contentContainerStyle={{ padding, paddingTop: padding + stickyTopReserve, paddingBottom: auroraScrollClearance(insets.bottom), flexGrow: center ? 1 : undefined, justifyContent: center ? "center" : undefined }}
      {...navScroll}
      // The nav pill owns its own scroll listener; chain ours after it rather
      // than replacing it, so the pill still hides on scroll.
      onScroll={onScrollY ? (e) => { navScroll.onScroll?.(e); onScrollY(e.nativeEvent.contentOffset.y); } : navScroll.onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.lime} colors={[palette.lime]} /> : undefined}
    >
      {top}
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, justifyContent: center ? "center" : "flex-start" }}>{top}{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>
      <AuroraField />
      {/* Lift fields above the keyboard so low inputs / submit buttons (login,
          builder, check-in, nutrition…) aren't hidden when it opens. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>{body}</Animated.View>
      </KeyboardAvoidingView>
      {scroll ? stickyTop : null}
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
  const glass = LIQUID_GLASS_SUPPORTED;
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
  const glass = LIQUID_GLASS_SUPPORTED;
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
  const glass = LIQUID_GLASS_SUPPORTED;
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

/**
 * The one canonical screen-header BACK button — a 44×44 line-bordered square with
 * the `back` glyph. This is the single source of truth so every pushed sub-screen
 * gets an identical, labelled return control instead of the ad-hoc `‹`/`←`
 * variants screens used to hand-roll.
 *
 * Theme-aware surface: AURORA (dark) keeps the transparent OUTLINED square (the
 * treatment the web app uses); KYOTO HOUR (light) fills it as a SOFT SURFACE — an
 * ink2 tile with a touch of depth — because a hollow outline reads as unfinished
 * on the warm washi ground, where every other control is a floating card.
 *
 * Defaults to `router.back()`; pass `onPress` for in-screen back navigation
 * (e.g. a settings sub-page that pops its own state rather than the stack).
 */
export function ABack({ onPress, label, style }: { onPress?: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  const { palette, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const soft = scheme === "light";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t("common.back")}
      onPress={onPress ?? (() => router.back())}
      hitSlop={8}
      style={[
        { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
        soft && { backgroundColor: palette.ink2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
        style,
      ]}
    >
      <AuroraIcon name="back" size={20} color={palette.chalk} />
    </Pressable>
  );
}

export function AHeading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette, scheme } = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ fontFamily: serifIf(scheme, F.black), fontSize: 30, color: palette.chalk, lineHeight: 36, letterSpacing: -0.5 }, style]}>
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
