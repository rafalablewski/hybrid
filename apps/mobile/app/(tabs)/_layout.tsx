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
      <Tabs.Screen name="index" options={{ title: t("nav.dashboard"), tabBarIcon: icon("◆") }} />
      <Tabs.Screen name="plans" options={{ title: t("nav.plans"), tabBarIcon: icon("▤") }} />
      <Tabs.Screen name="sport" options={{ title: t("nav.sport"), tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="log" options={{ title: t("nav.log"), tabBarIcon: icon("✎") }} />
      <Tabs.Screen name="history" options={{ title: t("nav.history"), tabBarIcon: icon("≣") }} />
      <Tabs.Screen name="coach" options={{ title: t("nav.coach"), tabBarIcon: icon("✦") }} />
    </Tabs>
  );
}
