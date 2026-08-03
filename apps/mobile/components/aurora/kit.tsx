import { type ReactNode, useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl, KeyboardAvoidingView, Platform, Animated, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, leading, tracking, F, serifIf, useEntrance, HubDissolve, cardShadow, PressScale, PressScale as Pressable, MAX_FONT_SCALE, FIXED_FONT_SCALE, HIT_TARGET, HIT_SLOP } from "../../lib/ui";
import { auroraScrollClearance } from "../../lib/layout";
import { useNavScrollProps } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";
import { heroTitleType, type AuroraIconName } from "@hybrid/core";
import { GlassSurface, GlassSegment, LIQUID_GLASS_SUPPORTED } from "./swiftui";
import { LiquidSeg } from "./liquid-seg";
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
  scroller,
  scroll = true,
  center = false,
  // 16dp side gutter — matches the web app-shell's mobile gutter (16px) so a
  // card fills the same share of the screen on both clients. Wider cards, less
  // dead space at the edges.
  padding = 16,
  refreshing,
  onRefresh,
  top,
  hubTab,
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
      <HeroScreen hero={hero} back={back} backLabel={backLabel} accessory={accessory} rail={rail} scroller={scroller} refreshing={refreshing} onRefresh={onRefresh} center={center} scroll={scroll}>
        {children}
      </HeroScreen>
    );
  }
  return (
    <AuroraPlainScreen scroll={scroll} center={center} padding={padding} refreshing={refreshing} onRefresh={onRefresh} top={top} hubTab={hubTab}>
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
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  padding?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  top?: ReactNode;
  hubTab?: boolean;
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
      // Clear the floating Aurora pill nav so the last content row never hides
      // under the bar — derived from the real bar height + safe-area inset (one
      // source of truth in lib/layout), not a hand-copied magic number.
      contentContainerStyle={{ padding, paddingBottom: auroraScrollClearance(insets.bottom), flexGrow: center ? 1 : undefined, justifyContent: center ? "center" : undefined }}
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
  const { palette, scheme } = useTheme();
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
          padding: 20,
          // A touch of depth — soft, low, lifted off the field (not the heavy
          // classic glass shadow), warm-toned on the light washi (cardShadow).
          ...cardShadow(scheme),
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
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  /** Overrides the accent. On a fill it paints the surface; on `outline` it
   *  tints the label and the hairline (a destructive action's red). */
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
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
  const fg = outline
    ? color
      ? txt(palette, color)
      : palette.ash
    : variant === "soft"
      ? palette.chalk
      : palette.onAccent;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      // APill is the app's primary action and was the ONE button primitive with
      // no accessibility contract — VoiceOver announced it as a plain view with
      // no role and no disabled state, while lib/ui's Button next to it was
      // fully labelled. The merge keeps the labelled behaviour.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          backgroundColor: bg,
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
        },
        style,
      ]}
    >
      {glassSoft && <GlassSurface radius={RADIUS.pill} />}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: fg }}>{label}</Text>
    </PressScale>
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
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}>
          <AuroraIcon name="eye" size={20} color={visible ? palette.lime : palette.ash} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * THE SEGMENTED CONTROL — one entry point, two renderings, no third.
 *
 * `ASegment` dispatches: on iOS it is a real SwiftUI `Picker` (GlassSegment,
 * tinted with the live accent); everywhere else it is `LiquidSeg`, the
 * gesture-tracked lens that inflates under touch, scrubs across segments as you
 * drag and lands on the shared `springs.lens`.
 *
 * That second branch is the change. The fallback used to be a static RN pill
 * row — correct, inert, and nothing like the control beside it — so the best
 * motion in the product reached exactly two surfaces while everything else got
 * a flat highlight. The audit counted eight segmented implementations; two of
 * them (the admin `Segmented` and History's `ViewSwitcher`) turned out on
 * reading to be WRAPPING and SCROLLING chip rails rather than segmented
 * controls at all, and became `AChip` rows. What is left is this and the
 * LiquidSeg it delegates to.
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
  if (LIQUID_GLASS_SUPPORTED) {
    return <GlassSegment options={options} value={value} onPick={onPick} accent={palette.lime} />;
  }
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
 * `action` makes the meta a button (the "See all →" affordance). `flat` drops
 * the serif swap for screens whose other heads are all sans — nutrition made
 * that call deliberately and it was right: one serif head among sans siblings
 * reads as a different screen.
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
  const fill = color ?? palette.lime;
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped > 0 ? Math.max(2, clamped) : 0;
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
        <View style={{ width: `${width}%`, height: "100%", borderRadius: RADIUS.mark, backgroundColor: fill }} />
      </View>
    </View>
  );
}

export function ASection({
  title,
  meta,
  action,
  flat,
  titleStyle,
  style,
}: {
  title: string;
  /** Small mono uppercase, right-aligned on the title's row. A NODE is allowed
   *  (a chip, an icon + count) — the meta slot is a slot, not a string field. */
  meta?: ReactNode;
  /** Makes the meta tappable — the "See all →" affordance. */
  action?: () => void;
  /** Keep the sans display face even under Kyoto Hour. */
  flat?: boolean;
  /** The ONE escape hatch, for a head that genuinely needs a different title
   *  treatment (a state colour, a smaller rung inside a card). Deliberately one
   *  prop rather than the `titleColor` + `small` pair it replaces: a section
   *  head that wants to look different should have to say so explicitly. */
  titleStyle?: TextStyle;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, scheme } = useTheme();
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
        style={[{ fontFamily: flat ? F.black : serifIf(scheme, F.black), fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: palette.chalk, flexShrink: 1 }, titleStyle]}
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
  const { palette, scheme } = useTheme();
  const type = heroTitleType(typeof children === "string" ? children : "", "title");
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[{ fontFamily: serifIf(scheme, F.black), fontSize: type.size, color: palette.chalk, lineHeight: type.lineHeight, letterSpacing: tracking.display }, style]}
    >
      {children}
    </Text>
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
