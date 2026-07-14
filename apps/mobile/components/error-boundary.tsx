import { Component, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";

// A top-level error boundary. In a production RN build, an uncaught render
// exception in ANY screen unmounts the whole React tree → a blank white screen
// the user can only escape by force-quitting. This catches it and shows a
// recoverable fallback so one screen's crash never bricks the app.
//
// Error boundaries must be class components (no hook equivalent for
// getDerivedStateFromError / componentDidCatch).
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // No crash reporter wired yet (see the `crash-reporting` capability); at
    // least surface it to the JS console / native logs for now.
    console.error("[ErrorBoundary] uncaught render error:", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: "#0c0d0c", alignItems: "center", justifyContent: "center", padding: 28 }}>
        <Text style={{ color: "#eae3d4", fontSize: 20, fontWeight: "800", textAlign: "center" }}>Something went wrong</Text>
        <Text style={{ color: "#8b8f86", fontSize: 14, textAlign: "center", marginTop: 10, lineHeight: 20 }}>
          The screen hit an unexpected error. Your saved data is safe. Try reloading.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Reload"
          style={{ marginTop: 22, backgroundColor: "#c6f84f", borderRadius: 999, paddingVertical: 13, paddingHorizontal: 30 }}
        >
          <Text style={{ color: "#0c0d0c", fontWeight: "800", fontSize: 15 }}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}
