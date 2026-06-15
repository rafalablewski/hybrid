import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/guard";
import { getStripe, APP_URL } from "@/lib/billing";

/** Open the Stripe billing portal so a paid user can manage/cancel their plan. */
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(request, { key: "billing-portal", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn’t configured yet.", configured: false }, { status: 503 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription to manage." }, { status: 400 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${APP_URL}/app`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    console.error("[billing] portal failed", e);
    return NextResponse.json({ error: "Couldn’t open the billing portal." }, { status: 502 });
  }
}
