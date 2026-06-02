import { connectorSpec, type ProviderId } from "@hybrid/core";

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
