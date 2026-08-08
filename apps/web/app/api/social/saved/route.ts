import { NextResponse } from "next/server";
import {
  FEED_SAVED_PAGE,
  buildSocialFeed,
  canViewResults,
  feedSubjectKey,
  parseFeedSubjectKey,
  relationTo,
  type FeedSubjectInput,
  type Visibility,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, allSessionsFor, authorCards, blockedIdsFor, edgesFor } from "@/lib/social";

/**
 * RESOLVE SAVED POSTS — the Saved screen's only read.
 *
 * Saving is per-device: the client stores the (subjectType, subjectId) KEYS and
 * nothing else, so this endpoint's job is to turn a list of keys back into
 * cards. It is a lookup, not a mutation, but it POSTs because the key list is
 * the request body — up to 40 of them, which is not a query string.
 *
 * WHY IT DOESN'T JUST FILTER THE FEED. /api/social/feed is a 14-day window over
 * people you currently follow. A post saved in March is in neither set, so a
 * Saved screen built by filtering the feed would quietly show you a subset of
 * what you saved — which is the exact failure a shelf exists to prevent. This
 * resolves each key against the row itself.
 *
 * PRIVACY IS RE-CHECKED AT READ TIME, never inherited from whenever the save
 * happened. Between then and now the author may have gone private, blocked you,
 * or you may have unfollowed — each of those hides the card again. A key that
 * can't be returned says why: `gone` (the row is deleted; the client prunes it)
 * or `hidden` (it exists, you may not see it — kept, because that reverses).
 *
 * A PR card's `subjectId` is the SESSION it was set in, and PR detection needs
 * everything the athlete did BEFORE that session — so this rebuilds each
 * author's cards through `buildSocialFeed` over their history rather than
 * hand-assembling a card here. Same builder as the feed, so a saved card cannot
 * render differently from the card that was saved.
 */

/** Wide enough that `buildSocialFeed`'s recency window never drops a saved
 *  card. The window is the feed's editorial rule, not a data rule. */
const WINDOW_DAYS = 3650;

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const rawKeys = (body as { keys?: unknown })?.keys;
  if (!Array.isArray(rawKeys)) return NextResponse.json({ error: "keys required" }, { status: 400 });

  // The trust boundary: these came out of device storage. Anything that isn't a
  // well-formed key for a real feed subject is dropped here, before it reaches
  // a query. Duplicates collapse; the page cap bounds the work.
  const wanted = new Map<string, { subjectType: string; subjectId: string }>();
  for (const raw of rawKeys) {
    const ref = parseFeedSubjectKey(raw);
    if (!ref) continue;
    wanted.set(feedSubjectKey(ref), ref);
    if (wanted.size >= FEED_SAVED_PAGE) break;
  }
  if (wanted.size === 0) return NextResponse.json({ items: [], gone: [], hidden: [] });

  try {
    const refs = [...wanted.values()];
    // A "pr" card is anchored to its session, so both types resolve through
    // the Session table.
    const sessionIds = [...new Set(refs.filter((r) => r.subjectType !== "post").map((r) => r.subjectId))];
    const postIds = [...new Set(refs.filter((r) => r.subjectType === "post").map((r) => r.subjectId))];

    const [sessionRows, postRows] = await Promise.all([
      sessionIds.length
        ? prisma.session.findMany({ where: { id: { in: sessionIds }, archivedAt: null }, select: { id: true, userId: true } })
        : Promise.resolve([]),
      postIds.length
        ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, authorId: true } }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const ownerOfSession = new Map(sessionRows.map((r) => [r.id, r.userId]));
    const ownerOfPost = new Map(postRows.map((r) => [r.id, r.authorId]));
    const ownerOf = (r: { subjectType: string; subjectId: string }) =>
      r.subjectType === "post" ? ownerOfPost.get(r.subjectId) : ownerOfSession.get(r.subjectId);

    // A row we can't find at all is GONE — deleted, or archived. The client
    // drops these, which is the only way the list ever shrinks by itself.
    const gone = refs.filter((r) => !ownerOf(r)).map(feedSubjectKey);

    // ---- who may I still see? Re-derived now, not trusted from save time ----
    const authorIds = [...new Set(refs.map(ownerOf).filter((id): id is string => !!id))];
    const [blocked, edges, profiles, cards] = await Promise.all([
      blockedIdsFor(me.id),
      edgesFor(me.id),
      prisma.socialProfile.findMany({ where: { userId: { in: authorIds } }, select: { userId: true, visibility: true } }),
      authorCards(authorIds),
    ]);
    const visibilityOf = new Map(profiles.map((p) => [p.userId, p.visibility as Visibility]));
    const visible = new Set(
      authorIds.filter((id) => {
        if (id === me.id) return true;
        if (blocked.has(id)) return false;
        // No profile row yet = the app's default, followers-only — never a
        // permissive fallback.
        return canViewResults(visibilityOf.get(id) ?? "followers", relationTo(me.id, id, edges));
      }),
    );

    const hidden = refs
      .filter((r) => { const o = ownerOf(r); return !!o && !visible.has(o); })
      .map(feedSubjectKey);

    const showableAuthors = authorIds.filter((id) => visible.has(id));
    if (!showableAuthors.length) return NextResponse.json({ items: [], gone, hidden });

    // Rebuild each visible author's cards from their own history — PR detection
    // compares a session against everything before it — then keep only the ones
    // that were actually saved.
    const histories = await Promise.all(showableAuthors.map((id) => allSessionsFor(id)));
    const savedPostIds = new Set(refs.filter((r) => r.subjectType === "post").map((r) => r.subjectId));
    const posts = savedPostIds.size
      ? await prisma.post
          .findMany({ where: { id: { in: [...savedPostIds] }, authorId: { in: showableAuthors } } })
          .catch(() => [])
      : [];

    const subjects: FeedSubjectInput[] = showableAuthors.map((id, i) => {
      const c = cards.get(id);
      return {
        author: {
          id,
          // Only a REAL profile handle is shown, same rule as the feed.
          handle: c?.hasProfile ? c.handle : "",
          displayName: c?.displayName ?? null,
          avatarUrl: c?.avatarUrl ?? null,
        },
        sessions: histories[i] ?? [],
        posts: posts
          .filter((p) => p.authorId === id)
          .map((p) => ({
            id: p.id,
            kind: (p.kind as "status" | "pr" | "workout") ?? "status",
            text: p.text,
            data: (p.data ?? {}) as Record<string, unknown>,
            at: p.createdAt.getTime(),
          })),
      };
    });

    const built = buildSocialFeed(subjects, { windowDays: WINDOW_DAYS, limit: 4000 });
    const items = built.filter((i) => wanted.has(feedSubjectKey(i)));

    // Same enrichment the feed does, so a saved card carries live counts rather
    // than whatever they were when it was saved.
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
    const cheered = new Set((myKudos as { subjectType: string; subjectId: string }[]).map((k) => `${k.subjectType}:${k.subjectId}`));

    // A saved key whose author IS visible but whose card the builder didn't
    // produce is gone too — the session was archived, or the post row vanished
    // between the two reads.
    const produced = new Set(items.map(feedSubjectKey));
    const alsoGone = refs
      .filter((r) => { const o = ownerOf(r); return !!o && visible.has(o) && !produced.has(feedSubjectKey(r)); })
      .map(feedSubjectKey);

    return NextResponse.json({
      items: items.map((i) => {
        const key = feedSubjectKey(i);
        return {
          ...i,
          kudos: kCount.get(key) ?? 0,
          comments: cCount.get(key) ?? 0,
          kudosedByMe: cheered.has(key),
          mine: i.author.id === me.id,
          // Same as the feed: the ⋯ menu needs it, and `edges` is already
          // loaded here for the visibility check above.
          relation: relationTo(me.id, i.author.id, edges),
        };
      }),
      gone: [...gone, ...alsoGone],
      hidden,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ items: [], gone: [], hidden: [], unavailable: true }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
