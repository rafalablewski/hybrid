import { NextResponse } from "next/server";
import { fixedWindow, pruneRateStore, withinBodyLimit, type RateState } from "@hybrid/core";
import { clientIp } from "./admin";

// Request-abuse guards used by sensitive/expensive routes: per-IP rate limiting
// and request body-size caps. The rate-limit math lives in @hybrid/core (pure +
// tested); this wires it to a Request and an in-process store. The store is
// per-instance — swap `store` for a shared Redis/Upstash map to enforce across
// the serverless fleet without touching call sites.

const store = new Map<string, RateState>();

export type RateLimit = { key: string; limit: number; windowMs: number };

/** Apply a per-IP fixed-window limit. Returns a 429 NextResponse when the
 *  caller is over budget, or null to proceed. */
export function rateLimit(req: Request, cfg: RateLimit): NextResponse | null {
  // Opportunistically evict expired buckets (cheap; keeps memory bounded).
  if (Math.random() < 0.02) pruneRateStore(store);

  const ip = clientIp(req) ?? "unknown";
  const result = fixedWindow(store, `${cfg.key}:${ip}`, { limit: cfg.limit, windowMs: cfg.windowMs });

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
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { error: NextResponse.json({ error: "payload too large" }, { status: 413 }) };
  }
  try {
    return { data: (raw ? JSON.parse(raw) : {}) as T };
  } catch {
    return { error: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
}
