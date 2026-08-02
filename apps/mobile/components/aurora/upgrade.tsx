import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking, Animated, Easing, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FUNNEL, FULL_BENEFITS } from "@hybrid/core";
import { track } from "../../lib/track";
import { startCheckout } from "../../lib/api";
import { iapAvailable, purchaseFull, restorePurchases, fetchFullPrice } from "../../lib/iap";
import { LegalLinks } from "../legal-links";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { fs, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";

// The Full toolkit, sold as one concise sheet (matches the web upgrade sheet).
// Benefits come from the shared @hybrid/core FULL_BENEFITS so the paywall and
// the Subscription settings tab can't drift across clients.
const BENEFITS = FULL_BENEFITS.map((b) => ({ t: b.title, d: b.desc }));

/**
 * AURORA Upgrade — a slide-up BOTTOM SHEET paywall (presented as a transparent
 * modal so the screen behind shows through the scrim). Reuses the same Stripe
 * Checkout / Apple IAP flow + funnel tracking. Mirrors the web upgrade sheet.
 */
export default function AuroraUpgrade() {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const router = useRouter();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const paid = useSession().entitlement === "paid";

  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  // Localized StoreKit price (App Store requires the real, currency-correct price
  // on the paywall, not a hardcoded number). Falls back to the display copy below.
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchFullPrice().then((p) => { if (active && p) setPrice(p); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Slide-up entrance: 1 = off-screen (down), 0 = resting (up). The scrim fades
  // in with it, and a dismiss slides it back down before popping the modal.
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    track(FUNNEL.upgradePageView, { client: "mobile" });
    Animated.timing(slide, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slide]);

  const close = () => {
    Animated.timing(slide, { toValue: 1, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => router.back());
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 720] });
  const scrimOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  const subscribe = async () => {
    if (busy) return;
    track(FUNNEL.upgradeCtaClick, { client: "mobile" });
    setBusy(true);
    setError("");

    // iOS: App Store rules require native In-App Purchase for digital goods.
    if (iapAvailable()) {
      const res = await purchaseFull();
      if (res.ok) {
        await supabase.auth.refreshSession().catch(() => {});
        setBusy(false);
        close();
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
      try { await Linking.openURL(res.url); } catch { setError("Couldn't open the checkout page."); }
    } else {
      setError(res.error ?? "Couldn't start checkout — try again.");
    }
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setError("");
    const res = await restorePurchases();
    if (res.ok) {
      await supabase.auth.refreshSession().catch(() => {});
      setRestoring(false);
      close();
      return;
    }
    setRestoring(false);
    if (!res.cancelled) setError(res.error ?? t("w.account.upgrade.restore-none"));
  };

  return (
    <View style={{ flex: 1 }}>
      {/* scrim — tap to dismiss; the screen behind stays visible through it */}
      <Pressable onPress={close} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={t("w.account.upgrade.maybe-later")}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: scrimOpacity }]} />
      </Pressable>

      {/* the sheet */}
      <Animated.View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          backgroundColor: C.ink2, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          borderWidth: 1, borderColor: C.line, maxHeight: "90%",
          paddingHorizontal: 22, paddingTop: 12, paddingBottom: insets.bottom + 22,
          transform: [{ translateY }],
          shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 24,
        }}
      >
        <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: "center", marginBottom: 18 }} />

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* badge */}
          <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${pa.fill}24`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: pa.text }}>✦ Full</Text>
          </View>

          <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.6, color: C.chalk, textAlign: "center", marginTop: 14 }}>{t("w.account.upgrade.sheet-title")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center", marginTop: 8, lineHeight: 18 }}>{t("w.account.upgrade.sheet-sub")}</Text>

          {/* benefits */}
          <View style={{ marginTop: 18 }}>
            {BENEFITS.map((b, i) => (
              <View key={b.t} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <Text style={{ fontSize: 15, color: pa.text, marginTop: 1 }}>{paid ? "✓" : "✦"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: C.chalk }}>{b.t}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: 12.5, color: C.ash, marginTop: 1, lineHeight: 17 }}>{b.d}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* price */}
          <View style={{ alignItems: "center", marginTop: 18 }}>
            <Text style={{ fontFamily: F.black, fontSize: 28, letterSpacing: -0.5, color: C.chalk }}>
              {price ?? "$9.99"}<Text style={{ fontFamily: F.reg, fontSize: 14, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text>
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.lime), marginTop: 3, letterSpacing: 0.3 }}>{t("w.account.upgrade.trial-note")}</Text>
          </View>

          {!!error && (
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 14, lineHeight: 18, textAlign: "center" }}>{error}</Text>
          )}
        </ScrollView>

        {/* CTA — fill + ink come from the admin-set premium accent (usePremiumAccent); ink is auto-picked for contrast on the fill */}
        <Pressable onPress={subscribe} disabled={busy} style={{ backgroundColor: pa.fill, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 16, opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color={pa.ink} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: pa.ink }}>{t("w.account.upgrade.start-trial")}</Text>}
        </Pressable>
        {/* Restore Purchases — required by Apple for auto-renewable subscriptions */}
        {iapAvailable() && (
          <Pressable onPress={restore} disabled={restoring} accessibilityRole="button" accessibilityLabel={t("w.account.upgrade.restore")} style={{ alignItems: "center", paddingVertical: 10, marginTop: 4 }}>
            {restoring ? <ActivityIndicator color={C.ash} /> : <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.account.upgrade.restore")}</Text>}
          </Pressable>
        )}
        <Pressable onPress={close} style={{ alignItems: "center", paddingVertical: 12 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("w.account.upgrade.maybe-later")}</Text>
        </Pressable>
        {/* Terms + Privacy — App Store requires both on the subscription screen */}
        <LegalLinks />
      </Animated.View>
    </View>
  );
}
