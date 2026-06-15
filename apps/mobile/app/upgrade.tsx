import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { startCheckout } from "../lib/api";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

// What the Full (athlete) upgrade unlocks — the depth gated behind a paid plan.
const INCLUDED = [
  "Periodized plans & your season",
  "Sport-specific S&C transfer",
  "Velocity (VBT) & load–velocity",
  "Performance State — your Athlete Twin (HPI)",
  "Technique video & asymmetry",
  "Future Self projections & longevity",
];

export default function Upgrade() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await startCheckout();
    setBusy(false);
    if (res.ok && res.url) {
      Linking.openURL(res.url);
    } else {
      setError(res.error ?? "Couldn't start checkout — try again.");
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 10 }}>Go Full</Text>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
        Simple keeps your training tracked and shareable — free, forever. Full unlocks the
        whole athlete toolkit.
      </Mono>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
        <Kicker color={C.lime}>What Full adds</Kicker>
        <View style={{ marginTop: 10, gap: 8 }}>
          {INCLUDED.map((line) => (
            <View key={line} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.lime }}>✓</Text>
              <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{line}</Text>
            </View>
          ))}
        </View>
      </Card>

      {!!error && (
        <Mono color={C.red} style={{ marginTop: 16, lineHeight: 19 }}>{error}</Mono>
      )}

      <Pressable
        onPress={subscribe}
        disabled={busy}
        style={{
          backgroundColor: C.lime,
          borderRadius: 12,
          paddingVertical: 15,
          alignItems: "center",
          marginTop: 16,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={C.onAccent} />
        ) : (
          <Text style={{ fontFamily: F.black, fontSize: 15, color: C.onAccent }}>Subscribe</Text>
        )}
      </Pressable>

      {/* On iOS, App Store rules route the final purchase through native In-App
          Purchase — that IAP client is the remaining integration. */}
      <Mono color={C.ash} style={{ marginTop: 10, lineHeight: 18, textAlign: "center" }}>
        On iOS the final purchase completes through In-App Purchase. The native IAP client is the
        remaining piece of this integration.
      </Mono>

      <Pressable onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Maybe later</Text>
      </Pressable>
    </Screen>
  );
}
