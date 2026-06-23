import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { setEntitlement } from "@/lib/billing";
import {
  appleIapConfigured,
  appleProductFull,
  verifyAppleTransaction,
} from "@/lib/apple-iap";

// Needs the Node runtime: the Apple library reads root-CA cert files and uses
// node crypto to verify the JWS signature chain.
export const runtime = "nodejs";

/**
 * Verify an App Store purchase from the mobile client and grant Full.
 *
 * App Store Server API (StoreKit 2): the native client posts a `transactionId`;
 * we fetch the signed transaction from Apple (authenticated with the .p8 API
 * key) and CRYPTOGRAPHICALLY VERIFY its JWS signature chain before granting —
 * see lib/apple-iap.ts. Still needs the native in-app-purchase client (e.g.
 * RevenueCat / react-native-iap on an EAS build) to actually run the purchase
 * and post the transaction id here. Degrades to a 503 until configured.
 */
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(request, { key: "billing-iap", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!appleIapConfigured()) {
    return NextResponse.json(
      { error: "In-app purchase isn’t configured yet — coming soon.", configured: false },
      { status: 503 },
    );
  }

  const parsed = await readJsonLimited<{ transactionId?: unknown }>(request, 64 * 1024);
  if (parsed.error) return parsed.error;
  const transactionId = parsed.data.transactionId;
  if (typeof transactionId !== "string" || transactionId.length < 1) {
    return NextResponse.json({ error: "missing transactionId" }, { status: 400 });
  }

  try {
    const tx = await verifyAppleTransaction(transactionId);
    if (!tx) {
      return NextResponse.json({ error: "not configured", configured: false }, { status: 503 });
    }

    const wantProduct = appleProductFull();
    if (wantProduct && tx.productId !== wantProduct) {
      return NextResponse.json({ error: "transaction is for a different product" }, { status: 400 });
    }
    // Auto-renewables carry an expiry; a lifetime product has none. Active =
    // no expiry, or an expiry still in the future.
    const active = tx.expiresDateMs === undefined || tx.expiresDateMs > Date.now();
    if (!active) {
      return NextResponse.json({ error: "subscription has expired" }, { status: 400 });
    }

    // BIND THE PURCHASE TO THIS ACCOUNT BEFORE GRANTING. The transaction is
    // cryptographically valid, but Apple will return it for anyone who posts the
    // id — so without binding, one purchase could be replayed across unlimited
    // accounts. Claim the originalTransactionId via the @unique column: if it's
    // already held by a different user, the write hits P2002 and we refuse.
    const otid = tx.originalTransactionId;
    if (otid) {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { appleOriginalTransactionId: otid } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          return NextResponse.json(
            { error: "This purchase is already linked to another account." },
            { status: 409 },
          );
        }
        throw e;
      }
    } else {
      console.warn("[billing] Apple IAP: no originalTransactionId on a verified transaction — granting without replay binding");
    }

    await setEntitlement({
      userId: user.id,
      authId: user.authId,
      entitlement: "paid",
      subscriptionStatus: "active",
    });
    return NextResponse.json({ ok: true, entitlement: "paid" });
  } catch (e) {
    console.error("[billing] Apple IAP verify failed", e);
    return NextResponse.json({ error: "Couldn’t verify the purchase — try again." }, { status: 502 });
  }
}
