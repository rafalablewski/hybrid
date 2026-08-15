import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, PanResponder, Platform, Animated, Easing, type StyleProp, type ViewStyle, type TextStyle, type TextInputProps } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, leading, tracking, F, useEntrance, HubDissolve, cardShadow, PressScale, PressScale as Pressable, MAX_FONT_SCALE, FIXED_FONT_SCALE, HIT_TARGET, HIT_SLOP } from "../../lib/ui";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import { heroTitleType, springs, springToRN, durations, states, shakeOffsets, splitBoxStyle, statSubTone, DOCK_RAIL, dockChipOn, type DockChipRole, type AuroraIconName } from "@hybrid/core";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { haptic } from "../../lib/haptics";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "./swiftui";
import { LiquidSeg } from "./liquid-seg";
import { RollingNumber } from "./rolling-number";
import { HeroScreen, type HeroSpec, type HeroScrollerFn } from "./hero";

/**
 * AURORA template UI kit (mobile). Soft, rounded primitives adapted from the
 * mobile Figma design — big corner radii, pill buttons, a floating-card feel —
 * but built on the HYBRID brand tokens (lime accent, ink surfaces, Archivo type)
 * via the shared theme palette, so the new look stays on-brand and theme-aware.
 */
/**
 * The radius vocabulary. `inner` was a MAGIC NUMBER before it was a token: 12
 * is the second-most-used radius in the app (68 sites) and the one everything
 * nested inside a 28 card lands on — it just had no name, so it sat alongside
 * 10, 13, 14 and 15 doing the same job. `mark` is the chart-bar/tick radius,
 * which had been written as 1, 2, 3 and 4 interchangeably.
 *
 * Five rungs is the whole system. A radius that is not one of these is a
 * decision that needs a reason (the audit found 36 distinct values).
 */
export const RADIUS = { mark: 3, inner: 12, field: 16, card: 28, pill: 999 } as const;

/**
 * CONCENTRIC RADIUS — a nested corner that shares its parent's centre.
 *
 * iOS 26 made this a rule rather than a taste: a child inset by `pad` inside a
 * container of radius `parent` is only truly concentric at `parent - pad`. Draw
 * it at some other value and the two arcs run on different centres — which is
 * why a 12dp tile inside a 28dp card reads as pasted on rather than set in,
 * even though nobody can say why.
 *
 * It applies to a block INSET ON ALL SIDES by the padding — a panel inside a
 * card, a row group inside a sheet. It does NOT apply to a 40dp glyph tile that
 * happens to sit near an edge: that one is a mark, and marks take `RADIUS.inner`.
 * Clamped at `mark` so a deep pad can't hand back a negative or a hairline
 * corner that reads as a mistake.
 */
export const concentricRadius = (parent: number, pad: number): number =>
  Math.max(RADIUS.mark, Math.round(parent - pad));

/**
 * THE CARD'S INNER PADDING — one number for the whole app.
 *
 * ACard is built on it, and so is every full-width card a screen hand-rolls
 * because it needs a gradient, a border colour or a Pressable that ACard does
 * not take. A bleed out of one is written `-CARD_PAD` so it names the container
 * it is escaping (see apps/web/__tests__/screen-gutter.test.ts). The web twin
 * is `CARD_PAD` in apps/web/lib/ui.tsx and both read `space.xl`, so neither
 * client can move alone.
 *
 * Why it is a token and not a literal: it drifted twice. Today's feeling card,
 * done-floor host and week verdict were hand-rolled at 16 against Performance's
 * 20; the sweep for that then found History, Plans, Nutrition and Profile
 * carrying their own mixture — including two SIBLING cards, stacked, at 20 and
 * 16, and one component (History's swipe card, Plans' detail cards) inset
 * differently on web than on mobile.
 *
 * WHAT DOES NOT TAKE IT — the deliberate variants, so the next sweep does not
 * "fix" them: a rail item or grid tile (its own compact inset), a media card
 * whose image is flush and only the text block is padded, an icon-tile ROW
 * (`IconTile` + text + chevron, inset 16), a card whose interior is banded rows
 * that pad themselves, and a sheet (its own 20, a different container).
 */
export const CARD_PAD = space.xl;

/** The screen's side gutter, in dp — matches the web app-shell's mobile
 *  --page-pad-x (12px) so content fills the same share of the screen on both
 *  clients. Full-bleed rails bleed by exactly this (see the slider rule in
 *  CLAUDE.md); HERO.gutter.edge in core carries the same value for the hero
 *  system. Vertical rhythm is separate (AuroraScreen's `padding`, 16).
 *
 *  A SCREEN THAT OWNS ITS OWN SCROLLER MUST IMPORT THIS. AuroraScreen and the
 *  hero scaffold apply the gutter for you, so a screen that opts out of them
 *  (Today's hub — its custom entrance + pager; History and the feed — their
 *  own FlatList) is the one place the value can drift. It did: the 16 -> 12
 *  sweep moved every rail on Today to bleed 12 while Today's own ScrollView
 *  stayed at 16, leaving a 4dp sliver of gutter beside every cut card and
 *  shifting the hub chrome 4dp between Dashboard and Performance/Feed. Read
 *  the token, never a number. */
export const GUTTER = 12;

/**
 * The gap below a card that is one of a VERTICAL RUN.
 *
 * The retired `Card` baked this in as `marginBottom`, which is why the two card
 * families could not be stacked together — a component that owns spacing outside
 * its own box cannot be composed. Passing it explicitly puts the layout back
 * where it is read, and leaves one greppable marker for the eventual sweep to
 * `gap` on the parent, which is where it really belongs.
 */
export const cardStack: ViewStyle = { marginBottom: space.md };

export { AuroraField, withAlpha } from "./field";
import { AuroraField, withAlpha } from "./field";

export function AuroraScreen({
  children,
  hero,
  back,
  backLabel,
  accessory,
  rail,
  dock,
  scroller,
  scroll = true,
  center = false,
  // Vertical rhythm only — the side gutter is the kit's GUTTER (12dp), applied
  // below so the two never drift apart per-screen. `padding={0}` opts the shell
  // out of BOTH (for a screen whose own scroller owns the padding, e.g. the
  // feed's FlatList — the shell padding on top of it was the old double-inset
  // bug).
  padding = 16,
  refreshing,
  onRefresh,
  top,
  hubTab,
  scrollRef,
}: {
  /** Optional because a screen that hands its own list to `scroller` has no
   *  body left for the shell to render — the list IS the body. */
  children?: ReactNode;
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
  /** A CTA that surfaces above the tab bar as the hero finishes collapsing. */
  dock?: ReactNode;
  /** Render your own scroller (a FlatList) under the hero — see HeroScreen. */
  scroller?: HeroScrollerFn;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The shell's scroller, for a screen that must move it from outside its own
   *  render — the picker brings its field back under the thumb when the bar's
   *  detached circle is pressed. Plain path only: a `hero` screen's scroller is
   *  the hero system's, and that one has its own collapse track to respect. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Content rendered ABOVE the screen's own body, inside the same scroller —
   *  the slot Today's hub uses to hand a screen its profile header + tab pills
   *  when the screen is showing as one of Today's tabs rather than as its own
   *  destination. It is ordinary content: it scrolls away with everything
   *  else, and it reserves no space when absent. */
  top?: ReactNode;
  /** Force the hub-tab shell when a screen shows as one of Today's tabs but
   *  supplies no `top` of its own (the Feed tab renders that chrome itself).
   *  Defaults to `top != null`, the ordinary case.
   *
   *  It matters because a hub tab MOUNTS IN FULL VIEW on every pill switch, and
   *  a freshly mounted native SafeAreaView applies its inset one frame late —
   *  the chrome renders jammed under the status bar for a visible frame. The
   *  hub shell pads with the provider's already-measured insets instead. */
  hubTab?: boolean;
}) {
  // A hero means the HERO SYSTEM owns the shell — safe area, rail, collapse
  // track and scroll clearance all come from it. Dispatched before ANY hook
  // runs, so the two shells never share a hook order. (`top` belongs
  // to the hub-tab shape, which by definition has no hero to establish, so the
  // two paths never need to compose.)
  if (hero) {
    return (
      <HeroScreen hero={hero} back={back} backLabel={backLabel} accessory={accessory} rail={rail} dock={dock} scroller={scroller} refreshing={refreshing} onRefresh={onRefresh} center={center} scroll={scroll}>
        {children}
      </HeroScreen>
    );
  }
  return (
    <AuroraPlainScreen scroll={scroll} center={center} padding={padding} refreshing={refreshing} onRefresh={onRefresh} top={top} hubTab={hubTab} scrollRef={scrollRef}>
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
  top,
  hubTab,
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  top?: ReactNode;
  hubTab?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
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
  const hub = hubTab ?? top != null;
  const inner = hub ? <HubDissolve active>{children}</HubDissolve> : children;
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      // Clear the floating Aurora pill nav so the last content row never hides
      // under the bar — derived from the real bar height + safe-area inset (one
      // source of truth in lib/layout), not a hand-copied magic number.
      contentContainerStyle={{ padding, paddingHorizontal: padding ? GUTTER : 0, paddingBottom: auroraScrollClearance(insets.bottom), flexGrow: center ? 1 : undefined, justifyContent: center ? "center" : undefined }}
      {...navScroll}
      // The nav pill owns its own scroll listener; chain ours after it rather
      // than replacing it, so the pill still hides on scroll.
      onScroll={navScroll.onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.lime} colors={[palette.lime]} /> : undefined}
    >
      {top}
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, paddingHorizontal: padding ? GUTTER : 0, justifyContent: center ? "center" : "flex-start" }}>{top}{inner}</View>
  );
  const shell = (
    <>
      <AuroraField />
      {/* Lift fields above the keyboard so low inputs / submit buttons (login,
          builder, check-in, nutrition…) aren't hidden when it opens. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, hub ? null : enterStyle]}>{body}</Animated.View>
      </KeyboardAvoidingView>
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
  tickColors,
  children,
}: {
  value: number;
  size?: number;
  ticks?: number;
  color: string;
  track: string;
  /** One colour per tick. Turns the ring from a gauge of what's KEPT into an
   *  account of the whole 100 — a run of ticks per cause. Without it, the plain
   *  gauge every other caller still wants. Web's Ring takes the same prop. */
  tickColors?: string[];
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.round(size * 0.16);
  const tickW = Math.max(2, Math.round(size * 0.045));
  const count = tickColors?.length ?? ticks;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: "absolute", width: size, height: size, alignItems: "center", transform: [{ rotate: `${(i / count) * 360}deg` }] }}
        >
          <View style={{ width: tickW, height: tickLen, borderRadius: tickW, backgroundColor: tickColors ? tickColors[i] : i < lit ? color : track }} />
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

/**
 * THE CARD. One surface for the whole app.
 *
 * There used to be two: this, and a `Card` in lib/ui.tsx. They shared a radius
 * and a shadow and then disagreed on padding (20 vs 16), on whether the
 * component shipped its own outer margin (lib/ui's did, so the two could not be
 * stacked together), and — decisively — on MATERIAL: this one drops a native
 * SwiftUI glass surface on iOS and that one never could. Since
 * LIQUID_GLASS_SUPPORTED is simply `Platform.OS === "ios"` with no toggle, that
 * was a permanent split no user could reconcile: 234 cards across two materials,
 * decided by which file the developer happened to import from. Glass on Today,
 * Nutrition, Performance, Plans, Profile; solid on Session detail, Feed,
 * Discover, Coaches, Leaderboard and all 20 admin sections — so on an iOS 26
 * device the material changed when you tapped into a session.
 *
 * `accent` came across from the retired twin (admin uses it to group rows);
 * the outer margin did NOT — spacing belongs to the parent, and callers that
 * need a vertical run pass `cardStack`.
 */
export function ACard({ children, style, solid, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; solid?: boolean; accent?: string }) {
  const { palette } = useTheme();
  const glass = LIQUID_GLASS_SUPPORTED && !solid;
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  // When Liquid Glass is active (iOS + toggle on) the surface is a native SwiftUI
  // layer dropped behind the content (transparent RN base so the glass refracts
  // the screen field); otherwise the solid ink2 card. The glass clips itself to
  // the same radius, so honour a caller-supplied borderRadius. `solid` opts a
  // card out of the glass even on iOS — for data-dense read surfaces (charts,
  // stat columns) where translucency costs contrast and the solid ink2 panel
  // (the web treatment, and Today's) reads better.
  const radius = typeof flat?.borderRadius === "number" ? flat.borderRadius : RADIUS.card;
  return (
    <View
      style={[
        {
          backgroundColor: glass ? "transparent" : palette.ink2,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: RADIUS.card,
          padding: CARD_PAD,
          // A touch of depth — soft, low, lifted off the field (not the heavy
          // classic glass shadow).
          ...cardShadow(),
        },
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {glass && <GlassSurface radius={radius} />}
      {children}
    </View>
  );
}

/**
 * THE BUTTON'S VARIANTS.
 *
 * `outline` came across from lib/ui's retired `Button`, which was the other half
 * of this primitive: same job, different geometry (16 vs 18 vertical padding,
 * fs.note vs fs.subtitle) and a different API — it took a `color` and offered a
 * hairline ghost for destructive actions, which APill could not express, while
 * APill offered the `light` and glass-`soft` fills, which Button could not. Two
 * buttons that each did something the other couldn't is how you end up with
 * both. This is the union.
 */
type PillVariant = "primary" | "light" | "soft" | "outline";

export function APill({
  label,
  onPress,
  variant = "primary",
  color,
  disabled,
  style,
  state = "idle",
  savingLabel,
  savedLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  /** Overrides the accent. On a fill it paints the surface; on `outline` it
   *  tints the label and the hairline (a destructive action's red). */
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * THE COMMIT STATE (audit §17). A button that reports what happened to the
   * thing it committed, WITHOUT changing size while it does.
   *
   * That size is the whole reason this lives in the shared pill. Every save in
   * the app hand-rolled the same pattern — swap the label to "Adding…", drop
   * the opacity — and "Add meal" and "Adding…" are different widths, so the
   * button resized under a finger that was still on it. Here the idle label is
   * always laid out (invisibly) to HOLD the width, and the states cross-fade on
   * top of it. The pill cannot resize because its size is not a function of
   * which state it is in.
   *
   * `saved` holds a tick for `states.savedHoldMs` and knocks Success; `error`
   * shakes on core's `shakeOffsets` and knocks Error. Both are the caller's to
   * set and clear — the button reports, it does not decide.
   */
  state?: "idle" | "saving" | "saved" | "error";
  /** Word for the in-flight state. Defaults to the idle label: the pill is
   *  already dimmed and non-interactive, so a caller with nothing better to say
   *  should not be forced to invent "Saving…". */
  savingLabel?: string;
  /** Word for the landed state, beside the tick. */
  savedLabel?: string;
}) {
  const { palette } = useTheme();
  const glass = LIQUID_GLASS_SUPPORTED;
  // The bright primary/light fills stay on brand on every client. The neutral
  // `soft` pill becomes a native Liquid Glass surface when active (iOS): a
  // transparent RN base + GlassSurface behind the label; ink2 otherwise.
  const glassSoft = variant === "soft" && glass;
  const outline = variant === "outline";
  const bg = outline
    ? "transparent"
    : variant === "primary"
      ? color ?? palette.lime
      : variant === "light"
        ? palette.chalk
        : glassSoft
          ? "transparent"
          : palette.ink2;
  const restFg = outline
    ? color
      ? txt(palette, color)
      : palette.ash
    : variant === "soft"
      ? palette.chalk
      : palette.onAccent;
  // A FAILED commit is drawn as a filled red pill whatever the variant was.
  // Painting red under an outline pill's own foreground would have left ash on
  // red — the failure state is the one place the label must not get quieter.
  const fg = state === "error" ? palette.onAccent : restFg;

  // ── the commit state ──────────────────────────────────────────────────
  const reduced = useReducedMotion();
  const shake = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;   // 0 = idle, 1 = reporting
  const busy = state === "saving";
  const reporting = state !== "idle";

  useEffect(() => {
    Animated.timing(fade, {
      toValue: reporting ? 1 : 0,
      duration: durations.dissolve,
      useNativeDriver: true,
    }).start();
  }, [reporting, fade]);

  useEffect(() => {
    if (state !== "error") return;
    haptic.error();
    // Reduce Motion drops the TRAVEL, not the report — the knock and the
    // colour still land, so the failure is never silent.
    if (reduced) return;
    const offsets = shakeOffsets();
    Animated.sequence(
      offsets.map((to) =>
        Animated.timing(shake, {
          toValue: to,
          duration: states.shakeMs / offsets.length,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [state, shake, reduced]);

  useEffect(() => {
    if (state === "saved") haptic.success();
  }, [state]);

  const stateLabel = state === "saving" ? (savingLabel ?? label) : state === "saved" ? (savedLabel ?? label) : label;

  // The caller's style is SPLIT (core `splitBoxStyle`): how-I-sit-in-my-parent
  // goes on the shake wrapper, which is the node the caller's row actually
  // sees; what-I-look-like stays on the pill. Without this the wrapper swallows
  // `flex: 1` — 11 callers pass it — and the button quietly stops stretching.
  const { outer, inner } = splitBoxStyle(StyleSheet.flatten(style) as Record<string, unknown>);
  return (
    <Animated.View style={[{ transform: [{ translateX: shake }] }, outer as StyleProp<ViewStyle>]}>
    <PressScale
      onPress={onPress}
      // A button mid-commit must not accept a second one. This is the gate the
      // hand-rolled copies each remembered separately (`disabled={saving}`).
      disabled={disabled || busy}
      // APill is the app's primary action and was the ONE button primitive with
      // no accessibility contract — VoiceOver announced it as a plain view with
      // no role and no disabled state, while lib/ui's Button next to it was
      // fully labelled. The merge keeps the labelled behaviour.
      accessibilityRole="button"
      accessibilityLabel={stateLabel}
      // `busy` is what VoiceOver announces for an in-flight action. Without it
      // a saving button reads as an ordinary enabled one that simply ignores
      // you.
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      style={[
        {
          backgroundColor: state === "error" ? palette.red : bg,
          borderRadius: RADIUS.pill,
          paddingVertical: 18,
          // Was absent, because APill was only ever stretched by its parent.
          // Button's inline callers need it, and on a full-width pill it just
          // insets a label that is centred anyway.
          paddingHorizontal: space.xxl,
          alignItems: "center",
          justifyContent: "center",
          minHeight: HIT_TARGET,
          opacity: disabled ? 0.5 : 1,
          borderWidth: variant === "soft" || outline ? 1 : 0,
          borderColor: outline && color ? withAlpha(color, 0.45) : palette.line,
          overflow: "hidden",
          // Fill the wrapper, whatever the wrapper turned out to be. A no-op
          // when it is content-sized, which is the common case.
          alignSelf: "stretch",
        },
        inner as StyleProp<ViewStyle>,
      ]}
    >
      {glassSoft && <GlassSurface radius={RADIUS.pill} />}
      {/* THE WIDTH-HOLDER. The idle label is always laid out, and only its
          opacity changes — so the pill's size is a function of its LABEL and
          never of its state. This is the layout shift the audit names: a
          button that grows or shrinks under a finger still resting on it. */}
      <Animated.Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: fg, opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}
      >
        {label}
      </Animated.Text>
      {/* The reporting states sit ON TOP, centred in the space the label
          already claimed. `pointerEvents none` so they never eat the press. */}
      {reporting && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: fade,
          }}
        >
          {state === "saving" && <ActivityIndicator size="small" color={fg} />}
          {state === "saved" && <AuroraIcon name="check" size={17} color={fg} />}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: fg }}>
            {stateLabel}
          </Text>
        </Animated.View>
      )}
    </PressScale>
    </Animated.View>
  );
}

/**
 * THE SELECTABLE CHIP — a filter, a segment of a scrolling row, a toggleable
 * facet. The interactive half of the pair whose other half is `Chip` in
 * lib/ui.tsx (the static tag). If it responds to a tap it is this, and it owes
 * the user a 44dp target.
 *
 * That target is why this exists as a component rather than a convention. The
 * audit measured five of these across five screens at ~25–31dp tall, built from
 * three different horizontal paddings (10 / 12 / 16), four vertical ones
 * (3 / 6 / 7 / 8) and three type sizes (11 / 12 / 13) — every one of them under
 * the HIG minimum, and several of them filters on data-dense screens used while
 * moving. Padding alone could not fix it: a chip's visual height is set by its
 * label, so the floor has to be declared.
 *
 * The selected state carries BOTH a tinted fill and a coloured border, never
 * colour alone — selection that is signalled only by hue fails WCAG 1.4.1, and
 * `accessibilityState.selected` carries it to VoiceOver besides.
 */
export function AChip({
  label,
  selected,
  onPress,
  accent,
  count,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Overrides the accent for a facet that owns a hue (a squad's colour). */
  accent?: string;
  /** A trailing tally, rendered inside the same pill ("Following 12"). */
  count?: number;
}) {
  const { palette } = useTheme();
  const tint = txt(palette, accent ?? palette.lime) ?? palette.lime;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label} ${count}` : label}
      accessibilityState={{ selected: !!selected }}
      style={{
        minHeight: HIT_TARGET,
        justifyContent: "center",
        paddingHorizontal: space.lg,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: selected ? tint : palette.line,
        backgroundColor: selected ? withAlpha(tint, 0.16) : "transparent",
      }}
    >
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: F.bold, fontSize: fs.body, color: selected ? tint : palette.ash }}
      >
        {label}
        {count != null ? `  ${count}` : ""}
      </Text>
    </PressScale>
  );
}

/* ── the dock rail ───────────────────────────────────────────────────────── */

/**
 * THE DOCK RAIL — the strip of chips that docks beneath the collapsed hero.
 *
 * The exact twin of apps/web/components/aurora/dock-rail.tsx. Both clients
 * import every number from packages/core/src/dock-rail.ts, which also carries
 * the diagnosis this replaces: the rail was authored four separate times
 * (History web, History mobile, Plans web, Plans mobile) and twelve properties
 * were decided independently in each. Design sheet:
 * reference/dock-rail-design.html.
 *
 * NOT `AChip`, which mobile History used to borrow. AChip is an IN-CONTENT
 * filter — it lives in the content column, in the content face (Archivo bold),
 * and 37 other call sites want it exactly as it is. A rail is CHROME: it sits
 * in the same band as the hero's eyebrow, meta line and accessory, all of which
 * speak the app's mono voice. Borrowing the content chip for the rail is why
 * mobile History drew Archivo 13 while all three other rails drew mono 12.
 *
 * FULL-BLEED is the rail's own job, per the house rule: the scaffolds' rail
 * slots reach the true screen edge and add NO padding, and this supplies the
 * gutter back so resting chips align with the content column. `gutter` is a
 * prop because the two scaffolds do not agree on one — AuroraScreen/HeroScreen
 * pad at GUTTER (12) and the cover scaffold pads its children at 16, and a chip
 * must line up with the column it is sitting above, not with a constant.
 */
export function DockRail({ label, gutter = GUTTER, children }: { label: string; gutter?: number; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Labelled, but deliberately NOT a tablist on either role: the mode chips
      // switch a rendered layout rather than tab panels, and the anchors are
      // buttons that scroll. Both are already buttons carrying their own state.
      accessibilityLabel={label}
      contentContainerStyle={{ gap: DOCK_RAIL.gap, paddingHorizontal: gutter, paddingVertical: DOCK_RAIL.padY }}
    >
      {children}
    </ScrollView>
  );
}

/**
 * One chip in the rail.
 *
 * THE ROLE is the one difference the two rails are allowed to have: a `mode`
 * chip SELECTS (one always on, the panel below changes) and wears the accent
 * tint; an `anchor` chip JUMPS to a section and can never light up, because a
 * jump chip claiming a selection it does not have is a lie about what pressing
 * it did. `dockChipOn` enforces that in core rather than here, so no call site
 * can reintroduce it by passing the wrong prop.
 *
 * The selected state carries a tinted fill, a coloured border AND a coloured
 * label — never hue alone (WCAG 1.4.1) — plus `accessibilityState.selected`.
 */
export function DockChip({
  role,
  label,
  selected,
  onPress,
}: {
  role: DockChipRole;
  label: string;
  /** Ignored for `anchor` — see dockChipOn. */
  selected?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const on = dockChipOn(role, selected);
  const accent = txt(palette, palette.lime) ?? palette.lime;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Only a mode chip has a selection to report. Announcing `selected: false`
      // on an anchor would tell VoiceOver there is a selection here to be had.
      accessibilityState={role === "mode" ? { selected: on } : undefined}
      style={{
        minHeight: DOCK_RAIL.chip.hit,
        justifyContent: "center",
        paddingHorizontal: DOCK_RAIL.chip.padX,
        borderRadius: DOCK_RAIL.chip.radius,
        borderWidth: 1,
        borderColor: on ? accent : palette.line,
        backgroundColor: on ? withAlpha(accent, DOCK_RAIL.tint) : "transparent",
      }}
    >
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        // CONSTANT weight across states — web used to go 400 -> 700 on select,
        // which widened the chip and reflowed every chip after it mid-tap.
        style={{ fontFamily: F.mono, fontSize: DOCK_RAIL.chip.size, letterSpacing: DOCK_RAIL.chip.tracking, color: on ? accent : palette.ash }}
      >
        {label}
      </Text>
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
  autoFocus,
  autoCorrect,
  onClear,
  onSubmit,
  returnKey,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address";
  /** Optional leading icon (e.g. mail/lock); secure fields also show an eye. */
  icon?: AuroraIconName;
  autoFocus?: boolean;
  autoCorrect?: boolean;
  /** Renders a trailing clear affordance. Pass only when there is something to
   *  clear, so the control does not offer a dead button on an empty field. */
  onClear?: () => void;
  /** What the keyboard's return key DOES. A search field whose return key
   *  dismisses without acting is a wasted key: the athlete has already told you
   *  what they want by typing it. */
  onSubmit?: () => void;
  returnKey?: TextInputProps["returnKeyType"];
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
        autoFocus={autoFocus}
        autoCorrect={autoCorrect}
        autoCapitalize="none"
        onSubmitEditing={onSubmit}
        returnKeyType={returnKey}
        style={{ flex: 1, fontFamily: F.reg, fontSize: fs.note, color: palette.chalk, paddingVertical: 17 }}
      />
      {onClear && (
        <Pressable onPress={onClear} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Clear">
          <AuroraIcon name="add" size={18} color={palette.ash} style={{ transform: [{ rotate: "45deg" }] }} />
        </Pressable>
      )}
      {secure && (
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}>
          <AuroraIcon name="eye" size={20} color={visible ? palette.lime : palette.ash} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * THE SEARCH FIELD.
 *
 * Thirteen screens had one and none of them shared it: vertical padding 0 / 12 /
 * 16, size fs.body / fs.bodyLg / fs.subtitle / a raw 15, some inside their own
 * bordered row and some drawing one, one of them set in the MONO face. Not one
 * of the thirteen had a clear button — the affordance an iOS user reaches for
 * without looking, and the only one that matters when a query returns nothing.
 *
 * Built on AField so the field chrome (surface, hairline, radius, focus, the
 * placeholder-as-accessibility-label) has exactly one definition.
 */
export function ASearch({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** Return-key action — typically "take the first result". */
  onSubmit?: () => void;
}) {
  return (
    <AField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      icon="search"
      autoFocus={autoFocus}
      autoCorrect={false}
      onClear={value ? () => onChange("") : undefined}
      onSubmit={onSubmit}
      returnKey={onSubmit ? "go" : undefined}
    />
  );
}

/**
 * THE SEGMENTED CONTROL — one entry point, ONE rendering, no second.
 *
 * `ASegment` is `LiquidSeg`: the gesture-tracked lens that inflates under
 * touch, scrubs across segments as you drag and lands on the shared
 * `springs.lens`. Every platform, no fork.
 *
 * It used to dispatch — a real SwiftUI segmented `Picker` on iOS, this
 * everywhere else. That branch is deleted, and swiftui.tsx (where GlassSegment
 * was) documents why in full: the native host sized itself from the SwiftUI
 * content ONCE at mount, before the labels were translated, so on device the
 * control drew outside its own box and over the content next to it.
 *
 * The audit counted eight segmented implementations; two of them (the admin
 * `Segmented` and History's `ViewSwitcher`) turned out on reading to be
 * WRAPPING and SCROLLING chip rails rather than segmented controls at all, and
 * became `AChip` rows. What is left is this and the LiquidSeg it delegates to.
 */
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
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <LiquidSeg
      items={options.map((o) => ({
        key: o.id,
        label: o.label,
        render: (on: boolean) => (
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.bold, fontSize: fs.body, color: on ? palette.chalk : palette.ash }}
          >
            {o.label}
          </Text>
        ),
      }))}
      index={index}
      onSelect={(i) => onPick(options[i]!.id)}
      // 44 so the segment clears the HIG target; the track's own padding puts
      // the control at 52, which is what a segmented control should be.
      segHeight={HIT_TARGET}
      trackStyle={{ backgroundColor: palette.ink2, borderWidth: 1, borderColor: palette.line }}
    />
  );
}

/**
 * The heading for a screen that owns no hero.
 *
 * It used to be 30/36/-0.5 — a size on neither the type ladder nor the HERO
 * SYSTEM's own title ramp, so a screen with an AHeading and a screen at
 * HeroRank `title` presented their names at different sizes for no reason. It
 * now reads the SAME rung the hero does (`fs.display`, via TITLE_BASE.title in
 * packages/core/src/hero.ts), so the two heads are one head at rest.
 *
 * This is a stopgap, not a destination: a screen with a title to establish
 * should take a `hero` and let the Hero System own its rail, collapse and
 * metadata. AHeading exists for the surfaces that genuinely have no stack.
 */
/**
 * THE SECTION HEAD — the one cluster label, to the standard CLAUDE.md already
 * names: a bold DISPLAY-face title in chalk, with any meta or action as small
 * mono uppercase on the RIGHT of the same row, and never a decorative marker on
 * the left.
 *
 * The standard was documented and then reimplemented eight times — SHead,
 * SecHead, SubHead, RailHead, SectionHead, SectionHeader, SectionLabel ×2 —
 * each agreeing on the SHAPE and disagreeing on everything measurable: title 18
 * vs fs.bodyLg vs fs.title vs fs.note, serif-swapped or not, meta at nano vs
 * micro, tracking 0.9 vs 1.2, top margin 6 / 16 / 24 / 28. A standard that lives
 * in prose gets re-derived; a standard that lives in a component gets used.
 *
 * `action` makes the meta a button — a head-level CONTROL (a filter, a state
 * toggle), never a rail's "see all", which lives in the tail.
 */
/**
 * THE METER — a labelled horizontal proportion. One row: a name on the left, its
 * value on the right, and a track beneath with the filled share.
 *
 * The audit counted thirteen "bar/meter implementations", and reading them
 * split the number three ways. FIVE were this: MeterRow, MeterRows, BarRow ×2
 * and MuscleBar, agreeing on the idea and disagreeing on the track (3 / 7 / 8dp
 * tall, radius 2 vs 4), on where the value sits, and on whether the label is
 * mono or sans. THREE were vertical COLUMN charts, which is a different object.
 * The remaining five were not bars at all — a rail container, a face feature, a
 * sized rectangle helper and an animated share-card fill — and have been renamed
 * for what they are.
 *
 * The track is `RADIUS.mark`-rounded and 6dp: tall enough to read a small
 * proportion, short enough not to become a chart.
 */
export function AMeter({
  label,
  value,
  pct,
  color,
  emphasis,
}: {
  label?: string;
  /** The right-hand readout — already formatted ("128 kg", "62%"). */
  value?: string;
  /** 0–100. Clamped, and a non-zero share always draws at least a sliver, so
   *  "a little" never renders as "none". */
  pct: number;
  color?: string;
  /** Lifts the label to the bold face — the "primary mover" treatment. */
  emphasis?: boolean;
}) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const fill = color ?? palette.lime;
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped > 0 ? Math.max(2, clamped) : 0;

  /**
   * THE FILL TRAVELS to its new share instead of being redrawn at it — the
   * meter's half of what `RollingNumber` does for the figure beside it.
   *
   * It matters most where the two sit together: the nutrition hero states the
   * remaining energy as a figure AND as this track, and the figure already
   * rolled while the track jump-cut, so one object moved and its twin blinked.
   * They now travel on the SAME timing — `durations.collapse` with the same
   * ease-out — so a logged food reads as one event.
   *
   * TIMING, NOT A SPRING, for the reason RollCell gives: a spring overshoots,
   * and a bar that overshoots its value is briefly REPORTING A NUMBER THAT IS
   * NOT TRUE. Springs are for objects travelling; this is a quantity arriving.
   *
   * It does not animate on mount. A screen whose every meter grows from zero on
   * arrival is a screen animating its own layout rather than a change, and it
   * would replay on every remount — the same discipline RollingNumber applies
   * when it has no previous value to roll from. Reduce Motion sets the width
   * outright: there is no position to cross-dissolve in a width.
   */
  const w = useRef(new Animated.Value(width)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; w.setValue(width); return; }
    if (reduced) { w.setValue(width); return; }
    Animated.timing(w, {
      toValue: width,
      duration: durations.collapse,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // a width is a layout prop
    }).start();
  }, [w, width, reduced]);

  return (
    <View style={{ marginTop: space.ms }}>
      {(label || value) && (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: space.xxs }}>
          {label ? (
            <Text
              maxFontSizeMultiplier={FIXED_FONT_SCALE}
              numberOfLines={1}
              style={{ flex: 1, fontFamily: emphasis ? F.bold : F.semi, fontSize: fs.caption, color: emphasis ? palette.chalk : palette.ash }}
            >
              {label}
            </Text>
          ) : null}
          {value ? (
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.ash }}>
              {value}
            </Text>
          ) : null}
        </View>
      )}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
        accessibilityLabel={label}
        style={{ height: 6, borderRadius: RADIUS.mark, backgroundColor: palette.line, overflow: "hidden" }}
      >
        <Animated.View
          style={{
            width: w.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            height: "100%", borderRadius: RADIUS.mark, backgroundColor: fill,
          }}
        />
      </View>
    </View>
  );
}

export function ASection({
  title,
  meta,
  action,
  titleStyle,
  style,
}: {
  title: string;
  /** Small mono uppercase, right-aligned on the title's row. A NODE is allowed
   *  (a chip, an icon + count) — the meta slot is a slot, not a string field. */
  meta?: ReactNode;
  /** Makes the meta tappable. NOT for a rail's "see all": a rail's exit lives
   *  at the END OF THE RAIL as a tail card (aurora/rail-tail.tsx), where the
   *  thumb already is once the cards run out. This is for a head-level CONTROL
   *  (a filter, a state toggle) or a meta that genuinely opens something the
   *  section itself isn't a preview of. */
  action?: () => void;
  /** The ONE escape hatch, for a head that genuinely needs a different title
   *  treatment (a state colour, a smaller rung inside a card). Deliberately one
   *  prop rather than the `titleColor` + `small` pair it replaces: a section
   *  head that wants to look different should have to say so explicitly. */
  titleStyle?: TextStyle;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const metaText =
    meta == null ? null : typeof meta === "string" ? (
      <Text
        maxFontSizeMultiplier={FIXED_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.label, color: palette.ash }}
      >
        {meta}
      </Text>
    ) : (
      meta
    );
  return (
    <View style={[{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginTop: space.xxl, marginBottom: space.ms }, style]}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[{ fontFamily: F.black, fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: palette.chalk, flexShrink: 1 }, titleStyle]}
      >
        {title}
      </Text>
      {action && metaText ? (
        <PressScale onPress={action} accessibilityRole="button" accessibilityLabel={typeof meta === "string" ? meta : title} hitSlop={HIT_SLOP}>
          {metaText}
        </PressScale>
      ) : (
        metaText
      )}
    </View>
  );
}

export function AHeading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  const type = heroTitleType(typeof children === "string" ? children : "", "title");
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[{ fontFamily: F.black, fontSize: type.size, color: palette.chalk, lineHeight: type.lineHeight, letterSpacing: tracking.display }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * THE STAT TILE — a mono label over one big figure, with an optional sub-line.
 *
 * The mobile twin of web's `Stat` (lib/ui.tsx), and it exists for the same
 * reason web's does: this anatomy is drawn on screen after screen, and every
 * hand-drawn copy is a chance for the type to drift. Web has had one component
 * for thirty-one tiles; mobile drew each by hand, so when the figures were
 * taught to ROLL (motion-audit-followups) web's thirty-one all rolled at once
 * and mobile's kept swapping. That was a real parity break — the audit named it
 * as one of only two items not fixed everywhere — and it could not be closed by
 * a sweep, because there was nothing to sweep ONTO. This is that thing.
 *
 * A FIGURE rolls to its new value; anything else renders as given. `value` is a
 * ReactNode because a few callers compose a unit or an icon into it, and
 * rolling an arbitrary tree would be nonsense — the same rule web's takes, so
 * the two clients agree about which figures move.
 *
 * `solid` passes through to ACard: a column of stats is a data-dense read
 * surface, and ACard's own note says translucency costs contrast there.
 */
export function AStat({
  label,
  value,
  sub,
  c,
  solid,
  style,
}: {
  label: string;
  /** A string/number ROLLS; a composed node renders verbatim. */
  value: ReactNode;
  /** Small line under the figure. A leading − or ↓ reads as a loss (red). */
  sub?: string;
  /** Figure colour. Defaults to chalk — pass an accent only when the figure
   *  itself carries state, never for decoration. */
  c?: string;
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  // ONLY a sign-led sub carries a tone (core `statSubTone`) — a caption, a
  // date or a denominator is neutral, not a win.
  const tone = statSubTone(sub);
  return (
    <ACard solid={solid} style={style}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: palette.ash }}
      >
        {label}
      </Text>
      <View style={{ marginTop: 6, marginBottom: 2, flexDirection: "row" }}>
        {typeof value === "string" || typeof value === "number" ? (
          <RollingNumber
            value={String(value)}
            style={{ fontFamily: F.black, fontSize: fs.hero, color: txt(palette, c ?? palette.chalk), lineHeight: leading(fs.hero, "tight") }}
          />
        ) : (
          value
        )}
      </View>
      {sub ? (
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.mono, fontSize: fs.caption, color: tone === "flat" ? palette.ash : txt(palette, tone === "down" ? palette.red : palette.lime) }}
        >
          {sub}
        </Text>
      ) : null}
    </ACard>
  );
}

/**
 * THE STEPPER — −/＋ around a figure that ROLLS to its new value.
 *
 * The audit's §13 table singles this control out, and it is right to: this is a
 * training app, so a number changing IS the content. A weight going 80 → 82.5,
 * a block going week 3 → 4. Every stepper in the app swapped the old string for
 * the new one in a single frame and buzzed at nothing, which is the one place
 * where the app's own `RollingNumber` was most obviously missing.
 *
 * It is a shared component because there were two hand-rolled ones (the volume
 * model's and the velocity screen's) that agreed on neither their geometry nor
 * their behaviour — the same drift the rail tails and the drag lifts had.
 *
 * `haptic.selection()` per step, never `light`: a stepper is movement through
 * DISCRETE VALUES, which is what selection feedback is for (see lib/haptics).
 * It fires only when the value actually changes, so holding ＋ at the maximum
 * ticks once and then goes quiet rather than buzzing against the clamp.
 */
export function AStepper({
  label,
  a11y,
  value,
  format,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  tone = "row",
}: {
  /** Row label. Omit for a bare −/figure/＋ cluster with no leading text. */
  label?: string;
  /** What the −/＋ buttons ANNOUNCE, when the control's name is already on
   *  screen as a kicker and printing it again inside the row would duplicate
   *  it. Without this a label-less stepper reads out as "minus", "plus". */
  a11y?: string;
  value: number;
  /** How the figure reads. Defaults to the plain number; pass this for a
   *  decimal or a unit that belongs INSIDE the rolling figure. */
  format?: (v: number) => string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Static unit printed beside the figure — it never rolls, because it is
   *  prose rather than part of the value. */
  suffix?: string;
  /** TWO RUNGS, not a free size. `row` is a settings line (mono, beside a
   *  label); `hero` is a screen's primary control, where the figure is the
   *  thing you came to set. Two named rungs is a vocabulary — a `size` number
   *  would be how the two hand-rolled steppers diverged in the first place. */
  tone?: "row" | "hero";
}) {
  const { palette: C } = useTheme();
  const hero = tone === "hero";
  const at = (next: number) => {
    // Round to the step's own precision: 0.05 steps otherwise accumulate
    // float error and the figure starts reading 0.7500000000000001.
    const dp = String(step).split(".")[1]?.length ?? 0;
    const v = Math.min(max, Math.max(min, Number(next.toFixed(dp))));
    // No tick for a step that does nothing. This is reachable only if a value
    // arrives off the step grid; at the limits the button is DISABLED, which is
    // what UIStepper does and what `accessibilityState` should say, so there is
    // no press to answer there. (An earlier cut fired `haptic.rigid()` here for
    // §15's "value clamped at max" — unreachable behind the same `disabled`,
    // and dead code claiming a behaviour is worse than no code. Rigid's live
    // home is the swipe row's rubber-band limit, where the drag does continue
    // past the stop.)
    if (v === value) return;
    haptic.selection();
    onChange(v);
  };
  const btn = {
    width: HIT_TARGET, height: HIT_TARGET - (hero ? 0 : 6), borderRadius: RADIUS.inner,
    // Neutral, never lime. The velocity screen's copy tinted its −/＋ with the
    // accent, but a stepper does not GO anywhere — it is the same reasoning
    // that keeps an expander's count in ash (see the exit-affordance rule).
    borderWidth: 1, borderColor: C.line, backgroundColor: C.ink,
    alignItems: "center" as const, justifyContent: "center" as const,
  };
  const glyph = { fontFamily: F.mono, fontSize: hero ? fs.subtitle : fs.bodyLg, color: C.chalk };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {label ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => at(value - step)}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel={`${a11y ?? label ?? ""} −`.trim()}
        style={[btn, value <= min && { opacity: 0.4 }]}
      >
        <Text style={glyph}>−</Text>
      </Pressable>
      {/* Centred and min-width so the row does not shuffle as the figure
          gains or loses a column mid-roll. */}
      <View style={{ minWidth: hero ? 108 : 62, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
        <RollingNumber
          value={(format ?? String)(value)}
          align="center"
          style={hero
            ? { fontFamily: F.black, fontSize: fs.title, color: C.chalk }
            : { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}
        />
        {suffix ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: hero ? fs.body : fs.caption, color: C.ash }}>{suffix}</Text> : null}
      </View>
      <Pressable
        onPress={() => at(value + step)}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={`${a11y ?? label ?? ""} ＋`.trim()}
        style={[btn, value >= max && { opacity: 0.4 }]}
      >
        <Text style={glyph}>+</Text>
      </Pressable>
    </View>
  );
}

/** How far the finger travels for ONE step of a scrub field, in dp. Small
 *  enough that 10 → 30 minutes is a comfortable thumb-flick, large enough that
 *  a value can be landed on exactly. */
const SCRUB_TRAVEL = 14;

/**
 * THE SCRUB FIELD — the figure IS the control.
 *
 * `AStepper` answers "nudge this by one rung"; this answers "set this", where
 * the value is the thing you came to the screen for and the label above it
 * would only be repeating the unit printed beside it. The figure takes the
 * screen's big display size, and a horizontal drag ACROSS it walks the value —
 * so the same control is coarse (one flick covers the whole plausible range)
 * and fine (the −/＋ land an exact number) without being two controls.
 *
 * It exists because the alternative kept being TWO controls. Heat's log sheet
 * drew a preset row AND a stepper for each of its two numbers: four rows, 98dp
 * per value, and nothing to say which was authoritative — plus a segmented
 * control that could hold no state at all once the stepper moved the value off
 * the preset grid. A segmented control must always have a selection; a value
 * that is continuous is not a segmented control's job.
 *
 * ONE TICK PER DETENT, never per frame — the audit's slider rule, applied to a
 * gesture with no thumb (see `useChartScrub`'s pinch, which reads the same
 * way). The drag re-bases on GRANT rather than tracking absolute position, so a
 * slow drag accumulates no rounding error.
 *
 * THE −/＋ ARE BARE. No border, no fill: the figure beside them is already the
 * affordance, and a box drawn around a glyph that sits next to a 34dp number is
 * chrome competing with the content. They keep the full 44dp target (the
 * drawing shrinks, the target does not) and they carry `adjustable` to
 * VoiceOver, which is the one thing a hand-drawn ± normally loses against the
 * platform's own stepper.
 */
export function AScrubField({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  suffix,
  a11y,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** How the figure reads. Defaults to the plain number. */
  format?: (v: number) => string;
  /** Static unit beside the figure — prose, so it never rolls. */
  suffix?: string;
  /** The accessible name. The row prints only the value, so without this the
   *  control reads out as a bare number. */
  a11y: string;
}) {
  const { palette: C } = useTheme();
  const show = (format ?? String)(value);

  // Read through refs so the responder is built ONCE: rebuilding it per value
  // would drop the gesture mid-drag.
  const vRef = useRef(value);
  vRef.current = value;
  const cfg = useRef({ min, max, step });
  cfg.current = { min, max, step };
  const cb = useRef(onChange);
  cb.current = onChange;
  const from = useRef(value);

  const commit = (next: number) => {
    const { min: lo, max: hi, step: by } = cfg.current;
    const dp = String(by).split(".")[1]?.length ?? 0;
    const v = Math.min(hi, Math.max(lo, Number(next.toFixed(dp))));
    if (v === vRef.current) return;
    haptic.selection();
    cb.current(v);
  };

  const pan = useRef(
    PanResponder.create({
      // HORIZONTAL only, and only on a clear one: a vertical drag belongs to
      // the sheet or the scroller this field is sitting in.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderGrant: () => { from.current = vRef.current; },
      onPanResponderMove: (_, g) => {
        commit(from.current + Math.round(g.dx / SCRUB_TRAVEL) * cfg.current.step);
      },
    }),
  ).current;

  const btn = { width: HIT_TARGET, height: HIT_TARGET, alignItems: "center" as const, justifyContent: "center" as const };
  const glyph = { fontFamily: F.mono, fontSize: fs.title, color: C.ash };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={a11y}
        accessibilityValue={{ text: `${show}${suffix ? ` ${suffix}` : ""}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => commit(value + (e.nativeEvent.actionName === "increment" ? step : -step))}
        style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: space.xs, paddingVertical: space.sm }}
      >
        <RollingNumber
          value={show}
          style={{ fontFamily: F.black, fontSize: fs.hero, color: C.chalk, lineHeight: leading(fs.hero, "tight"), letterSpacing: tracking.display }}
        />
        {suffix ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>
            {suffix}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Pressable
          onPress={() => commit(value - step)}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`${a11y} −`}
          style={[btn, value <= min && { opacity: 0.35 }]}
        >
          <Text style={glyph}>−</Text>
        </Pressable>
        <Pressable
          onPress={() => commit(value + step)}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`${a11y} ＋`}
          style={[btn, value >= max && { opacity: 0.35 }]}
        >
          <Text style={glyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * THE CHECK MARK — the box a checkbox row ticks.
 *
 * §13's row asks for the fill to scale FROM THE CENTRE and the tick to draw
 * after it. Both halves matter and the order is the point: the box filling and
 * the tick arriving in the same frame reads as a swap of two pictures, while
 * filling then ticking reads as one thing being marked.
 *
 * Reduce Motion substitutes a cross-dissolve of the same two states — the mark
 * still changes, it just does not travel to get there.
 */
export function ACheckMark({ on, size = 20, accent }: { on: boolean; size?: number; accent?: string }) {
  const { palette: C } = useTheme();
  const reduced = useReducedMotion();
  const fill = accent ?? C.lime;
  const a = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { Animated.timing(a, { toValue: on ? 1 : 0, duration: durations.dissolve, useNativeDriver: true }).start(); return; }
    Animated.timing(a, {
      toValue: on ? 1 : 0,
      // 120ms for the fill, per the audit's own figure — a mark is a state
      // change, not a journey, so it is a short curve rather than a spring.
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [on, a, reduced]);
  // The tick draws over the last third of the fill, so it lands ON a filled box.
  const tick = a.interpolate({ inputRange: [0, 0.66, 1], outputRange: [0, 0, 1] });
  return (
    <View
      style={{
        width: size, height: size, borderRadius: 999, alignItems: "center", justifyContent: "center",
        borderWidth: on ? 0 : 1.5, borderColor: `${C.ash}b3`,
      }}
    >
      <Animated.View
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
          borderRadius: 999, backgroundColor: fill,
          opacity: reduced ? a : 1,
          transform: reduced ? [] : [{ scale: a }],
        }}
      />
      <Animated.View style={{ opacity: tick, transform: reduced ? [] : [{ scale: tick }] }}>
        <AuroraIcon name="check" size={Math.round(size * 0.62)} color={C.ink} />
      </Animated.View>
    </View>
  );
}

export function ASub({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { palette } = useTheme();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[{ fontFamily: F.reg, fontSize: fs.note, color: palette.ash, lineHeight: leading(fs.note, "relaxed") }, style]}>
      {children}
    </Text>
  );
}

/**
 * The panel's position while the drawer carries a height of its own — OUT OF
 * FLOW, which is the whole reason a measured drawer works at all. See ADrawer.
 */
const DRAWER_PANEL_CLIPPED: ViewStyle = { position: "absolute", top: 0, left: 0, right: 0 };

/**
 * ADrawer — a disclosure that MOVES. A section eases open UNDERNEATH the control
 * that opened it, instead of popping into place inside a card that eases (or the
 * athlete being sent to another screen to read the detail of the card they were
 * already looking at).
 *
 * The web twin gets the movement from a 0fr → 1fr grid row (globals.css
 * `.motion-drawer`) — a real height animation with nothing measured. RN has no
 * such thing, so the panel is MEASURED and its height interpolated on the SAME
 * sheet spring; once the opening has settled the height goes back to `auto`,
 * otherwise content that grows inside an already-open drawer (a muscle row
 * expanding inside Volume's open detail) would be clipped to a height measured
 * before it grew.
 *
 * The content MOUNTS on first open and stays: a collapse needs something to
 * collapse, and a fold nobody has opened should not pay to lay out.
 */
export function ADrawer({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [panelH, setPanelH] = useState(0);
  const [settled, setSettled] = useState(false);
  const grow = useRef(new Animated.Value(0)).current;
  // Latched in RENDER, not in an effect. An effect commits one frame too late:
  // the content would not be laid out yet, `panelH` would still be 0, and the
  // animation below would bail — so every open would wait for a second layout
  // pass before it started moving.
  const mounted = useRef(open);
  if (open) mounted.current = true;

  // `settled` mirrored into a ref so the guard below can read it WITHOUT making
  // it a dependency. As a dep it would re-run this effect the moment a close
  // clears it — restarting the closing timing halfway through its own run.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!open) { settledRef.current = false; setSettled(false); }
    // Already open and settled: the height is `auto`, so a re-measure (a row
    // expanding INSIDE this drawer) has nothing to animate. Left unguarded this
    // restarts the spring on every layout pass of the content.
    if (open && settledRef.current) return undefined;
    // Reduce Motion SUBSTITUTES a cross-dissolve for the travel: the drawer
    // takes its height at once and fades in. Never an instant cut — the user
    // still has to perceive that something opened.
    if (reduced) {
      Animated.timing(grow, { toValue: open ? 1 : 0, duration: durations.reduced, easing: Easing.linear, useNativeDriver: false }).start();
      return undefined;
    }
    // Nothing to animate to until the content has been measured once.
    if (open && panelH <= 0) return undefined;
    const anim = open
      ? Animated.spring(grow, { toValue: 1, useNativeDriver: false, ...springToRN(springs.sheet) })
      : Animated.timing(grow, { toValue: 0, duration: durations.fast, easing: Easing.in(Easing.cubic), useNativeDriver: false });
    anim.start(({ finished }) => { if (finished && open) { settledRef.current = true; setSettled(true); } });
    return () => anim.stop();
  }, [open, panelH, reduced, grow]);

  // FLOWING — the drawer takes its height FROM the panel (auto) rather than
  // carrying one. That is the settled-open state, and Reduce Motion's open
  // state; every other state pins an explicit height on the drawer.
  const flowing = reduced ? open : settled;

  return (
    <Animated.View
      style={[
        { overflow: "hidden", opacity: settled ? 1 : grow },
        flowing
          ? null
          : { height: reduced ? 0 : grow.interpolate({ inputRange: [0, 1], outputRange: [0, panelH], extrapolate: "clamp" }) },
      ]}
      pointerEvents={open ? "auto" : "none"}
      /* Staying mounted is what buys the collapse — but a clipped panel is
         still in the accessibility tree, so a closed drawer would hand
         VoiceOver a section that isn't on screen. The web twin reaches this
         with one `inert` attribute; RN needs both platforms named. */
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      <View
        /* OUT OF FLOW for every state that pins a height on the drawer — which
           is what makes the measurement below possible at all. A box clipped to
           EXACTLY 0 does not let an in-flow child overflow it: Yoga reads a zero
           available main size as an at-most-0 constraint and lays the child out
           at 0 (any height ABOVE zero overflows normally — 0 is the one value
           that clamps). In flow, then, a closed drawer measures its panel as 0,
           `panelH` never leaves 0, the guard above bails on every run, and the
           drawer never moves: the chevron and the label toggle over a card that
           never opens. An absolutely positioned panel is sized against the
           drawer's WIDTH alone, so it measures its true height in every state.

           Measured on EVERY layout, not just the first — the interpolation's
           target has to follow content that changed while the drawer was open. */
        style={flowing ? null : DRAWER_PANEL_CLIPPED}
        onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}
      >
        {mounted.current ? children : null}
      </View>
    </Animated.View>
  );
}

/**
 * CARD FOOT — the ONE way a card is allowed to end.
 *
 * Three cards used to end three different ways. Tissue drew a rail of three
 * mono controls; Your Level drew a full-width row whose label was a statistic
 * and whose lime arrow pushed an entire screen; Volume drew an eyebrow on the
 * left and a lime CTA with a rotating ↓ on the right that merely unfolded a
 * drawer in place. Sixteen properties were being decided independently — face,
 * size, weight, case, tracking, colour, glyph, glyph motion, gap, offsets, the
 * open-state label, panel motion, the tap target, the haptic and, worst, what
 * a press even DOES. The accent was the loudest of them: lime meant "leaves the
 * card" on one and "unfolds in place" on the next, so it told the reader
 * nothing at all.
 *
 * The resolution is a shape, not a style guide:
 *
 *   status    — an optional figure or fact that QUALIFIES the card. It renders
 *               ABOVE the rule, is never pressable, and is never a button's
 *               accessible name. A number is not a label.
 *   expander  — exactly ONE link, and it unfolds in place. Nothing in a footer
 *               navigates and nothing opens a sheet, so nothing here earns the
 *               accent. The label names the NOUN of what appears and does NOT
 *               change when it does — the chevron's rotation is the only state
 *               anything reports, which is what retires "Hide tissues"/"Hide".
 *   children  — what unfolds, inside the ADrawer this component owns.
 *
 * There is deliberately no `kind`, no colour, no glyph and no array: a card
 * that wants a second link or an action in its footer is a review conversation,
 * not a prop. An action that must live near the footer belongs INSIDE the panel
 * (see the injury pill in tissue-card.tsx), where it cannot be mistaken for a
 * disclosure.
 *
 * Mirrors apps/web/components/aurora/card-foot.tsx.
 */

/** The rail's one glyph. A 12dp VECTOR that rotates 180° — mobile used to draw
 *  this and web an 8px text triangle that SWAPPED ▼/▲, which is two different
 *  affordances for one control. Ash, never the accent. */
function FootChevron({ open }: { open: boolean }) {
  const { palette: C } = useTheme();
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { spin.setValue(open ? 1 : 0); return; }
    Animated.spring(spin, { toValue: open ? 1 : 0, useNativeDriver: true, ...springToRN(springs.sheet) }).start();
  }, [open, reduced, spin]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-180deg"] }) }] }}
    >
      <AuroraIcon name="chevron-down" size={12} color={C.ash} />
    </Animated.View>
  );
}

export function CardFoot({
  status,
  expander,
  children,
}: {
  /** A figure or fact that qualifies the card. Above the rule, never pressable. */
  status?: string;
  /** The one link. `label` names what unfolds and never changes on open. */
  expander: { label: string; open: boolean; onToggle: () => void };
  /** What unfolds. */
  children: ReactNode;
}) {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      {status ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash, marginBottom: 11 }}>
          {status}
        </Text>
      ) : null}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>
        <Pressable
          onPress={() => { haptic.selection(); expander.onToggle(); }}
          accessibilityRole="button"
          accessibilityState={{ expanded: expander.open }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            // 44dp of pressable height. Every one of the five controls this
            // replaces sat under 20dp — web set `padding: 0` on its rail
            // buttons and mobile leaned on `hitSlop={6}` — which is the one
            // property in this component that is not cosmetic.
            minHeight: HIT_TARGET,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600",
              textTransform: "uppercase", letterSpacing: tracking.label,
              // Ash, always. Nothing in a footer leaves the card, so nothing
              // here may take the accent.
              color: C.ash, flexShrink: 1,
            }}
          >
            {expander.label}
          </Text>
          <FootChevron open={expander.open} />
        </Pressable>
        <ADrawer open={expander.open}>{children}</ADrawer>
      </View>
    </View>
  );
}

/**
 * THE ACTION PILL — for the one thing a card may do that is not unfolding.
 *
 * It lives INSIDE a panel, never in the rail, and it is deliberately a
 * different object from the link: bordered, chalk, pill-shaped. A reader never
 * has to work out whether a footer control will unfold something or open a
 * form, because the two share no vocabulary at all.
 */
export function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={() => { haptic.selection(); onPress(); }}
      accessibilityRole="button"
      style={{
        alignSelf: "flex-start", minHeight: HIT_TARGET, justifyContent: "center",
        paddingHorizontal: 16, borderRadius: RADIUS.pill,
        borderWidth: 1, borderColor: C.line, backgroundColor: "transparent",
      }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600", textTransform: "uppercase", letterSpacing: tracking.label, color: C.chalk }}>
        {label}
      </Text>
    </Pressable>
  );
}
