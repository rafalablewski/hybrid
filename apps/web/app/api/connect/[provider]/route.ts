import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { connectorSpec, type ProviderId } from "@hybrid/core";
import { oauthConfig, authorizeUrl, requiredEnv } from "@/lib/connectors";

// Begin a wearable connection. For OAuth providers we redirect to the provider's
// consent screen; if creds aren't configured we say so honestly (501) rather
// than pretend. Native (HealthKit) connects from the mobile client, not here.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = await params;
  const spec = connectorSpec(provider as ProviderId);
  if (!spec) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  if (spec.auth === "native")
    return NextResponse.json({ error: "connect Apple Health from the mobile app" }, { status: 400 });
  if (spec.auth === "team")
    return NextResponse.json({ error: "team feeds are provisioned by an admin" }, { status: 400 });

  const cfg = oauthConfig(provider as ProviderId);
  if (!cfg)
    return NextResponse.json(
      { error: "provider not configured", needs: requiredEnv(provider as ProviderId) },
      { status: 501 },
    );

  // CSRF state: random token echoed back and verified in the callback.
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(`oauth_state_${provider}`, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });

  return NextResponse.redirect(authorizeUrl(cfg, state));
}
