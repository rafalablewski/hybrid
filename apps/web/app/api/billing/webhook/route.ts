import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe, setEntitlement, entitlementForStatus } from "@/lib/billing";

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

/** Resolve the Stripe customer id on an event object to our user, then mirror
 *  the subscription state onto their entitlement (DB + auth metadata). `eventAt`
 *  is the Stripe event timestamp; an event older than the last one we applied is
 *  ignored so a delayed/reordered delivery can't roll the entitlement back. */
async function syncCustomer(customerId: string | null, status: string | null, eventAt: Date) {
  if (!customerId) return;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, authId: true, subscriptionStatusAt: true },
  });
  if (!user) return;
  // Out-of-order guard: skip an event older than the last applied subscription
  // event (e.g. a late "subscription.deleted" retry landing after a re-subscribe
  // would otherwise flip a paying user back to free).
  if (user.subscriptionStatusAt && eventAt < user.subscriptionStatusAt) return;
  await setEntitlement({
    userId: user.id,
    authId: user.authId,
    entitlement: entitlementForStatus(status),
    subscriptionStatus: status,
    eventAt,
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

  // Idempotency: claim the event id. Stripe retries on any non-2xx and can
  // redeliver the same event, so re-processing must be a no-op. Best-effort —
  // if the ledger table isn't migrated yet we log and still process (the
  // entitlement writes themselves are idempotent state-sets).
  try {
    await prisma.processedWebhookEvent.create({ data: { id: event.id, type: event.type, provider: "stripe" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[billing] webhook idempotency ledger unavailable (processing anyway)", e);
  }

  const eventAt = new Date(event.created * 1000);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        // A completed checkout = an active subscription starting now.
        await syncCustomer(customerId, "active", eventAt);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        await syncCustomer(customerId, status, eventAt);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[billing] webhook handler failed", event.type, e);
    // Release the idempotency claim so Stripe's retry (we return 500) actually
    // re-processes instead of being skipped as a duplicate.
    await prisma.processedWebhookEvent.deleteMany({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
