import { prisma } from "@/lib/db";
import { authorCards } from "@/lib/social";
import { sanitizeProgramWeeks } from "@/lib/coach-program";
import type { StorefrontProgram, StorefrontReview, UserPageCoach } from "@hybrid/core";

/**
 * A coach's STOREFRONT — their headline, published programs, reviews and the
 * viewer's own standing with them.
 *
 * It is read from two places now, and that is the point: the marketplace's
 * `/api/coaches/[handle]` and the person's own page
 * (`/api/social/user/[handle]`), which shows coaching as a SECTION of the human
 * rather than as a separate storefront. One reader, so the two can never
 * describe the same coach differently — the drift that produced two half-people
 * in the first place.
 */
export interface CoachStorefront {
  /** The whole coaching block, exactly as the user page renders it. */
  coach: UserPageCoach;
  isMe: boolean;
}

/** Null when this user has no CoachProfile — they're simply not a coach. */
export async function loadCoachStorefront(viewerId: string, coachId: string): Promise<CoachStorefront | null> {
  const [coachProfile, programRows, reviewRows, link, myEnrollments] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId: coachId } }),
    prisma.coachProgram.findMany({ where: { coachId, published: true }, orderBy: { createdAt: "desc" } }),
    prisma.coachReview.findMany({ where: { coachId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.coachLink.findUnique({ where: { coachId_clientId: { coachId, clientId: viewerId } } }).catch(() => null),
    prisma.programEnrollment.findMany({ where: { coachId, clientId: viewerId } }),
  ]);
  if (!coachProfile) return null;

  const cards = await authorCards(reviewRows.map((r) => r.authorId));
  const reviews: StorefrontReview[] = reviewRows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    at: r.createdAt.getTime(),
    author: cards.get(r.authorId) ?? { id: r.authorId, handle: "athlete", displayName: null, avatarUrl: null },
    mine: r.authorId === viewerId,
  }));
  const rating = reviewRows.length
    ? Math.round((reviewRows.reduce((s, r) => s + r.rating, 0) / reviewRows.length) * 10) / 10
    : null;
  const enrollBy = new Map(myEnrollments.map((e) => [e.programId, e.status]));

  const programs: StorefrontProgram[] = programRows.map((p) => {
    // A compact preview of the structure so a client can see what they're
    // starting BEFORE they enrol — capped to bound the payload.
    const weeks = sanitizeProgramWeeks(p.weeks);
    return {
      id: p.id,
      name: p.name,
      goal: p.goal,
      summary: p.summary,
      level: p.level,
      weeks: weeks.length,
      preview: weeks.slice(0, 8).map((w) => ({
        days: w.days.slice(0, 7).map((d) => ({
          day: d.day,
          items: d.items.slice(0, 10).map((it) => ({ name: it.name, sr: it.sr, rpe: it.rpe })),
        })),
      })),
      enrollmentStatus: enrollBy.get(p.id) ?? null,
    };
  });

  return {
    coach: {
      headline: coachProfile.headline,
      bio: coachProfile.bio,
      specialties: coachProfile.specialties,
      sports: coachProfile.sports,
      acceptingClients: coachProfile.acceptingClients,
      priceNote: coachProfile.priceNote,
      rating,
      programs,
      reviews,
      isMyCoach: link?.status === "ACTIVE",
      linkStatus: link?.status ?? null,
    },
    isMe: coachId === viewerId,
  };
}

/** The coach's `name`/`avatarUrl` come from their SOCIAL profile (the one
 *  identity in the product), so the storefront never grows a second name. */
export async function coachDisplay(coachId: string): Promise<{ name: string | null; avatarUrl: string | null; coachVerified: boolean }> {
  const [social, user] = await Promise.all([
    prisma.socialProfile.findUnique({ where: { userId: coachId }, select: { displayName: true, avatarUrl: true } }),
    prisma.user.findUnique({ where: { id: coachId }, select: { name: true, coachVerified: true } }),
  ]);
  return { name: social?.displayName ?? user?.name ?? null, avatarUrl: social?.avatarUrl ?? null, coachVerified: user?.coachVerified ?? false };
}
