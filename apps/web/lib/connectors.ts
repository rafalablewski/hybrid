import { connectorSpec, type ProviderId } from "@hybrid/core";
import { prisma } from "./db";
import { protectToken, revealToken } from "./crypto";

// Server-side OAuth config for wearable providers. Real endpoints; credentials
// come from env (per provider). Returns null when a provider isn't configured
// yet, so routes can respond with an honest "needs credentials" instead of
// pretending to connect.

interface ProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  apiBase: string;
}

export const PROVIDER_ENDPOINTS: Partial<Record<ProviderId, ProviderEndpoints>> = {
  whoop: {
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    apiBase: "https://api.prod.whoop.com/developer/v1",
  },
  oura: {
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    apiBase: "https://api.ouraring.com/v2/usercollection",
  },
};

export interface OAuthConfig {
  endpoints: ProviderEndpoints;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** Env var names a provider needs, for honest error messages. */
export function requiredEnv(provider: ProviderId): string[] {
  return [`${provider.toUpperCase()}_CLIENT_ID`, `${provider.toUpperCase()}_CLIENT_SECRET`];
}

export function oauthConfig(provider: ProviderId): OAuthConfig | null {
  const endpoints = PROVIDER_ENDPOINTS[provider];
  const spec = connectorSpec(provider);
  if (!endpoints || !spec || spec.auth !== "oauth") return null;
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return {
    endpoints,
    clientId,
    clientSecret,
    redirectUri: `${siteUrl()}/api/connect/${provider}/callback`,
    scopes: spec.scopes ?? [],
  };
}

export function authorizeUrl(cfg: OAuthConfig, state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(" "),
    state,
  });
  return `${cfg.endpoints.authorizeUrl}?${p.toString()}`;
}

type RefreshableConn = {
  id: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

/** A stored access token is stale if it has an expiry that's already past (with
 *  a 60s safety margin). No expiry → assume long-lived; refresh reactively on a
 *  401 instead. */
export function tokenExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() - 60_000 <= Date.now();
}

/**
 * Run the OAuth refresh_token grant for a connection, persist the rotated tokens
 * (encrypted), and return a fresh, decrypted access token — or null when refresh
 * isn't possible (no refresh token / unconfigured / provider rejected it, in
 * which case the connection is marked `error` so the UI prompts a reconnect).
 *
 * Without this, a wearable's short-lived access token simply expired and every
 * athlete's sync silently died until they noticed and reconnected.
 */
export async function refreshAccessToken(provider: ProviderId, conn: RefreshableConn): Promise<string | null> {
  const cfg = oauthConfig(provider);
  const refresh = revealToken(conn.refreshToken);
  if (!cfg || !refresh) {
    await prisma.connection.update({ where: { id: conn.id }, data: { status: "error" } }).catch(() => {});
    return null;
  }
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: cfg.scopes.join(" "),
    });
    const res = await fetch(cfg.endpoints.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`refresh HTTP ${res.status}`);
    const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tok.access_token) throw new Error("refresh returned no access token");
    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        status: "active",
        accessToken: protectToken(tok.access_token),
        // Providers often rotate the refresh token; only overwrite when present.
        ...(tok.refresh_token ? { refreshToken: protectToken(tok.refresh_token) } : {}),
        expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      },
    });
    return tok.access_token;
  } catch (e) {
    console.error(`[connect] ${provider} token refresh failed`, e);
    await prisma.connection.update({ where: { id: conn.id }, data: { status: "error" } }).catch(() => {});
    return null;
  }
}
