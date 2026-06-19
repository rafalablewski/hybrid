import { View, Text, Pressable } from "react-native";
import { useRouter, useSegments, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useSession } from "../../lib/session";
import { useTemplate } from "../../lib/template";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraIcon } from "./icons";

// The five funnel destinations, mirroring the uploaded design's bottom nav —
// glyphs are design-kit line icons only (no custom-drawn marks).
const TABS: { id: string; glyph: AuroraIconName; label: string; href: Href; seg: string }[] = [
  { id: "today", glyph: "village", label: "Today", href: "/(tabs)", seg: "index" },
  { id: "cockpit", glyph: "user-circle", label: "Cockpit", href: "/(tabs)/cockpit", seg: "cockpit" },
  { id: "log", glyph: "list-add", label: "Train", href: "/(tabs)/log", seg: "log" },
  { id: "history", glyph: "copy", label: "History", href: "/(tabs)/history", seg: "history" },
  { id: "more", glyph: "settings", label: "More", href: "/(tabs)/more", seg: "more" },
];

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
  const { palette: C } = useTheme();
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const aurora = useTemplate().template === "aurora";
  const { session, ready } = useSession();
  const persona = usePersona();
  const access = useNavAccess();

  // Gate: Aurora only, signed in, and not on an auth/funnel/live-workout route.
  if (!aurora || !ready || !session) return null;
  const top = segments[0];
  if (!top || HIDE_ON.has(top)) return null;

  // Active tab from the route: inside (tabs) the second segment is the screen
  // ("index" when absent → Today); pushed routes match nothing (no highlight).
  const inTabs = top === "(tabs)";
  const activeSeg = inTabs ? (segments[1] ?? "index") : null;

  const showCockpit = navVisibleTo(persona, "cockpit", access);
  const tabs = TABS.filter((t) => t.id !== "cockpit" || showCockpit);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: 420,
          backgroundColor: C.ink2,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 9,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        {tabs.map((tab) => {
          const focused = activeSeg === tab.seg;
          return (
            <Pressable
              key={tab.id}
              onPress={() => { if (!focused) router.navigate(tab.href); }}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              hitSlop={6}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
            >
              {/* A bare icon left "More" reading as a Settings cog. The label
                  under every glyph names the destination (incl. "More") so the
                  bar is self-explanatory and the active tab is unmistakable. */}
              <View style={{ width: 44, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: focused ? C.chalk : "transparent" }}>
                <AuroraIcon name={tab.glyph} size={21} color={focused ? C.ink : C.ash} />
              </View>
              <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 0.2, color: focused ? C.chalk : C.ash }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

