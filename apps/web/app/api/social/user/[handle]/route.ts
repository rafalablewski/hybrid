import { NextResponse } from "next/server";
import { ACTIVITY_PAGE_MAX, type UserPageResponse } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";
import { loadPublicProfile } from "@/lib/profile-read";
import { loadCoachStorefront } from "@/lib/coach-storefront";
import { timelinePage } from "@/lib/user-timeline";

/**
 * THE INDIVIDUAL USER PAGE, in one read.
 *
 * A person used to need two endpoints and produce two different surfaces — the
 * profile card and, if they coached, a separate storefront. This returns the
 * WHOLE person: the card and the privacy-gated results (lib/profile-read.ts),
 * their social counts, their coaching if they coach (lib/coach-storefront.ts,
 * the same read the marketplace uses), and their recent posts.
 *
 * The timeline is PAGE ONE only — it rides here so opening a person costs one
 * request, and the "load older" door continues at
 * /api/social/user/[handle]/activity with the cursor this response carries.
 *
 * PRIVACY. Everything derived from training sits behind the one `canViewResults`
 * gate the card already enforced — stats, level, and now the timeline, which is
 * simply not queried when the gate is shut rather than being fetched and
 * filtered. The coaching block is deliberately OUTSIDE that gate: a published
 * storefront is public by definition (it is listed in the marketplace), and a
 * coach with a followers-only training log still has to be hireable.
 */

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [followers, following, store, timeline] = await Promise.all([
      prisma.follow.count({ where: { followeeId: p.userId, status: "active" } }),
      prisma.follow.count({ where: { followerId: p.userId, status: "active" } }),
      p.profile.isCoach ? loadCoachStorefront(me.id, p.userId) : Promise.resolve(null),
      p.canViewResults && p.sessions
        ? timelinePage({
            viewerId: me.id,
            authorId: p.userId,
            relation: p.relation,
            sessions: p.sessions,
            limit: ACTIVITY_PAGE_MAX,
          })
        : Promise.resolve(null),
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
      activity: timeline?.items ?? [],
      activityCursor: timeline?.nextCursor ?? null,
      activityCapped: timeline?.capped ?? false,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
