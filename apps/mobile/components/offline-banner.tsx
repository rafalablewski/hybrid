import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnectivity } from "../lib/net";
import { useTheme } from "../lib/theme";
import { F } from "../lib/ui";

// A slim, theme-aware "no connection" bar pinned under the status bar whenever
// the backend is unreachable (driven by the connectivity manager's /api/health
// probe). Turns the old confusing empty-screen-on-failure into an explicit,
// recoverable signal: tap Retry to re-probe (which revalidates every query on
// recovery). Renders nothing when online, so it costs nothing in the happy path.
export default function OfflineBanner() {
  const { online, checking, retry } = useConnectivity();
  const { palette: C } = useTheme();
  const insets = useSafeAreaInsets();
  if (online) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, zIndex: 100 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.amber, paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 13, color: "#1a1206" }}>
          {checking ? "Reconnecting…" : "No connection to HYBRID"}
        </Text>
        {checking ? (
          <ActivityIndicator size="small" color="#1a1206" />
        ) : (
          <Pressable onPress={retry} hitSlop={10} accessibilityRole="button" accessibilityLabel="Retry connection">
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: "#1a1206", textDecorationLine: "underline" }}>Retry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
