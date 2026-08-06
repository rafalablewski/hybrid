import { NextResponse } from "next/server";
import { buildLiveNow, buildSocialFeed, rankFeed, type FeedSignals, type FeedSubjectInput, type Relation } from "@hybrid/core";
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
          // Only a REAL profile handle is shown; a profile-less user (id-slice
          // fallback) gets an empty handle so the card renders just their name,
          // never a synthetic "@a1b2c3d4".
          handle: c?.hasProfile ? c.handle : "",
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

    // ---- RANKING (core/feed-rank.ts) ------------------------------------
    // The signals we can compute HONESTLY today. Gym, program and strength
    // band aren't modelled yet, so they're simply absent — the ranker treats
    // an absent signal as no boost, never as a guess.
    const [backEdges, coachLinks, iGave, iGot] = await Promise.all([
      // Who follows ME — the other half of a mutual follow ("friend").
      prisma.follow.findMany({ where: { followeeId: me.id, status: "active" }, select: { followerId: true } }),
      prisma.coachLink.findMany({
        where: { OR: [{ clientId: me.id }, { coachId: me.id }], status: "ACTIVE" },
        select: { coachId: true, clientId: true },
      }),
      // Interaction history, both directions — an edge we BUILT, not one we
      // were assigned.
      prisma.kudos.groupBy({ by: ["ownerId"], _count: { _all: true }, where: { userId: me.id, ownerId: { in: ids } } }),
      prisma.kudos.groupBy({ by: ["userId"], _count: { _all: true }, where: { ownerId: me.id, userId: { in: ids } } }),
    ]);

    const followsMe = new Set(backEdges.map((e) => e.followerId));
    const iFollow = new Set(follows.map((f) => f.followeeId));
    const coachOf = new Set<string>();
    for (const l of coachLinks) coachOf.add(l.coachId === me.id ? l.clientId : l.coachId);

    const interactions = new Map<string, number>();
    for (const r of iGave as { ownerId: string; _count: { _all: number } }[]) interactions.set(r.ownerId, (interactions.get(r.ownerId) ?? 0) + r._count._all);
    for (const r of iGot as { userId: string; _count: { _all: number } }[]) interactions.set(r.userId, (interactions.get(r.userId) ?? 0) + r._count._all);

    const signalsFor = (authorId: string): FeedSignals => {
      if (authorId === me.id) return { relation: "self", mine: true };
      const out = iFollow.has(authorId);
      const back = followsMe.has(authorId);
      const relation: Relation = closeSet.has(authorId) ? "close" : out && back ? "friend" : out ? "following" : back ? "follower" : "none";
      return { relation, coach: coachOf.has(authorId), interactions: interactions.get(authorId) ?? 0 };
    };

    // The RANKED order ships as the feed; the clients' Following tab re-sorts
    // chronologically from the same payload, so the unranked exit never needs
    // a second round trip.
    const ranked = rankFeed(enriched, (i) => signalsFor(i.author.id), { limit: 50 });

    // NOW TRAINING — presence, from the SAME subjects, so the strip costs no
    // extra query. Only people I follow are in `subjects` and the block list is
    // already applied above, so "who is at the gym right now" never reaches
    // anyone the athlete hasn't approved.
    const live = buildLiveNow(subjects, { viewerId: me.id });

    return NextResponse.json({ feed: ranked, live });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ feed: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
