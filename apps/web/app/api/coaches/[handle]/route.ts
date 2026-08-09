import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";
import { coachDisplay, loadCoachStorefront } from "@/lib/coach-storefront";

// A coach's public storefront by @handle: their profile, published programs,
// reviews + average rating, and the viewer's own link/enrolment state.
//
// The read itself lives in lib/coach-storefront.ts, because the PERSON's page
// (/api/social/user/[handle]) serves the same coaching block as a section of
// the human — a coach is not a second kind of profile.

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const social = await prisma.socialProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { userId: true, handle: true } });
    if (!social) return NextResponse.json({ error: "not found" }, { status: 404 });

    const store = await loadCoachStorefront(me.id, social.userId);
    if (!store) return NextResponse.json({ error: "not a coach" }, { status: 404 });
    const who = await coachDisplay(social.userId);
    const c = store.coach;

    return NextResponse.json({
      coach: {
        userId: social.userId,
        handle: social.handle,
        name: who.name,
        avatarUrl: who.avatarUrl,
        headline: c.headline,
        bio: c.bio,
        specialties: c.specialties,
        sports: c.sports,
        acceptingClients: c.acceptingClients,
        priceNote: c.priceNote,
        coachVerified: who.coachVerified,
      },
      programs: c.programs,
      reviews: c.reviews,
      rating: c.rating,
      isMyCoach: c.isMyCoach,
      linkStatus: c.linkStatus,
      isMe: store.isMe,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
