import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// The coach marketplace directory: public coach storefronts, verified first,
// with their @handle, published-program count and average review rating. Any
// signed-in user can browse. Filterable by free text / sport / specialty.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const sport = (url.searchParams.get("sport") || "").trim();

  try {
    // Fetch the public directory (sport tag filtered in DB), then match the free
    // text q in JS so it's CASE-INSENSITIVE + PARTIAL across headline/bio/name/
    // handle AND the specialties/sports arrays (Prisma's array `has` is exact, so
    // "olympic" used to miss "Olympic lifting"). The directory is small, so a
    // 120-row scan + filter is cheap and far better quality.
    const profiles = await prisma.coachProfile.findMany({
      where: {
        visibility: "public",
        ...(sport ? { sports: { has: sport } } : {}),
      },
      include: { user: { select: { id: true, name: true, coachVerified: true } } },
      take: 120,
    });
    const ids = profiles.map((p) => p.userId);
    const [socials, programCounts, reviews] = await Promise.all([
      prisma.socialProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, handle: true, avatarUrl: true, displayName: true } }),
      prisma.coachProgram.groupBy({ by: ["coachId"], _count: { _all: true }, where: { coachId: { in: ids }, published: true } }),
      prisma.coachReview.groupBy({ by: ["coachId"], _avg: { rating: true }, _count: { _all: true }, where: { coachId: { in: ids } } }),
    ]);
    const socialBy = new Map(socials.map((s) => [s.userId, s]));
    const progBy = new Map(programCounts.map((p) => [p.coachId, p._count._all]));
    const revBy = new Map(reviews.map((r) => [r.coachId, { avg: r._avg.rating ?? 0, count: r._count._all }]));

    // Only coaches who have claimed a @handle are addressable in the directory;
    // when q is present, keep those whose text/arrays partially match it.
    const matchesQ = (p: (typeof profiles)[number]) => {
      if (!q) return true;
      const s = socialBy.get(p.userId);
      const hay = [p.headline, p.bio, p.user.name, s?.handle, s?.displayName, ...(p.specialties ?? []), ...(p.sports ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };
    const coaches = profiles
      .filter((p) => socialBy.has(p.userId) && matchesQ(p))
      .slice(0, 60)
      .map((p) => {
        const s = socialBy.get(p.userId)!;
        const r = revBy.get(p.userId);
        return {
          userId: p.userId,
          handle: s.handle,
          name: s.displayName ?? p.user.name,
          avatarUrl: s.avatarUrl,
          headline: p.headline,
          specialties: p.specialties,
          sports: p.sports,
          acceptingClients: p.acceptingClients,
          priceNote: p.priceNote,
          coachVerified: p.user.coachVerified,
          programs: progBy.get(p.userId) ?? 0,
          rating: r ? Math.round(r.avg * 10) / 10 : null,
          reviews: r?.count ?? 0,
        };
      })
      .sort((a, b) => Number(b.coachVerified) - Number(a.coachVerified) || (b.rating ?? 0) - (a.rating ?? 0));

    return NextResponse.json({ coaches });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ coaches: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
