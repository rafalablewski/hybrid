import { useRef, useState, useEffect, useId } from "react";
import { View, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform, Easing } from "react-native";
import { BlurView } from "expo-blur";
import { Host, RoundedRectangle, Namespace, GlassEffectContainer, HStack, ZStack } from "@expo/ui/swift-ui";
import { glassEffect, glassEffectId, frame } from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
import { useRouter, useSegments, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useSession } from "../../lib/session";
import { useTemplate } from "../../lib/template";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useNavScroll } from "../../lib/nav-scroll";
import { AuroraIcon } from "./icons";

// The bottom nav: Today · Explore · [Train FAB] · More · Profile. Train is the
// elevated centre action (a raised lime FAB that punches up through the bar).
// Explore opens the social/discovery surface (the Feed); Profile returns to the
// bar (it also lives in the Today header). Plans · History · Cockpit stay
// reachable from the More hub. Side glyphs are design-kit line icons only.
type Side = { id: string; glyph: AuroraIconName; labelKey?: string; label?: string; href: Href; seg: string };
const LEFT: Side[] = [
  { id: "today", glyph: "village", labelKey: "nav.today", href: "/(tabs)", seg: "index" },
  { id: "explore", glyph: "globe", labelKey: "nav.explore", href: "/explore", seg: "explore" },
];
const RIGHT: Side[] = [
  { id: "more", glyph: "grid", labelKey: "nav.more", href: "/(tabs)/more", seg: "more" },
  { id: "profile", glyph: "user-circle", labelKey: "nav.profile", href: "/(tabs)/you", seg: "you" },
];
const SIDES: Side[] = [...LEFT, ...RIGHT];
// The centre Train action opens the Train launcher hub (start today's session,
// AI/repeat-last, routines, resume a draft) — matching web, where the Train FAB
// also opens the launcher. From there one tap drops into the live logger.
const TRAIN: { href: Href; seg: string } = { href: "/(tabs)/log", seg: "log" };

// Routes that should NOT show the bar: auth/funnel + the focused live workout
// (accidental nav mid-set loses context). Everything else gets it.
const HIDE_ON = new Set(["login", "welcome", "onboarding", "workout", "upgrade"]);

// The sliding highlight's size (matches the old per-item pill).
const PILL_W = 46;
const PILL_H = 40;

/**
 * AURORA global navigation — the floating pill bottom bar, rendered once at the
 * ROOT so it shows on EVERY screen (tab routes AND pushed sub-pages like
 * Statistics/Settings/Periodize), not just the five tabs. Router-driven (no
 * dependency on the Tabs navigator), self-gating to Aurora + an authed session.
 * Replaces the per-Tabs Aurora bar; Classic keeps its glass tab bar + command orb.
 */
export default function AuroraGlobalNav() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const aurora = useTemplate().template === "aurora";
  const { session, ready } = useSession();
  const persona = usePersona();
  const access = useNavAccess();
  const haptics = useLoggerPrefs().haptics;
  const navScroll = useNavScroll();

  // Shrink-on-scroll (the Instagram behaviour): the whole pill+FAB is full size
  // at the top and scales down smoothly as the active surface scrolls, driven by
  // the shared `collapse` value (0 → 1). Reset to full whenever the route
  // changes so landing on a new screen always starts expanded, even if the
  // previous screen was scrolled.
  const collapse = navScroll?.collapse;
  const routeKey = segments.join("/");
  useEffect(() => { navScroll?.reset(); }, [routeKey, navScroll]);
  const collapseScale = collapse ? collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) : 1;
  const collapseShift = collapse ? collapse.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) : 0;
  const collapseFade = collapse ? collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) : 1;

  // The selection highlight is a per-slot lens that CROSS-FADES between tabs
  // (opacity only), NOT a single lens that slides across the bar: sliding a
  // native glassEffect view re-samples its backdrop every frame and janks (the
  // "laggy movement between tabs"). Each slot owns an opacity Animated.Value;
  // selecting a tab fades its lens in and the others out, so nothing ever
  // travels. Train (the centre FAB) → all lenses fade out.
  const lensOpRef = useRef<Record<string, Animated.Value> | null>(null);
  if (!lensOpRef.current) lensOpRef.current = Object.fromEntries(SIDES.map((s) => [s.seg, new Animated.Value(0)]));
  const lensOp = lensOpRef.current;
  const firstRef = useRef(true);
  // Inner-row width — needed to lay the native glass-morph layer's slots out to
  // match the RN icons (SwiftUI frames take concrete widths, not flex).
  const [rowW, setRowW] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // OPTIMISTIC selection — the indicator + icon tint follow this, updated the
  // instant a tab is pressed (not when the route finally commits). Fixes the
  // "icon turns black, then a second later the pill slides in" lag: navigation
  // (useSegments) can take a beat to flip on a heavy screen, so previously the
  // tapped icon inverted to its dark on-pill colour immediately while the pill
  // was still waiting on the route. Now the pill leads; the route reconciles it.
  const [selectedSeg, setSelectedSeg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

  // Which side slot is lit, derived the same way as renderSideItem's `focused`:
  // a tab route matches on the second segment, a pushed route (e.g. Explore →
  // /explore) on the first. Train / unknown routes → null (indicator hidden).
  const top0 = segments[0];
  const inTabs0 = top0 === "(tabs)";
  const activeSeg0 = inTabs0 ? (segments[1] ?? "index") : null;
  const focusedSeg = SIDES.find((s) => activeSeg0 === s.seg || (!inTabs0 && top0 === s.seg))?.seg ?? null;
  // Reconcile the optimistic selection with the real route once it settles
  // (deep links, the back button, or a redirect that lands elsewhere than the
  // tapped tab). A press sets selectedSeg first; this keeps it honest after.
  useEffect(() => { setSelectedSeg(focusedSeg); }, [focusedSeg]);

  // iOS renders the moving highlight as REAL Liquid Glass (a native SwiftUI
  // glassEffect lens via @expo/ui — the same material the kit's GlassSurface
  // uses); Android falls back to the opaque chalk pill. Over the translucent
  // glass the active glyph stays bright (chalk) so it never inverts to an
  // invisible dark-on-glass; over the opaque chalk pill it flips to ink.
  const useGlass = Platform.OS === "ios";
  const activeIconColor = useGlass ? C.chalk : C.onAccent;

  useEffect(() => {
    // Cross-fade: the selected slot's lens → 1, every other → 0. Opacity only
    // (no translate/scale of the glass), so it stays smooth. Snap on first paint
    // or reduced motion.
    SIDES.forEach((s) => {
      const to = s.seg === selectedSeg ? 1 : 0;
      if (firstRef.current || reduceMotion) lensOp[s.seg].setValue(to);
      else Animated.timing(lensOp[s.seg], { toValue: to, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    firstRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeg, reduceMotion]);

  // Gate: Aurora only, signed in, and not on an auth/funnel/live-workout route.
  if (!aurora || !ready || !session) return null;
  const top = segments[0];
  if (!top || HIDE_ON.has(top)) return null;

  // Active tab from the route: inside (tabs) the second segment is the screen
  // ("index" when absent → Today); pushed routes match nothing (no highlight).
  const inTabs = top === "(tabs)";
  const activeSeg = inTabs ? (segments[1] ?? "index") : null;

  // Cockpit was removed from the bar (it lives under the More hub now); this gate
  // is kept referenced so the access/persona import stays meaningful.
  void navVisibleTo(persona, "cockpit", access);

  // Liquid-glass pill: a frosted BlurView lets the screen fizz through the bar —
  // but LIGHTER than the classic GlassCard (no grain/sheen, a more opaque tint
  // film so the nav stays legible over any content). Shadow on the OUTER view
  // (a rounded drop shadow); the INNER view clips the blur to the pill radius.
  const light = scheme === "light";
  const film = light ? "rgba(243,244,239,0.62)" : "rgba(20,22,20,0.55)";
  const rim = light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)";
  const border = light ? "rgba(20,30,15,0.12)" : "rgba(255,255,255,0.12)";
  const trainFocused = activeSeg === TRAIN.seg;
  // Selected slot index among the 4 side tabs (−1 = none, e.g. Train) — drives
  // which cell of the native glass-morph layer holds the lens.
  const selIdx = selectedSeg ? SIDES.findIndex((s) => s.seg === selectedSeg) : -1;
  // A render HELPER, not a nested component: defining a component inside render
  // makes React remount the whole subtree each render. A plain function that
  // returns JSX renders inline with no remount penalty.
  const renderSideItem = (tab: Side) => {
    // The VISUAL selection follows selectedSeg (optimistic), so the highlight +
    // icon tint respond the instant you tap; the ROUTE (focusedSeg) only decides
    // whether we still need to navigate.
    const isSel = selectedSeg === tab.seg;
    const onRoute = focusedSeg === tab.seg;
    const label = tab.labelKey ? t(tab.labelKey) : (tab.label ?? "");
    return (
      <Pressable
        key={tab.id}
        onPress={() => {
          setSelectedSeg(tab.seg);
          if (!onRoute) { if (haptics) Haptics.selectionAsync().catch(() => {}); router.navigate(tab.href); }
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isSel }}
        accessibilityLabel={label}
        hitSlop={8}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        {/* iOS: the selection highlight is a single native Liquid Glass lens that
            MORPHS between slots (rendered once, behind all icons — see
            GlassMorphSelector); nothing per-slot here. Android: an opaque chalk
            pill per slot that cross-fades (opacity only) so switching stays
            smooth without a native glass view. */}
        <View style={{ width: PILL_W, height: PILL_H, alignItems: "center", justifyContent: "center" }}>
          {!useGlass && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 20, backgroundColor: C.chalk, opacity: lensOp[tab.seg] }]} />
          )}
          <AuroraIcon name={tab.glyph} size={23} color={isSel ? activeIconColor : C.ash} />
        </View>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}>
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 999,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
          opacity: collapseFade,
          transform: [{ translateY: collapseShift }, { scale: collapseScale }],
        }}
      >
      {/* The frosted pill itself (clips the blur to the radius). The four side
          items sit either side of a centre gap reserved for the elevated FAB. */}
      <View
        style={{
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: border,
          paddingHorizontal: 10,
          paddingVertical: 9,
        }}
      >
        <BlurView intensity={28} tint={scheme} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
        {/* Inner row. On iOS the native glass-morph layer fills this row BEHIND
            the icons and travels between slots; the icons/FAB/taps stay RN, so
            the bar still works even if the native layer doesn't render. */}
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w && w !== rowW) setRowW(w); }}
        >
          {useGlass && rowW > 0 && <GlassMorphSelector rowW={rowW} selectedIndex={selIdx} />}
          {LEFT.map(renderSideItem)}
          {/* centre gap — the raised Train FAB overlays this slot */}
          <View style={{ width: 64 }} />
          {RIGHT.map(renderSideItem)}
        </View>
      </View>

      {/* ELEVATED TRAIN FAB — a larger lime circle raised above the bar, with a
          thick ink ring so it punches cleanly through, and a soft lime glow.
          Rendered in the OUTER (non-clipped) wrapper so it can overflow upward. */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        <Pressable
          onPress={() => { setSelectedSeg(null); if (!trainFocused) { if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.navigate(TRAIN.href); } }}
          accessibilityRole="button"
          accessibilityState={{ selected: trainFocused }}
          accessibilityLabel={t("nav.train")}
          hitSlop={8}
          style={{ alignItems: "center", transform: [{ translateY: -22 }] }}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: C.lime,
              borderWidth: 4,
              borderColor: C.ink,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: C.lime,
              shadowOpacity: 0.55,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 14,
            }}
          >
            {/* Dumbbell — two plate stacks + a connecting handle, drawn from Views
                (no SVG dep, matching the icon approach). */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 5, height: 20, borderRadius: 2, backgroundColor: C.ink }} />
              <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: C.ink, marginLeft: 1.5 }} />
              <View style={{ width: 11, height: 4, backgroundColor: C.ink }} />
              <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: C.ink, marginRight: 1.5 }} />
              <View style={{ width: 5, height: 20, borderRadius: 2, backgroundColor: C.ink }} />
            </View>
          </View>
        </Pressable>
      </View>
      </Animated.View>
    </View>
  );
}

/**
 * The iOS selection highlight — a SINGLE native Liquid Glass lens that MORPHS
 * between tab slots (Apple's matched-geometry travel), instead of a JS-driven
 * translate that re-samples the glass every frame and janks. All four slot cells
 * live in one GlassEffectContainer under a Namespace; only the selected cell
 * renders the glass RoundedRectangle, tagged with a stable glassEffectId — so
 * when the selection moves, SwiftUI fluidly morphs the glass across. Laid out
 * with concrete widths (SwiftUI frames aren't flex) to match the RN icons: four
 * equal slots of (rowW − 64) / 4 with a fixed 64pt centre gap for the Train FAB.
 * Rendered behind the RN glyphs and pointer-transparent; if the native layer
 * fails to render the bar still works (the glyphs + taps are all RN).
 */
function GlassMorphSelector({ rowW, selectedIndex }: { rowW: number; selectedIndex: number }) {
  const nsId = useId();
  const slotW = Math.max(0, (rowW - 64) / 4);
  const cell = (i: number) => (
    <ZStack key={i} modifiers={[frame({ width: slotW, height: PILL_H })]}>
      {selectedIndex === i ? (
        <RoundedRectangle
          cornerRadius={20}
          modifiers={[
            frame({ width: PILL_W, height: PILL_H }),
            glassEffect({ glass: { variant: "regular" }, shape: "roundedRectangle", cornerRadius: 20 }),
            glassEffectId("sel", nsId),
          ]}
        />
      ) : null}
    </ZStack>
  );
  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <Namespace id={nsId}>
        <GlassEffectContainer>
          <HStack spacing={0} modifiers={[frame({ height: PILL_H })]}>
            {cell(0)}
            {cell(1)}
            {/* fixed centre gap — the raised Train FAB overlays this */}
            <ZStack modifiers={[frame({ width: 64, height: PILL_H })]}>{null}</ZStack>
            {cell(2)}
            {cell(3)}
          </HStack>
        </GlassEffectContainer>
      </Namespace>
    </Host>
  );
}
