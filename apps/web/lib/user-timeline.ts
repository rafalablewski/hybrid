import {
  ACTIVITY_PAGE_MAX,
  ACTIVITY_SESSION_CAP,
  buildSocialFeed,
  pageFeedItems,
  type FeedItemView,
  type FeedSubjectInput,
  type LoggedSession,
  type Relation,
} from "@hybrid/core";
import { prisma } from "@/lib/db";
import { authorCards, enrichReactions, type AuthorCard } from "@/lib/social";
import type { FeedPostInput } from "@hybrid/core";

/**
 * ONE PERSON'S TIMELINE, and how it pages.
 *
 * The obvious way to page a timeline is to fetch an older WINDOW per page —
 * days 90-180, then 180-270. That is wrong here, and quietly so: `buildSocialFeed`
 * decides whether a session set a record by comparing it against everything
 * earlier IN THE ARRAY IT WAS HANDED. Hand it only the older slice and the
 * oldest session in that slice has nothing before it, so it reads as a
 * first-ever PR. Page 3 of an athlete's history would sprout trophies they
 * earned years earlier.
 *
 * So the feed is built ONCE over the athlete's whole (capped) history, and a
 * page is a SLICE of the built list, taken with a keyset cursor
 * (core/feed-cursor.ts). Records stay correct because the engine always sees
 * the full run-up, and the paging stays stable because a cursor names a
 * position in time rather than an offset into a list that keeps moving.
 *
 * The cost is honest: the history load is the same one the profile stats
 * already do (`allSessionsFor`, capped at 400), so page 1 costs one query
 * FEWER than the windowed read this replaced. Later pages re-walk that history
 * — bounded work over data we must load anyway to keep the badges right.
 */

/** A window wide enough that the SESSION CAP, not the calendar, is the limit —
 *  the timeline should end where the athlete's history does. */
const WINDOW_DAYS = 365 * 20;

/** Their shared posts. Capped alongside the sessions so the two halves of the
 *  timeline reach equally far back. */
async function postsFor(authorId: string, cap = ACTIVITY_SESSION_CAP): Promise<FeedPostInput[]> {
  try {
    const rows = await prisma.post.findMany({
      where: { authorId },
      orderBy: { createdAt: "desc" },
      take: cap,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: (r.kind as FeedPostInput["kind"]) ?? "status",
      text: r.text,
      data: (r.data ?? {}) as Record<string, unknown>,
      at: r.createdAt.getTime(),
    }));
  } catch {
    /* Post table not migrated yet — the timeline is sessions-only. */
    return [];
  }
}

export interface TimelinePage {
  items: FeedItemView[];
  nextCursor: string | null;
  /** The history hit the session cap, so the end of the timeline is OUR limit
   *  rather than the athlete's first workout. The clients say which it is. */
  capped: boolean;
}

/**
 * One page of somebody's timeline.
 *
 * `sessions` is the already-loaded history from `loadPublicProfile` — pass it
 * in rather than re-reading it. Callers that don't have it (the activity
 * endpoint on page 2+) load it themselves through the same helper, so the two
 * paths build from identical input.
 */
export async function timelinePage(opts: {
  viewerId: string;
  authorId: string;
  relation: Relation;
  sessions: LoggedSession[];
  cursor?: string | null;
  limit?: number;
  /** Reuse a card the caller already resolved, to save a query. */
  card?: AuthorCard;
}): Promise<TimelinePage> {
  const { viewerId, authorId, relation, sessions, cursor } = opts;
  const limit = opts.limit ?? ACTIVITY_PAGE_MAX;

  const [posts, card] = await Promise.all([
    postsFor(authorId),
    opts.card ? Promise.resolve(opts.card) : authorCards([authorId]).then((m) => m.get(authorId)),
  ]);

  const subject: FeedSubjectInput = {
    author: {
      id: authorId,
      // Only a REAL profile handle is shown; a profile-less user gets an empty
      // handle so the card renders just their name.
      handle: card?.hasProfile ? card.handle : "",
      displayName: card?.displayName ?? null,
      avatarUrl: card?.avatarUrl ?? null,
    },
    sessions,
    posts,
  };

  // Built over EVERYTHING, so record detection sees the full run-up…
  const all = buildSocialFeed([subject], {
    windowDays: WINDOW_DAYS,
    limit: ACTIVITY_SESSION_CAP + posts.length,
  });
  // …then sliced. A FeedItem already carries the `(id, at)` pair the cursor is
  // expressed in, so it is cursorable as-is.
  const page = pageFeedItems(all, cursor, limit);

  // Reactions are fetched for the PAGE only — a page of 15 rows should not pay
  // for the counts of a timeline nobody scrolled to.
  const enriched = await enrichReactions(page.items, viewerId);
  return {
    items: enriched.map((i) => ({ ...i, relation })) as FeedItemView[],
    nextCursor: page.nextCursor,
    capped: sessions.length >= ACTIVITY_SESSION_CAP,
  };
}
