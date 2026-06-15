import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, setEntitlement, entitlementForStatus } from "@/lib/billing";

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

/** Resolve the Stripe customer id on an event object to our user, then mirror
 *  the subscription state onto their entitlement (DB + auth metadata). */
async function syncCustomer(customerId: string | null, status: string | null) {
  if (!customerId) return;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, authId: true },
  });
  if (!user) return;
  await setEntitlement({
    userId: user.id,
    authId: user.authId,
    entitlement: entitlementForStatus(status),
    subscriptionStatus: status,
  });
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    console.error("[billing] webhook signature verification failed", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        // A completed checkout = an active subscription starting now.
        await syncCustomer(customerId, "active");
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await syncCustomer(customerId, status);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[billing] webhook handler failed", event.type, e);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
