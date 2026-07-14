import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
// Japandi (light) hero headings use a Fraunces serif (parity with web's
// --font-heading); Aurora keeps Archivo. Loaded here, applied via serifIf().
import { Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { SessionProvider } from "../lib/session";
import { LanguageProvider } from "../lib/i18n";
import { TemplateProvider } from "../lib/template";
import { LiquidGlassProvider } from "../lib/liquid-glass";
import { ThemeProvider, useTheme } from "../lib/theme";
import QueryProvider from "../lib/query";
import { C } from "../lib/ui";
import { startIap } from "../lib/iap";
import { supabase } from "../lib/supabase";
import AuroraGlobalNav from "../components/aurora/global-nav";

// Inner shell so it can read the theme (the provider sits above it): drives the
// status-bar style + the navigator background so the whole app follows
// light/dark (system by default, overridable in Settings). In Aurora it also
// renders the global floating pill nav over every screen (self-gating).
function Shell() {
  const { scheme, palette } = useTheme();
  // Launch-time IAP listener: verify + grant + finish any transaction that
  // completes while no purchase UI is open (interrupted / Ask-to-Buy / renewal /
  // another-device purchase), and refresh the session so Full unlocks at once.
  // No-op off iOS. Cleaned up on unmount.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    startIap(() => { supabase.auth.refreshSession().catch(() => {}); }).then((c) => { cleanup = c; });
    return () => { cleanup?.(); };
  }, []);
  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ink } }}>
        {/* The signed-in app shell. Auth/funnel screens (welcome/login) can sit
            BELOW it in the stack after a sign-in (welcome → login → replace to
            tabs leaves welcome underneath), so the iOS edge swipe-back used to
            pop the whole app back to "Start your journey" — looking like a
            sign-out. Disable the back gesture on the shell so swiping inside the
            app (e.g. the Today pager) never escapes to the auth screens. */}
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        {/* Upgrade is a slide-up BOTTOM SHEET — a transparent modal so the screen
            behind stays visible through the scrim (the component animates the
            panel up itself). */}
        <Stack.Screen name="upgrade" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
      </Stack>
      <AuroraGlobalNav />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <ThemeProvider>
          <TemplateProvider>
            <LiquidGlassProvider>
              <SessionProvider>
                <LanguageProvider>
                  <Shell />
                </LanguageProvider>
              </SessionProvider>
            </LiquidGlassProvider>
          </TemplateProvider>
        </ThemeProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
