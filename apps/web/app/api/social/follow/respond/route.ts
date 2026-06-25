import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// Approve or deny a PENDING follow request addressed to me (private profile).

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{ followerId?: unknown; action?: unknown }>(request);
  if (error) return error;
  const followerId = typeof b.followerId === "string" ? b.followerId : "";
  const action = b.action === "approve" || b.action === "deny" ? b.action : "";
  if (!followerId || !action) return NextResponse.json({ error: "followerId + action required" }, { status: 400 });

  try {
    // Only the FOLLOWEE (me) can act on a request addressed to me.
    const edge = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId: me.id } },
    });
    if (!edge || edge.status !== "pending") return NextResponse.json({ error: "no pending request" }, { status: 404 });

    if (action === "approve") {
      const follow = await prisma.follow.update({
        where: { followerId_followeeId: { followerId, followeeId: me.id } },
        data: { status: "active" },
      });
      return NextResponse.json({ follow });
    }
    await prisma.follow.delete({ where: { followerId_followeeId: { followerId, followeeId: me.id } } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
