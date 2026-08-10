import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import {
  HERO,
  HERO_INK,
  HERO_INLINE_TITLE,
  HERO_META_TYPE,
  HERO_TAKEOVER_INK,
  heroBackdrop,
  heroGeometry,
  heroLight,
  heroMetaLine,
  heroNavAction,
  heroNavMaterial,
  heroRailPin,
  heroSnapTarget,
  heroStatusBar,
  heroTitleType,
  isDetour,
  type HeroBackdrop as HeroBackdropKind,
  type HeroGeometry,
  type HeroMode,
  type HeroRank,
} from "@hybrid/core";
import { AURORA_NAV_BAR_HEIGHT, auroraScrollClearance } from "../../lib/layout";
import { useNavScroll } from "../../lib/nav-scroll";
import { useTheme } from "../../lib/theme";
import { F, serifIf, useEntrance, PressScale, FIXED_FONT_SCALE } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { useLang } from "../../lib/i18n";
import { haptic } from "../../lib/haptics";
import { AuroraField, withAlpha } from "./field";
import { AuroraIcon } from "./icons";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "./swiftui";

/**
 * THE HERO SYSTEM — mobile.
 *
 * Every screen head in the app is one of these, at one of three ranks. The
 * contract (geometry, the collapse track, the layer interpolations, the type
 * ramp, the metadata language, the backdrop rules) lives in
 * `packages/core/src/hero.ts` and is shared verbatim with the web twin
 * (apps/web/components/aurora/hero.tsx), so the two clients cannot drift.
 *
 * Read the spec first: reference/hero-system.md.
 *
 * Composition, not configuration — a screen assembles the same pieces the
 * SwiftUI kit does (HeroContainer / HeroBackground / HeroRail / HeroNav /
 * HeroTitle / HeroMetadata / HeroAccessory), and `HeroScreen` is simply the
 * assembled default that almost every screen wants.
 */

/* ── HeroNav — the one navigation control, everywhere, forever ───────────── */

/**
 * Is the screen being drawn a presented DETOUR?
 *
 * Read from the ROUTE against the shared list in @hybrid/core rather than
 * passed down, for the same reason the presentation itself is declared from
 * that list in app/_layout.tsx: the two would otherwise be set in different
 * files and drift, and a card modal wearing a back chevron is precisely the
 * confusion the split was made to end. One list decides how the screen arrives
 * AND how its nav button says to leave.
 */
function usePresented(): boolean {
  const path = usePathname();
  return isDetour(path.replace(/^\/+/, ""));
}

export function HeroNav({
  onPress,
  /** Names the ORIGIN, not the action: "Olympic Weightlifting", not "Back".
   *  A hero must answer "where did I come from" without animation. */
  fromLabel,
  mode = "page",
  material = "glass",
  onDark = true,
  presented,
  style,
}: {
  onPress: () => void;
  fromLabel?: string;
  mode?: HeroMode;
  material?: "clear" | "glass";
  /** Whether the button sits on a dark ground (every cover and takeover does). */
  onDark?: boolean;
  /** The screen arrived as a presented DETOUR, so the button dismisses rather
   *  than pops. Resolved from the route by HeroScreen — see `usePresented`. */
  presented?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const routePresented = usePresented();
  const { role, glyph } = heroNavAction(mode, presented ?? routePresented);
  const fg = onDark ? "#fff" : C.chalk;
  const glass = material === "glass";
  // Liquid Glass where the platform has it; the white-12% + blur fallback
  // otherwise. Same circle either way — only the material differs, and it
  // differs with what is BEHIND the button, never with which screen it is on.
  const native = glass && LIQUID_GLASS_SUPPORTED;
  const inset = (HERO.nav.hit - HERO.nav.size) / 2;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fromLabel && role === "pop" ? `← ${fromLabel}` : t(role === "dismiss" ? "common.close" : "common.back")}
      hitSlop={8}
      style={[{ width: HERO.nav.hit, height: HERO.nav.hit, alignItems: "center", justifyContent: "center", marginLeft: -inset }, style]}
    >
      <View
        style={{
          width: HERO.nav.size,
          height: HERO.nav.size,
          borderRadius: HERO.radius.nav,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: glass && !native ? withAlpha(onDark ? "#ffffff" : C.ink2, HERO.alpha.navFill) : "transparent",
          borderWidth: glass ? HERO.nav.stroke : 0,
          borderColor: withAlpha(onDark ? "#ffffff" : C.chalk, HERO.alpha.navStroke),
        }}
      >
        {native && <GlassSurface radius={HERO.radius.nav} />}
        {glass && !native && <BlurView intensity={22} tint={onDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
        <AuroraIcon name={glyph} size={HERO.nav.glyph} color={fg} />
      </View>
    </PressScale>
  );
}

/* ── The metadata language — three slots, one type style ─────────────────── */

const metaStyle = (color: string) => ({
  fontFamily: F.mono,
  fontSize: HERO_META_TYPE.size,
  lineHeight: HERO_META_TYPE.lineHeight,
  letterSpacing: HERO_META_TYPE.tracking * HERO_META_TYPE.size,
  textTransform: "uppercase" as const,
  color,
});

/** color-mix(#fff 82%, accent) — the eyebrow chip's accent-tinted white, the
 *  exact mix the web twin runs. Computed here because RN has no color-mix(). */
function chipTint(accent: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return "#ffffff";
  const n = parseInt(accent.slice(1, 7), 16);
  const ch = (shift: number) => Math.round(0.82 * 255 + 0.18 * ((n >> shift) & 0xff));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** WHAT KIND of thing this is — one line, directly above the title. `solid`
 *  (the accent-tinted chip) is reached only over art, where an 11pt mono line
 *  has no contrast substrate; everywhere else the eyebrow is tinted text. */
export function HeroEyebrow({ label, tone, accent, onDark = true, mark }: { label: string; tone: "tint" | "solid"; accent: string; onDark?: boolean; mark?: string }) {
  const text = mark ? `${mark} ${label}` : label;
  if (tone === "solid") {
    return (
      <Text style={[metaStyle("#0d0e0d"), { alignSelf: "flex-start", fontWeight: "700", backgroundColor: chipTint(accent), paddingHorizontal: 12, paddingVertical: 5, borderRadius: HERO.radius.chip, overflow: "hidden" }]}>
        {text}
      </Text>
    );
  }
  return <Text style={metaStyle(accent)}>{text}</Text>;
}

/** FACTS about this instance — one line, directly below the title. Parts are
 *  joined by core (spaced en dash), never by the screen. */
export function HeroMetadata({ parts, onDark = true }: { parts: (string | null | undefined | false)[]; onDark?: boolean }) {
  const { palette: C } = useTheme();
  const line = heroMetaLine(parts);
  if (!line) return null;
  return <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={metaStyle(onDark ? `rgba(255,255,255,${HERO.alpha.dim})` : C.ash)}>{line}</Text>;
}

/** The rail's TRAILING slot — one label, or one control. Never a fact the meta
 *  line already carries. */
export function HeroAccessory({ label, onPress, active, onDark = true }: { label: string; onPress?: () => void; active?: boolean; onDark?: boolean }) {
  const { palette: C } = useTheme();
  const fg = active ? C.lime : onDark ? `rgba(255,255,255,${HERO.alpha.dim})` : C.ash;
  const body = <Text style={[metaStyle(fg), { fontWeight: "600" }]}>{label}</Text>;
  if (!onPress) return body;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={10}
      style={{ minHeight: HERO.nav.hit, justifyContent: "center", paddingHorizontal: 4 }}
    >
      {body}
    </PressScale>
  );
}

/** The display TITLE. Bottom-anchored by its container, so a one-line and a
 *  two-line title share the same last baseline — nothing below the hero moves
 *  because a name got longer. */
export function HeroTitle({ title, rank, onDark = true, style }: { title: string; rank: HeroRank; onDark?: boolean; style?: StyleProp<ViewStyle> }) {
  const { palette: C, scheme } = useTheme();
  const type = heroTitleType(title, rank);
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={type.maxLines}
      style={[
        {
          fontFamily: serifIf(scheme, F.black),
          fontSize: type.size,
          lineHeight: type.lineHeight,
          letterSpacing: type.tracking * type.size,
          color: onDark ? "#fff" : C.chalk,
        },
        style as never,
      ]}
    >
      {title}
    </Text>
  );
}

/* ── HeroBackground — one ground per rank, and no way to pick another ────── */

export function HeroBackground({
  backdrop,
  accent,
  glyph,
  artPaths,
  emblem,
  colourArt,
  artOpacity,
  artShift,
  scrimOpacity,
  safeTop,
}: {
  backdrop: HeroBackdropKind;
  accent: string;
  glyph?: string;
  artPaths?: string[];
  emblem?: boolean;
  colourArt?: boolean;
  artOpacity: Animated.AnimatedInterpolation<number> | number;
  artShift: Animated.AnimatedInterpolation<number> | number;
  scrimOpacity: Animated.AnimatedInterpolation<number> | number;
  safeTop: number;
}) {
  // SVG gradient ids are document-global; scope per mount so stacked heroes
  // (push navigation) can't cross-reference each other's hotspot.
  const hotspotId = `hero-hotspot-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (backdrop === "field") return <AuroraField />;
  const story = backdrop === "story";
  // A container is lit from the LEFT, the things inside it from the RIGHT — the
  // one cue that tells you which level of a hierarchy you're on.
  const mirrored = heroLight(emblem ? "container" : "item") === "left";
  return (
    <>
      {story ? (
        <>
          {/* the takeover's ground: two soft accent glows on near-black. No
              wash, no art — a takeover's subject is the numbers on it. */}
          <LinearGradient colors={[withAlpha(accent, 0.16), "transparent"]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.8 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <LinearGradient colors={["transparent", withAlpha(accent, 0.1)]} start={{ x: 0.2, y: 0.3 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        </>
      ) : (
        <>
          {/* duotone accent wash over the fixed cover ink */}
          <LinearGradient
            colors={[`${accent}85`, `${accent}26`, `${accent}00`]}
            locations={[0, 0.46, 1]}
            start={mirrored ? { x: 0.1, y: 0 } : { x: 0.9, y: 0 }}
            end={mirrored ? { x: 0.8, y: 0.95 } : { x: 0.2, y: 0.95 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* radial hotspot at the wash's source corner */}
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={hotspotId} cx={mirrored ? 0.14 : 0.86} cy={0.08} rx={1.2} ry={0.92}>
                <Stop offset="0" stopColor={accent} stopOpacity={0.42} />
                <Stop offset="0.55" stopColor={accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${hotspotId})`} />
          </Svg>
        </>
      )}
      {/* the art — parallax drift against the frame, retiring on the track.
          DRAWN art wins over a glyph: a stroke mark holds its shape at 150dp
          and survives into the collapsed bar as texture, which a desaturated
          emoji does not. Same box, same parallax, same opacity floor. */}
      {!!artPaths?.length ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: safeTop - (emblem ? 4 : 18),
            right: emblem ? -30 : -22,
            opacity: artOpacity as never,
            transform: [{ translateY: artShift as never }],
          }}
        >
          <Svg width={emblem ? 228 : 174} height={emblem ? 228 : 174} viewBox="0 0 72 72" fill="none">
            {artPaths.map((d, i) => (
              <Path key={i} d={d} stroke={`rgba(255,255,255,${emblem ? 0.1 : 0.085})`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        </Animated.View>
      ) : !!glyph && (
        <Animated.Text
          pointerEvents="none"
          style={{
            position: "absolute",
            top: safeTop - (emblem ? 4 : 26),
            right: emblem ? -30 : -10,
            fontSize: emblem ? 214 : 150,
            lineHeight: emblem ? 222 : 158,
            ...(colourArt ? null : { color: `rgba(255,255,255,${emblem ? 0.09 : 0.07})` }),
            opacity: artOpacity as never,
            transform: [{ translateY: artShift as never }],
          }}
        >
          {glyph}
        </Animated.Text>
      )}
      {/* legibility scrim under the display title — retired as the title leaves.
          Runs out to FULLY opaque hero ink at the very bottom so the seam band
          under the hero starts from exactly the same colour. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: scrimOpacity as never }]}>
        <LinearGradient
          colors={story ? ["#0a0b0900", "#0a0b0999", HERO_TAKEOVER_INK] : ["#0c0d0c00", "#0c0d0ccc", HERO_INK]}
          locations={[0, 0.95, 1]}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}

/* ── The seam — hero ink dissolving into the page ────────────────────────── */

const BLEED_OVER = 64;
const BLEED_FADE = 148;
const BLEED = (() => {
  const head = BLEED_OVER / (BLEED_OVER + BLEED_FADE);
  const at = (f: number) => head + f * (1 - head);
  return {
    colors: [HERO_INK, HERO_INK, `${HERO_INK}e6`, `${HERO_INK}9e`, `${HERO_INK}4d`, `${HERO_INK}00`] as [string, string, ...string[]],
    locations: [0, head, at(0.22), at(0.45), at(0.68), 1] as [number, number, ...number[]],
  };
})();

/* ── HeroScreen — the assembled default ──────────────────────────────────── */

export interface HeroSpec {
  rank: HeroRank;
  mode?: HeroMode;
  title: string;
  /** WHAT KIND of thing this is. */
  eyebrow?: string;
  /** A leading mark on the eyebrow (the ✦ premium signifier, and nothing else). */
  eyebrowMark?: string;
  /** FACTS about this instance — joined by core, never by the screen. */
  meta?: (string | null | undefined | false)[];
  /** The subject's accent. Defaults to the theme's primary. */
  accent?: string;
  /** The subject's mark, drawn as cover art. `cover` rank only. */
  glyph?: string;
  /** DRAWN cover art — stroke paths in a 72-unit box (core `sportMarkPaths`).
   *  Takes precedence over `glyph`, which stays for subjects with no drawing. */
  artPaths?: string[];
  /** Emblem-scale art (a category/goal) rather than poster-scale (an item).
   *  Also decides the light source: containers are lit from the left. */
  emblem?: boolean;
  /** Full-colour art (a dish) rather than a monochrome ghost — it must retire
   *  before the bar arrives instead of surviving as texture. */
  colourArt?: boolean;
}

/** Take the scroll props (and the docked sub-rail) and render your own
 *  scroller. Exported so AuroraScreen can pass one straight through. */
export type HeroScrollerFn = (props: HeroScrollProps, rail: ReactNode) => ReactNode;

declare const __DEV__: boolean;

/**
 * THE SUB-RAIL'S ONE PLACEMENT RULE, enforced instead of documented.
 *
 * The dock point is computed from the geometry on the premise that the rail is
 * the first thing in the scroll content. A `scroller` screen renders the rail
 * node itself, so it is the one place that premise can be broken — put content
 * above the rail inside the same parent and it would dock early, with the page
 * sliding out from under it. Nothing about that failure is visible in a type,
 * so it is checked at layout time in dev: y is measured against the rail's
 * parent, and the parent's top must BE the content's top.
 */
function assertRailAtContentTop(e: LayoutChangeEvent) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const y = e.nativeEvent.layout.y;
  if (y > 0.5) {
    console.warn(
      `[hero] The docked sub-rail is ${Math.round(y)}dp below the top of its parent. ` +
        `HeroScreen pins it as if it were the first thing in the scroll content, so it will dock early. ` +
        `Render the rail node first in your scroller's content (see HeroScreen's \`scroller\` prop).`,
    );
  }
}

export interface HeroScrollProps {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  contentContainerStyle: ViewStyle;
  keyboardShouldPersistTaps: "handled";
}

/**
 * The container every screen composes. It owns exactly four things: the safe
 * area, the collapse track, the pinned hero overlay, and the scroll clearance.
 * Everything else is a slot.
 *
 * `scroller` hands a screen the scroll props so it can keep its own scroller (a
 * FlatList, say) instead of the default ScrollView — the container never
 * requires a screen to give up virtualization to get a hero.
 */
export function HeroScreen({
  hero,
  back,
  /** Names the ORIGIN for the nav button's label. */
  backLabel,
  accessory,
  rail,
  dock,
  scroller,
  refreshing,
  onRefresh,
  center,
  scroll = true,
  children,
}: {
  hero: HeroSpec;
  /** Defaults to `router.back()`; `false` renders no button (a root screen). */
  back?: (() => void) | false;
  backLabel?: string;
  accessory?: ReactNode;
  /** Pull-to-refresh, for the screens that had it on AuroraScreen. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Centre the content in the remaining space (short screens: empty states,
   *  a single form). The hero is unaffected — it is always at the top. */
  center?: boolean;
  /** `false` → the screen owns its own layout below the hero (a flex column
   *  with its own virtualized list, say). There is no scroller, so there is no
   *  collapse track: the hero simply sits at rest. That is consistent, not a
   *  special case — `heroCollapse` is 0 whenever the track is 0. */
  scroll?: boolean;
  /** A sub-rail (segmented control, category chips) that docks beneath the
   *  collapsed bar. It is NOT part of the hero — the hero's rail is the nav
   *  row, and this rides under it. */
  rail?: ReactNode;
  /** A CTA that surfaces above the tab bar as the hero finishes collapsing. */
  dock?: ReactNode;
  /** Take the scroll props (and the docked sub-rail node) and render your own
   *  scroller — a FlatList, say. The container never requires a screen to give
   *  up virtualization to get a hero. The rail node must go FIRST in the
   *  scroller's content (the top of a list header) — that is where its dock
   *  point assumes it is; dev warns at layout time if it isn't. */
  scroller?: HeroScrollerFn;
  children?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const mode = hero.mode ?? "page";
  const accent = hero.accent ?? C.lime;
  // A PRESENTED detour is a card, not a full screen: it reports no top inset
  // because there is no status bar over it, which would put the rail 4pt from
  // the card's own rounded top edge. `presentedTop` is the inset it stands in
  // with — see @hybrid/core HERO.
  const safeTop = usePresented() ? Math.max(insets.top, HERO.presentedTop) : insets.top;
  const geom = heroGeometry(hero.rank, safeTop, mode);
  const backdrop = heroBackdrop(hero.rank, mode, !!hero.glyph || !!hero.artPaths?.length);
  const onDark = backdrop !== "field" || scheme === "dark";
  const dark = backdrop !== "field";

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const dockedRef = useRef(false);
  const [docked, setDocked] = useState(false);
  const [barred, setBarred] = useState(false);
  const ns = useNavScroll();
  const reduced = useReducedMotion();
  const entrance = useEntrance();
  const router = useRouter();
  // A pushed screen needs only a `hero` — popping is what a nav button does
  // unless it is told otherwise, which is the default the retired ABack had.
  const onBack = back === false ? null : (back ?? (() => router.back()));

  const d = geom.delta;
  // Every layer reads the SAME detents core publishes — the ONE reason web and
  // mobile can't drift on when a title leaves or a bar arrives. (core's
  // heroLayers() computes these for a scalar p; Animated needs ranges, so the
  // ranges are built from the identical constants.)
  const track = (from: number, to: number, out: [number, number]) =>
    d <= 0
      ? out[0]
      : scrollY.interpolate({ inputRange: [from * d, Math.max(from * d + 1, to * d)], outputRange: out, extrapolate: "clamp" });
  const { titleOut, inlineIn, hairlineIn, dock: dockAt } = HERO.detent;
  const frameShift = track(0, 1, [0, -d]);
  const railCounter = track(0, 1, [0, d]);
  const artShift = track(0, 1, [0, d * (hero.emblem ? HERO.parallax.emblem : HERO.parallax.art)]);
  const artOpacity = hero.colourArt ? track(0, HERO.colourArtOut, [1, HERO.artFloor.colour]) : track(0, 1, [1, HERO.artFloor.ghost]);
  const scrimOpacity = track(0, 1, [1, 0]);
  const displayOpacity = track(0, titleOut, [1, 0]);
  const inlineOpacity = track(inlineIn, 1, [0, 1]);
  const hairlineOpacity = track(hairlineIn, 1, [0, 1]);
  const dockOpacity = track(dockAt, 1, [0, 1]);
  const dockRise = track(dockAt, 1, [HERO.motion.rise, 0]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.setValue(y);
    if (d > 0) {
      const p = Math.min(1, Math.max(0, y / d));
      if ((p >= dockAt) !== dockedRef.current) {
        dockedRef.current = p >= dockAt;
        setDocked(dockedRef.current);
      }
      setBarred((was) => (p >= hairlineIn === was ? was : p >= hairlineIn));
    }
    ns?.onScroll(e);
  };

  // Released mid-track → settle to the nearer pole. A genuine detent, so it may
  // buzz (user-gated); under Reduce Motion the settle is an instant jump. The
  // tracking itself is NEVER suppressed: it is direct manipulation.
  const snap = (y: number) => {
    const target = heroSnapTarget(y, geom);
    if (target == null) return;
    scrollRef.current?.scrollTo({ y: target, animated: !reduced });
    haptic.selection();
  };

  const scrollProps: HeroScrollProps = {
    onScroll,
    onScrollEndDrag: (e) => {
      const v = e.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(v) < 0.15) snap(e.nativeEvent.contentOffset.y);
    },
    onMomentumScrollEnd: (e) => snap(e.nativeEvent.contentOffset.y),
    scrollEventThrottle: 16,
    contentContainerStyle: {
      paddingTop: geom.height,
      paddingBottom: auroraScrollClearance(insets.bottom) + (dock ? 66 : 0),
      flexGrow: center ? 1 : undefined,
      justifyContent: center ? "center" : undefined,
    },
    keyboardShouldPersistTaps: "handled",
  };

  // The sub-rail docks beneath the collapsed bar: once its natural position
  // would scroll past the bar, it translates down to hold there.
  //
  // NOT MEASURED. This container renders the rail as the FIRST thing in the
  // scroll content — directly under `paddingTop: geom.height` — so its y in
  // that content is the hero's height, and the pin is a pure function of the
  // geometry. It used to read an `onLayout`, which is how it shipped broken:
  // `onLayout` reports y against the rail's PARENT (0, in both placements),
  // not against the scroll content, so the pin came out 0, the rail held from
  // the first pixel of scroll, and the collapsed bar left a whole collapse
  // track of gap above it. A measurement whose coordinate space depends on how
  // deep the node happens to be nested cannot be the source of truth for a
  // position this component itself decides. (The cover screen still measures —
  // there the rail sits BELOW a hem of variable height, so its position is
  // genuinely unknown, and it is a direct child of the content container, so
  // its measured y is already in the right space.)
  const railPin = heroRailPin(geom.height, geom);
  const railShift = scrollY.interpolate({ inputRange: [railPin, railPin + 100000], outputRange: [0, 100000], extrapolateLeft: "clamp" });

  const navMaterial = heroNavMaterial(backdrop, barred);
  const type = heroTitleType(hero.title, hero.rank);

  // The sub-rail: a second sticky layer that docks beneath the collapsed bar.
  // Handed to a custom `scroller` too, so a FlatList screen gets the identical
  // behaviour by dropping it at the top of its list header.
  const railNode = rail ? (
    <Animated.View testID="hero-rail" onLayout={assertRailAtContentTop} style={{ zIndex: 10, transform: [{ translateY: railShift }] }}>
      <View
        // Full-bleed, and NO padding of its own: the rail owns its gutter (see
        // DockRail). This slot used to pad its child and History then
        // negative-margined straight back out again — the same gutter applied
        // twice in opposite directions, which is how the two rails ended up
        // measuring differently. Now identical to the cover scaffold's slot.
        // (The height measurement that used to sit here is gone with the rest
        // of this container's measuring — see the dock point above.)
        style={{ marginHorizontal: -HERO.gutter.edge, backgroundColor: withAlpha(C.ink, 0.88), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, overflow: "hidden" }}
      >
        <BlurView intensity={26} tint={scheme === "light" ? "light" : "dark"} style={StyleSheet.absoluteFill} />
        {rail}
      </View>
    </Animated.View>
  ) : null;

  const body = (
    <View style={{ paddingHorizontal: HERO.gutter.edge }}>
      {railNode}
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: dark ? (mode === "takeover" ? HERO_TAKEOVER_INK : C.ink) : C.ink }}>
      <StatusBar style={heroStatusBar(hero.rank, mode, scheme)} />
      {backdrop === "field" && <AuroraField />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, entrance]}>
          {/* the hero ink bleeding into the page — glued to the CONTENT, so it
              slides up under the pinned hero and is gone by the time the
              collapsed bar's hairline takes over as the edge. Dark grounds
              only: on the light theme a dark cover meeting warm paper is a real
              boundary, not an artifact. */}
          {dark && scheme !== "light" && (
            <Animated.View
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, top: geom.height - BLEED_OVER, height: BLEED_OVER + BLEED_FADE, opacity: scrimOpacity as never, transform: [{ translateY: Animated.multiply(scrollY, -1) }] }}
            >
              <LinearGradient colors={BLEED.colors} locations={BLEED.locations} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}

          {!scroll ? (
            <View style={{ flex: 1, paddingTop: geom.height }}>
              {railNode}
              {children}
            </View>
          ) : scroller ? (
            scroller(scrollProps, railNode)
          ) : (
            <ScrollView
              ref={scrollRef}
              {...scrollProps}
              refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.lime} colors={[C.lime]} progressViewOffset={geom.barHeight} /> : undefined}
            >
              {body}
            </ScrollView>
          )}

          {/* ── the hero: pinned overlay, carried up by exactly the scroll ── */}
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: geom.height,
              zIndex: 20,
              overflow: "hidden",
              backgroundColor: dark ? (mode === "takeover" ? HERO_TAKEOVER_INK : HERO_INK) : "transparent",
              transform: [{ translateY: frameShift as never }],
            }}
          >
            {/* THE BAR'S MATERIAL. A dark ground is already opaque, so it needs
                nothing; the `field` ground is transparent, and without this the
                page would scroll BEHIND the inline title once the hero is
                barred. Fades in on the hairline's ramp, so the bar's edge and
                its substrate arrive together. */}
            {!dark && (
              <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: geom.barHeight, overflow: "hidden", opacity: hairlineOpacity as never }}>
                <BlurView intensity={26} tint={scheme === "light" ? "light" : "dark"} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.ink, 0.72) }]} />
              </Animated.View>
            )}

            <HeroBackground
              backdrop={backdrop}
              accent={accent}
              glyph={hero.glyph}
              artPaths={hero.artPaths}
              emblem={hero.emblem}
              colourArt={hero.colourArt}
              artOpacity={artOpacity}
              artShift={artShift}
              scrimOpacity={scrimOpacity}
              safeTop={safeTop}
            />

            {/* THE RAIL — the system's spatial constant. It counter-translates
                the frame, so the nav button never moves on screen, and it is at
                the identical y in every rank and on every screen. */}
            <Animated.View
              style={{
                position: "absolute",
                top: geom.railTop,
                left: HERO.gutter.edge,
                right: HERO.gutter.edge,
                height: HERO.rail.height,
                flexDirection: "row",
                alignItems: "center",
                zIndex: 3,
                transform: [{ translateY: railCounter as never }],
              }}
            >
              {onBack ? <HeroNav onPress={onBack} fromLabel={backLabel} mode={mode} material={navMaterial} onDark={onDark} /> : <View style={{ width: HERO.nav.hit }} />}
              {/* the collapsed bar's inline title — arrives only after the
                  display title has fully left, so the two are never both up */}
              <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: HERO.nav.hit + 8, right: HERO.nav.hit + 8, alignItems: "center", justifyContent: "center", height: HERO.rail.height, opacity: inlineOpacity as never }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.bold), fontSize: HERO_INLINE_TITLE.size, lineHeight: HERO_INLINE_TITLE.lineHeight, letterSpacing: HERO_INLINE_TITLE.tracking * HERO_INLINE_TITLE.size, color: onDark ? "#fff" : C.chalk }}>
                  {hero.title}
                </Text>
              </Animated.View>
              <View style={{ flex: 1 }} />
              {accessory}
            </Animated.View>

            {/* the display block — eyebrow, title, meta. BOTTOM-ANCHORED, so a
                two-line title grows upward into the art and nothing below the
                hero ever moves because a name got longer. */}
            {hero.rank !== "bar" && (
              <Animated.View pointerEvents="none" style={{ position: "absolute", left: HERO.gutter.hero, right: HERO.gutter.hero, bottom: HERO.rail.bottom + 10, opacity: displayOpacity as never }}>
                {!!hero.eyebrow && (
                  <View style={{ marginBottom: 10 }}>
                    <HeroEyebrow label={hero.eyebrow} tone={backdrop === "art" ? "solid" : "tint"} accent={accent} onDark={onDark} mark={hero.eyebrowMark} />
                  </View>
                )}
                <HeroTitle title={hero.title} rank={hero.rank} onDark={onDark} style={{ maxWidth: "88%" } as never} />
                {!!hero.meta?.length && (
                  <View style={{ marginTop: 8 }}>
                    <HeroMetadata parts={hero.meta} onDark={onDark} />
                  </View>
                )}
              </Animated.View>
            )}

            {/* the collapsed bar's bottom edge */}
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: onDark ? `rgba(255,255,255,${HERO.alpha.hairline})` : C.line, opacity: hairlineOpacity as never }} />
          </Animated.View>

          {dock && (
            <Animated.View
              pointerEvents={docked ? "box-none" : "none"}
              style={{ position: "absolute", left: HERO.gutter.edge, right: HERO.gutter.edge, bottom: insets.bottom + AURORA_NAV_BAR_HEIGHT + 14, zIndex: 30, opacity: dockOpacity as never, transform: [{ translateY: dockRise as never }] }}
            >
              {dock}
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The hero's geometry, for a screen that owns its own scaffold (the Wrapped
 *  takeover) but must still place its rail at the system's y. */
export function useHeroGeometry(rank: HeroRank, mode: HeroMode = "page"): HeroGeometry {
  const insets = useSafeAreaInsets();
  return useMemo(() => heroGeometry(rank, insets.top, mode), [rank, insets.top, mode]);
}
