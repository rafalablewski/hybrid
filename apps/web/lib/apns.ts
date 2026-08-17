import { connect, constants, type ClientHttp2Session } from "node:http2";
import { createPrivateKey, sign as signRaw } from "node:crypto";

/**
 * APNs — the transport. One file, no SDK, no push service in the middle.
 *
 * WHY DIRECTLY TO APPLE. The obvious alternative is Expo's push service, and it
 * is genuinely less code: one HTTPS POST to exp.host with an Expo push token.
 * It also puts a third party between this app and every athlete's lock screen,
 * needs an EAS project + push credentials uploaded to Expo, and hands token
 * ownership to an account this repo deliberately does not depend on (the whole
 * TestFlight pipeline exists to avoid needing one — see the workflow header).
 * APNs itself is a signed JWT and an HTTP/2 POST, which is this file, so the
 * dependency buys nothing it costs less to do.
 *
 * THE AUTHENTICATION is a provider token (an ES256 JWT signed with a .p8 key
 * from App Store Connect), not a certificate: one key works for every
 * environment and never expires, so there is no annual outage waiting in a
 * calendar. Apple accepts a token for up to an hour; we mint one and cache it
 * for fifty minutes.
 *
 * THE ONE SUBTLETY, and it is the one that silently breaks push: a device token
 * is only valid on the APNs host that issued it. A build signed with an
 * `aps-environment: development` entitlement gets a SANDBOX token; a TestFlight
 * / App Store build gets a PRODUCTION one. Nothing in the token says which, and
 * the wrong host answers `400 BadDeviceToken` — indistinguishable from a dead
 * token unless you know to look. So a send with no recorded environment tries
 * production, and on BadDeviceToken retries sandbox once; the host that answered
 * is written back to the row (PushDevice.environment) and every later send goes
 * straight there.
 *
 * Env (see .env.example): APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, and
 * optionally APNS_BUNDLE_ID (defaults to the app's) and APNS_ENVIRONMENT to pin
 * a host. Unset = push is not configured, and every send is a recorded no-op
 * rather than an exception — the same soft-degrade shape the rest of the
 * server's optional integrations use.
 */

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

export type ApnsEnvironment = keyof typeof HOSTS;

/** Every way one send can end, from APNs' own answer. */
export type ApnsOutcome =
  /** Delivered to APNs (200). `environment` is the host that took it. */
  | { ok: true; environment: ApnsEnvironment }
  /** This token is dead — unregister it. 410, or 400 BadDeviceToken on both hosts. */
  | { ok: false; retire: true; reason: string }
  /** Something else went wrong (network, 429, 500, a bad payload). Keep the token. */
  | { ok: false; retire: false; reason: string };

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  /** Pinned host, when the deployment knows (APNS_ENVIRONMENT). */
  pinned?: ApnsEnvironment;
}

/** The configured APNs credentials, or null when push isn't set up. */
export function apnsConfig(): ApnsConfig | null {
  const keyP8 = process.env.APNS_KEY_P8;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyP8 || !keyId || !teamId) return null;
  const env = process.env.APNS_ENVIRONMENT;
  return {
    // A .p8 pasted into an env var arrives with literal \n, the way
    // APPLE_IAP_PRIVATE_KEY does — accept both forms.
    keyP8: keyP8.includes("-----BEGIN") ? keyP8.replace(/\\n/g, "\n") : keyP8,
    keyId,
    teamId,
    bundleId: process.env.APNS_BUNDLE_ID || "com.hybriddomain.xyz",
    pinned: env === "production" || env === "sandbox" ? env : undefined,
  };
}

export const pushConfigured = (): boolean => apnsConfig() !== null;

// ------------------------------------------------------------ the token -----

const b64url = (b: Buffer | string): string =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Cached provider token. Apple allows an hour; we re-mint at fifty minutes. */
let cached: { jwt: string; until: number; keyId: string } | null = null;

/**
 * Mint (or reuse) the ES256 provider token.
 *
 * `dsaEncoding: "ieee-p1363"` is not optional: node's default ECDSA output is
 * DER, and a JOSE signature is the raw r||s pair. A DER signature here produces
 * a 403 InvalidProviderToken that looks exactly like a wrong key.
 */
function providerToken(cfg: ApnsConfig, now: number = Date.now()): string {
  if (cached && cached.keyId === cfg.keyId && cached.until > now) return cached.jwt;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }));
  const signing = `${header}.${payload}`;
  const key = createPrivateKey(cfg.keyP8);
  const sig = signRaw("sha256", Buffer.from(signing), { key, dsaEncoding: "ieee-p1363" });
  const jwt = `${signing}.${b64url(sig)}`;
  cached = { jwt, until: now + 50 * 60_000, keyId: cfg.keyId };
  return jwt;
}

/** Drop the cached provider token — for a test, or a key rotation mid-process. */
export function resetApnsToken(): void {
  cached = null;
}

/**
 * The provider token, exposed for the test suite ONLY.
 *
 * A wrong signature encoding here answers `403 InvalidProviderToken`, which is
 * the same thing Apple says about a revoked key, a wrong Team ID and a key
 * without access to this app — so this is the one part of the transport worth
 * verifying locally, against a real EC key, rather than discovering from a
 * TestFlight build that quietly receives nothing. Nothing in the app calls it;
 * `sendOne` uses the private function directly.
 */
export const __testProviderToken = (cfg: ApnsConfig, now: number): string => providerToken(cfg, now);

// ------------------------------------------------------------- the send -----

export interface ApnsNotification {
  token: string;
  title: string;
  body: string;
  /** Everything under `aps` — the client reads `kind` + `route` from here. */
  data?: Record<string, string>;
  /** Replaces an on-screen notification with the same id instead of stacking. */
  collapseId?: string;
  /** The bell's unread count, so the app icon agrees with the app. */
  badge?: number;
}

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = constants;

/** One HTTP/2 session per host, reused for a batch and closed by the caller. */
class Connection {
  private sessions = new Map<ApnsEnvironment, ClientHttp2Session>();

  session(env: ApnsEnvironment): ClientHttp2Session {
    const open = this.sessions.get(env);
    if (open && !open.closed && !open.destroyed) return open;
    const s = connect(HOSTS[env]);
    // A session-level error must not become an unhandled 'error' event and take
    // the whole serverless invocation down; each request handles its own.
    s.on("error", () => {});
    this.sessions.set(env, s);
    return s;
  }

  close(): void {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }
}

/** How long one POST may take before we give up on it. */
const SEND_TIMEOUT_MS = 8_000;

function post(
  conn: Connection,
  cfg: ApnsConfig,
  env: ApnsEnvironment,
  n: ApnsNotification,
): Promise<{ status: number; reason: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (status: number, reason: string) => {
      if (settled) return;
      settled = true;
      resolve({ status, reason });
    };
    try {
      const payload = JSON.stringify({
        aps: {
          alert: { title: n.title, body: n.body },
          sound: "default",
          ...(n.badge === undefined ? {} : { badge: n.badge }),
          "thread-id": n.data?.kind,
        },
        ...(n.data ?? {}),
      });
      const req = conn.session(env).request({
        [HTTP2_HEADER_METHOD]: "POST",
        [HTTP2_HEADER_PATH]: `/3/device/${n.token}`,
        authorization: `bearer ${providerToken(cfg)}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        // 10 = deliver now. These three notifications are all things that just
        // happened; none of them is worth power-saving into next hour.
        "apns-priority": "10",
        ...(n.collapseId ? { "apns-collapse-id": n.collapseId } : {}),
        "content-type": "application/json",
      });
      req.setTimeout(SEND_TIMEOUT_MS, () => {
        req.close();
        done(0, "timeout");
      });
      let status = 0;
      let raw = "";
      req.on("response", (h) => {
        status = Number(h[HTTP2_HEADER_STATUS] ?? 0);
      });
      req.on("data", (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on("error", (e: Error) => done(0, e.message));
      req.on("end", () => {
        // APNs answers a failure with {"reason":"BadDeviceToken"} and a 200 with
        // an empty body.
        let reason = "";
        try {
          reason = raw ? ((JSON.parse(raw) as { reason?: string }).reason ?? "") : "";
        } catch {
          reason = raw.slice(0, 120);
        }
        done(status, reason);
      });
      req.end(payload);
    } catch (e) {
      // A malformed .p8 throws in createPrivateKey, inside providerToken.
      done(0, e instanceof Error ? e.message : "send failed");
    }
  });
}

/** Statuses/reasons that mean the token itself is finished. */
const dead = (status: number, reason: string): boolean =>
  status === 410 || reason === "Unregistered" || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";

/**
 * Send one notification, resolving the environment as described in the header.
 *
 * `known` is the device row's recorded environment. With none, production is
 * tried first (every build this repo ships is App Store-signed) and sandbox is
 * the fallback — so a locally-signed development build still receives, and the
 * answer is recorded so it only costs one extra round trip once.
 */
async function sendOne(
  conn: Connection,
  cfg: ApnsConfig,
  n: ApnsNotification,
  known: ApnsEnvironment | null,
): Promise<ApnsOutcome> {
  const order: ApnsEnvironment[] = cfg.pinned
    ? [cfg.pinned]
    : known
      ? [known]
      : ["production", "sandbox"];

  let last = { status: 0, reason: "not sent" };
  for (const env of order) {
    const r = await post(conn, cfg, env, n);
    if (r.status === 200) return { ok: true, environment: env };
    last = r;
    // Only a token/topic mismatch is worth trying the other host for; a 429 or a
    // 500 is about APNs, and hammering the sandbox with it would be noise.
    if (!dead(r.status, r.reason)) break;
  }
  if (dead(last.status, last.reason)) return { ok: false, retire: true, reason: last.reason || `HTTP ${last.status}` };
  return { ok: false, retire: false, reason: last.reason || `HTTP ${last.status}` };
}

/** One notification to one token — opens and closes its own connection. */
export async function apnsSend(
  cfg: ApnsConfig,
  n: ApnsNotification,
  known?: ApnsEnvironment | null,
): Promise<ApnsOutcome> {
  const conn = new Connection();
  try {
    return await sendOne(conn, cfg, n, known ?? null);
  } finally {
    conn.close();
  }
}

/**
 * A batch over one connection — what the cron uses.
 *
 * Sequential on purpose. HTTP/2 would happily multiplex these, but the nudge
 * cron's whole job is a slow trickle across timezones (a few hundred devices in
 * the hour that is 07:00 somewhere), and a serial loop over one session is both
 * well inside a serverless invocation's budget and impossible to get wrong.
 */
export async function apnsSendBatch(
  cfg: ApnsConfig,
  items: { notification: ApnsNotification; known?: ApnsEnvironment | null }[],
): Promise<ApnsOutcome[]> {
  const conn = new Connection();
  try {
    const out: ApnsOutcome[] = [];
    for (const it of items) out.push(await sendOne(conn, cfg, it.notification, it.known ?? null));
    return out;
  } finally {
    conn.close();
  }
}

/** Coerce a stored environment string back to the union. */
export const asApnsEnvironment = (v: string | null | undefined): ApnsEnvironment | null =>
  v === "production" || v === "sandbox" ? v : null;
