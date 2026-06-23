import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { connectorSpec, type ProviderId } from "@hybrid/core";
import { oauthConfig } from "@/lib/connectors";
import { protectToken } from "@/lib/crypto";

// OAuth callback: verify state, exchange the code for tokens, and persist the
// Connection. A follow-up sync pulls history into the Signal ontology.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = await params;
  const spec = connectorSpec(provider as ProviderId);
  if (!spec) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const cfg = oauthConfig(provider as ProviderId);
  if (!cfg) return NextResponse.json({ error: "provider not configured" }, { status: 501 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${provider}`)?.value;
  if (!code || !state || !expected || state !== expected)
    return NextResponse.json({ error: "invalid oauth state" }, { status: 400 });

  // Exchange the authorization code for tokens.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.endpoints.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return NextResponse.json({ error: "token exchange failed" }, { status: 502 });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tok.access_token) return NextResponse.json({ error: "no access token" }, { status: 502 });

  await prisma.connection.upsert({
    where: { userId_provider: { userId: user.id, provider } },
    update: {
      status: "active",
      accessToken: protectToken(tok.access_token),
      // Many providers omit refresh_token on a RE-auth — only overwrite it (and
      // scope) when actually returned, otherwise a re-connect would null out the
      // still-valid refresh token we need to keep the sync alive.
      ...(tok.refresh_token ? { refreshToken: protectToken(tok.refresh_token) } : {}),
      expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      ...(tok.scope ? { scope: tok.scope } : {}),
    },
    create: {
      userId: user.id,
      provider,
      status: "active",
      accessToken: protectToken(tok.access_token),
      refreshToken: protectToken(tok.refresh_token),
      expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      scope: tok.scope ?? cfg.scopes.join(" "),
    },
  });

  jar.delete(`oauth_state_${provider}`);
  return NextResponse.redirect(`${url.origin}/app?connected=${provider}`);
}
