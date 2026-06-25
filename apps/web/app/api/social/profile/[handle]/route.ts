import { NextResponse } from "next/server";
import { relationTo, canViewResults, profileStats, type Visibility } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, edgesFor, allSessionsFor, blockedIdsFor } from "@/lib/social";

// A user's PUBLIC profile by @handle. The card (handle/name/bio) is always
// returned; RESULTS (stats) are gated by the privacy visibility × relation.
// Also reports the viewer's relation so the UI can render the follow button.

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const profile = await prisma.socialProfile.findUnique({
      where: { handle: handle.toLowerCase() },
      include: { user: { select: { id: true, name: true, coachVerified: true, role: true } } },
    });
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    // A block relationship hides the profile entirely (either direction).
    const blocked = await blockedIdsFor(me.id);
    if (blocked.has(profile.userId)) return NextResponse.json({ error: "not found" }, { status: 404 });

    const edges = await edgesFor(me.id);
    const relation = relationTo(me.id, profile.userId, edges);
    const canView = canViewResults(profile.visibility as Visibility, relation);

    // pending request state (I asked to follow a private account)
    const myEdge = edges.find((e) => e.followerId === me.id && e.followeeId === profile.userId);
    const isCoach = profile.user.role === "COACH";

    const stats = canView ? profileStats(await allSessionsFor(profile.userId)) : null;

    return NextResponse.json({
      profile: {
        userId: profile.userId,
        handle: profile.handle,
        displayName: profile.displayName ?? profile.user.name,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        visibility: profile.visibility,
        showcase: profile.showcase,
        coachVerified: profile.user.coachVerified,
        isCoach,
      },
      relation,
      followState: myEdge ? (myEdge.status === "pending" ? "requested" : myEdge.closeFriend ? "close" : "following") : "none",
      canViewResults: canView,
      stats,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
