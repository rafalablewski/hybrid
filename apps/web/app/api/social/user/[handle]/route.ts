import { NextResponse } from "next/server";
import { buildSocialFeed, type FeedSubjectInput, type Relation, type UserPageResponse } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import {
  authorCards,
  blockedIdsFor,
  enrichReactions,
  recentPostsByUsers,
  recentSessionsByUsers,
  tableMissing,
} from "@/lib/social";
import { loadPublicProfile } from "@/lib/profile-read";
import { loadCoachStorefront } from "@/lib/coach-storefront";

/**
 * THE INDIVIDUAL USER PAGE, in one read.
 *
 * A person used to need two endpoints and produce two different surfaces — the
 * profile card and, if they coached, a separate storefront. This returns the
 * WHOLE person: the card and the privacy-gated results (lib/profile-read.ts),
 * their social counts, their coaching if they coach (lib/coach-storefront.ts,
 * the same read the marketplace uses), and their recent posts.
 *
 * PRIVACY. Everything derived from training sits behind the one `canViewResults`
 * gate the card already enforced — stats, level, and now the timeline, which is
 * simply not queried when the gate is shut rather than being fetched and
 * filtered. The coaching block is deliberately OUTSIDE that gate: a published
 * storefront is public by definition (it is listed in the marketplace), and a
 * coach with a followers-only training log still has to be hireable.
 */

/** How far back a person's own timeline reaches. Longer than the feed's 14-day
 *  window — a page is somewhere you go on purpose, so it should still have
 *  something on it for someone who trains twice a month. */
const WINDOW_DAYS = 90;
const LIMIT = 20;

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [followers, following, store, activity] = await Promise.all([
      prisma.follow.count({ where: { followeeId: p.userId, status: "active" } }),
      prisma.follow.count({ where: { followerId: p.userId, status: "active" } }),
      p.profile.isCoach ? loadCoachStorefront(me.id, p.userId) : Promise.resolve(null),
      p.canViewResults ? timelineFor(me.id, p.userId, p.relation) : Promise.resolve([]),
    ]);

    const body: UserPageResponse = {
      profile: p.profile,
      relation: p.relation,
      followState: p.followState,
      canViewResults: p.canViewResults,
      stats: p.stats,
      fitnessLevel: p.fitnessLevel,
      counts: { followers, following },
      coach: store?.coach ?? null,
      activity,
      // A list that stops without saying it stopped reads as "this is
      // everything they have done".
      activityTruncated: activity.length >= LIMIT,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** Their posts, built by the SAME engine the feed uses over the SAME inputs —
 *  so a workout reads identically on a person's page and in the stream — then
 *  left in chronological order, because a timeline is not a ranked feed. */
async function timelineFor(viewerId: string, authorId: string, relation: Relation) {
  // A block in either direction has already excluded this profile entirely, but
  // the check is cheap and keeps this function safe to call on its own.
  const blocked = await blockedIdsFor(viewerId);
  if (blocked.has(authorId)) return [];

  const sinceMs = Date.now() - WINDOW_DAYS * 86_400_000;
  const [sessionsByUser, postsByUser, cards] = await Promise.all([
    recentSessionsByUsers([authorId], sinceMs),
    recentPostsByUsers([authorId], sinceMs),
    authorCards([authorId]),
  ]);
  const c = cards.get(authorId);
  const subject: FeedSubjectInput = {
    author: {
      id: authorId,
      handle: c?.hasProfile ? c.handle : "",
      displayName: c?.displayName ?? null,
      avatarUrl: c?.avatarUrl ?? null,
    },
    sessions: sessionsByUser.get(authorId) ?? [],
    posts: postsByUser.get(authorId) ?? [],
  };
  const items = buildSocialFeed([subject], { windowDays: WINDOW_DAYS, limit: LIMIT });
  const enriched = await enrichReactions(items, viewerId);
  // `relation` rides along so a row's ⋯ menu knows whether to offer Follow or
  // Unfollow without a second round trip — the same field the feed attaches.
  // Every row here has the same author, so it is the page's own relation.
  return enriched.map((i) => ({ ...i, relation }));
}
