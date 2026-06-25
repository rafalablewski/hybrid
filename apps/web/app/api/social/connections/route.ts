import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards } from "@/lib/social";

// My social graph: who I follow, who follows me, mutual friends, and the
// pending follow requests addressed to me (to approve/deny).

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [out, incoming] = await Promise.all([
      prisma.follow.findMany({ where: { followerId: me.id } }),
      prisma.follow.findMany({ where: { followeeId: me.id } }),
    ]);

    const ids = new Set<string>();
    out.forEach((f) => ids.add(f.followeeId));
    incoming.forEach((f) => ids.add(f.followerId));
    const cards = await authorCards([...ids]);

    const followeeActive = new Set(out.filter((f) => f.status === "active").map((f) => f.followeeId));
    const followerActive = new Set(incoming.filter((f) => f.status === "active").map((f) => f.followerId));

    const following = out
      .filter((f) => f.status === "active")
      .map((f) => ({
        ...cards.get(f.followeeId),
        closeFriend: f.closeFriend,
        friend: followerActive.has(f.followeeId),
      }));
    const followers = incoming
      .filter((f) => f.status === "active")
      .map((f) => ({ ...cards.get(f.followerId), friend: followeeActive.has(f.followerId) }));
    const requests = incoming
      .filter((f) => f.status === "pending")
      .map((f) => ({ ...cards.get(f.followerId), followerId: f.followerId }));
    const friends = following.filter((f) => f.friend);

    return NextResponse.json({ following, followers, requests, friends });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ following: [], followers: [], requests: [], friends: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
