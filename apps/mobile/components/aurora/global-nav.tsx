import { View, Text, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRouter, useSegments, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useSession } from "../../lib/session";
import { useTemplate } from "../../lib/template";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { F } from "../../lib/ui";
import { AuroraIcon } from "./icons";

// The bottom nav: Today · History · [Train FAB] · Plans · More. Train is the
// elevated centre action (a raised lime FAB that punches up through the bar).
// Profile (You) is no longer on the bar — it now lives in the Today header and
// the More hub — so this slot carries PLANS (the core "follow a program" loop,
// previously buried in More). Cockpit stays reachable from the More hub. Side
// glyphs are design-kit line icons only (no custom-drawn marks).
type Side = { id: string; glyph: AuroraIconName; labelKey?: string; label?: string; href: Href; seg: string };
const LEFT: Side[] = [
  { id: "today", glyph: "village", labelKey: "nav.today", href: "/(tabs)", seg: "index" },
  { id: "history", glyph: "copy", labelKey: "nav.history", href: "/(tabs)/history", seg: "history" },
];
const RIGHT: Side[] = [
  { id: "plans", glyph: "bookmark", labelKey: "nav.plans", href: "/(tabs)/plans", seg: "plans" },
  { id: "more", glyph: "settings", labelKey: "nav.more", href: "/(tabs)/more", seg: "more" },
];
// The centre Train action starts logging RIGHT NOW: it drops straight into the
// live workout with an empty session and the get-ready count-in (so the timer
// goes off), rather than the launcher hub. `source=empty` resumes an
// in-progress draft if one exists, so a tap never silently loses a workout.
const TRAIN: { href: Href; seg: string } = { href: "/workout?source=empty", seg: "workout" };

// Routes that should NOT show the bar: auth/funnel + the focused live workout
// (accidental nav mid-set loses context). Everything else gets it.
const HIDE_ON = new Set(["login", "welcome", "onboarding", "workout"]);

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
  // A render HELPER, not a nested component: defining a component inside render
  // makes React remount the whole subtree each render. A plain function that
  // returns JSX renders inline with no remount penalty.
  const renderSideItem = (tab: Side) => {
    const focused = activeSeg === tab.seg;
    const label = tab.labelKey ? t(tab.labelKey) : (tab.label ?? "");
    return (
      <Pressable
        key={tab.id}
        onPress={() => { if (!focused) { if (haptics) Haptics.selectionAsync().catch(() => {}); router.navigate(tab.href); } }}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        hitSlop={6}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
      >
        {/* A bare icon left "More" reading as a Settings cog. The label under
            every glyph names the destination so the bar is self-explanatory. */}
        <View style={{ width: 44, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: focused ? C.chalk : "transparent" }}>
          <AuroraIcon name={tab.glyph} size={21} color={focused ? C.ink : C.ash} />
        </View>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.2, color: focused ? C.chalk : C.ash }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}>
      <View
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 999,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
      {/* The frosted pill itself (clips the blur to the radius). The four side
          items sit either side of a centre gap reserved for the elevated FAB. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
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
        {LEFT.map(renderSideItem)}
        {/* centre gap — the raised Train FAB overlays this slot */}
        <View style={{ width: 64 }} />
        {RIGHT.map(renderSideItem)}
      </View>

      {/* ELEVATED TRAIN FAB — a larger lime circle raised above the bar, with a
          thick ink ring so it punches cleanly through, and a soft lime glow.
          Rendered in the OUTER (non-clipped) wrapper so it can overflow upward. */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        <Pressable
          onPress={() => { if (!trainFocused) { if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.navigate(TRAIN.href); } }}
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
          <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 0.5, color: txt(C, C.lime), marginTop: 3 }}>{t("nav.train")}</Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
}

