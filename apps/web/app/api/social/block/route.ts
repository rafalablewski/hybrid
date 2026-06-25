import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// Block / unblock a user. Creating a block also tears down any follow edges in
// both directions, so a blocked pair immediately disappears from each other's
// feed, search, suggestions, leaderboards and compare (enforced in those reads).

async function resolve(b: { userId?: unknown; handle?: unknown }) {
  if (typeof b.userId === "string" && b.userId) return prisma.user.findUnique({ where: { id: b.userId }, select: { id: true } });
  if (typeof b.handle === "string" && b.handle) {
    const p = await prisma.socialProfile.findUnique({ where: { handle: b.handle.toLowerCase() }, select: { userId: true } });
    return p ? { id: p.userId } : null;
  }
  return null;
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "social-block", limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ userId?: unknown; handle?: unknown }>(request);
  if (error) return error;
  try {
    const target = await resolve(b);
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
    if (target.id === me.id) return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });

    await prisma.$transaction([
      prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: me.id, blockedId: target.id } },
        update: {},
        create: { blockerId: me.id, blockedId: target.id },
      }),
      // tear down any follow relationship in both directions
      prisma.follow.deleteMany({ where: { OR: [
        { followerId: me.id, followeeId: target.id },
        { followerId: target.id, followeeId: me.id },
      ] } }),
    ]);
    return NextResponse.json({ blocked: true }, { status: 201 });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "Social isn't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: b, error } = await readJsonLimited<{ userId?: unknown; handle?: unknown }>(request);
  if (error) return error;
  try {
    const target = await resolve(b);
    if (target) await prisma.block.deleteMany({ where: { blockerId: me.id, blockedId: target.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ ok: true, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
