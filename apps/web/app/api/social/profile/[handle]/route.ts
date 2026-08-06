import { NextResponse } from "next/server";
import { relationTo, canViewResults, profileStats, estimateFitnessLevel, badgeFor, type Visibility } from "@hybrid/core";
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

    // The sessions are fetched once and read twice — the public stats, and the
    // earned level badge. Both sit behind the SAME `canView` gate, so a private
    // account's level never leaves the server rather than being filtered by a
    // client that could simply choose not to filter it.
    const sessions = canView ? await allSessionsFor(profile.userId) : null;
    const stats = sessions ? profileStats(sessions) : null;

    // Body mass makes the strength half readable; without it the estimate still
    // scores every endurance discipline, so a runner or swimmer keeps a badge.
    const bw = sessions
      ? (await prisma.bodyMetric.findFirst({
          where: { userId: profile.userId, weightKg: { not: null } },
          orderBy: { measuredAt: "desc" },
          select: { weightKg: true },
        }))?.weightKg ?? null
      : null;
    // SEX, so the public badge is scored against the same bar the athlete's own
    // Performance card uses. Every threshold in the app is published for a male
    // athlete and shifted from there, and without this the server would hold a
    // woman to the men's bar while her own card holds her to the women's — the
    // two surfaces disagreeing about her level, which is precisely what one
    // shared estimate exists to prevent.
    //
    // Read from the talent profile because it is the only place sex is
    // PERSISTED; the volume profile lives in each device's own prefs and the
    // server cannot see it. The durable fix is persisting the volume profile
    // server-side — until then a woman who filled in only the volume profile
    // gets the right level on her own card and no worse than the old behaviour
    // in public.
    const talent = sessions
      ? await prisma.talentProfile.findUnique({ where: { userId: profile.userId }, select: { sex: true } })
      : null;
    // ONE WORD and its accent. The ratio never travels — PR loads are already
    // public tiles, and publishing the ratio beside them would let any viewer
    // divide and recover the athlete's body mass.
    const badge = sessions
      ? badgeFor(estimateFitnessLevel(sessions, { bodyweightKg: bw, sex: talent?.sex === "F" ? "F" : "M" }))
      : null;

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
      fitnessLevel: badge ? { level: badge.level, accent: badge.accent } : null,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
