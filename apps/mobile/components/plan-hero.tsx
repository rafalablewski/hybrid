import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HERO, HERO_INK, HERO_INLINE_TITLE, heroGeometry, heroSnapTarget, planCoverView, type GoalNode, type GoalPlan, type PlanProgram } from "@hybrid/core";
import { AURORA_NAV_BAR_HEIGHT, auroraScrollClearance } from "../lib/layout";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useNavScroll } from "../lib/nav-scroll";
import { useTheme, txt } from "../lib/theme";
import { fs, F, serifIf, useEntrance, PressScale as Pressable } from "../lib/ui";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { AuroraField, withAlpha } from "./aurora/kit";
import { HeroAccessory, HeroEyebrow, HeroMetadata, HeroNav, HeroTitle } from "./aurora/hero";
import { haptic } from "../lib/haptics";

/** The Explore PlanCover's fixed-dark base — the cover is dark in BOTH themes,
 *  exactly like the Explore cards it grows out of. Now the HERO SYSTEM's ink
 *  (packages/core/src/hero.ts), so the cover, the Wrapped takeover and every
 *  future art hero start from one colour. */
const COVER_INK = HERO_INK;

/** The docked enroll pill both detail renderers hand to PlanCoverScreen's dock
 *  slot — lime while actionable, a quiet bordered status pill once enrolled. */
export function PlanDockPill({ state, idleLabel, busyLabel, doneLabel, onPress }: { state: "idle" | "busy" | "done" | "error"; idleLabel: string; busyLabel: string; doneLabel: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  const done = state === "done";
  return (
    <Pressable
      onPress={onPress}
      disabled={state === "busy" || done}
      accessibilityRole="button"
      style={{
        height: 50,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: done ? C.ink2 : C.lime,
        borderWidth: 1,
        borderColor: done ? C.line : C.lime,
        shadowColor: done ? "#000" : C.lime,
        shadowOpacity: done ? 0.2 : 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: done ? txt(C, C.lime) : C.onAccent }}>
        {state === "busy" ? busyLabel : done ? `✓ ${doneLabel}` : idleLabel}
      </Text>
    </Pressable>
  );
}

/** Geometry comes from the HERO SYSTEM — this screen is rank `cover`, and it
 *  collapses to the same bar every other rank collapses to, at the same rail y.
 *  See reference/hero-system.md. */
const BAR_CONTENT = HERO.height.bar;
const COVER_CONTENT = HERO.height.cover;

/** ── the seam ──────────────────────────────────────────────────────────────
 *  The cover's bottom edge used to butt straight up against the page and read
 *  as a CUT: both sides are near-black, but the cover carries its own accent
 *  wash + title scrim while the page carries the AuroraField wash, so the two
 *  never quite match and the join draws a line right above the first card.
 *  This band continues the cover ink DOWN into the page and dissolves it, so
 *  the two washes cross-fade instead of meeting at an edge. `OVER` is an opaque
 *  head that lives BEHIND the cover — it keeps the join seamless while the
 *  ScrollView rubber-bands away from the pinned cover at the top of the list. */
const BLEED_OVER = 64;
const BLEED_FADE = 148;
/** Eased ink→nothing ramp (a linear alpha ramp bands and dies too early). Both
 *  ends share the cover's RGB, so the interpolation never greys out. */
const BLEED = (() => {
  const head = BLEED_OVER / (BLEED_OVER + BLEED_FADE);
  const at = (f: number) => head + f * (1 - head);
  return {
    colors: [COVER_INK, COVER_INK, `${COVER_INK}e6`, `${COVER_INK}9e`, `${COVER_INK}4d`, `${COVER_INK}00`] as [string, string, ...string[]],
    locations: [0, head, at(0.22), at(0.45), at(0.68), 1] as [number, number, ...number[]],
  };
})();

/** What the scaffold needs to draw a cover — a structural subset of core's
 *  PlanCoverView, so the GOAL-level cover (goalCoverView) rides the exact same
 *  scaffold with its plan-count label in the duration slot. */
export interface CoverSpec {
  accent: string;
  glyph: string;
  chip: string;
  /** top-right mono label — "8 WEEKS" on a plan, "1 PLAN" on a goal. */
  duration: string;
  title: string;
  metaParts: (string | null)[];
  /** rule-topped hem columns; [] skips the hem entirely. */
  stats: { value: string; unit: string | null; label: string }[];
  blurb: string;
  /** Same material, different object. "plan" (default) is the POSTER — wash
   *  from the top-RIGHT corner, modest ghost glyph, mono meta under the title,
   *  blurb below on the ink. "goal" is the EMBLEM — the discipline's mark
   *  blown up as the cover art (bigger, brighter, deeper parallax), the wash
   *  mirrored to the top-LEFT so the two levels never read as the same
   *  cover, and the blurb ON the cover face instead of the meta line.
   *  "library" is the SHELF — the Plans root. Emblem-sized glyph like the goal,
   *  but the wash comes from the right like the plan AND runs at a softer mix:
   *  its accent is the theme's own primary (no discipline owns "Plans"), and
   *  the container must not out-shout the nineteen goal accents it holds.
   *  "recipe" is the PLATE — the dish emoji at emblem scale and FULL COLOUR
   *  (a ghosted 7%-white emoji is a grey smudge, not a dish), which is why it
   *  is also the one variant that fades to NOTHING rather than to a residue:
   *  a monochrome mark can drift into the pinned bar as texture, a colour
   *  emoji only smears behind the bar title. Meta line + blurb-below like the
   *  plan, because a recipe has both and a poster is the right object. */
  variant?: "plan" | "goal" | "library" | "recipe";
}

/** Imperative handle onto the scaffold's scroll, for a `rail` that navigates
 *  the content beneath it (the Plans root's category chips). */
export interface CoverScreenApi {
  /** Scroll so the child at `y` — measured by the CHILD's own onLayout, i.e.
   *  relative to the children slot — comes to rest just under the collapsed bar
   *  and the docked rail. The scaffold owns both of those offsets, so callers
   *  never have to reconstruct them from insets. */
  scrollToChild: (y: number, animated?: boolean) => void;
}

/**
 * PlanCoverScreen — the plan detail's full-bleed collapsing cover scaffold,
 * shared by BOTH mobile detail renderers (discipline-shaped program + classic).
 *
 * The cover is the Explore PlanCover recipe at screen scale (one shared
 * planCoverView so the two can't drift): duotone accent wash over fixed cover
 * ink, ghost discipline glyph, white chip, bottom-anchored display title. It
 * sits at y=0 under the status bar, PINS, and compresses 1:1 with scroll into a
 * 56dp glass bar — pure transform/opacity interpolation off one scrollY value
 * (the NavScrollProvider idiom), never a height animation. Deliberately NOT
 * suppressed under Reduce Motion: this is direct manipulation tracking the
 * finger, the same stance as the shipped masthead compression; only the
 * released-mid-range snap degrades to an instant settle.
 *
 * Slots: `top` renders above the sticky `rail` (which docks beneath the
 * collapsed bar), `children` below it; `dock` is the CTA pill that surfaces
 * above the tab bar as the cover finishes collapsing.
 */
export default function PlanCoverScreen({
  goal,
  plan,
  program,
  back,
  top,
  rail,
  dock,
  children,
}: {
  goal: GoalNode;
  plan: GoalPlan;
  program?: PlanProgram;
  back: () => void;
  top?: ReactNode;
  rail?: ReactNode;
  dock?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <CoverScreen cover={planCoverView(goal, plan, program)} backLabel={goal.name} back={back} top={top} rail={rail} dock={dock}>
      {children}
    </CoverScreen>
  );
}

/** The generic scaffold behind PlanCoverScreen — same collapse physics, snap
 *  detent and dock for ANY CoverSpec (plan detail and the goal/category hero). */
export function CoverScreen({
  cover,
  backLabel,
  back,
  top,
  rail,
  dock,
  scrollApi,
  children,
}: {
  cover: CoverSpec;
  /** what the ← button announces ("← Olympic Weightlifting" / "← All goals"). */
  backLabel: string;
  back: () => void;
  top?: ReactNode;
  rail?: ReactNode;
  dock?: ReactNode;
  /** filled with the scroll handle, so a `rail` can jump the content. */
  scrollApi?: { current: CoverScreenApi | null };
  children?: ReactNode;
}) {
  const { palette: C, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const library = cover.variant === "library";
  const plate = cover.variant === "recipe";
  // Every non-plan level blows the glyph up as cover art; only the goal mirrors
  // the light source to the left.
  const emblem = cover.variant === "goal" || library || plate;
  const mirrored = cover.variant === "goal";
  // The goal puts its blurb ON the cover face; plan and recipe put it under the
  // hem and keep the mono meta line on the face.
  const blurbOnFace = cover.variant === "goal";
  // Four hem columns (a recipe's four macros) need tighter type than three.
  const wide = cover.stats.length > 3;
  const geom = heroGeometry("cover", insets.top);
  const heroH = geom.height;
  const barH = geom.barHeight;
  const delta = geom.delta;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const dockedRef = useRef(false);
  const [docked, setDocked] = useState(false);
  const [railTop, setRailTop] = useState<number | null>(null);
  // Measured so `scrollToChild` can land a child under the bar + docked rail
  // without the caller reconstructing either offset.
  const childrenTop = useRef(0);
  const railH = useRef(0);
  const ns = useNavScroll();
  const reduced = useReducedMotion();
  const entrance = useEntrance();

  useEffect(() => {
    if (!scrollApi) return;
    scrollApi.current = {
      scrollToChild: (y, animated = true) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, childrenTop.current + y - barH - railH.current), animated }),
    };
    return () => {
      scrollApi.current = null;
    };
  }, [scrollApi, barH]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.setValue(y);
    const wantDock = y > delta * 0.45;
    if (wantDock !== dockedRef.current) {
      dockedRef.current = wantDock;
      setDocked(wantDock);
    }
    ns?.onScroll(e);
  };

  // Released mid-collapse → settle to the nearer pole. A genuine detent, so it
  // may buzz (user-gated); under Reduce Motion the settle is an instant jump.
  const snap = (y: number) => {
    const target = heroSnapTarget(y, geom);
    if (target == null) return;
    scrollRef.current?.scrollTo({ y: target, animated: !reduced });
    haptic.selection();
  };

  // Every hero layer reads from the ONE scroll track (0 → delta), 1:1 with the
  // finger. Frame slides up; the bar chrome counter-translates to stay put.
  const clamp = (input: [number, number], output: [number, number]) =>
    scrollY.interpolate({ inputRange: input, outputRange: output, extrapolate: "clamp" });
  const heroShift = clamp([0, delta], [0, -delta]);
  const counter = clamp([0, delta], [0, delta]);
  // Every detent below is the HERO SYSTEM's, published once in core — the
  // reason this cover and the web twin can no longer drift on WHEN the title
  // leaves or the bar arrives.
  const D = HERO.detent;
  const glyphCounter = clamp([0, delta], [0, delta * (emblem ? HERO.parallax.emblem : HERO.parallax.art)]);
  // A monochrome ghost can survive into the pinned bar as texture; the recipe
  // plate is a full-colour emoji, so it has to be gone by the time the bar is.
  const glyphFade = plate ? clamp([0, delta * HERO.colourArtOut], [1, HERO.artFloor.colour]) : clamp([0, delta], [1, HERO.artFloor.ghost]);
  const scrimFade = clamp([0, delta], [1, 0]);
  const bigFade = clamp([0, delta * D.titleOut], [1, 0]);
  const compactFade = clamp([delta * D.inlineIn, delta], [0, 1]);
  const hairFade = clamp([delta * D.hairlineIn, delta], [0, 1]);
  const dockFade = clamp([delta * D.dock, delta], [0, 1]);
  const dockRise = clamp([delta * D.dock, delta], [HERO.motion.rise, 0]);
  // The rail docks beneath the collapsed bar: once its natural position would
  // scroll past `barH`, it translates down to hold there (second sticky layer).
  const railShift =
    railTop != null
      ? scrollY.interpolate({
          inputRange: [Math.max(0, railTop - barH), Math.max(0, railTop - barH) + 100000],
          outputRange: [0, 100000],
          extrapolateLeft: "clamp",
        })
      : 0;

  const accent = cover.accent;
  // SVG gradient ids are document-global; scope per mount so stacked covers
  // (push navigation) can't cross-reference. useId's ":" is illegal in url().
  const hotspotId = `cover-hotspot-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {/* the cover is fixed-dark even in the light theme → light status icons */}
      <StatusBar style="light" />
      <AuroraField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[{ flex: 1 }, entrance]}>
          {/* the cover ink bleeding into the page — glued to the CONTENT (not
              the cover), so it slides up under the pinned cover and is gone by
              the time the collapsed bar's hairline takes over as the edge. Dark
              only: on the light theme a dark poster meeting warm paper is a
              real boundary, not an artifact, and a dark veil there would only
              muddy the hem underneath it. */}
          {scheme !== "light" && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: heroH - BLEED_OVER,
                height: BLEED_OVER + BLEED_FADE,
                opacity: scrimFade,
                transform: [{ translateY: Animated.multiply(scrollY, -1) }],
              }}
            >
              <LinearGradient colors={BLEED.colors} locations={BLEED.locations} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onScrollEndDrag={(e) => {
              const v = e.nativeEvent.velocity?.y ?? 0;
              if (Math.abs(v) < 0.15) snap(e.nativeEvent.contentOffset.y);
            }}
            onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: heroH, paddingBottom: auroraScrollClearance(insets.bottom) + 66 }}
          >
            {/* the hem — editorial rule-topped stat columns directly on the ink,
                the first content to slide under the pinned cover. */}
            <View style={{ paddingHorizontal: HERO.gutter.edge }}>
              {cover.stats.length > 0 && (
                <View style={{ flexDirection: "row", gap: wide ? 12 : 18, marginTop: 16, marginBottom: 16 }}>
                  {cover.stats.map((s) => (
                    <View key={s.label} style={{ flex: 1, borderTopWidth: 2, borderTopColor: withAlpha(C.chalk, 0.18), paddingTop: 10 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: wide ? 22 : 27, lineHeight: wide ? 24 : 28, letterSpacing: -0.5, color: C.chalk, fontVariant: ["tabular-nums"] }}>
                        {s.value}
                        {!!s.unit && <Text style={{ fontSize: wide ? 12 : 14, color: C.ash }}>{s.unit}</Text>}
                      </Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: wide ? 8.5 : fs.nano, letterSpacing: wide ? 0.8 : 1.4, textTransform: "uppercase", color: C.ash, marginTop: 6 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!blurbOnFace && !!cover.blurb && <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 22, color: C.ash, marginTop: cover.stats.length ? 0 : 16, marginBottom: 4 }}>{cover.blurb}</Text>}
              {top}
            </View>

            {rail && (
              <Animated.View
                onLayout={(e) => setRailTop(e.nativeEvent.layout.y)}
                style={{ zIndex: 10, transform: [{ translateY: railShift }] }}
              >
                <View
                  onLayout={(e) => {
                    railH.current = e.nativeEvent.layout.height;
                  }}
                  style={{ backgroundColor: withAlpha(C.ink, 0.88), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, overflow: "hidden" }}
                >
                  <BlurView intensity={26} tint={scheme === "light" ? "light" : "dark"} style={StyleSheet.absoluteFill} />
                  {rail}
                </View>
              </Animated.View>
            )}

            <View
              onLayout={(e) => {
                childrenTop.current = e.nativeEvent.layout.y;
              }}
              style={{ paddingHorizontal: 16 }}
            >
              {children}
            </View>
          </ScrollView>

          {/* ── the cover: pinned overlay, slides up by exactly the scroll ── */}
          <Animated.View
            pointerEvents="box-none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroH, zIndex: 20, overflow: "hidden", backgroundColor: COVER_INK, transform: [{ translateY: heroShift }] }}
          >
            {/* duotone wash bleeding from the top corner (Explore recipe) —
                mirrored to the LEFT on the goal emblem so the light source
                itself tells you which level you're on, and run at a SOFTER mix
                on the library so the root never out-shouts the goal accents
                sitting on the shelves beneath it */}
            <LinearGradient
              // Alpha-over-ink stops matching web's color-mix recipe exactly:
              // color-mix(accent 52%, ink) ≈ accent @ 0x85 over the ink base,
              // 15% ≈ 0x26 at the 46% stop, then pure ink (library: 34%/10% →
              // 0x57/0x1a). Web parity: cover-hero.tsx layer 1.
              colors={library ? [`${accent}57`, `${accent}1a`, `${accent}00`] : [`${accent}85`, `${accent}26`, `${accent}00`]}
              locations={[0, 0.46, 1]}
              start={mirrored ? { x: 0.1, y: 0 } : { x: 0.9, y: 0 }}
              end={mirrored ? { x: 0.8, y: 0.95 } : { x: 0.2, y: 0.95 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* radial hotspot at the wash's source corner — web parity:
                radial-gradient(120% 92% at 86%|14% 8%, accent @ 42%|26%,
                transparent 55%). SVG radial fill: the closest RN equivalent. */}
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id={hotspotId} cx={mirrored ? 0.14 : 0.86} cy={0.08} rx={1.2} ry={0.92}>
                  <Stop offset="0" stopColor={accent} stopOpacity={library ? 0.26 : 0.42} />
                  <Stop offset="0.55" stopColor={accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${hotspotId})`} />
            </Svg>
            {/* bottom scrim for title legibility — retired as the title leaves.
                The last sliver runs out to FULLY opaque cover ink (below the
                title, so the poster's wash is untouched) so the bleed band
                underneath starts from exactly the same colour. */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: scrimFade }]}>
              <LinearGradient colors={["#0c0d0c00", "#0c0d0ccc", COVER_INK]} locations={[0, 0.95, 1]} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {/* the art — parallax drift against the frame. On the goal emblem it
                IS the subject: bigger, brighter, deeper. */}
            <Animated.Text
              pointerEvents="none"
              style={{
                position: "absolute",
                top: insets.top - (plate ? 0 : emblem ? 4 : 26),
                right: plate ? -18 : emblem ? -30 : -10,
                fontSize: emblem ? 214 : 150,
                lineHeight: emblem ? 222 : 158,
                // the dish keeps its own colour; every other cover art is a ghost
                ...(plate ? null : { color: `rgba(255,255,255,${emblem ? 0.09 : 0.07})` }),
                opacity: glyphFade,
                transform: [{ translateY: glyphCounter }],
              }}
            >
              {cover.glyph}
            </Animated.Text>

            {/* THE RAIL — the system's spatial constant: same y, same 40pt
                circular nav button, same trailing metadata slot as every other
                screen in the app. It counter-translates the frame, so the
                button never moves on screen. */}
            <Animated.View style={{ position: "absolute", top: geom.railTop, left: HERO.gutter.edge, right: HERO.gutter.edge, height: HERO.rail.height, flexDirection: "row", justifyContent: "space-between", alignItems: "center", zIndex: 3, transform: [{ translateY: counter }] }}>
              <HeroNav onPress={back} fromLabel={backLabel} material="glass" onDark />
              <HeroAccessory label={cover.duration} />
            </Animated.View>

            {/* compact bar title — fades in a beat after the big one leaves */}
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: "absolute", top: geom.railTop, left: HERO.gutter.edge + HERO.nav.hit + 8, right: HERO.gutter.edge + HERO.nav.hit + 8, height: HERO.rail.height, alignItems: "center", justifyContent: "center", zIndex: 2, opacity: compactFade, transform: [{ translateY: counter }] }}
            >
              <Text numberOfLines={1} style={{ fontFamily: serifIf(scheme, F.bold), fontSize: HERO_INLINE_TITLE.size, lineHeight: HERO_INLINE_TITLE.lineHeight, letterSpacing: HERO_INLINE_TITLE.tracking * HERO_INLINE_TITLE.size, color: "#fff" }}>{cover.title}</Text>
            </Animated.View>

            {/* the cover proper — chip, title, meta; slides up with the frame */}
            {/* the display block — eyebrow, title, meta. BOTTOM-ANCHORED, so a
                two-line title grows upward into the art and the hem below never
                moves because a plan's name got longer. */}
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: HERO.gutter.hero, right: HERO.gutter.hero, bottom: HERO.rail.bottom + 10, opacity: bigFade }}>
              <View style={{ marginBottom: 10 }}>
                <HeroEyebrow label={cover.chip} tone="solid" accent={accent} />
              </View>
              <HeroTitle title={cover.title} rank="cover" style={{ maxWidth: "88%" } as never} />
              {blurbOnFace ? (
                <Text numberOfLines={2} style={{ fontFamily: F.reg, fontSize: 13, lineHeight: 18, color: `rgba(255,255,255,${HERO.alpha.dim})`, maxWidth: "88%", marginTop: 8 }}>{cover.blurb}</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <HeroMetadata parts={cover.metaParts} />
                </View>
              )}
            </Animated.View>

            {/* hairline — the collapsed bar's bottom edge */}
            <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: `rgba(255,255,255,${HERO.alpha.hairline})`, opacity: hairFade }} />
          </Animated.View>

          {/* ── the dock: CTA pill above the tab bar, arrives with the collapse ── */}
          {dock && (
            <Animated.View
              pointerEvents={docked ? "box-none" : "none"}
              style={{ position: "absolute", left: HERO.gutter.edge, right: HERO.gutter.edge, bottom: insets.bottom + AURORA_NAV_BAR_HEIGHT + 14, zIndex: 30, opacity: dockFade, transform: [{ translateY: dockRise }] }}
            >
              {dock}
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
