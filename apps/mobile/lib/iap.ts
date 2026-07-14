import { Platform } from "react-native";
import type { Purchase, PurchaseError } from "react-native-iap";
import { verifyIapPurchase } from "./api";

/**
 * Native In-App Purchase (StoreKit 2, via react-native-iap v15 / Nitro).
 *
 * App Store compliance for auto-renewable subscriptions requires:
 *   - a launch-time transaction listener, so an interrupted / Ask-to-Buy /
 *     renewal / another-device purchase that completes when no purchase UI is
 *     open is still verified, granted and finished (never a paid-but-not-granted
 *     state) — see startIap();
 *   - a "Restore Purchases" path — see restorePurchases();
 *   - the localized StoreKit price on the paywall — see fetchFullPrice();
 *   - a way to reach Apple's subscription management — see manageSubscriptions().
 *
 * react-native-iap is a NATIVE module: it only exists in a real (EAS) build on a
 * device, never in Expo Go or the react-native-web bundle. So we gate on iOS and
 * import it lazily — a static import would crash the web bundle at load.
 */

/** The auto-renewable product id — must match APPLE_IAP_PRODUCT_FULL on the server. */
const FULL_SKU = process.env.EXPO_PUBLIC_IAP_PRODUCT_FULL || "com.hybrid.full.monthly";

/** IAP is iOS-only here (Android billing would be a separate integration). */
export function iapAvailable(): boolean {
  return Platform.OS === "ios";
}

export type PurchaseResult = { ok: boolean; error?: string; cancelled?: boolean };

let mod: typeof import("react-native-iap") | null = null;
async function iap() {
  if (!mod) mod = await import("react-native-iap");
  return mod;
}

// One-shot waiters resolved by the shared purchase listener, so the interactive
// purchase flow can report success/failure to the UI while the SAME listener
// also handles background/replayed transactions.
const waiters = new Set<(r: PurchaseResult) => void>();
let onGrantedCb: (() => void) | null = null;
let started = false;

function settle(r: PurchaseResult) {
  const pending = [...waiters];
  waiters.clear();
  for (const w of pending) w(r);
  if (r.ok) onGrantedCb?.();
}
function waitOnce(): Promise<PurchaseResult> {
  return new Promise((resolve) => waiters.add(resolve));
}

async function processPurchase(purchase: Purchase): Promise<void> {
  const transactionId = purchase.transactionId;
  if (!transactionId) {
    settle({ ok: false, error: "The store didn't return a transaction id." });
    return;
  }
  const verified = await verifyIapPurchase(transactionId);
  if (verified.ok) {
    // Only finish once the server has granted entitlement, so a failed verify
    // leaves the transaction to replay rather than being silently consumed.
    try {
      const IAP = await iap();
      await IAP.finishTransaction({ purchase, isConsumable: false });
    } catch {
      /* already finished / will replay — entitlement is granted regardless */
    }
    settle({ ok: true });
  } else {
    settle({ ok: false, error: verified.error });
  }
}

/**
 * Start IAP at app launch (iOS only, idempotent). Opens the StoreKit connection
 * and registers PERSISTENT listeners so a transaction completing while no
 * purchase UI is active is still verified + granted + finished. `onGranted`
 * refreshes the session so Full unlocks immediately. Returns a cleanup fn.
 */
export async function startIap(onGranted?: () => void): Promise<() => void> {
  if (onGranted) onGrantedCb = onGranted;
  if (!iapAvailable() || started) return () => {};
  const IAP = await iap();
  try {
    await IAP.initConnection();
  } catch {
    return () => {};
  }
  const up = IAP.purchaseUpdatedListener((p: Purchase) => {
    void processPurchase(p);
  });
  const err = IAP.purchaseErrorListener((e: PurchaseError) => {
    if (IAP.isUserCancelledError(e)) settle({ ok: false, cancelled: true });
    else settle({ ok: false, error: e.message || "The purchase failed." });
  });
  started = true;
  return () => {
    up.remove();
    err.remove();
    started = false;
  };
}

/**
 * Fetch the localized StoreKit price for the Full subscription (e.g. "$9.99" /
 * "9,99 €"), so the paywall never shows a hardcoded currency. Returns null when
 * unavailable (not iOS, offline, no EAS build).
 */
export async function fetchFullPrice(): Promise<string | null> {
  if (!iapAvailable()) return null;
  try {
    const IAP = await iap();
    await IAP.initConnection().catch(() => {});
    const products = await IAP.fetchProducts({ skus: [FULL_SKU], type: "subs" });
    const p = (products ?? [])[0] as { displayPrice?: string; localizedPrice?: string | null } | undefined;
    return p?.displayPrice ?? p?.localizedPrice ?? null;
  } catch {
    return null;
  }
}

/**
 * Interactive purchase of Full. The shared listener (startIap) reports the
 * result; we register a one-shot waiter for the UI. Never throws.
 */
export async function purchaseFull(): Promise<PurchaseResult> {
  if (!iapAvailable()) {
    return { ok: false, error: "In-app purchase is available in the iOS app." };
  }
  const IAP = await iap();
  try {
    await IAP.initConnection();
  } catch {
    return { ok: false, error: "Couldn't connect to the App Store. Try again." };
  }
  if (!started) await startIap();
  const result = waitOnce();
  IAP.requestPurchase({
    request: { apple: { sku: FULL_SKU }, ios: { sku: FULL_SKU } },
    type: "subs",
  }).catch(() => settle({ ok: false, error: "Couldn't start the purchase." }));
  return result;
}

/**
 * Restore Purchases — required by Apple for auto-renewable subscriptions. Looks
 * up the user's existing/renewed transactions and verifies the Full one on the
 * server so entitlement is re-granted after a reinstall or on a new device.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!iapAvailable()) {
    return { ok: false, error: "Restore is available in the iOS app." };
  }
  const IAP = await iap();
  try {
    await IAP.initConnection();
  } catch {
    return { ok: false, error: "Couldn't connect to the App Store. Try again." };
  }
  try {
    const purchases = (await IAP.getAvailablePurchases()) as Purchase[];
    const full =
      purchases.find((p) => (p as { productId?: string }).productId === FULL_SKU) ?? purchases[0];
    if (!full) return { ok: false, error: "No purchases to restore." };
    const transactionId = full.transactionId;
    if (!transactionId) return { ok: false, error: "Couldn't read the restored transaction." };
    const verified = await verifyIapPurchase(transactionId);
    if (verified.ok) {
      onGrantedCb?.();
      return { ok: true };
    }
    return { ok: false, error: verified.error };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Couldn't restore purchases." };
  }
}

/** Open Apple's subscription-management sheet (Settings → Subscriptions). */
export async function manageSubscriptions(): Promise<void> {
  if (!iapAvailable()) return;
  try {
    const IAP = await iap();
    await IAP.initConnection().catch(() => {});
    await IAP.showManageSubscriptionsIOS();
  } catch {
    /* best-effort */
  }
}
