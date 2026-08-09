import { NextResponse } from "next/server";
import { PEOPLE_PAGE_MAX, type PeopleTab, type UserPagePeopleResponse } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { authorCards, blockedIdsFor, tableMissing } from "@/lib/social";
import { loadPublicProfile } from "@/lib/profile-read";

/**
 * ONE SIDE of someone's follow graph — who follows them, or who they follow.
 *
 * Its own read, not part of the page payload: the counts are cheap and always
 * shown, but the LIST is a thing you ask for, and most visits never do.
 *
 * PRIVACY — this deliberately reuses `canViewResults` rather than inventing a
 * second rule. A public account's connections are browsable; a followers-only
 * account shows them to its approved followers; a private account to nobody.
 * That is the same sentence the stats obey, so the page has ONE privacy model
 * rather than two that will eventually disagree.
 *
 * Blocks apply in both directions, so a blocked user is in nobody's list.
 */
export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;
  const tab: PeopleTab = new URL(request.url).searchParams.get("tab") === "following" ? "following" : "followers";

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!p.canViewResults) return NextResponse.json({ error: "private" }, { status: 403 });

    // One more than the cap, so "is there more" costs no second query.
    const edges = await prisma.follow.findMany({
      where: tab === "followers"
        ? { followeeId: p.userId, status: "active" }
        : { followerId: p.userId, status: "active" },
      orderBy: { createdAt: "desc" },
      take: PEOPLE_PAGE_MAX + 1,
      select: { followerId: true, followeeId: true },
    });

    const blocked = await blockedIdsFor(me.id);
    const ids = edges
      .map((e) => (tab === "followers" ? e.followerId : e.followeeId))
      .filter((id) => !blocked.has(id));
    const truncated = ids.length > PEOPLE_PAGE_MAX;
    const shown = ids.slice(0, PEOPLE_PAGE_MAX);
    const cards = await authorCards(shown);

    const body: UserPagePeopleResponse = {
      tab,
      // Only a REAL profile handle travels: a profile-less user has no page to
      // open, so they are not a row here.
      people: shown
        .map((id) => cards.get(id))
        .filter((c): c is NonNullable<ReturnType<typeof cards.get>> => !!c?.hasProfile)
        .map((c) => ({ userId: c.id, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl })),
      truncated,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ tab, people: [], truncated: false, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
