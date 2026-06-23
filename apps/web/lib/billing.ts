import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { patchUserMetadata } from "@/lib/supabase/admin";

/**
 * Billing — the paid "Full" entitlement.
 *
 * The whole flow is code-complete; it just needs the provider credentials wired
 * in env (see .env.example): STRIPE_SECRET_KEY, STRIPE_PRICE_FULL,
 * STRIPE_WEBHOOK_SECRET (web/Stripe) and APPLE_IAP_SHARED_SECRET (mobile IAP).
 * Every entry point degrades to a "not configured" 503 until then, so the app
 * never crashes on a missing key.
 */

let _stripe: Stripe | null = null;

/** Lazily-constructed Stripe client, or null when the secret key isn't set. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

/** Whether the Stripe checkout path is fully configured (key + price). */
export function billingConfigured(): boolean {
  return !!getStripe() && !!process.env.STRIPE_PRICE_FULL;
}

export const FULL_PRICE_ID = process.env.STRIPE_PRICE_FULL ?? "";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://hybrid-web-rosy.vercel.app";

type Entitlement = "free" | "paid";

/** A Stripe subscription status maps to a paid entitlement only while active. */
export function entitlementForStatus(status: string | null | undefined): Entitlement {
  return status === "active" || status === "trialing" ? "paid" : "free";
}

/**
 * Set the account entitlement EVERYWHERE: the DB row (server source of truth +
 * Stripe linkage) AND the Supabase auth user_metadata (so both clients pick it
 * up from their session on the next refresh). Safe if the admin client is
 * unconfigured — the DB still updates.
 */
export async function setEntitlement(opts: {
  userId: string;
  authId: string | null;
  entitlement: Entitlement;
  subscriptionStatus?: string | null;
  stripeCustomerId?: string | null;
  /** When applying a provider subscription event, its timestamp — persisted for
   *  the out-of-order guard in the webhook. */
  eventAt?: Date | null;
}): Promise<void> {
  const updated = await prisma.user.update({
    where: { id: opts.userId },
    data: {
      entitlement: opts.entitlement,
      ...(opts.subscriptionStatus !== undefined
        ? { subscriptionStatus: opts.subscriptionStatus }
        : {}),
      ...(opts.stripeCustomerId ? { stripeCustomerId: opts.stripeCustomerId } : {}),
      ...(opts.eventAt ? { subscriptionStatusAt: opts.eventAt } : {}),
    },
    select: { id: true, email: true, role: true },
  });
  await patchUserMetadata(opts.authId, { entitlement: opts.entitlement });

  // Fire the `upgraded` lifecycle automation when an account becomes paid
  // (idempotent — the unique enrollment guard means a repeated webhook is safe;
  // no-ops until an active `upgraded` sequence exists). Best-effort.
  if (opts.entitlement === "paid" && updated.email) {
    try {
      const { enrollInTrigger } = await import("@/lib/email");
      await enrollInTrigger("upgraded", { id: updated.id, email: updated.email, role: updated.role, entitlement: "paid" });
    } catch {
      /* best-effort */
    }
  }
}

/** Find-or-create the Stripe customer for a user, persisting the id. */
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  user: { id: string; email: string; authId: string | null; stripeCustomerId: string | null },
): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id, authId: user.authId ?? "" },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}
