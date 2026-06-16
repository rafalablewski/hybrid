import { Platform } from "react-native";
import type { Purchase, PurchaseError } from "react-native-iap";
import { verifyIapPurchase } from "./api";

/**
 * Native In-App Purchase (StoreKit 2, via react-native-iap v15).
 *
 * Flow: open the App Store purchase for the Full subscription → on success the
 * store hands us a `transactionId` → POST it to /api/billing/iap/verify, which
 * verifies it against Apple's App Store Server API and grants Full → finish the
 * transaction so StoreKit stops replaying it.
 *
 * react-native-iap is a NATIVE module: it only exists in a real (EAS) build on a
 * device, never in Expo Go or the react-native-web bundle. So we (a) gate on iOS
 * and (b) import it lazily inside the function — a static import would crash the
 * web bundle at load. Until an EAS build exists this is inert but type-checked.
 */

/** The auto-renewable product id — must match APPLE_IAP_PRODUCT_FULL on the server. */
const FULL_SKU = process.env.EXPO_PUBLIC_IAP_PRODUCT_FULL || "com.hybrid.full.monthly";

/** IAP is iOS-only here (Android billing would be a separate integration). */
export function iapAvailable(): boolean {
  return Platform.OS === "ios";
}

export type PurchaseResult = { ok: boolean; error?: string; cancelled?: boolean };

/**
 * Run the Full subscription purchase end-to-end. Resolves when the purchase is
 * verified + granted, the user cancels, or it fails. Never throws.
 */
export async function purchaseFull(): Promise<PurchaseResult> {
  if (!iapAvailable()) {
    return { ok: false, error: "In-app purchase is available in the iOS app." };
  }

  // Lazy — keeps the native module out of the web/Android bundle.
  const IAP = await import("react-native-iap");

  try {
    await IAP.initConnection();
  } catch {
    return { ok: false, error: "Couldn't connect to the App Store. Try again." };
  }

  return new Promise<PurchaseResult>((resolve) => {
    let settled = false;
    let updateSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;

    const finish = (result: PurchaseResult) => {
      if (settled) return;
      settled = true;
      updateSub?.remove();
      errorSub?.remove();
      IAP.endConnection().catch(() => {});
      resolve(result);
    };

    updateSub = IAP.purchaseUpdatedListener(async (purchase: Purchase) => {
      const transactionId = purchase.transactionId;
      if (!transactionId) {
        finish({ ok: false, error: "The store didn't return a transaction id." });
        return;
      }
      const verified = await verifyIapPurchase(transactionId);
      if (verified.ok) {
        // Only finish once the server has granted entitlement, so a failed
        // verify leaves the transaction to replay rather than silently lost.
        try {
          await IAP.finishTransaction({ purchase, isConsumable: false });
        } catch {
          /* already finished / will replay — entitlement is granted regardless */
        }
        finish({ ok: true });
      } else {
        finish({ ok: false, error: verified.error });
      }
    });

    errorSub = IAP.purchaseErrorListener((err: PurchaseError) => {
      if (IAP.isUserCancelledError(err)) {
        finish({ ok: false, cancelled: true });
      } else {
        finish({ ok: false, error: err.message || "The purchase failed." });
      }
    });

    // Kick off the purchase; the result arrives via the listeners above.
    IAP.requestPurchase({
      request: { apple: { sku: FULL_SKU }, ios: { sku: FULL_SKU } },
      type: "subs",
    }).catch(() => finish({ ok: false, error: "Couldn't start the purchase." }));
  });
}
