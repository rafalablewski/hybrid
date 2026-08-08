import { Component, type ReactNode } from "react";
import { View, Text, ScrollView, Share, Platform } from "react-native";
import { router } from "expo-router";
import { PressScale as Pressable } from "../lib/ui";

// A top-level error boundary. In a production RN build, an uncaught render
// exception in ANY screen unmounts the whole React tree → a blank white screen
// the user can only escape by force-quitting. This catches it and shows a
// recoverable fallback so one screen's crash never bricks the app.
//
// TWO THINGS THIS HAS TO DO that the first version did not:
//
// 1. SAY WHAT BROKE. It sits above the navigator, so on a device there is no
//    console to read and no screen left to read it from — the message was lost
//    the moment it was caught. A crash a tester cannot report is a crash nobody
//    can fix, which is exactly how "the Plans page doesn't work, it just asks
//    me to reload" reached us with nothing attached. The detail block is
//    selectable and shareable so it can be sent on from the device itself.
//    (A real reporter is still owed — see the `crash-reporting` capability.)
//
// 2. OFFER A WAY OUT. "Reload" alone re-renders the SAME crashing route, so a
//    screen that throws on mount is a loop with no exit but force-quitting —
//    the precise failure this boundary exists to prevent. `Back to Today`
//    leaves the crashed route behind, which is what makes the promise above
//    ("one screen's crash never bricks the app") actually true. The web twin
//    has had both actions all along (apps/web/app/error.tsx: Try again + Back
//    to app); mobile had only the loop.
//
// Deliberately provider-free — no theme, i18n or session, and no app font: any
// of those may be the thing that failed, and a fallback that needs the broken
// thing is not a fallback. Hence the hardcoded ink/chalk/lime and the platform
// monospace.
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

type Props = { children: ReactNode };
type State = { error: Error | null; componentStack: string | null };

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
   *  while the fallback is up, so the jump has to wait for it to come back —
   *  one frame later. If the restored route throws again on the way, we simply
   *  land back here, which is no worse than staying. */
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

  share = () => {
    const { error, componentStack } = this.state;
    if (!error) return;
    Share.share({ message: detailOf(error, componentStack) }).catch(() => {});
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    const detail = detailOf(error, componentStack);
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
          // screen gutter — and a bare `padding` here would silently claim to
          // be the latter (see apps/web/__tests__/screen-gutter.test.ts).
          contentContainerStyle={{ paddingVertical: 14, paddingHorizontal: 14 }}
        >
          <Text selectable style={{ color: ASH, fontFamily: MONO, fontSize: 11, lineHeight: 17 }}>
            {detail}
          </Text>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={{ backgroundColor: LIME, borderRadius: 999, minHeight: 44, justifyContent: "center", paddingHorizontal: 26 }}
          >
            <Text style={{ color: INK, fontWeight: "800", fontSize: 15 }}>Try again</Text>
          </Pressable>
          <Pressable
            onPress={this.home}
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            style={{ borderWidth: 1, borderColor: LINE, borderRadius: 999, minHeight: 44, justifyContent: "center", paddingHorizontal: 26 }}
          >
            <Text style={{ color: CHALK, fontWeight: "700", fontSize: 15 }}>Back to Today</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={this.share}
          accessibilityRole="button"
          accessibilityLabel="Send the error details"
          style={{ marginTop: 14, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
        >
          <Text style={{ color: ASH, fontFamily: MONO, fontSize: 12 }}>Send the details →</Text>
        </Pressable>
      </View>
    );
  }
}
