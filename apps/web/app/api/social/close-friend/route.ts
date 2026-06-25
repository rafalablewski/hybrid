import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// Toggle a followee into / out of my curated "close friends" list. Only valid
// on an ACTIVE follow I own.

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{ followeeId?: unknown; close?: unknown }>(request);
  if (error) return error;
  const followeeId = typeof b.followeeId === "string" ? b.followeeId : "";
  const close = b.close === true;
  if (!followeeId) return NextResponse.json({ error: "followeeId required" }, { status: 400 });

  try {
    const edge = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: me.id, followeeId } },
    });
    if (!edge || edge.status !== "active")
      return NextResponse.json({ error: "follow them first" }, { status: 400 });
    const follow = await prisma.follow.update({
      where: { followerId_followeeId: { followerId: me.id, followeeId } },
      data: { closeFriend: close },
    });
    return NextResponse.json({ follow });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
