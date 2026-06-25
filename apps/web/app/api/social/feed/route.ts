import { NextResponse } from "next/server";
import { buildSocialFeed, type FeedSubjectInput } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, recentSessionsByUsers, recentPostsByUsers, authorCards, blockedIdsFor } from "@/lib/social";

// The activity feed: my active followees' recent sessions + PRs, built by the
// core engine, enriched with kudos/comment counts and whether I've cheered each
// item. I'm an APPROVED follower of everyone here, so the privacy gate is
// already satisfied (private accounts only have approved followers).

const WINDOW_DAYS = 14;

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const follows = await prisma.follow.findMany({
      where: { followerId: me.id, status: "active" },
      select: { followeeId: true, closeFriend: true },
    });
    // Include my OWN activity in the feed too (like Strava's "you"), minus
    // anyone in a block relationship with me.
    const blocked = await blockedIdsFor(me.id);
    const ids = [me.id, ...follows.map((f) => f.followeeId).filter((id) => !blocked.has(id))];
    const closeSet = new Set(follows.filter((f) => f.closeFriend).map((f) => f.followeeId));

    const sinceMs = Date.now() - WINDOW_DAYS * 86_400_000;
    const [sessionsByUser, postsByUser, cards] = await Promise.all([
      recentSessionsByUsers(ids, sinceMs),
      recentPostsByUsers(ids, sinceMs),
      authorCards(ids),
    ]);

    const subjects: FeedSubjectInput[] = ids.map((id) => {
      const c = cards.get(id);
      return {
        author: {
          id,
          handle: c?.handle ?? id.slice(0, 8),
          displayName: id === me.id ? "You" : c?.displayName ?? null,
          avatarUrl: c?.avatarUrl ?? null,
          closeFriend: closeSet.has(id),
        },
        sessions: sessionsByUser.get(id) ?? [],
        posts: postsByUser.get(id) ?? [],
      };
    });

    const items = buildSocialFeed(subjects, { windowDays: WINDOW_DAYS, limit: 50 });

    // kudos + comments for the items on screen
    const keys = items.map((i) => ({ subjectType: i.subjectType, subjectId: i.subjectId }));
    const [kudos, myKudos, comments] = keys.length
      ? await Promise.all([
          prisma.kudos.groupBy({ by: ["subjectType", "subjectId"], _count: { _all: true }, where: { OR: keys } }),
          prisma.kudos.findMany({ where: { userId: me.id, OR: keys }, select: { subjectType: true, subjectId: true } }),
          prisma.comment.groupBy({ by: ["subjectType", "subjectId"], _count: { _all: true }, where: { OR: keys } }),
        ])
      : [[], [], []];

    const kCount = new Map((kudos as { subjectType: string; subjectId: string; _count: { _all: number } }[]).map((k) => [`${k.subjectType}:${k.subjectId}`, k._count._all]));
    const cCount = new Map((comments as { subjectType: string; subjectId: string; _count: { _all: number } }[]).map((c) => [`${c.subjectType}:${c.subjectId}`, c._count._all]));
    const mine = new Set((myKudos as { subjectType: string; subjectId: string }[]).map((k) => `${k.subjectType}:${k.subjectId}`));

    const enriched = items.map((i) => {
      const key = `${i.subjectType}:${i.subjectId}`;
      return {
        ...i,
        kudos: kCount.get(key) ?? 0,
        comments: cCount.get(key) ?? 0,
        kudosedByMe: mine.has(key),
        mine: i.author.id === me.id,
      };
    });

    return NextResponse.json({ feed: enriched });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ feed: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
