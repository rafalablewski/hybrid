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

// The funnel tabs that belong in the bar, in order, with their Aurora glyph +
// a11y label. Everything else (plans/sport/…) is reached from More / deep links.
const TABS: { name: string; icon: AuroraIconName; label: string }[] = [
  { name: "index", icon: "navigation", label: "Today" },
  { name: "cockpit", icon: "arrow-up", label: "Cockpit" },
  { name: "log", icon: "add", label: "Train" },
  { name: "history", icon: "calendar", label: "History" },
  { name: "more", icon: "settings", label: "More" },
];

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
          // soft floating shadow
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
              style={{
                flex: 1,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
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
                <AuroraIcon name={tab.icon} size={23} color={focused ? C.ink : C.ash} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
