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
  const q = new URL(request.url).searchParams;
  const tab: PeopleTab = q.get("tab") === "following" ? "following" : "followers";
  // The cursor is the last Follow row's id. Opaque to the client, and bounded +
  // pattern-checked here because it arrives from a URL.
  const rawCursor = q.get("cursor");
  const cursor = rawCursor && /^[A-Za-z0-9_-]{1,64}$/.test(rawCursor) ? rawCursor : null;

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!p.canViewResults) return NextResponse.json({ error: "private" }, { status: 403 });

    // KEYSET paging on the edge itself. `createdAt` alone is not a total order
    // (a bulk follow-back writes several rows in the same millisecond), so the
    // id is the tiebreak — and it is also what the cursor names, which is why
    // a new follower arriving at the top cannot shift the page you are reading.
    const edges = await prisma.follow.findMany({
      where: tab === "followers"
        ? { followeeId: p.userId, status: "active" }
        : { followerId: p.userId, status: "active" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One more than the page, so "is there more" costs no second query.
      take: PEOPLE_PAGE_MAX + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, followerId: true, followeeId: true },
    });

    const hasMore = edges.length > PEOPLE_PAGE_MAX;
    const pageEdges = edges.slice(0, PEOPLE_PAGE_MAX);
    const blocked = await blockedIdsFor(me.id);
    // Blocks are filtered AFTER the page is cut, so a blocked row shortens the
    // page rather than pulling an extra stranger into it — and the cursor still
    // names a real edge, which is what keeps the next page contiguous.
    const shown = pageEdges
      .map((e) => (tab === "followers" ? e.followerId : e.followeeId))
      .filter((id) => !blocked.has(id));
    const lastEdge = pageEdges[pageEdges.length - 1];
    const cards = await authorCards(shown);

    const body: UserPagePeopleResponse = {
      tab,
      // Only a REAL profile handle travels: a profile-less user has no page to
      // open, so they are not a row here.
      people: shown
        .map((id) => cards.get(id))
        .filter((c): c is NonNullable<ReturnType<typeof cards.get>> => !!c?.hasProfile)
        .map((c) => ({ userId: c.id, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl })),
      nextCursor: hasMore && lastEdge ? lastEdge.id : null,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ tab, people: [], nextCursor: null, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
