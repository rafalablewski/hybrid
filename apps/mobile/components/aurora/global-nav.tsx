import { useRef, useState, useEffect } from "react";
import { View, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform, Easing } from "react-native";
import { BlurView } from "expo-blur";
import { Host, RoundedRectangle, ZStack } from "@expo/ui/swift-ui";
import { glassEffect, frame, offset, opacity, animation, Animation } from "@expo/ui/swift-ui/modifiers";
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
import { AuroraSvgIcon } from "./icons";

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

// The sliding highlight's size. Widened toward Instagram's proportions (the
// lens reads as "the selection", not a small token drifting behind the glyph).
const PILL_W = 56;
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

  // Which side slot the ROUTE says is lit: a tab route matches on the second
  // segment, a pushed route (e.g. Explore → /explore) on the first. Train /
  // unknown routes → null (indicator hidden). Derived up here so the selection
  // state + per-slot Animated.Values can be SEEDED with it — seeding everything
  // to 0/null and reconciling after mount flashed the active tab dark for a
  // frame, then animated it in, on every bar mount (review finding).
  const top0 = segments[0];
  const inTabs0 = top0 === "(tabs)";
  const activeSeg0 = inTabs0 ? (segments[1] ?? "index") : null;
  const focusedSeg = SIDES.find((s) => activeSeg0 === s.seg || (!inTabs0 && top0 === s.seg))?.seg ?? null;

  // Android's selection highlight is a per-slot chalk pill that CROSS-FADES
  // between tabs (opacity only; iOS gets the travelling native glass lens —
  // see GlassMorphSelector). Each slot owns an opacity Animated.Value.
  const lensOpRef = useRef<Record<string, Animated.Value> | null>(null);
  if (!lensOpRef.current) lensOpRef.current = Object.fromEntries(SIDES.map((s) => [s.seg, new Animated.Value(s.seg === focusedSeg ? 1 : 0)]));
  const lensOp = lensOpRef.current;
  // Active-glyph tint is a CROSSFADE synced to the lens ARRIVAL, not an instant
  // flip on press. The instant flip was the biggest "lag" tell (Instagram
  // audit): the destination icon lit up a full ~250ms before the lens got
  // there, so the eye read "tap registered… now watch a slow bubble catch up".
  // Incoming glyph fades in slightly DELAYED (meets the lens as it lands);
  // outgoing fades back quickly as the lens departs.
  const iconOpRef = useRef<Record<string, Animated.Value> | null>(null);
  if (!iconOpRef.current) iconOpRef.current = Object.fromEntries(SIDES.map((s) => [s.seg, new Animated.Value(s.seg === focusedSeg ? 1 : 0)]));
  const iconOp = iconOpRef.current;
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
  // Seeded from the route so the first paint is already correct (no mount flash).
  const [selectedSeg, setSelectedSeg] = useState<string | null>(focusedSeg);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);

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
    // Android lens cross-fade + (both platforms) the active-glyph tint
    // crossfade. The glyph is timed to the lens: incoming waits ~a beat then
    // fades in as the lens arrives (iOS spring lands ~250-300ms after press;
    // Android's in-place fade is quicker, so the delay is shorter); outgoing
    // fades back immediately as the lens leaves. Snap on first paint or
    // reduced motion.
    SIDES.forEach((s) => {
      const to = s.seg === selectedSeg ? 1 : 0;
      if (firstRef.current || reduceMotion) {
        lensOp[s.seg].setValue(to);
        iconOp[s.seg].setValue(to);
      } else {
        Animated.timing(lensOp[s.seg], { toValue: to, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        Animated.timing(iconOp[s.seg], {
          toValue: to,
          duration: to ? 200 : 120,
          delay: to ? (useGlass ? 90 : 40) : 0,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
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
            TRAVELS between slots (rendered once, behind all icons — see
            GlassMorphSelector); nothing per-slot here. Android: an opaque chalk
            pill per slot that cross-fades (opacity only) so switching stays
            smooth without a native glass view. The glyph is TWO stacked icons
            (ash base + active tint overlay) so the tint CROSSFADES in sync with
            the lens instead of flipping instantly on press. */}
        <View style={{ width: PILL_W, height: PILL_H, alignItems: "center", justifyContent: "center" }}>
          {!useGlass && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 20, backgroundColor: C.chalk, opacity: lensOp[tab.seg] }]} />
          )}
          <AuroraSvgIcon name={tab.glyph} size={23} color={C.ash} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: iconOp[tab.seg] }]}>
            <AuroraSvgIcon name={tab.glyph} size={23} color={activeIconColor} />
          </Animated.View>
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
          {useGlass && rowW > 0 && <GlassMorphSelector rowW={rowW} selectedIndex={selIdx} reduceMotion={reduceMotion} />}
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
 * The iOS selection highlight — a SINGLE, PERSISTENT native Liquid Glass lens
 * that TRAVELS between slots via an animated SwiftUI `.offset`, driven by
 * `.animation(_:value:)` keyed to a monotonic pose tick.
 *
 * Why this shape (from auditing @expo/ui's native Swift): matched-geometry
 * (GlassEffectContainer + glassEffectId) morphs on INSERT/REMOVE, but an
 * ancestor `.animation(value:)` doesn't animate a child appearing/disappearing
 * — so a per-cell "only the selected cell has glass" design SNAPS. The pattern
 * that actually animates is a PERSISTING view whose animatable property changes
 * under `.animation(value:)` — exactly what @expo/ui's own ChartView does
 * (`.animation(.easeInOut, value: props.data.count)`). So: one glass lens,
 * centred, shifted by an animated offset. The animation runs natively in
 * SwiftUI (not a JS-driven transform over the bridge, which is what janked
 * earlier), so the travel is smooth.
 *
 * Instagram-audit refinements (the earlier build travelled but read "laggy"):
 * (1) STRETCH — the lens elongates toward the target while moving (frame width
 *     springs up scaled by travel distance, then settles back ~150ms later; two
 *     poses, each animated natively under the same spring). IG's blob-stretch
 *     is what makes an identical duration read as snappy instead of floaty.
 * (2) Snappier spring: response 0.32 / damping 0.74 (was 0.38/0.82 — barely any
 *     arrival energy) — a touch of overshoot on landing.
 * (3) NEVER UNMOUNTS — selecting Train used to `return null`, so leaving or
 *     re-entering a side tab POPPED (SwiftUI can't animate a remount; the very
 *     trap documented above). The lens now stays mounted and fades via an
 *     animated `opacity` instead.
 * Every pose change bumps `tick`, the `.animation(value:)` key, so each phase
 * (travel+stretch → settle → hide/show) animates natively in SwiftUI.
 *
 * Offsets are from the row centre. Slots are (rowW−64)/4 wide with a 64pt centre
 * gap for the Train FAB, so the four slot centres sit at ∓(1.5·slotW+32) and
 * ∓(0.5·slotW+32) around centre. Rendered behind the RN glyphs, pointer-
 * transparent; the glyphs/FAB/taps are all RN so the bar works regardless.
 */
function GlassMorphSelector({ rowW, selectedIndex, reduceMotion }: { rowW: number; selectedIndex: number; reduceMotion: boolean }) {
  const slotW = Math.max(0, (rowW - 64) / 4);
  const xFor = (i: number) =>
    i === 0 ? -(1.5 * slotW) - 32
    : i === 1 ? -(0.5 * slotW) - 32
    : i === 2 ? 0.5 * slotW + 32
    : 1.5 * slotW + 32;
  const [pose, setPose] = useState(() => ({
    x: selectedIndex >= 0 ? xFor(selectedIndex) : 0,
    w: PILL_W,
    shown: selectedIndex >= 0,
    tick: 0,
  }));
  const prevIdxRef = useRef(selectedIndex);
  const slotWRef = useRef(slotW);

  useEffect(() => {
    const prev = prevIdxRef.current;
    prevIdxRef.current = selectedIndex;
    if (selectedIndex === prev) return;
    if (selectedIndex < 0) {
      // Train: fade out IN PLACE (staying mounted is what keeps this animatable).
      setPose((p) => ({ ...p, w: PILL_W, shown: false, tick: p.tick + 1 }));
      return;
    }
    const x = xFor(selectedIndex);
    if (prev < 0 || reduceMotion) {
      // Reappear after Train (or reduced motion): settle at the slot, fading in.
      setPose((p) => ({ x, w: PILL_W, shown: true, tick: p.tick + 1 }));
      return;
    }
    // Travel: stretch toward the target on take-off, contract on arrival.
    const stretchW = Math.min(PILL_W + Math.abs(x - xFor(prev)) * 0.3, PILL_W * 2);
    setPose((p) => ({ x, w: stretchW, shown: true, tick: p.tick + 1 }));
    const settle = setTimeout(() => setPose((p) => ({ ...p, w: PILL_W, tick: p.tick + 1 })), 150);
    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, reduceMotion]);

  // Bar relayout (rotation/resize): reposition WITHOUT animating (tick unchanged).
  useEffect(() => {
    if (slotWRef.current === slotW) return;
    slotWRef.current = slotW;
    setPose((p) => (prevIdxRef.current >= 0 ? { ...p, x: xFor(prevIdxRef.current), w: PILL_W } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotW]);

  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <ZStack>
        <RoundedRectangle
          cornerRadius={20}
          modifiers={[
            frame({ width: pose.w, height: PILL_H }),
            glassEffect({ glass: { variant: "regular" }, shape: "roundedRectangle", cornerRadius: 20 }),
            offset({ x: pose.x, y: 0 }),
            opacity(pose.shown ? 1 : 0),
            animation(
              reduceMotion ? Animation.linear({ duration: 0 }) : Animation.spring({ response: 0.32, dampingFraction: 0.74 }),
              pose.tick,
            ),
          ]}
        />
      </ZStack>
    </Host>
  );
}
