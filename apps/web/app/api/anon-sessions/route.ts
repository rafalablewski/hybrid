import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Anonymous (guest) workout logging. A user training BEFORE they have an account
// can still have their workout recorded so an admin sees real product usage from
// people who haven't signed up. NO AUTH — there's no account yet. We store only
// the workout + an opaque per-device id (not PII). When the guest later signs up,
// the mobile client flushes their on-device history into real Session rows; these
// anonymous rows stay as-is for the admin's usage picture.
//
// Because it's a PUBLIC write endpoint (the one route with no user/machine auth),
// it is RATE-LIMITED per IP to blunt spam/abuse — the security test allow-lists
// it only on that condition.
//
// Best-effort by design: if the AnonSession table isn't migrated yet, this
// no-ops with 200 so it never breaks the guest's logging flow.
export async function POST(request: Request) {
  const limited = await rateLimit(request, { key: "anon-sessions", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const b = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    blocks?: unknown;
    startedAt?: unknown;
    deviceId?: unknown;
    platform?: unknown;
  };

  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const platform =
    b.platform === "ios" || b.platform === "android" || b.platform === "web" ? b.platform : null;

  try {
    await prisma.anonSession.create({
      data: {
        deviceId: typeof b.deviceId === "string" ? b.deviceId.slice(0, 128) : null,
        platform,
        title: b.title.trim().slice(0, 200),
        startedAt: b.startedAt ? new Date(b.startedAt as string) : new Date(),
        blocks: (b.blocks ?? []) as object,
      },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // Table not migrated (run reference/sql-history-checkin-anon.sql) — don't
    // fail the guest's workout over telemetry.
    console.error("[anon-sessions] skipped:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
