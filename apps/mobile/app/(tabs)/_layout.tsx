import { Tabs, Redirect } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { C, F } from "../../lib/ui";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ color, fontSize: 16 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { session, ready } = useSession();
  const { t } = useLang();
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.ink, borderTopColor: C.line },
        tabBarActiveTintColor: C.lime,
        tabBarInactiveTintColor: C.ash,
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
  );
}
