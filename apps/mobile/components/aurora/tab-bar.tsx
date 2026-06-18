import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useTheme } from "../../lib/theme";
import { AuroraIcon } from "./icons";

// Minimal shape of the bottom-tab-bar props we use (the full type lives in
// @react-navigation/bottom-tabs, which expo-router bundles privately — typing it
// structurally keeps this dependency-safe).
export type AuroraTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean };
  };
};

// A glyph is either one of the uploaded line-icons (icons1/2/3) or one of the
// two distinctive nav marks from the design that aren't in the icon set — the
// home GRID and the statistics BAR-CHART — which we draw from primitive Views
// (crisp at any size, no extra asset/dependency).
type Glyph = "grid" | "chart" | AuroraIconName;

// The funnel tabs, in bar order, mirroring the uploaded design's bottom nav:
// home grid · stats bars · calendar · gear — plus our essential Train (add).
const TABS: { name: string; glyph: Glyph; label: string }[] = [
  { name: "index", glyph: "grid", label: "Today" },
  { name: "cockpit", glyph: "chart", label: "Cockpit" },
  { name: "log", glyph: "add", label: "Train" },
  { name: "history", glyph: "calendar", label: "History" },
  { name: "more", glyph: "settings", label: "More" },
];

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

/**
 * AURORA bottom navigation — the uploaded design's floating pill bar: a single
 * rounded dark bar of circular icon buttons, the active one a filled light
 * circle. Replaces the classic glass tab bar + the floating "jump to" command
 * orb (no FAB in Aurora). Mobile-only by nature (web uses the sidebar).
 */
export default function AuroraTabBar({ state, navigation }: AuroraTabBarProps) {
  const { palette: C } = useTheme();
  const insets = useSafeAreaInsets();
  const persona = usePersona();
  const access = useNavAccess();
  const showCockpit = navVisibleTo(persona, "cockpit", access);

  const activeName = state.routes[state.index]?.name;
  const tabs = TABS.filter((tab) => {
    if (tab.name === "cockpit" && !showCockpit) return false;
    return state.routes.some((r) => r.name === tab.name);
  });

  const onPress = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const focused = name === activeName;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(name);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 18, alignItems: "center" }}
    >
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
          const focused = tab.name === activeName;
          return (
            <Pressable
              key={tab.name}
              onPress={() => onPress(tab.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              hitSlop={6}
              style={{ flex: 1, height: 52, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: focused ? C.chalk : "transparent",
                }}
              >
                <TabGlyph glyph={tab.glyph} size={22} color={focused ? C.ink : C.ash} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
