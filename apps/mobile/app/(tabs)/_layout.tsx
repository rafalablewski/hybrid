import { Tabs, Redirect } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { CommandMenu, GlassTabBarBackground } from "../../components/liquid-glass";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ color, fontSize: 16 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { session, ready } = useSession();
  const { t } = useLang();
  const { palette } = useTheme();
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.ink }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarBackground: () => <GlassTabBarBackground />,
          tabBarStyle: { backgroundColor: "transparent", borderTopColor: palette.line },
          tabBarActiveTintColor: palette.lime,
          tabBarInactiveTintColor: palette.ash,
          tabBarLabelStyle: { fontFamily: F.mono, fontSize: 10 },
        }}
      >
        {/* The funnel: see today → train → review. Everything else lives under More. */}
        <Tabs.Screen name="index" options={{ title: t("nav.dashboard"), tabBarIcon: icon("◆") }} />
        <Tabs.Screen name="log" options={{ title: t("nav.train"), tabBarIcon: icon("▶") }} />
        <Tabs.Screen name="history" options={{ title: t("nav.history"), tabBarIcon: icon("≣") }} />
        <Tabs.Screen name="more" options={{ title: t("nav.more"), tabBarIcon: icon("⋯") }} />

        {/* Reachable from More / deep links, hidden from the bar to cut clutter. */}
        <Tabs.Screen name="plans" options={{ href: null }} />
        <Tabs.Screen name="sport" options={{ href: null }} />
        <Tabs.Screen name="velocity" options={{ href: null }} />
        <Tabs.Screen name="running" options={{ href: null }} />
        <Tabs.Screen name="coach" options={{ href: null }} />
      </Tabs>
      <CommandMenu />
    </View>
  );
}
