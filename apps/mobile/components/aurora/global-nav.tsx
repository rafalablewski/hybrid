import { View, Pressable } from "react-native";
import { useRouter, useSegments, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useSession } from "../../lib/session";
import { useTemplate } from "../../lib/template";
import { useTheme } from "../../lib/theme";
import { AuroraIcon } from "./icons";

type Glyph = "grid" | "chart" | AuroraIconName;

// The five funnel destinations, mirroring the uploaded design's bottom nav.
const TABS: { id: string; glyph: Glyph; label: string; href: Href; seg: string }[] = [
  { id: "today", glyph: "grid", label: "Today", href: "/(tabs)", seg: "index" },
  { id: "cockpit", glyph: "chart", label: "Cockpit", href: "/(tabs)/cockpit", seg: "cockpit" },
  { id: "log", glyph: "add", label: "Train", href: "/(tabs)/log", seg: "log" },
  { id: "history", glyph: "calendar", label: "History", href: "/(tabs)/history", seg: "history" },
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
              style={{ flex: 1, height: 52, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: focused ? C.chalk : "transparent" }}>
                <TabGlyph glyph={tab.glyph} size={22} color={focused ? C.ink : C.ash} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabGlyph({ glyph, size, color }: { glyph: Glyph; size: number; color: string }) {
  if (glyph === "grid") {
    const cell = (size - 5) / 2;
    const sq = { width: cell, height: cell, borderRadius: Math.max(2, cell * 0.3), backgroundColor: color } as const;
    return (
      <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignContent: "space-between" }}>
        <View style={sq} /><View style={sq} /><View style={sq} /><View style={sq} />
      </View>
    );
  }
  if (glyph === "chart") {
    const bw = (size - 6) / 4;
    const bar = (h: number) => ({ width: bw, height: size * h, borderRadius: bw / 2, backgroundColor: color } as const);
    return (
      <View style={{ width: size, height: size, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View style={bar(0.5)} /><View style={bar(0.82)} /><View style={bar(0.62)} /><View style={bar(1)} />
      </View>
    );
  }
  return <AuroraIcon name={glyph} size={size} color={color} />;
}
