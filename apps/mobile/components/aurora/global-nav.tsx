import { useRef, useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Animated, AccessibilityInfo, Platform, Easing } from "react-native";
import { BlurView } from "expo-blur";
import { Host, Capsule, ZStack } from "@expo/ui/swift-ui";
import { glassEffect, frame, offset, opacity, animation, Animation } from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
import { useRouter, useSegments, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  navVisibleTo,
  AURORA_NAV_TABS,
  AURORA_NAV_GEOMETRY,
  AURORA_NAV_MATERIAL,
  AURORA_TRAIN_GLYPH,
  formatSessionElapsed,
  type AuroraNavTabId,
  type AuroraIconName,
} from "@hybrid/core";
import { Path as SvgPath } from "react-native-svg";
import Svg from "react-native-svg";
import { loadDraft, type Draft } from "../../lib/draft";
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

// The bottom nav: FIVE tabs (Today, Explore, Train, More, Profile) inside a
// single Liquid Glass capsule, with a session accessory riding above it when a
// workout is in progress.
//
// Anatomy follows Apple's tab-bar guidance rather than approximating it. Two
// corrections from the previous build (the shared contract lives in
// @hybrid/core AURORA_NAV_TABS, so web cannot drift from it):
//  - A tab bar carries NAVIGATION; "avoid placing screen-specific actions in
//    the tab bar". Train opens the Train launcher — a destination, which is
//    what the old detached circle did too — so it is simply a tab.
//  - A circle DETACHED beside an iOS 26 tab bar is the SEARCH role: it morphs
//    into a search field on tap. The old lime Train circle occupied that slot
//    and read as "search" to anyone fluent in the platform. The slot is now
//    free, and stays reserved for real search.
// Persistent session state belongs in the accessory above the bar (the system
// mini-player slot), never as a tab. Glyphs are design-kit line icons, plus the
// shared inline dumbbell for Train.
type Side = {
  id: AuroraNavTabId;
  glyph: AuroraIconName | "train";
  labelKey: string;
  label: string;
  href: Href;
  seg: string;
};
const ROUTES: Record<AuroraNavTabId, { href: Href; seg: string }> = {
  today: { href: "/(tabs)", seg: "index" },
  explore: { href: "/explore", seg: "explore" },
  train: { href: "/(tabs)/log", seg: "log" },
  more: { href: "/(tabs)/more", seg: "more" },
  profile: { href: "/(tabs)/you", seg: "you" },
};
const SIDES: Side[] = AURORA_NAV_TABS.map((t) => ({ ...t, ...ROUTES[t.id] }));

// Routes that should NOT show the bar: auth/funnel, the focused live workout
// (accidental nav mid-set loses context), and the post-workout Wrapped — a
// full-bleed story takeover with its own back button and its own sticky share
// dock, which the floating bar sat on top of. Web reaches the same result by
// rendering the Wrapped as an opaque fixed overlay ABOVE the pill nav; this is
// the native equivalent. Everything else gets the bar.
const HIDE_ON = new Set(["login", "welcome", "onboarding", "workout", "upgrade", "session"]);

// Geometry + material come from @hybrid/core so the two clients cannot drift
// (each used to hard-code its own copy of these numbers).
const {
  slotH: SLOT_H,
  lensW: LENS_W,
  padV: BAR_PAD_V,
  padH: BAR_PAD_H,
  miniSlotH: MINI_SLOT_H,
  miniLensW: MINI_LENS_W,
  labelH: LABEL_H,
  miniOn: MINI_ON,
  miniOff: MINI_OFF,
  accessoryH: ACC_H,
  accessoryGap: ACC_GAP,
} = AURORA_NAV_GEOMETRY;
const MAT = AURORA_NAV_MATERIAL;

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
  // The residual scale is gentle now that the bar ALSO goes icon-only past the
  // threshold (see `mini` below) — the geometry does most of the shrinking, so
  // scaling the rest of the way on top would leave an untappable bar.
  const collapseScale = collapse ? collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) : 1;
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

  // MINI (icon-only) bar: past the collapse threshold the labels collapse away
  // and every slot tightens to its glyph — the small bar is icons alone, like
  // the native minimized tab bar. It's a LAYOUT change (width/height/radius,
  // which the native driver can't carry), so it rides its own JS-driven timing
  // value off a hysteresis-guarded boolean instead of the continuous ramp.
  const [mini, setMini] = useState(false);
  const miniAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!collapse) return;
    const id = collapse.addListener(({ value }) => { setMini((m) => (m ? value > MINI_OFF : value > MINI_ON)); });
    return () => collapse.removeListener(id);
  }, [collapse]);
  useEffect(() => {
    if (reduceMotion) { miniAnim.setValue(mini ? 1 : 0); return; }
    Animated.timing(miniAnim, { toValue: mini ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [mini, reduceMotion, miniAnim]);
  const lerp = (from: number, to: number) => miniAnim.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const slotW = lerp(LENS_W, MINI_LENS_W);
  const slotH = lerp(SLOT_H, MINI_SLOT_H);
  const slotR = lerp(SLOT_H / 2, MINI_SLOT_H / 2);
  const labelH = lerp(LABEL_H, 0);
  const labelOp = miniAnim.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: "clamp" });

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

  // SESSION ACCESSORY state — an in-progress workout, shown above the capsule.
  // Deliberately NOT lib/draft's useDraft(): that hook is built on
  // useFocusEffect, and this bar mounts OUTSIDE the navigator (a sibling of
  // <Stack> in the root layout), so it has no screen focus to hang off. Re-read
  // on every route change; the clock only ticks while a draft exists.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    loadDraft().then((d) => { if (alive) setDraft(d); }).catch(() => {});
    return () => { alive = false; };
  }, [routeKey]);
  useEffect(() => {
    if (!draft) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [draft]);

  // iOS 26 renders the moving highlight as REAL Liquid Glass (a native SwiftUI
  // glassEffect lens via @expo/ui — the same material the system tab bar uses);
  // older iOS + Android fall back to a translucent glass lens of their own.
  //
  // The active glyph takes the BRAND TINT on both paths. It used to be chalk on
  // glass and ink on an opaque chalk pill — but chalk-against-ash at one stroke
  // weight is a Material tell, where iOS moves the selected item to a true tint
  // (it also swaps to a filled symbol; this kit is line icons only per the
  // project rule, so tint carries it). The fallback lens is translucent now
  // precisely so the tint stays legible over it.
  const useGlass = NATIVE_GLASS;
  const activeIconColor = C.lime;

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

  // Fallback material (Android + iOS < 26). Liquid Glass is a nearly CLEAR body
  // whose identity lives at the RIM, so this is a light film under a modest
  // blur, a bright top rim and a dark bottom lip — the lip is what makes glass
  // read as thick rather than printed. The old recipe was a 55% tint film under
  // intensity 28: frosted glass from iOS 7-18, opaque enough that nothing behind
  // survived, so the edge had nothing left to bend. Numbers come from
  // AURORA_NAV_MATERIAL, shared with the web bar.
  // On iOS 26 the native glass carries its own edge light, so no film/rim/lip.
  const light = scheme === "light";
  const film = light ? `rgba(255,255,255,0.42)` : `rgba(243,244,239,${MAT.filmOpacity})`;
  const rim = light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.30)";
  const lip = light ? "rgba(20,30,15,0.20)" : "rgba(0,0,0,0.42)";
  const border = light ? "rgba(20,30,15,0.10)" : "rgba(255,255,255,0.08)";
  // Selected slot index among the five tabs (−1 = none, i.e. a pushed screen
  // that isn't on the bar) — drives which cell of the native glass-morph layer
  // holds the lens.
  const selIdx = selectedSeg ? SIDES.findIndex((s) => s.seg === selectedSeg) : -1;
  // The accessory stands down once you're already in the Train launcher or the
  // live logger, where it would only repeat what's on screen.
  const showAccessory = draft != null && activeSeg !== "log";
  // The label row — height-collapsed + faded out when the bar goes MINI, so the
  // small bar is glyphs alone. HEIGHT is what animates (not `display`), so the
  // slot morphs smoothly between the two sizes; the Pressable keeps its
  // accessibilityLabel either way, so the name never disappears for VoiceOver.
  const renderLabel = (text: string, color: string) => (
    <Animated.View pointerEvents="none" style={{ height: labelH, opacity: labelOp, overflow: "hidden" }}>
      <Text numberOfLines={1} style={{ marginTop: 2, lineHeight: 12, fontFamily: F.semi, fontSize: fs.nano, color }}>{text}</Text>
    </Animated.View>
  );
  // Train's dumbbell is the one glyph outside the kit's PNG-mirrored union, so
  // it is stroked inline from the shared path data (same 72 viewBox, same
  // weight) instead of going through AuroraSvgIcon.
  const renderGlyph = (glyph: Side["glyph"], color: string) =>
    glyph === "train" ? (
      <Svg width={21} height={21} viewBox="0 0 72 72" fill="none">
        <SvgPath d={AURORA_TRAIN_GLYPH} stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    ) : (
      <AuroraSvgIcon name={glyph} size={21} color={color} strokeWidth={4} />
    );
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
            GlassMorphSelector); nothing per-slot here. Fallback: a LIFTED glass
            lens per slot that cross-fades (opacity only) so switching stays
            smooth without a native glass view — translucent and brighter than
            the bar carrying it, i.e. thinner glass, rather than the opaque
            chalk pill it used to be (which read as a stroked outline and forced
            the active glyph to invert). Each item is icon + label, stacked
            TWICE (ash base + active tint overlay) so the tint CROSSFADES in
            sync with the lens instead of flipping instantly on press. */}
        <Animated.View style={{ width: slotW, height: slotH, alignItems: "center", justifyContent: "center" }}>
          {!useGlass && (
            // Two nested views on purpose: the opacity crossfade is
            // NATIVE-driven and the mini radius is JS-driven, and the two
            // drivers can't share one style object.
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: lensOp[tab.seg] }]}>
              <Animated.View
                style={{
                  flex: 1,
                  borderRadius: slotR,
                  backgroundColor: light ? "rgba(255,255,255,0.72)" : `rgba(255,255,255,${MAT.lensOpacity + 0.06})`,
                  borderWidth: 1,
                  borderColor: light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.24)",
                }}
              />
            </Animated.View>
          )}
          {/* Glyph weight 4.5 (viewBox units, ~1.3px at 21) — the NAV-BAR weight
              shared with web's PillButton, lighter than the design-kit default
              (6) which read too heavy beside a 10pt label on glass. */}
          <View style={{ alignItems: "center" }}>
            {renderGlyph(tab.glyph, C.ash)}
            {renderLabel(label, C.ash)}
          </View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: iconOp[tab.seg] }]}>
            <View style={{ alignItems: "center" }}>
              {renderGlyph(tab.glyph, activeIconColor)}
              {renderLabel(label, activeIconColor)}
            </View>
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}>
      {/* The bar stack: [session accessory] over [glass capsule with the five
          tabs], shrinking together on scroll. */}
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 440,
          alignItems: "stretch",
          gap: ACC_GAP,
          opacity: collapseFade,
          transform: [{ translateY: collapseShift }, { scale: collapseScale }],
        }}
      >
        {/* SESSION ACCESSORY — an in-progress workout, in the tab-bar accessory
            slot (Apple's home for players and active orders, the mini-player
            idiom). Persistent STATE belongs here; the tab bar itself carries
            navigation only. The lime dot is a semantic status indicator, not
            decoration. */}
        {showAccessory && draft && (
          <View
            style={{
              borderRadius: 999,
              shadowColor: "#000",
              shadowOpacity: useGlass ? 0.18 : 0.28,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            <Pressable
              onPress={() => { if (haptics) Haptics.selectionAsync().catch(() => {}); router.navigate(ROUTES.train.href); }}
              accessibilityRole="button"
              accessibilityLabel={`${draft.title} — ${formatSessionElapsed(draft.startedAt, nowTs)}`}
              style={{
                height: ACC_H,
                borderRadius: 999,
                overflow: "hidden",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: BAR_PAD_H + 4,
                ...(useGlass ? null : { borderWidth: 1, borderColor: border }),
              }}
            >
              {useGlass ? (
                <Host style={StyleSheet.absoluteFill} pointerEvents="none">
                  <ZStack>
                    <Capsule modifiers={[glassEffect({ glass: { variant: "regular" }, shape: "capsule" })]} />
                  </ZStack>
                </Host>
              ) : (
                <>
                  <BlurView intensity={MAT.blur} tint={scheme} style={StyleSheet.absoluteFill} />
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
                  <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
                </>
              )}
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime }} />
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.caption, color: C.chalk }}>{draft.title}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, fontVariant: ["tabular-nums"] }}>{formatSessionElapsed(draft.startedAt, nowTs)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.lime }}>{t("common.resume") === "common.resume" ? "Resume" : t("common.resume")}</Text>
            </Pressable>
          </View>
        )}

        {/* The capsule. Shadow on the OUTER view (a rounded drop shadow); the
            INNER view clips the material to the capsule radius. */}
        <View
          style={{
            borderRadius: 999,
            shadowColor: "#000",
            shadowOpacity: useGlass ? 0.22 : 0.4,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
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
              // glassEffect, the same material as the system tab bar. No film,
              // rim or lip: the material adapts to the content behind it and
              // draws its own edge light.
              <Host style={StyleSheet.absoluteFill} pointerEvents="none">
                <ZStack>
                  <Capsule modifiers={[glassEffect({ glass: { variant: "regular" }, shape: "capsule" })]} />
                </ZStack>
              </Host>
            ) : (
              <>
                <BlurView intensity={MAT.blur} tint={scheme} style={StyleSheet.absoluteFill} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: film }]} />
                {/* the bright top rim and the dark bottom lip — the lip is what
                    makes the capsule read as a THICK piece of glass */}
                <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: rim }} />
                <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, backgroundColor: lip }} />
              </>
            )}
            {/* Inner row — five equal slots. On iOS 26 the native glass-morph
                layer fills this row BEHIND the icons and travels between slots;
                the icons/taps stay RN, so the bar still works even if the
                native layer doesn't render. */}
            <View
              style={{ flexDirection: "row", alignItems: "center" }}
              onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w && w !== rowW) setRowW(w); }}
            >
              {useGlass && rowW > 0 && <GlassMorphSelector rowW={rowW} selectedIndex={selIdx} reduceMotion={reduceMotion} mini={mini} />}
              {SIDES.map(renderSideItem)}
            </View>
          </View>
        </View>
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
 * (3) NEVER UNMOUNTS — the lens used to `return null` whenever nothing was
 *     selected, so leaving or re-entering a tab POPPED (SwiftUI can't animate a
 *     remount; the very trap documented above). It now stays mounted and fades
 *     via an animated `opacity` instead. With Train promoted to a tab the only
 *     unselected case left is a pushed screen that isn't on the bar.
 * Every pose change bumps `tick`, the `.animation(value:)` key, so each phase
 * (travel+stretch → settle → hide/show) animates natively in SwiftUI.
 *
 * Offsets are from the row centre: N equal slots of rowW/N, whose centres sit
 * at (i − (N−1)/2)·slotW around it. N comes from SIDES rather than a literal —
 * it was hard-coded to 4 while Train lived outside the bar, and Train becoming
 * a tab is exactly the change that would have silently mis-seated the lens.
 * Rendered behind the RN glyphs, pointer-transparent; the glyphs/taps are all
 * RN so the bar works regardless.
 */
function GlassMorphSelector({ rowW, selectedIndex, reduceMotion, mini }: { rowW: number; selectedIndex: number; reduceMotion: boolean; mini: boolean }) {
  const slotW = rowW / SIDES.length;
  const xFor = (i: number) => (i - (SIDES.length - 1) / 2) * slotW;
  // The lens tracks the MINI geometry too — when the bar drops its labels the
  // glass capsule tightens with the slots (animated natively, like every other
  // pose change, by bumping the tick the .animation(value:) key watches).
  const lensW = mini ? MINI_LENS_W : LENS_W;
  const lensH = mini ? MINI_SLOT_H : SLOT_H;
  // Explicitly typed: AURORA_NAV_GEOMETRY is `as const`, so an inferred `w`
  // would narrow to the literal union of the two lens widths and reject the
  // mid-travel stretch value.
  const [pose, setPose] = useState<{ x: number; w: number; shown: boolean; tick: number }>(() => ({
    x: selectedIndex >= 0 ? xFor(selectedIndex) : 0,
    w: lensW,
    shown: selectedIndex >= 0,
    tick: 0,
  }));
  const prevIdxRef = useRef(selectedIndex);
  const slotWRef = useRef(slotW);
  const miniRef = useRef(mini);

  // Resize the lens in place when the bar flips between full and icon-only.
  useEffect(() => {
    if (miniRef.current === mini) return;
    miniRef.current = mini;
    setPose((p) => ({ ...p, w: lensW, tick: p.tick + 1 }));
  }, [mini, lensW]);

  useEffect(() => {
    const prev = prevIdxRef.current;
    prevIdxRef.current = selectedIndex;
    if (selectedIndex === prev) return;
    if (selectedIndex < 0) {
      // Train: fade out IN PLACE (staying mounted is what keeps this animatable).
      setPose((p) => ({ ...p, w: lensW, shown: false, tick: p.tick + 1 }));
      return;
    }
    const x = xFor(selectedIndex);
    if (prev < 0 || reduceMotion) {
      // Reappear after Train (or reduced motion): settle at the slot, fading in.
      setPose((p) => ({ x, w: lensW, shown: true, tick: p.tick + 1 }));
      return;
    }
    // Travel: stretch toward the target on take-off, contract on arrival.
    const stretchW = Math.min(lensW + Math.abs(x - xFor(prev)) * 0.3, lensW * 2);
    setPose((p) => ({ x, w: stretchW, shown: true, tick: p.tick + 1 }));
    const settle = setTimeout(() => setPose((p) => ({ ...p, w: lensW, tick: p.tick + 1 })), 150);
    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, reduceMotion]);

  // Bar relayout (rotation/resize): reposition WITHOUT animating (tick unchanged).
  useEffect(() => {
    if (slotWRef.current === slotW) return;
    slotWRef.current = slotW;
    setPose((p) => (prevIdxRef.current >= 0 ? { ...p, x: xFor(prevIdxRef.current), w: lensW } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotW]);

  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <ZStack>
        <Capsule
          modifiers={[
            frame({ width: pose.w, height: lensH }),
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
