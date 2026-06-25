import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, blockedIdsFor } from "@/lib/social";

// Follow / unfollow. A follow of a PRIVATE profile lands PENDING (the target
// approves via /api/social/follow/respond); otherwise it's ACTIVE immediately.

async function resolveTarget(b: { followeeId?: unknown; handle?: unknown }) {
  if (typeof b.followeeId === "string" && b.followeeId) {
    return prisma.user.findUnique({ where: { id: b.followeeId }, select: { id: true } });
  }
  if (typeof b.handle === "string" && b.handle) {
    const p = await prisma.socialProfile.findUnique({ where: { handle: b.handle.toLowerCase() }, select: { userId: true } });
    return p ? { id: p.userId } : null;
  }
  return null;
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "social-follow", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ followeeId?: unknown; handle?: unknown }>(request);
  if (error) return error;

  try {
    const target = await resolveTarget(b);
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
    if (target.id === me.id) return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });

    const blocked = await blockedIdsFor(me.id);
    if (blocked.has(target.id)) return NextResponse.json({ error: "Unavailable." }, { status: 403 });

    const profile = await prisma.socialProfile.findUnique({ where: { userId: target.id }, select: { visibility: true } });
    const status = profile?.visibility === "private" ? "pending" : "active";

    const follow = await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: me.id, followeeId: target.id } },
      update: {}, // keep existing status (don't downgrade an approved follow)
      create: { followerId: me.id, followeeId: target.id, status },
    });
    return NextResponse.json({ follow, status: follow.status }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Social isn't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{ followeeId?: unknown; handle?: unknown }>(request);
  if (error) return error;
  try {
    const target = await resolveTarget(b);
    if (!target) return NextResponse.json({ ok: true });
    await prisma.follow.deleteMany({ where: { followerId: me.id, followeeId: target.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ ok: true, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
