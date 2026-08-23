import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Animated, StyleSheet } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { springs, springDurationMs, MODAL_SCREENS, COVER_SCREENS } from "@hybrid/core";
import { SessionProvider } from "../lib/session";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider, useTheme } from "../lib/theme";
import QueryProvider from "../lib/query";
import { C } from "../lib/ui";
import { startIap } from "../lib/iap";
import { usePushBridge } from "../lib/push";
import { useRecoveryReadActions } from "../lib/recovery-actions";
import { supabase } from "../lib/supabase";
import { ErrorBoundary } from "../components/error-boundary";
import { ToastHost } from "../components/aurora/toast";
import { NavScrollProvider } from "../lib/nav-scroll";
import { SheetRecedeProvider, useRecedeStyle, useRecedeDim } from "../lib/sheet-recede";
import { SharedElementProvider } from "../lib/shared-element";
import { ConfirmProvider } from "../components/aurora/confirm";
/**
 * The DETOURS that exist as routes on this client, from the shared list in
 * @hybrid/core. `timer` is web's id for the interval timer — mobile's file is
 * `interval-timer.tsx`, which is in the list under its own name — so it is the
 * one entry with no route here, and expo-router would throw on a Stack.Screen
 * naming a file that does not exist. Derived from the shared list rather than
 * retyped, so adding a detour in core reaches BOTH clients.
 */
const MOBILE_DETOURS = MODAL_SCREENS.filter((r) => r !== "timer");

/**
 * The MODES that exist as routes on this client.
 *
 * `log` is dropped, and it is the one exclusion in this file that is not merely
 * a naming difference: on WEB `log` IS the live logger, while on mobile `log`
 * is the Train LAUNCHER tab (app/(tabs)/log.tsx) and the live logger is
 * `workout`. Declaring a Stack.Screen for it would name a route that is inside
 * the tab group, and treating the launcher as a mode would be wrong anyway —
 * it is a place, not a stopwatch. @hybrid/core COVER_SCREENS documents the
 * collision at the source; this is the client half of it.
 */
const MOBILE_COVERS = COVER_SCREENS.filter((r) => r !== "log");

// The bottom nav is the SYSTEM tab bar now (app/(tabs)/_layout.tsx uses
// expo-router native tabs), so there is no app-rendered bar to mount here.
// The Classic template keeps its floating command orb, which used to be
// rendered inside the tabs layout — that layout is pure NativeTabs now, so
// the orb moves up here beside the navigator.

// Inner shell so it can read the theme (the provider sits above it): drives the
// status-bar style + the navigator background so the whole app follows
// light/dark (system by default, overridable in Settings). In Aurora it also
// renders the global floating pill nav over every screen (self-gating).
function Shell() {
  const { palette } = useTheme();
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
  // Push: re-register this phone's APNs token (it rotates), and route a tap to
  // the surface the notification named. Mounted HERE, above the navigator, so a
  // notification that launched the app still finds a router to push onto — and
  // so there is exactly one set of listeners no matter which screen is up.
  // Requests nothing: the permission is asked for in Settings and once after a
  // check-in (lib/push.ts askPushOnce), never at launch.
  usePushBridge();
  // The recovery read's four answers, ON the notification — registered and
  // handled here for the same reason as the bridge above: a press can arrive
  // with no screen mounted, and there must be exactly one listener. It writes
  // in place without foregrounding the app, which is the whole point; the
  // bridge ignores custom actions so the two never both act on one press.
  useRecoveryReadActions();
  return (
    <NavScrollProvider>
      <StatusBar style="light" />
      {/* Black ground so the receded card's rounded corners actually read —
          the same reason iOS darkens the window behind a presented sheet. */}
      <Animated.View style={[{ flex: 1, backgroundColor: palette.ink, overflow: "hidden" }, recede]}>
      {/* SCREEN TRANSITIONS. Direction encodes hierarchy — the shared rule in
          @hybrid/core (motion.ts `screenTransition`), which the web shell reads
          too, so the two clients can't disagree about what a given move means.
          These options are rendered NATIVELY by react-native-screens, so
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
        {/* THE ONE MODE. Entering the live logger takes the tab bar away, turns
            the back-swipe off and makes the app a stopwatch with a keyboard —
            and it used to arrive as `slide_from_right`, the identical motion to
            opening Settings. `fullScreenModal` + a rise from the bottom edge is
            the third spatial claim the system was missing: not "deeper" (a
            push) and not "a detour you'll come back from" (a present), but
            "the app is something else now". Which screens are modes is
            @hybrid/core `isCover`, the same list `screenTransition` reads, so
            the presentation and the motion cannot disagree.

            `gestureEnabled: false` stays and now agrees with the presentation:
            a cover is left deliberately — by finishing or by abandoning —
            never by brushing the edge of the screen. */}
        {MOBILE_COVERS.map((route) => (
          <Stack.Screen
            key={route}
            name={route}
            options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", animationDuration: springDurationMs(springs.zoom), gestureEnabled: false }}
          />
        ))}
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        {/* THE DETOURS. `presentation: "modal"` is a real iOS card modal: the
            screen behind recedes and stays visibly there, and the card is
            dismissed by dragging DOWN from anywhere on it. Which routes get it
            is not decided here — @hybrid/core `MODAL_SCREENS` decides, and the
            web shell reads the same list, so a detour cannot be a detour on one
            client and a drill-down on the other.

            Before this, `presentation:` appeared exactly ONCE in the whole app
            (upgrade), so Settings, the editors and the check-in all inherited
            `slide_from_right` — the same motion as opening a session's
            breakdown. A right-slide claims "deeper in the same tree"; a modal
            claims "a detour, and you will come back", and the two exit by
            different gestures. Teaching one motion for both taught the wrong
            exit for half the app.

            Depth is untouched: a session, a plan, an exercise page still push,
            because a destination is not a detour however deep it sits. */}
        {MOBILE_DETOURS.map((route) => (
          <Stack.Screen key={route} name={route} options={{ presentation: "modal" }} />
        ))}
        {/* Upgrade is the shared SHEET now (components/aurora/upgrade.tsx renders
            <Sheet>), so the route itself must be a transparent, un-animated pane
            for the sheet to present over: the panel's travel, its scrim, the
            parent's recede and the drag are all the Sheet's, and a second
            animation from the navigator would fight all four. */}
        <Stack.Screen name="upgrade" options={{ presentation: "transparentModal", animation: "none", contentStyle: { backgroundColor: "transparent" } }} />
      </Stack>
      {/* The brightness drop, drawn as a wash rather than a `filter` — RN's
          filter support is uneven across platforms. pointerEvents none so it
          never eats a tap while animating. */}
      {dim ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: dim }]} />
      ) : null}
      </Animated.View>
      {/* Outside the receding plane: an outcome chip must not scale away with
          the screen a sheet is presenting over. */}
      <ToastHost />
    </NavScrollProvider>
  );
}

export default function RootLayout() {
  // SÖHNE, BUNDLED. The keys are the aliases `F` hands React Native; the
  // PostScript names inside the binaries are what SwiftUI resolves, and
  // native-face.test.ts holds the two together by parsing these very files.
  const [loaded] = useFonts({
    Sohne_400Buch: require("../assets/fonts/Sohne-Buch.otf"),
    Sohne_500Kraftig: require("../assets/fonts/Sohne-Kraftig.otf"),
    Sohne_600Halbfett: require("../assets/fonts/Sohne-Halbfett.otf"),
    // The display weight — mastheads and big figures only, see `F.takeover`.
    Sohne_700Dreiviertelfett: require("../assets/fonts/Sohne-Dreiviertelfett.otf"),
    SohneMono_400Buch: require("../assets/fonts/SohneMono-Buch.otf"),
    SohneMono_500Kraftig: require("../assets/fonts/SohneMono-Kraftig.otf"),
    SohneMono_600Halbfett: require("../assets/fonts/SohneMono-Halbfett.otf"),
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <ErrorBoundary>
      {/* SEEDED with the window's metrics at launch. Without this the provider
          starts every consumer at a ZERO inset and only corrects after its own
          view lays out — and a screen presented as a native `fullScreenModal`
          (the logger, and every other cover) lives in its own view controller,
          outside that measurement, so it can keep the zero. That is how the
          live logger came to draw its clock and its Finish across the status
          bar. `initialWindowMetrics` is synchronous and correct from the first
          frame, which is the only frame a cover gets. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryProvider>
          <ThemeProvider>
            <SessionProvider>
              <LanguageProvider>
                <SheetRecedeProvider>
                  {/* Above Shell so the flying clone renders over every
                      screen — it must not be clipped by the navigator. */}
                  <SharedElementProvider>
                    {/* Inside SheetRecedeProvider so a confirm recedes the
                        screen behind it like every other sheet, and inside
                        LanguageProvider so its buttons localize. */}
                    <ConfirmProvider>
                      <Shell />
                    </ConfirmProvider>
                  </SharedElementProvider>
                </SheetRecedeProvider>
              </LanguageProvider>
            </SessionProvider>
          </ThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
