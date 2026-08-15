import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { FUNNEL, FULL_BENEFITS , ALPHA} from "@hybrid/core";
import { track } from "../../lib/track";
import { startCheckout } from "../../lib/api";
import { iapAvailable, purchaseFull, restorePurchases, fetchFullPrice } from "../../lib/iap";
import { LegalLinks } from "../legal-links";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { leading, tracking, fs, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import Sheet from "./sheet";
import { RADIUS } from "./kit";
import { withAlpha } from "./field";

// The Full toolkit, sold as one concise sheet (matches the web upgrade sheet).
// Benefits come from the shared @hybrid/core FULL_BENEFITS so the paywall and
// the Subscription settings tab can't drift across clients.
const BENEFITS = FULL_BENEFITS.map((b) => ({ t: b.title, d: b.desc }));

/**
 * AURORA Upgrade — the Full paywall, in the SHARED Sheet (aurora/sheet.tsx).
 *
 * It used to hand-roll its own: a raw RN Modal route drawing its own scrim at
 * motion.scrimFlat, its own panel on a 340ms cubic, and its own 40x4 grab
 * handle bound to nothing. Bypassing the shared component cost it everything
 * the component does — the parent's recede (so the paywall floated over a flat
 * picture instead of over a screen that was visibly still there), the scrim
 * coordination that lets the dim drop to 0.28 because the recede does the
 * separating, the reference counting, drag-to-dismiss, and the elongation. The
 * web twin (components/aurora/upgrade.tsx) had been on the shared Sheet the
 * whole time, so this was also the last place the two paywalls disagreed.
 *
 * It is still a ROUTE (`router.push("/upgrade")` is called from a dozen entry
 * points and from the funnel), so the route is a transparent, un-animated pane
 * and this owns the presentation: `onClosed` pops it only once the panel has
 * finished leaving, never on the request to close — popping earlier would tear
 * the route down under a panel still in flight.
 */
export default function AuroraUpgrade() {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const router = useRouter();
  const { t } = useLang();
  const paid = useSession().entitlement === "paid";
  // The Sheet owns the panel; this owns only whether it is up. Closing sets it
  // false and the route is popped from `onClosed`, after the exit has run.
  const [open, setOpen] = useState(true);

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

  useEffect(() => { track(FUNNEL.upgradePageView, { client: "mobile" }); }, []);

  const close = () => setOpen(false);

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
    // No scrim, no panel, no handle and no pad here: they are the Sheet's, and
    // every one of them was a second, drifting copy before. The body goes
    // straight into the Sheet's own scroller — the same flow the web twin uses,
    // so the CTA sits at the end of the read on both clients.
    <Sheet visible={open} onClose={close} onClosed={() => router.back()}>
      {/* badge */}
      <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: withAlpha(pa.fill, ALPHA.solid), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: pa.text }}>✦ Full</Text>
      </View>

      <Text style={{ fontFamily: F.black, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk, textAlign: "center", marginTop: 16 }}>{t("w.account.upgrade.sheet-title")}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 8, lineHeight: 18 }}>{t("w.account.upgrade.sheet-sub")}</Text>

      {/* benefits */}
      <View style={{ marginTop: 16 }}>
        {BENEFITS.map((b, i) => (
          <View key={b.t} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <Text style={{ fontSize: fs.note, color: pa.text, marginTop: 1 }}>{paid ? "✓" : "✦"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.t}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 1, lineHeight: 17 }}>{b.d}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* price */}
      <View style={{ alignItems: "center", marginTop: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: 28, letterSpacing: tracking.display, color: C.chalk }}>
          {price ?? "$9.99"}<Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}> {t("w.account.upgrade.per-month")}</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 3, letterSpacing: tracking.label }}>{t("w.account.upgrade.trial-note")}</Text>
      </View>

      {!!error && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 16, lineHeight: leading(fs.caption), textAlign: "center" }}>{error}</Text>
      )}

      {/* CTA — fill + ink come from the admin-set premium accent (usePremiumAccent); ink is auto-picked for contrast on the fill */}
      <Pressable onPress={subscribe} disabled={busy} style={{ backgroundColor: pa.fill, borderRadius: RADIUS.field, paddingVertical: 16, alignItems: "center", marginTop: 16, opacity: busy ? 0.6 : 1 }}>
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
    </Sheet>
  );
}
