import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Liveness/readiness probe for uptime monitors and load balancers. No user auth
// (it exposes nothing sensitive), but generously per-IP rate-limited so it can't
// be used to hammer the DB. Returns 200 { ok: true } when the DB is reachable,
// 503 otherwise, so an external monitor can alert on real outages instead of
// waiting for user complaints.
export async function GET(request: Request) {
  // Generous — a monitor polls every 30–60s; this only stops abuse.
  const limited = await rateLimit(request, { key: "health", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const startedAt = Date.now();
  try {
    // Cheapest possible round-trip that proves the connection + pool are alive.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: "up", latencyMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[health] database unreachable", e);
    return NextResponse.json(
      { ok: false, db: "down", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
