import { NextResponse } from "next/server";
import {
  buildSocialFeed,
  canViewResults,
  feedSubjectKey,
  migrateBlocks,
  parseFeedSubjectKey,
  relationTo,
  sanitizeDeviceWorkout,
  type FeedSubjectInput,
  type LoggedSession,
  type Visibility,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { reactionKeys, tableMissing, allSessionsFor, authorCards, blockedIdsFor, edgesFor } from "@/lib/social";

/**
 * ONE POST — everything the individual post screen renders, in one read.
 *
 * The feed is a stream; a post is a PLACE. It has an address on both clients
 * (`/app?s=post&post=<type>:<id>` on web, `/post?type=…&id=…` on mobile), which
 * means a shared link, a bookmark and a refresh all land on the thing itself
 * rather than at the top of a ranked feed that may not even contain it. So this
 * route can't assume the caller already has the card: it returns the CARD and
 * the WORKOUT together.
 *
 *   { item }    the same FeedItemView the feed serves — author, headline, the
 *               records the session set, kudos/comment counts, my relation to
 *               the author. Rebuilt through `buildSocialFeed` over the author's
 *               own history (detecting a record needs everything they did
 *               BEFORE the session), so a post can never render differently
 *               from the row it was opened from.
 *   { session } the full ledger behind it — every exercise, every set — for a
 *               session-backed post. A status post has no workout and omits it.
 *
 * PRIVACY, evaluated server-side and re-derived now (never inherited from
 * whenever the link was made): mine → always; otherwise visibility × relation
 * (canViewResults), with a block in either direction hiding it entirely and an
 * archived session 404ing. The private post-workout reflection (note / mood /
 * tags / feel) is NOT selected by the query at all, so it cannot travel.
 */

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { type, id } = await params;
  // The trust boundary, same as the Saved resolver: an unknown subject type or
  // an over-long id is a 404, not a query. `pr` canonicalises to `session` —
  // a link sent before the records moved onto the workout still lands.
  const ref = parseFeedSubjectKey(`${type}:${id}`);
  if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const isPost = ref.subjectType === "post";
    const [sessionRow, postRow] = await Promise.all([
      isPost
        ? Promise.resolve(null)
        : prisma.session.findFirst({
            where: { id: ref.subjectId, archivedAt: null },
            select: { id: true, userId: true, title: true, startedAt: true, completedAt: true, blocks: true, device: true },
          }),
      isPost ? prisma.post.findUnique({ where: { id: ref.subjectId } }).catch(() => null) : Promise.resolve(null),
    ]);

    const authorId = sessionRow?.userId ?? postRow?.authorId ?? null;
    if (!authorId) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (authorId !== me.id) {
      const blocked = await blockedIdsFor(me.id);
      // A block reads as absence, exactly like a profile — never as a refusal.
      if (blocked.has(authorId)) return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const [edges, profile, cards] = await Promise.all([
      edgesFor(me.id),
      prisma.socialProfile.findUnique({ where: { userId: authorId }, select: { visibility: true } }),
      authorCards([authorId]),
    ]);
    const relation = relationTo(me.id, authorId, edges);
    // No profile row yet = the app's default, followers-only. An athlete who
    // hasn't chosen is never treated as public.
    const visibility = (profile?.visibility as Visibility) ?? "followers";
    if (authorId !== me.id && !canViewResults(visibility, relation))
      return NextResponse.json({ error: "private" }, { status: 403 });

    const card = cards.get(authorId);
    const subject: FeedSubjectInput = {
      author: {
        id: authorId,
        // Only a REAL profile handle is shown, same rule as the feed.
        handle: card?.hasProfile ? card.handle : "",
        displayName: card?.displayName ?? null,
        avatarUrl: card?.avatarUrl ?? null,
      },
      sessions: isPost ? [] : await allSessionsFor(authorId),
      posts: postRow
        ? [{
            id: postRow.id,
            kind: (postRow.kind as "status" | "pr" | "workout") ?? "status",
            text: postRow.text,
            data: (postRow.data ?? {}) as Record<string, unknown>,
            at: postRow.createdAt.getTime(),
          }]
        : [],
    };

    // The feed's OWN builder, over a window wide enough that an old post is
    // still built (the 14-day window is the stream's editorial rule, not a rule
    // about what exists).
    const built = buildSocialFeed([subject], { windowDays: 3650, limit: 4000 });
    const item = built.find((i) => feedSubjectKey(i) === feedSubjectKey(ref));
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Live counts, folding in the reactions given to the PR card this workout
    // used to have beside it (lib/social.ts).
    const { pairs } = reactionKeys([item]);
    const [kudos, myKudos, comments] = await Promise.all([
      prisma.kudos.count({ where: { OR: pairs } }),
      prisma.kudos.findFirst({ where: { userId: me.id, OR: pairs }, select: { id: true } }),
      prisma.comment.count({ where: { OR: pairs } }),
    ]);
    const session: LoggedSession | undefined = sessionRow
      ? {
          id: sessionRow.id,
          title: sessionRow.title,
          startedAt: sessionRow.startedAt.toISOString(),
          completedAt: sessionRow.completedAt ? sessionRow.completedAt.toISOString() : null,
          blocks: migrateBlocks(sessionRow.blocks),
          // The measurement rides along, so the post reads what the watch
          // recorded rather than what was typed (CLAUDE.md — device truth).
          device: sanitizeDeviceWorkout(sessionRow.device),
        }
      : undefined;

    return NextResponse.json({
      item: { ...item, kudos, comments, kudosedByMe: !!myKudos, mine: authorId === me.id, relation },
      ...(session ? { session } : {}),
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
