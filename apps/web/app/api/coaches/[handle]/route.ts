import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards } from "@/lib/social";

// A coach's public storefront by @handle: their profile, published programs,
// reviews + average rating, and the viewer's own link/enrolment state.

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const social = await prisma.socialProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { userId: true, handle: true, displayName: true, avatarUrl: true } });
    if (!social) return NextResponse.json({ error: "not found" }, { status: 404 });
    const coachId = social.userId;

    const [coachProfile, user, programs, reviewRows, link, myEnrollments] = await Promise.all([
      prisma.coachProfile.findUnique({ where: { userId: coachId } }),
      prisma.user.findUnique({ where: { id: coachId }, select: { name: true, coachVerified: true } }),
      prisma.coachProgram.findMany({ where: { coachId, published: true }, orderBy: { createdAt: "desc" } }),
      prisma.coachReview.findMany({ where: { coachId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.coachLink.findUnique({ where: { coachId_clientId: { coachId, clientId: me.id } } }).catch(() => null),
      prisma.programEnrollment.findMany({ where: { coachId, clientId: me.id } }),
    ]);
    if (!coachProfile) return NextResponse.json({ error: "not a coach" }, { status: 404 });

    const cards = await authorCards(reviewRows.map((r) => r.authorId));
    const reviews = reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      at: r.createdAt.getTime(),
      author: cards.get(r.authorId) ?? { id: r.authorId, handle: "athlete", displayName: null, avatarUrl: null },
      mine: r.authorId === me.id,
    }));
    const avg = reviewRows.length ? Math.round((reviewRows.reduce((s, r) => s + r.rating, 0) / reviewRows.length) * 10) / 10 : null;
    const enrollBy = new Map(myEnrollments.map((e) => [e.programId, e.status]));

    return NextResponse.json({
      coach: {
        userId: coachId,
        handle: social.handle,
        name: social.displayName ?? user?.name,
        avatarUrl: social.avatarUrl,
        headline: coachProfile.headline,
        bio: coachProfile.bio,
        specialties: coachProfile.specialties,
        sports: coachProfile.sports,
        acceptingClients: coachProfile.acceptingClients,
        priceNote: coachProfile.priceNote,
        coachVerified: user?.coachVerified ?? false,
      },
      programs: programs.map((p) => ({
        id: p.id,
        name: p.name,
        goal: p.goal,
        summary: p.summary,
        level: p.level,
        weeks: Array.isArray(p.weeks) ? (p.weeks as unknown[]).length : 0,
        enrollmentStatus: enrollBy.get(p.id) ?? null,
      })),
      reviews,
      rating: avg,
      isMyCoach: link?.status === "ACTIVE",
      linkStatus: link?.status ?? null,
      isMe: coachId === me.id,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
