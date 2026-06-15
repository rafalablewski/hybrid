import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { setEntitlement } from "@/lib/billing";

const PROD_VERIFY = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_VERIFY = "https://sandbox.itunes.apple.com/verifyReceipt";

type AppleVerifyResponse = {
  status: number;
  latest_receipt_info?: { product_id?: string; expires_date_ms?: string }[];
};

async function verifyWithApple(receipt: string, secret: string): Promise<AppleVerifyResponse> {
  const body = JSON.stringify({
    "receipt-data": receipt,
    password: secret,
    "exclude-old-transactions": true,
  });
  // Always hit production first; 21007 means it's a sandbox receipt → retry there.
  let res = await fetch(PROD_VERIFY, { method: "POST", body });
  let data = (await res.json()) as AppleVerifyResponse;
  if (data.status === 21007) {
    res = await fetch(SANDBOX_VERIFY, { method: "POST", body });
    data = (await res.json()) as AppleVerifyResponse;
  }
  return data;
}

/**
 * Verify an App Store purchase from the mobile client and grant Full.
 *
 * Code-complete: it calls Apple's verifyReceipt with the shared secret and only
 * grants when the receipt is valid and the subscription is unexpired. What's
 * still needed to go live: the native in-app-purchase client (e.g. RevenueCat /
 * react-native-iap on an EAS build) that actually runs the purchase and posts
 * the receipt here, plus APPLE_IAP_SHARED_SECRET (+ APPLE_IAP_PRODUCT_FULL).
 */
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(request, { key: "billing-iap", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const secret = process.env.APPLE_IAP_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "In-app purchase isn’t configured yet — coming soon.", configured: false },
      { status: 503 },
    );
  }

  const parsed = await readJsonLimited<{ receipt?: unknown }>(request, 256 * 1024);
  if (parsed.error) return parsed.error;
  const receipt = parsed.data.receipt;
  if (typeof receipt !== "string" || receipt.length < 20) {
    return NextResponse.json({ error: "missing receipt" }, { status: 400 });
  }

  try {
    const result = await verifyWithApple(receipt, secret);
    if (result.status !== 0) {
      return NextResponse.json({ error: `receipt invalid (status ${result.status})` }, { status: 400 });
    }
    // Find an unexpired entry — optionally pinned to a configured product id.
    const wantProduct = process.env.APPLE_IAP_PRODUCT_FULL;
    const now = Date.now();
    const active = (result.latest_receipt_info ?? []).some((e) => {
      const okProduct = !wantProduct || e.product_id === wantProduct;
      const exp = Number(e.expires_date_ms ?? 0);
      return okProduct && exp > now;
    });
    if (!active) {
      return NextResponse.json({ error: "no active subscription on receipt" }, { status: 400 });
    }

    await setEntitlement({
      userId: user.id,
      authId: user.authId,
      entitlement: "paid",
      subscriptionStatus: "active",
    });
    return NextResponse.json({ ok: true, entitlement: "paid" });
  } catch (e) {
    console.error("[billing] IAP verify failed", e);
    return NextResponse.json({ error: "Couldn’t verify the purchase — try again." }, { status: 502 });
  }
}
