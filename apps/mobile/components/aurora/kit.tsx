import { type ReactNode, useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl, KeyboardAvoidingView, Platform, Animated, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, F, serifIf, useEntrance, HubDissolve, cardShadow, PressScale, PressScale as Pressable } from "../../lib/ui";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";
import { GlassSurface, GlassSegment, LIQUID_GLASS_SUPPORTED } from "./swiftui";
import { HeroScreen, type HeroSpec, type HeroScrollerFn } from "./hero";

/**
 * AURORA template UI kit (mobile). Soft, rounded primitives adapted from the
 * mobile Figma design — big corner radii, pill buttons, a floating-card feel —
 * but built on the HYBRID brand tokens (lime accent, ink surfaces, Archivo type)
 * via the shared theme palette, so the new look stays on-brand and theme-aware.
 */
export const RADIUS = { card: 28, field: 16, pill: 999 } as const;

export { AuroraField, withAlpha } from "./field";
import { AuroraField, withAlpha } from "./field";

export function AuroraScreen({
  children,
  hero,
  back,
  backLabel,
  accessory,
  rail,
  scroller,
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
  /** THE HERO. Give a screen a `hero` and AuroraScreen hands the whole shell to
   *  the HERO SYSTEM (components/aurora/hero.tsx): the system's rail at the
   *  system's y, the one nav button, the one title ramp, the one metadata
   *  voice, and a collapse track — instead of the screen hand-rolling a header
   *  row out of ABack + AHeading, which is how every screen used to invent its
   *  own. See reference/hero-system.md.
   *
   *  Screens with NO hero (a Today hub tab, the live logger's own shell) keep
   *  the plain scaffold below — a root tab has nothing to pop and no title to
   *  establish, so a rail there would be chrome for its own sake. */
  hero?: HeroSpec;
  /** What the nav button does. Defaults to `router.back()` — the same default
   *  the retired ABack had, so a pushed screen needs only a `hero`. Pass
   *  `false` on a ROOT screen: the rail renders with an empty leading slot, so
   *  the title's y is unchanged and nothing shifts between a root and a pushed
   *  screen. */
  back?: (() => void) | false;
  /** Names the ORIGIN, not the action ("Olympic Weightlifting", not "Back"). */
  backLabel?: string;
  /** The rail's trailing slot — one label or one control. */
  accessory?: ReactNode;
  /** A sub-rail that docks beneath the collapsed bar (a segmented control). */
  rail?: ReactNode;
  /** Render your own scroller (a FlatList) under the hero — see HeroScreen. */
  scroller?: HeroScrollerFn;
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
  // A hero means the HERO SYSTEM owns the shell — safe area, rail, collapse
  // track and scroll clearance all come from it. Dispatched before ANY hook
  // runs, so the two shells never share a hook order. (`top`/`stickyTop` belong
  // to the hub-tab shape, which by definition has no hero to establish, so the
  // two paths never need to compose.)
  if (hero) {
    return (
      <HeroScreen hero={hero} back={back} backLabel={backLabel} accessory={accessory} rail={rail} scroller={scroller} refreshing={refreshing} onRefresh={onRefresh} center={center} scroll={scroll}>
        {children}
      </HeroScreen>
    );
  }
  return (
    <AuroraPlainScreen scroll={scroll} center={center} padding={padding} refreshing={refreshing} onRefresh={onRefresh} stickyTop={stickyTop} stickyTopReserve={stickyTopReserve} onScrollY={onScrollY} top={top}>
      {children}
    </AuroraPlainScreen>
  );
}

/** The pre-hero shell — the Aurora field + safe area + scroller, with no screen
 *  head of its own. Still the right scaffold for the surfaces that genuinely
 *  have no hero: a Today hub tab (its chrome is Today's, handed down through
 *  `top`) and screens that own their own head. */
function AuroraPlainScreen({
  children,
  scroll = true,
  center = false,
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
  top?: ReactNode;
  stickyTop?: ReactNode;
  stickyTopReserve?: number;
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
  // AS A HUB TAB (`top` provided — Today handing over its header + pills): the
  // whole-screen entrance would replay over the chrome on every pill tap,
  // making the "stable" header jump. So the chrome renders plainly and only
  // the CONTENT below it dissolves in (lib/ui useHubDissolve — the flying lens
  // owns the motion; web twin is the data-nav-kind="hub" view transition).
  const hub = top != null;
  const inner = hub ? <HubDissolve active>{children}</HubDissolve> : children;
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
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, justifyContent: center ? "center" : "flex-start" }}>{top}{inner}</View>
  );
  const shell = (
    <>
      <AuroraField />
      {/* Lift fields above the keyboard so low inputs / submit buttons (login,
          builder, check-in, nutrition…) aren't hidden when it opens. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, hub ? null : enterStyle]}>{body}</Animated.View>
      </KeyboardAvoidingView>
      {scroll ? stickyTop : null}
    </>
  );
  // AS A HUB TAB the screen MOUNTS IN FULL VIEW on every pill switch, and a
  // freshly mounted native SafeAreaView applies its inset one frame late — the
  // chrome renders jammed under the status bar for a visible frame (caught
  // frame-by-frame in the first TestFlight build of the hub move). The
  // provider's insets are already measured, so padding with them is correct on
  // the very first render. Standalone screens keep the native SafeAreaView:
  // they mount behind a stack transition, where the lag is invisible, and the
  // native view tracks inset CHANGES (rotation) more tightly.
  return hub ? (
    <View style={{ flex: 1, backgroundColor: palette.ink, paddingTop: insets.top }}>{shell}</View>
  ) : (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink }} edges={["top"]}>{shell}</SafeAreaView>
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

export function ACard({ children, style, solid }: { children: ReactNode; style?: ViewStyle; solid?: boolean }) {
  const { palette, scheme } = useTheme();
  const glass = LIQUID_GLASS_SUPPORTED && !solid;
  // When Liquid Glass is active (iOS + toggle on) the surface is a native SwiftUI
  // layer dropped behind the content (transparent RN base so the glass refracts
  // the screen field); otherwise the solid ink2 card. The glass clips itself to
  // the same radius, so honour a caller-supplied borderRadius. `solid` opts a
  // card out of the glass even on iOS — for data-dense read surfaces (charts,
  // stat columns) where translucency costs contrast and the solid ink2 panel
  // (the web treatment, and Today's) reads better.
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
          // classic glass shadow), warm-toned on the light washi (cardShadow).
          ...cardShadow(scheme),
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
    <PressScale
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
    </PressScale>
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
