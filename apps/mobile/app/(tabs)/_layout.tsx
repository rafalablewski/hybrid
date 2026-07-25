import { Tabs, Redirect } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { navVisibleTo, type AuroraIconName } from "@hybrid/core";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { useTemplate } from "../../lib/template";
import { fs, F } from "../../lib/ui";
import { CommandMenu, GlassTabBarBackground } from "../../components/liquid-glass";
import { AuroraIcon } from "../../components/aurora/icons";

const glyphIcon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ color, fontSize: fs.subtitle }}>{glyph}</Text>;
const auroraTabIcon = (name: AuroraIconName) => ({ color }: { color: ColorValue }) =>
  <AuroraIcon name={name} size={23} color={color} />;
// Aurora swaps the bar's glyphs for the uploaded line-icon set.
const icon = (glyph: string, aurora: boolean, name: AuroraIconName) =>
  aurora ? auroraTabIcon(name) : glyphIcon(glyph);

export default function TabsLayout() {
  const { session, ready } = useSession();
  const { t } = useLang();
  const { palette } = useTheme();
  // Cockpit is a real tab only for athlete+ (the freemium upgrade is sold on the
  // single Unlock Full page, not as a locked tab). Casual keeps a clean bar.
  const persona = usePersona();
  const access = useNavAccess();
  const aurora = useTemplate().template === "aurora";
  const showCockpit = navVisibleTo(persona, "cockpit", access);
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.ink }}>
      <Tabs
        // Aurora's bottom nav is the GLOBAL floating pill bar (rendered once at
        // the root so it shows on every screen — see components/aurora/global-nav),
        // so the per-Tabs bar is suppressed here; classic keeps its glass bar.
        tabBar={aurora ? () => null : undefined}
        screenOptions={{
          headerShown: false,
          tabBarBackground: () => <GlassTabBarBackground />,
          tabBarStyle: { backgroundColor: "transparent", borderTopColor: palette.line },
          tabBarActiveTintColor: palette.lime,
          tabBarInactiveTintColor: palette.ash,
          tabBarLabelStyle: { fontFamily: F.mono, fontSize: fs.nano },
        }}
      >
        {/* The funnel: see today → train → review. Everything else lives under More.
            Cockpit sits next to Today for the athlete persona; hidden for casual
            (whose upgrade path is the single Unlock Full page). */}
        <Tabs.Screen name="index" options={{ title: t("nav.dashboard"), tabBarIcon: icon("◆", aurora, "play") }} />
        <Tabs.Screen name="cockpit" options={{ title: t("nav.cockpit"), tabBarIcon: icon("◈", aurora, "arrow-up"), href: showCockpit ? undefined : null }} />
        <Tabs.Screen name="log" options={{ title: t("nav.train"), tabBarIcon: icon("▶", aurora, "add") }} />
        <Tabs.Screen name="history" options={{ title: t("nav.history"), tabBarIcon: icon("≣", aurora, "calendar") }} />
        <Tabs.Screen name="more" options={{ title: t("nav.more"), tabBarIcon: icon("⋯", aurora, "settings") }} />

        {/* "You" (profile) — Aurora surfaces it as the 5th nav item via the global
            pill bar (router-driven, ignores href); classic keeps it reachable but
            hidden from its 5-tab bar to avoid clutter. */}
        <Tabs.Screen name="you" options={{ href: aurora ? undefined : null }} />

        {/* Reachable from More / deep links, hidden from the bar to cut clutter. */}
        <Tabs.Screen name="plans" options={{ href: null }} />
        <Tabs.Screen name="sport" options={{ href: null }} />
        <Tabs.Screen name="velocity" options={{ href: null }} />
        <Tabs.Screen name="endurance" options={{ href: null }} />
        <Tabs.Screen name="coach" options={{ href: null }} />
      </Tabs>
      {/* The floating "jump to" command orb is a classic-only flourish; Aurora's
          bespoke pill bar replaces it. */}
      {!aurora && <CommandMenu />}
    </View>
  );
}
