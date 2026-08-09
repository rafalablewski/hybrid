import { NextResponse } from "next/server";
import { ACTIVITY_PAGE_MAX } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { tableMissing } from "@/lib/social";
import { loadPublicProfile } from "@/lib/profile-read";
import { timelinePage } from "@/lib/user-timeline";

/**
 * PAGES 2+ of somebody's timeline. Page 1 rides on the main page read, so
 * opening a person still costs ONE request; this endpoint exists for the
 * "load older" door and returns nothing but rows.
 *
 * The privacy gate is re-checked here rather than trusted from the first call,
 * because a cursor is just a string in a URL and must never be a way around it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor");

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!p.canViewResults || !p.sessions) return NextResponse.json({ error: "private" }, { status: 403 });

    const page = await timelinePage({
      viewerId: me.id,
      authorId: p.userId,
      relation: p.relation,
      sessions: p.sessions,
      cursor,
      limit: ACTIVITY_PAGE_MAX,
    });
    return NextResponse.json(page);
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ items: [], nextCursor: null, capped: false, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
