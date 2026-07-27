import { useRef, useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform, Easing } from "react-native";
import { BlurView } from "expo-blur";
import { Host, Capsule, ZStack } from "@expo/ui/swift-ui";
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
import { fs, F } from "../../lib/ui";
import { AuroraSvgIcon } from "./icons";

// The bottom nav, in the iOS 26 SwiftUI TabView anatomy: the four side tabs
// (Today · Explore · More · Profile) live INSIDE a Liquid Glass capsule, and
// Train floats BESIDE it as a detached circular action — Apple's split tab bar
// (the tab group + the standalone accessory, like Search in the system apps).
// This replaces the old centre FAB that punched up through the bar. Explore
// opens the social/discovery surface (the Feed); Profile also lives in the
// Today header. Plans · History · Cockpit stay reachable from the More hub.
// Side glyphs are design-kit line icons only.
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
// The detached Train action opens the Train launcher hub (start today's
// session, AI/repeat-last, routines, resume a draft) — matching web, where the
// Train circle also opens the launcher. From there one tap drops into the live
// logger.
const TRAIN: { href: Href; seg: string } = { href: "/(tabs)/log", seg: "log" };

// Routes that should NOT show the bar: auth/funnel + the focused live workout
// (accidental nav mid-set loses context). Everything else gets it.
const HIDE_ON = new Set(["login", "welcome", "onboarding", "workout", "upgrade"]);

// iOS 26 tab-bar geometry: each slot is icon + label (like the native TabView
// items), the selection lens is a capsule covering both, and the detached
// Train circle matches the bar's full height.
const LENS_W = 60; // selection lens width
const SLOT_H = 46; // slot content height (icon + label) = lens height
const BAR_PAD_V = 6;
const BAR_PAD_H = 8;
const TRAIN_D = SLOT_H + BAR_PAD_V * 2; // 58 — the circle matches bar height

// Native Liquid Glass (SwiftUI glassEffect) exists from iOS 26. Older iOS and
// Android keep the frosted BlurView bar + the opaque chalk selection pill, so
// the bar never renders invisible where the material doesn't exist.
const NATIVE_GLASS = Platform.OS === "ios" && (parseInt(String(Platform.Version), 10) || 0) >= 26;

/**
 * AURORA global navigation — the floating iOS 26-style bottom bar, rendered
 * once at the ROOT so it shows on EVERY screen (tab routes AND pushed sub-pages
 * like Statistics/Settings/Periodize), not just the five tabs. Router-driven
 * (no dependency on the Tabs navigator), self-gating to Aurora + an authed
 * session. On iOS 26 the capsule itself is REAL Liquid Glass (a native SwiftUI
 * glassEffect capsule — the same material as the system tab bar); elsewhere it
 * falls back to the frosted blur. Replaces the per-Tabs Aurora bar; Classic
 * keeps its glass tab bar + command orb.
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

  // Shrink-on-scroll (the tabBarMinimizeBehavior feel): the whole capsule +
  // Train circle is full size at the top and scales down smoothly as the active
  // surface scrolls, driven by the shared `collapse` value (0 → 1). Reset to
  // full whenever the route changes so landing on a new screen always starts
  // expanded, even if the previous screen was scrolled.
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

  // The fallback selection highlight is a per-slot chalk pill that CROSS-FADES
  // between tabs (opacity only; iOS 26 gets the travelling native glass lens —
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

  // iOS 26 renders the moving highlight as REAL Liquid Glass (a native SwiftUI
  // glassEffect lens via @expo/ui — the same material the kit's GlassSurface
  // uses); older iOS + Android fall back to the opaque chalk pill. Over the
  // translucent glass the active glyph stays bright (chalk) so it never inverts
  // to an invisible dark-on-glass; over the opaque chalk pill it flips to ink.
  const useGlass = NATIVE_GLASS;
  const activeIconColor = useGlass ? C.chalk : C.onAccent;

  useEffect(() => {
    // Fallback lens cross-fade + (both platforms) the active-glyph tint
    // crossfade. The glyph is timed to the lens: incoming waits ~a beat then
    // fades in as the lens arrives (iOS spring lands ~250-300ms after press;
    // the in-place fallback fade is quicker, so the delay is shorter); outgoing
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

  // Performance (the merged ex-Cockpit hub) isn't on the bar (it lives under the
  // More hub); this gate is kept referenced so the access/persona import stays
  // meaningful.
  void navVisibleTo(persona, "performance", access);

  // Fallback material (Android + iOS < 26): the frosted BlurView capsule — a
  // translucent tint film + top rim so the nav stays legible over any content.
  // On iOS 26 the native glass carries its own edge light, so no film/border.
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
        {/* iOS 26: the selection highlight is a single native Liquid Glass lens
            that TRAVELS between slots (rendered once, behind all icons — see
            GlassMorphSelector); nothing per-slot here. Fallback: an opaque
            chalk pill per slot that cross-fades (opacity only) so switching
            stays smooth without a native glass view. Each item is icon + label
            (the iOS 26 TabView item), stacked TWICE (ash base + active tint
            overlay) so the tint CROSSFADES in sync with the lens instead of
            flipping instantly on press. */}
        <View style={{ width: LENS_W, height: SLOT_H, alignItems: "center", justifyContent: "center" }}>
          {!useGlass && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: SLOT_H / 2, backgroundColor: C.chalk, opacity: lensOp[tab.seg] }]} />
          )}
          <View style={{ alignItems: "center", gap: 2 }}>
            <AuroraSvgIcon name={tab.glyph} size={21} color={C.ash} />
            <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.nano, color: C.ash }}>{label}</Text>
          </View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: iconOp[tab.seg] }]}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <AuroraSvgIcon name={tab.glyph} size={21} color={activeIconColor} />
              <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.nano, color: activeIconColor }}>{label}</Text>
            </View>
          </Animated.View>
        </View>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}>
      {/* The iOS 26 split bar: [glass capsule with the four tabs] + [detached
          Train circle], shrinking together on scroll. */}
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 420,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: collapseFade,
          transform: [{ translateY: collapseShift }, { scale: collapseScale }],
        }}
      >
        {/* The capsule. Shadow on the OUTER view (a rounded drop shadow); the
            INNER view clips the material to the capsule radius. */}
        <View
          style={{
            flex: 1,
            borderRadius: 999,
            shadowColor: "#000",
            shadowOpacity: useGlass ? 0.22 : 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <View
            style={{
              borderRadius: 999,
              overflow: "hidden",
              paddingHorizontal: BAR_PAD_H,
              paddingVertical: BAR_PAD_V,
              ...(useGlass ? null : { borderWidth: 1, borderColor: border }),
            }}
          >
            {useGlass ? (
              // iOS 26: the bar IS Liquid Glass — a native SwiftUI capsule with
              // glassEffect, the same material as the system TabView bar. No
              // film, rim or border: the material adapts to the content behind
              // it and draws its own edge light.
              <Host style={StyleSheet.absoluteFill} pointerEvents="none">
                <ZStack>
                  <Capsule modifiers={[glassEffect({ glass: { variant: "regular" }, shape: "capsule" })]} />
                </ZStack>
              </Host>
            ) : (
              <>
                <BlurView intensity={28} tint={scheme} style={StyleSheet.absoluteFill} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
                <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
              </>
            )}
            {/* Inner row — four equal slots. On iOS 26 the native glass-morph
                layer fills this row BEHIND the icons and travels between slots;
                the icons/taps stay RN, so the bar still works even if the
                native layer doesn't render. */}
            <View
              style={{ flexDirection: "row", alignItems: "center" }}
              onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w && w !== rowW) setRowW(w); }}
            >
              {useGlass && rowW > 0 && <GlassMorphSelector rowW={rowW} selectedIndex={selIdx} reduceMotion={reduceMotion} />}
              {SIDES.map(renderSideItem)}
            </View>
          </View>
        </View>

        {/* DETACHED TRAIN ACTION — the standalone circle beside the capsule
            (the iOS 26 accessory-button idiom), bar-height, solid lime with a
            soft glow: the app's CTA identity in Apple's prominent-button slot. */}
        <Pressable
          onPress={() => { setSelectedSeg(null); if (!trainFocused) { if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.navigate(TRAIN.href); } }}
          accessibilityRole="button"
          accessibilityState={{ selected: trainFocused }}
          accessibilityLabel={t("nav.train")}
          hitSlop={8}
        >
          <View
            style={{
              width: TRAIN_D,
              height: TRAIN_D,
              borderRadius: TRAIN_D / 2,
              backgroundColor: C.lime,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: C.lime,
              shadowOpacity: 0.45,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
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
      </Animated.View>
    </View>
  );
}

/**
 * The iOS 26 selection highlight — a SINGLE, PERSISTENT native Liquid Glass
 * lens that TRAVELS between slots via an animated SwiftUI `.offset`, driven by
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
 * Offsets are from the row centre. With Train detached beside the bar there is
 * no centre gap any more: four equal slots of rowW/4, whose centres sit at
 * (i − 1.5)·slotW around the row centre. Rendered behind the RN glyphs,
 * pointer-transparent; the glyphs/taps are all RN so the bar works regardless.
 */
function GlassMorphSelector({ rowW, selectedIndex, reduceMotion }: { rowW: number; selectedIndex: number; reduceMotion: boolean }) {
  const slotW = rowW / 4;
  const xFor = (i: number) => (i - 1.5) * slotW;
  const [pose, setPose] = useState(() => ({
    x: selectedIndex >= 0 ? xFor(selectedIndex) : 0,
    w: LENS_W,
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
      setPose((p) => ({ ...p, w: LENS_W, shown: false, tick: p.tick + 1 }));
      return;
    }
    const x = xFor(selectedIndex);
    if (prev < 0 || reduceMotion) {
      // Reappear after Train (or reduced motion): settle at the slot, fading in.
      setPose((p) => ({ x, w: LENS_W, shown: true, tick: p.tick + 1 }));
      return;
    }
    // Travel: stretch toward the target on take-off, contract on arrival.
    const stretchW = Math.min(LENS_W + Math.abs(x - xFor(prev)) * 0.3, LENS_W * 2);
    setPose((p) => ({ x, w: stretchW, shown: true, tick: p.tick + 1 }));
    const settle = setTimeout(() => setPose((p) => ({ ...p, w: LENS_W, tick: p.tick + 1 })), 150);
    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, reduceMotion]);

  // Bar relayout (rotation/resize): reposition WITHOUT animating (tick unchanged).
  useEffect(() => {
    if (slotWRef.current === slotW) return;
    slotWRef.current = slotW;
    setPose((p) => (prevIdxRef.current >= 0 ? { ...p, x: xFor(prevIdxRef.current), w: LENS_W } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotW]);

  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <ZStack>
        <Capsule
          modifiers={[
            frame({ width: pose.w, height: SLOT_H }),
            glassEffect({ glass: { variant: "regular" }, shape: "capsule" }),
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
