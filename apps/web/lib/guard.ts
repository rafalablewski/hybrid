import { NextResponse } from "next/server";
import { fixedWindow, pruneRateStore, withinBodyLimit, type RateState } from "@hybrid/core";
import { clientIp } from "./admin";

// Request-abuse guards used by sensitive/expensive routes: per-IP rate limiting
// and request body-size caps. The rate-limit math lives in @hybrid/core (pure +
// tested). The counter is kept in a SHARED store (Upstash / Vercel KV over REST)
// so the limit is enforced across the whole serverless fleet — an in-process Map
// is per-instance and effectively unlimited under any real (multi-instance)
// traffic. When no shared store is configured we fall back to that Map so the
// app still runs (best-effort, per-instance) instead of failing closed.

const store = new Map<string, RateState>();

export type RateLimit = { key: string; limit: number; windowMs: number };

type RateResult = {
  allowed: boolean;
  retryAfterSec: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

// --- Distributed backend (Upstash / Vercel KV REST) ------------------------
// Both expose the same REST API, so no client library is needed. Reads KV_REST_*
// (Vercel KV) or UPSTASH_REDIS_REST_* (Upstash). Returns null when unconfigured.
let warnedNoStore = false;
function redisRest(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  // No shared store → the per-instance in-memory limiter is effectively
  // unlimited fleet-wide on serverless. Fine for dev; a real gap in prod. Alarm
  // once so it's visible in logs rather than silently ineffective.
  if (!warnedNoStore && process.env.NODE_ENV === "production") {
    warnedNoStore = true;
    console.error(
      "[guard] no shared rate-limit store configured (KV_REST_API_* / UPSTASH_REDIS_REST_*) — per-IP limits are per-instance only and NOT enforced fleet-wide. Configure Upstash/Vercel KV in production.",
    );
  }
  return null;
}

/** Atomic fixed window in Redis: INCR the per-IP+key counter, set the TTL only
 *  on the first hit of the window (PEXPIRE NX), and read the remaining TTL —
 *  one pipelined round-trip. Throws on any transport/store error so the caller
 *  can fall back to the in-process limiter. */
async function redisFixedWindow(
  rest: { url: string; token: string },
  bucketKey: string,
  cfg: { limit: number; windowMs: number },
): Promise<RateResult> {
  const res = await fetch(`${rest.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${rest.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", bucketKey],
      ["PEXPIRE", bucketKey, cfg.windowMs, "NX"],
      ["PTTL", bucketKey],
    ]),
    // Never let a slow store hold a user request open.
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`rate store HTTP ${res.status}`);
  const body = (await res.json()) as Array<{ result?: unknown; error?: unknown }>;
  if (body[0]?.error) throw new Error(String(body[0].error));
  const count = Number(body[0]?.result ?? 0);
  let ttl = Number(body[2]?.result ?? cfg.windowMs);
  if (!Number.isFinite(ttl) || ttl < 0) ttl = cfg.windowMs;
  return {
    allowed: count <= cfg.limit,
    retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)),
    limit: cfg.limit,
    remaining: Math.max(0, cfg.limit - count),
    resetAt: Date.now() + ttl,
  };
}

/** Per-instance fallback (the original in-memory fixed window). */
function inMemoryFixedWindow(bucketKey: string, cfg: RateLimit): RateResult {
  // Opportunistically evict expired buckets (cheap; keeps memory bounded).
  if (Math.random() < 0.02) pruneRateStore(store);
  return fixedWindow(store, bucketKey, { limit: cfg.limit, windowMs: cfg.windowMs });
}

/** Apply a per-IP fixed-window limit, enforced fleet-wide when a shared store is
 *  configured. Returns a 429 NextResponse when the caller is over budget, or
 *  null to proceed. */
export async function rateLimit(req: Request, cfg: RateLimit): Promise<NextResponse | null> {
  const ip = clientIp(req) ?? "unknown";
  const bucketKey = `rl:${cfg.key}:${ip}`;

  let result: RateResult;
  const rest = redisRest();
  if (rest) {
    try {
      result = await redisFixedWindow(rest, bucketKey, { limit: cfg.limit, windowMs: cfg.windowMs });
    } catch (e) {
      // Fail OPEN to the in-process limiter on a store blip — a Redis outage
      // must not 500 every protected route. Still bounded (per instance).
      console.error("[guard] distributed rate store unavailable, falling back to in-memory", e);
      result = inMemoryFixedWindow(bucketKey, cfg);
    }
  } else {
    result = inMemoryFixedWindow(bucketKey, cfg);
  }

  if (!result.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: result.retryAfterSec },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSec),
          "RateLimit-Limit": String(result.limit),
          "RateLimit-Remaining": String(result.remaining),
          "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      },
    );
  }
  return null;
}

const DEFAULT_MAX_BODY = 64 * 1024; // 64 KB — generous for JSON, hostile for abuse.

/** Read + parse a JSON body, rejecting anything over `maxBytes`. Returns either
 *  the parsed value or a NextResponse (413/400) to return as-is. */
export async function readJsonLimited<T = unknown>(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BODY,
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  if (!withinBodyLimit(req.headers.get("content-length"), maxBytes)) {
    return { error: NextResponse.json({ error: "payload too large" }, { status: 413 }) };
  }
  const raw = await req.text();
  // Guard against a lying/absent content-length by checking the actual bytes.
  // TextEncoder (not Buffer) so the helper stays portable across Edge/runtimes.
  if (new TextEncoder().encode(raw).length > maxBytes) {
    return { error: NextResponse.json({ error: "payload too large" }, { status: 413 }) };
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    // Routes destructure fields off this, so reject "null"/arrays/primitives
    // up front rather than letting a property access throw downstream.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: NextResponse.json({ error: "invalid json object" }, { status: 400 }) };
    }
    return { data: parsed as T };
  } catch {
    return { error: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
}
