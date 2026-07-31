import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Animated, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
// Kyoto Hour (light) hero headings use the Shippori Mincho Japanese book serif
// (parity with web's --font-heading); Aurora keeps Archivo. Loaded here,
// applied via serifIf().
import { ShipporiMincho_500Medium, ShipporiMincho_600SemiBold, ShipporiMincho_700Bold, ShipporiMincho_800ExtraBold } from "@expo-google-fonts/shippori-mincho";
import { springs, springDurationMs } from "@hybrid/core";
import { SessionProvider } from "../lib/session";
import { LanguageProvider } from "../lib/i18n";
import { TemplateProvider } from "../lib/template";
import { LiquidGlassProvider } from "../lib/liquid-glass";
import { ThemeProvider, useTheme } from "../lib/theme";
import QueryProvider from "../lib/query";
import { C } from "../lib/ui";
import { startIap } from "../lib/iap";
import { supabase } from "../lib/supabase";
import { ErrorBoundary } from "../components/error-boundary";
import { NavScrollProvider } from "../lib/nav-scroll";
import { SheetRecedeProvider, useRecedeStyle, useRecedeDim } from "../lib/sheet-recede";
import { SharedElementProvider } from "../lib/shared-element";
// The bottom nav is the SYSTEM tab bar now (app/(tabs)/_layout.tsx uses
// expo-router native tabs), so there is no app-rendered bar to mount here.
// The Classic template keeps its floating command orb, which used to be
// rendered inside the tabs layout — that layout is pure NativeTabs now, so
// the orb moves up here beside the navigator.
import { CommandMenu } from "../components/liquid-glass";
import { useTemplate } from "../lib/template";

// Inner shell so it can read the theme (the provider sits above it): drives the
// status-bar style + the navigator background so the whole app follows
// light/dark (system by default, overridable in Settings). In Aurora it also
// renders the global floating pill nav over every screen (self-gating).
function Shell() {
  const { scheme, palette } = useTheme();
  const aurora = useTemplate().template === "aurora";
  // The presenting surface that scales back while a sheet is up. Everything the
  // sheet covers lives inside it — navigator AND the system tab bar — so the
  // whole app recedes as one plane, the way iOS presents a sheet.
  const recede = useRecedeStyle();
  const dim = useRecedeDim();
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
    <NavScrollProvider>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {/* Black ground so the receded card's rounded corners actually read —
          the same reason iOS darkens the window behind a presented sheet. */}
      <Animated.View style={[{ flex: 1, backgroundColor: palette.ink, overflow: "hidden" }, recede]}>
      {/* SCREEN TRANSITIONS. Direction encodes hierarchy — the shared rule in
          @hybrid/core (motion.ts `screenTransition`), which the web shell reads
          too, so the two clients can't disagree about what a given move means.
          These options are rendered NATIVELY by react-native-screens (4.25), so
          the travel runs off the JS thread; only the content entrance
          (useEntrance) stays on the JS driver, deliberately — see lib/ui.tsx.

          `slide_from_right` IS the drill-down: everything under the Stack that
          isn't a tab route is a detail screen pushed on top of the shell, and
          the iOS back-swipe reverses it exactly. Reduce Motion is handled by
          the OS for native stack animations (iOS substitutes a cross-dissolve),
          which is why there is no flag threaded through here. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.ink },
          animation: "slide_from_right",
          animationDuration: springDurationMs(springs.slide),
          gestureEnabled: true,
        }}
      >
        {/* The signed-in app shell. Auth/funnel screens (welcome/login) can sit
            BELOW it in the stack after a sign-in (welcome → login → replace to
            tabs leaves welcome underneath), so the iOS edge swipe-back used to
            pop the whole app back to "Start your journey" — looking like a
            sign-out. Disable the back gesture on the shell so swiping inside the
            app (e.g. the Today pager) never escapes to the auth screens. */}
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: "none" }} />
        {/* Routes where a back-swipe would be WRONG, not merely unhelpful. These
            are the same routes the floating nav hides on (global-nav HIDE_ON) —
            for the same reason: they are focused states you should leave
            deliberately, not by brushing the edge of the screen.
              • workout  — swiping out mid-set loses the live session's context.
              • login / welcome / onboarding — funnel steps; swiping back up the
                funnel lands the user somewhere the flow didn't intend.
            Everything else inherits the interactive pop, which on iOS is the
            OS's own gesture: genuinely finger-tracked, interruptible, and
            parallaxed — better than anything hand-rolled. */}
        <Stack.Screen name="workout" options={{ gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        {/* Upgrade is a slide-up BOTTOM SHEET — a transparent modal so the screen
            behind stays visible through the scrim (the component animates the
            panel up itself). */}
        <Stack.Screen name="upgrade" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
      </Stack>
      {!aurora && <CommandMenu />}
      {/* The brightness drop, drawn as a wash rather than a `filter` — RN's
          filter support is uneven across platforms. pointerEvents none so it
          never eats a tap while animating. */}
      {dim ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: dim }]} />
      ) : null}
      </Animated.View>
    </NavScrollProvider>
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
    ShipporiMincho_500Medium,
    ShipporiMincho_600SemiBold,
    ShipporiMincho_700Bold,
    ShipporiMincho_800ExtraBold,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryProvider>
          <ThemeProvider>
            <TemplateProvider>
              <LiquidGlassProvider>
                <SessionProvider>
                  <LanguageProvider>
                    <SheetRecedeProvider>
                      {/* Above Shell so the flying clone renders over every
                          screen — it must not be clipped by the navigator. */}
                      <SharedElementProvider>
                        <Shell />
                      </SharedElementProvider>
                    </SheetRecedeProvider>
                  </LanguageProvider>
                </SessionProvider>
              </LiquidGlassProvider>
            </TemplateProvider>
          </ThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
