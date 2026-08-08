import { Component, type ReactNode } from "react";
import { View, Text, ScrollView, Share, Platform } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { PressScale as Pressable } from "../lib/ui";

// The render boundaries. In a production RN build, an uncaught render exception
// unmounts the React tree → a blank white screen the user can only escape by
// force-quitting. These catch it and show a recoverable fallback.
//
// THREE THINGS THIS HAS TO DO that the first version did not:
//
// 1. SAY WHAT BROKE. It caught the exception and threw away the only copy of
//    it: "Something went wrong. Try reloading." On a device there is no console
//    to read and no screen left to read one from, so a TestFlight crash arrived
//    as "the Plans page doesn't work, it just asks me to reload" with nothing
//    attached — unfixable by construction. The detail block is selectable and
//    shareable so it can leave the device.
//
// 2. CONTAIN THE CRASH TO THE SCREEN THAT CAUSED IT. `ErrorBoundary` below is
//    mounted above the navigator, so ONE broken route blanks the whole app —
//    no tab bar, no back gesture, nothing to navigate with. That is the gap
//    between its own promise ("one screen's crash never bricks the app") and
//    what it does. `RouteErrorBoundary` is expo-router's per-route convention:
//    a route that exports it keeps the navigator mounted around the failure, so
//    every OTHER screen stays reachable while the broken one reports.
//
// 3. OFFER A WAY OUT. "Reload" alone re-renders the SAME crashing route, so a
//    screen that throws on mount was a loop with no exit but force-quitting.
//    The app-wide fallback gained "Back to Today"; the route-level one doesn't
//    need it, because the navigator underneath is the way out.
//
// Deliberately provider-free — no theme, i18n, session or app font: any of
// those may be the thing that failed, and a fallback that needs the broken
// thing is not a fallback. Hence the hardcoded ink/chalk/lime and the platform
// monospace. A real reporter is still owed (see the `crash-reporting`
// capability); this is the stopgap.
//
// Error boundaries must be class components (no hook equivalent for
// getDerivedStateFromError / componentDidCatch).

const INK = "#0c0d0c";
const INK2 = "#141614";
const LINE = "#2a2d2a";
const CHALK = "#eae3d4";
const ASH = "#8b8f86";
const LIME = "#c6f84f";
const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

/** The message plus the first frames of the stack — enough to name the
 *  component that threw, short enough to read on a phone. */
function detailOf(error: Error, componentStack?: string | null): string {
  const frames = (error.stack ?? "").split("\n").slice(1, 5).map((l) => l.trim());
  const where = (componentStack ?? "").split("\n").filter(Boolean).slice(0, 5).map((l) => l.trim());
  return [
    `${error.name}: ${error.message}`,
    ...(frames.length ? ["", ...frames] : []),
    ...(where.length ? ["", "in:", ...where] : []),
  ].join("\n");
}

/**
 * The fallback itself, shared by both boundaries. `onLeave` is what separates
 * them: the app-wide boundary has unmounted the navigator, so leaving means
 * re-mounting it and jumping; a route boundary renders INSIDE the navigator, so
 * there is nothing to leave — the tab bar and the back gesture are still there.
 */
function CrashFallback({ detail, onRetry, onLeave }: { detail: string; onRetry: () => void; onLeave?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: INK, alignItems: "center", justifyContent: "center", padding: 28 }}>
      <Text style={{ color: CHALK, fontSize: 20, fontWeight: "800", textAlign: "center" }}>Something went wrong</Text>
      <Text style={{ color: ASH, fontSize: 14, textAlign: "center", marginTop: 10, lineHeight: 20 }}>
        This screen hit an unexpected error. Your saved data is safe.
      </Text>

      {/* WHAT broke, on the device, in the tester's hands. Bounded and
          scrollable so a long stack can't push the actions off the screen. */}
      <ScrollView
        style={{ alignSelf: "stretch", maxHeight: 190, marginTop: 18, borderWidth: 1, borderColor: LINE, borderRadius: 16, backgroundColor: INK2 }}
        // Stated on both axes: this is the DETAIL CARD's own inset, not the
        // screen gutter — and a bare `padding` here would silently claim to be
        // the latter (see apps/web/__tests__/screen-gutter.test.ts).
        contentContainerStyle={{ paddingVertical: 14, paddingHorizontal: 14 }}
      >
        <Text selectable style={{ color: ASH, fontFamily: MONO, fontSize: 11, lineHeight: 17 }}>
          {detail}
        </Text>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={{ backgroundColor: LIME, borderRadius: 999, minHeight: 44, justifyContent: "center", paddingHorizontal: 26 }}
        >
          <Text style={{ color: INK, fontWeight: "800", fontSize: 15 }}>Try again</Text>
        </Pressable>
        {!!onLeave && (
          <Pressable
            onPress={onLeave}
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            style={{ borderWidth: 1, borderColor: LINE, borderRadius: 999, minHeight: 44, justifyContent: "center", paddingHorizontal: 26 }}
          >
            <Text style={{ color: CHALK, fontWeight: "700", fontSize: 15 }}>Back to Today</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={() => { Share.share({ message: detail }).catch(() => {}); }}
        accessibilityRole="button"
        accessibilityLabel="Send the error details"
        style={{ marginTop: 14, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
      >
        <Text style={{ color: ASH, fontFamily: MONO, fontSize: 12 }}>Send the details →</Text>
      </Pressable>
    </View>
  );
}

/**
 * THE ROUTE-LEVEL BOUNDARY — expo-router's `ErrorBoundary` convention. A route
 * file that exports one gets its screen wrapped, and ONLY its screen, so the
 * navigator survives the crash and every other screen stays reachable.
 *
 * Add to any route worth containing:
 *   export { RouteErrorBoundary as ErrorBoundary } from "../components/error-boundary";
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // No "Back to Today" here on purpose: the navigator is still mounted
  // underneath, so the tab bar and the back gesture ARE the way out, and a
  // button beside them would be a worse copy of what the OS already gives.
  return <CrashFallback detail={detailOf(error)} onRetry={() => void retry()} />;
}

type Props = { children: ReactNode };
type State = { error: Error | null; componentStack: string | null };

/** The app-wide last resort, for a throw in the providers themselves — above
 *  the navigator, where there is no screen left to contain the failure to. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // No crash reporter wired yet (see the `crash-reporting` capability); at
    // least surface it to the JS console / native logs, and keep the component
    // stack so the fallback can name the screen that threw.
    console.error("[ErrorBoundary] uncaught render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null, componentStack: null });

  /** Clear the error AND leave the route that threw. The navigator is unmounted
   *  while this fallback is up, so the jump has to wait for it to come back —
   *  one frame later. If the restored route throws again on the way we land
   *  back here, which is no worse than staying. */
  home = () => {
    this.setState({ error: null, componentStack: null }, () => {
      requestAnimationFrame(() => {
        try {
          router.replace("/");
        } catch {
          /* the navigator may not be ready; the reset alone still stands */
        }
      });
    });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return <CrashFallback detail={detailOf(error, componentStack)} onRetry={this.reset} onLeave={this.home} />;
  }
}
