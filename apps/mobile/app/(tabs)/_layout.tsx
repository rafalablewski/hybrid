import { Tabs, Redirect } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useSession } from "../../lib/session";
import { C, F } from "../../lib/ui";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ color, fontSize: 16 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { session, ready } = useSession();
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
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("◆") }} />
      <Tabs.Screen name="plans" options={{ title: "Plans", tabBarIcon: icon("▤") }} />
      <Tabs.Screen name="sport" options={{ title: "Sport", tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="log" options={{ title: "Log", tabBarIcon: icon("✎") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: icon("≣") }} />
    </Tabs>
  );
}
