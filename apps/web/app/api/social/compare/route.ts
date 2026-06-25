import { NextResponse } from "next/server";
import { compareAthletes, relationTo, canViewResults, type Visibility } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, edgesFor, allSessionsFor, authorCards } from "@/lib/social";

// Head-to-head comparison between me and another athlete (by @handle). Gated by
// the same privacy rule as the feed: I must be allowed to see their results.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const handle = (new URL(request.url).searchParams.get("handle") || "").toLowerCase();
  if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });

  try {
    const profile = await prisma.socialProfile.findUnique({ where: { handle }, select: { userId: true, handle: true, displayName: true, visibility: true } });
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (profile.userId === me.id) return NextResponse.json({ error: "Pick someone else to compare." }, { status: 400 });

    const edges = await edgesFor(me.id);
    const relation = relationTo(me.id, profile.userId, edges);
    if (!canViewResults(profile.visibility as Visibility, relation))
      return NextResponse.json({ error: "Their results are private. Follow them to compare." }, { status: 403 });

    const [mySessions, theirSessions, cards] = await Promise.all([
      allSessionsFor(me.id),
      allSessionsFor(profile.userId),
      authorCards([me.id]),
    ]);
    const myCard = cards.get(me.id);
    const result = compareAthletes(
      { id: me.id, handle: myCard?.handle ?? "you", displayName: "You", sessions: mySessions },
      { id: profile.userId, handle: profile.handle, displayName: profile.displayName, sessions: theirSessions },
    );
    return NextResponse.json({ compare: result });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
