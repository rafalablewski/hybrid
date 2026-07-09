import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { FUNNEL } from "@hybrid/core";
import { track } from "../../lib/track";
import { startCheckout } from "../../lib/api";
import { iapAvailable, purchaseFull } from "../../lib/iap";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

// The whole Full (athlete) toolkit — sold as one bundle so the upgrade's full
// value is clear (not "just one screen"). Grouped to stay scannable.
const BUNDLE: { k: string; c: (C: ReturnType<typeof useTheme>["palette"]) => string; items: string[] }[] = [
  { k: "Train smarter", c: (C) => C.lime, items: ["Adaptive plans — auto-progression", "Periodize — your season", "Competition — peak on the day"] },
  { k: "Your performance", c: (C) => C.lime, items: ["Performance State · HPI", "Injury risk by tissue", "Future-self projections", "Analytics dashboards"] },
  { k: "Sport & technique", c: (C) => C.lime, items: ["Sport S&C transfer", "Velocity (VBT)", "Force plate", "Technique video"] },
  { k: "Endurance & body", c: (C) => C.lime, items: ["Running — pace zones", "Volume · MEV–MRV", "Exercises & trends", "Longevity"] },
];

/** AURORA Upgrade — the Full toolkit paywall, reusing the same checkout / IAP
 *  flow and funnel tracking in the rounded Aurora style. */
export default function AuroraUpgrade() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  // A free viewer sees each premium feature explicitly LOCKED (🔒); a paid-Simple
  // viewer sees them as included (✓).
  const paid = useSession().entitlement === "paid";

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
    <AuroraScreen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: txt(C, C.lime), marginTop: 12 }}>{t("w.account.upgrade.kicker")}</Text>
      <AHeading style={{ fontSize: fs.display, marginTop: 4 }}>Unlock HYBRID Full</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 8, lineHeight: 21 }}>
        One upgrade turns on the whole athlete toolkit — not a single screen. Your free training stays
        exactly as it is; the depth simply switches on.
      </Text>

      <View style={{ alignSelf: "flex-start", marginTop: 12, borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>12+ pro tools · one subscription</Text>
      </View>

      {/* flagship — the Cockpit assembles everything */}
      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>The hub — everything in one place</Text>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: 10 }}>◈ Athlete Cockpit{paid ? "" : "  🔒"}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4, lineHeight: 18 }}>Goal, season, your Performance State, sport, velocity &amp; endurance — assembled into one command center.</Text>
      </ACard>

      {BUNDLE.map((cat) => (
        <ACard key={cat.k} style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, cat.c(C)) }}>{cat.k}</Text>
          <View style={{ marginTop: 12, gap: space.sm }}>
            {cat.items.map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{line}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: paid ? txt(C, cat.c(C)) : C.ash }}>{paid ? "✓" : "🔒"}</Text>
              </View>
            ))}
          </View>
        </ACard>
      ))}

      {!!error && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.red), marginTop: 16, lineHeight: 19 }}>{error}</Text>
      )}

      <Pressable
        onPress={subscribe}
        disabled={busy}
        style={{
          backgroundColor: C.lime,
          borderRadius: RADIUS.pill,
          paddingVertical: 18,
          alignItems: "center",
          marginTop: 16,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={C.onAccent} />
        ) : (
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.account.upgrade.subscribe")}</Text>
        )}
      </Pressable>

      {/* iOS completes the purchase through native In-App Purchase; web/Android
          use hosted Stripe Checkout. */}
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 12, lineHeight: 18, textAlign: "center" }}>
        On iOS the purchase completes securely through the App Store. Cancel anytime in your
        App Store subscriptions.
      </Text>

      <Pressable onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.account.upgrade.maybe-later")}</Text>
      </Pressable>
    </AuroraScreen>
  );
}
