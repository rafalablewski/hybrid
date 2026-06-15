import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/guard";
import {
  getStripe,
  billingConfigured,
  getOrCreateStripeCustomer,
  FULL_PRICE_ID,
  APP_URL,
} from "@/lib/billing";

/** Start a Stripe Checkout for the Full (paid) subscription. Returns the hosted
 *  checkout URL for the client to redirect to. */
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(request, { key: "billing-checkout", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe || !billingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn’t configured yet — coming soon.", configured: false },
      { status: 503 },
    );
  }

  if (user.entitlement === "paid") {
    return NextResponse.json({ error: "already on Full" }, { status: 400 });
  }

  try {
    const customer = await getOrCreateStripeCustomer(stripe, user);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: FULL_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/app?upgraded=1`,
      cancel_url: `${APP_URL}/app`,
      metadata: { userId: user.id, authId: user.authId ?? "" },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing] checkout failed", e);
    return NextResponse.json({ error: "Couldn’t start checkout — try again." }, { status: 502 });
  }
}
