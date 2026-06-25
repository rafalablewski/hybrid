import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards } from "@/lib/social";

// "People you may know": friends-of-friends and people who share a coach with
// me, minus anyone I already follow. Each carries a short reason.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const myFollows = await prisma.follow.findMany({ where: { followerId: me.id }, select: { followeeId: true } });
    const exclude = new Set<string>([me.id, ...myFollows.map((f) => f.followeeId)]);
    const reason = new Map<string, string>();

    // friends-of-friends: people my followees follow
    const followeeIds = myFollows.map((f) => f.followeeId);
    if (followeeIds.length) {
      const fof = await prisma.follow.findMany({
        where: { followerId: { in: followeeIds }, status: "active" },
        select: { followeeId: true },
        take: 200,
      });
      for (const f of fof) if (!exclude.has(f.followeeId)) reason.set(f.followeeId, "Followed by people you follow");
    }

    // shared coach: other clients of my coaches, and my clients' coaches
    const links = await prisma.coachLink.findMany({
      where: { OR: [{ clientId: me.id }, { coachId: me.id }], status: "ACTIVE" },
      select: { coachId: true, clientId: true },
    });
    const coachIds = links.filter((l) => l.clientId === me.id).map((l) => l.coachId);
    if (coachIds.length) {
      const siblings = await prisma.coachLink.findMany({
        where: { coachId: { in: coachIds }, status: "ACTIVE" },
        select: { clientId: true },
        take: 200,
      });
      for (const s of siblings) if (!exclude.has(s.clientId)) reason.set(s.clientId, "Trains with the same coach");
      for (const id of coachIds) if (!exclude.has(id)) reason.set(id, "Your coach");
    }

    const ids = [...reason.keys()].slice(0, 24);
    // only surface people who have a social profile (claimed a handle)
    const profiles = await prisma.socialProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
    const withProfile = profiles.map((p) => p.userId).slice(0, 12);
    const cards = await authorCards(withProfile);
    const suggestions = withProfile.map((id) => ({ ...cards.get(id), reason: reason.get(id) }));

    return NextResponse.json({ suggestions });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ suggestions: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
