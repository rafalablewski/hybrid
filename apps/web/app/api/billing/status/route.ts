import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { getStripe } from "@/lib/billing";

/** The caller's billing state — for a client to reconcile/refresh entitlement. */
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    entitlement: user.entitlement,
    subscriptionStatus: user.subscriptionStatus,
    hasCustomer: !!user.stripeCustomerId,
    configured: !!getStripe(),
  });
}
