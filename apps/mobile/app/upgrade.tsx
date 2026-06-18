import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { FUNNEL } from "@hybrid/core";
import { track } from "../lib/track";
import { startCheckout } from "../lib/api";
import { iapAvailable, purchaseFull } from "../lib/iap";
import { supabase } from "../lib/supabase";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraUpgrade from "../components/aurora/upgrade";

// The whole Full (athlete) toolkit — sold as one bundle so the upgrade's full
// value is clear (not "just one screen"). Grouped to stay scannable.
const BUNDLE: { k: string; c: (C: ReturnType<typeof useTheme>["palette"]) => string; items: string[] }[] = [
  { k: "Train smarter", c: (C) => C.lime, items: ["Adaptive plans — auto-progression", "Periodize — your season", "Builder — your own templates", "Competition — peak on the day"] },
  { k: "Your performance", c: (C) => C.blue, items: ["Athlete Twin · HPI", "Injury risk by tissue", "Future-self projections", "Analytics dashboards"] },
  { k: "Sport & technique", c: (C) => C.amber, items: ["Sport S&C transfer", "Velocity (VBT)", "Force plate", "Technique video"] },
  { k: "Endurance & body", c: (C) => C.violet, items: ["Running — pace zones", "Volume · MEV–MRV", "Exercises & trends", "Longevity"] },
];

export default function Upgrade() {
  if (useTemplate().template === "aurora") return <AuroraUpgrade />;
  return <ClassicUpgrade />;
}

function ClassicUpgrade() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { track(FUNNEL.upgradePageView, { client: "mobile" }); }, []);

  const subscribe = async () => {
    if (busy) return;
    track(FUNNEL.upgradeCtaClick, { client: "mobile" });
    setBusy(true);
    setError("");

    // iOS: App Store rules require native In-App Purchase for digital goods.
    if (iapAvailable()) {
      const res = await purchaseFull();
      if (res.ok) {
        // Pull a fresh session so the mirrored 'paid' entitlement unlocks Full.
        await supabase.auth.refreshSession().catch(() => {});
        setBusy(false);
        router.back();
        return;
      }
      setBusy(false);
      if (!res.cancelled) setError(res.error ?? "The purchase didn't complete — try again.");
      return;
    }

    // Web / Android: hosted Stripe Checkout.
    const res = await startCheckout();
    setBusy(false);
    if (res.ok && res.url) {
      try {
        await Linking.openURL(res.url);
      } catch {
        setError("Couldn't open the checkout page.");
      }
    } else {
      setError(res.error ?? "Couldn't start checkout — try again.");
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.amber, marginTop: 10 }}>Full · the upgrade</Text>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 4 }}>Unlock HYBRID Full</Text>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
        One upgrade turns on the whole athlete toolkit — not a single screen. Your free training stays
        exactly as it is; the depth simply switches on.
      </Mono>

      <View style={{ alignSelf: "flex-start", marginTop: 12, borderWidth: 1, borderColor: C.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.lime }}>12+ pro tools · one subscription</Text>
      </View>

      {/* flagship — the Cockpit assembles everything */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
        <Kicker color={C.lime}>The hub — everything in one place</Kicker>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk, marginTop: 8 }}>◈ Athlete Cockpit</Text>
        <Mono color={C.ash} style={{ marginTop: 2, lineHeight: 18 }}>Goal, season, your Twin, sport, velocity &amp; endurance — assembled into one command center.</Mono>
      </Card>

      {BUNDLE.map((cat) => (
        <Card key={cat.k} style={{ marginTop: 12 }}>
          <Kicker color={cat.c(C)}>{cat.k}</Kicker>
          <View style={{ marginTop: 10, gap: 8 }}>
            {cat.items.map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: cat.c(C) }}>✓</Text>
                <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{line}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}

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

      {/* iOS completes the purchase through native In-App Purchase; web/Android
          use hosted Stripe Checkout. */}
      <Mono color={C.ash} style={{ marginTop: 10, lineHeight: 18, textAlign: "center" }}>
        On iOS the purchase completes securely through the App Store. Cancel anytime in your
        App Store subscriptions.
      </Mono>

      <Pressable onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Maybe later</Text>
      </Pressable>
    </Screen>
  );
}
