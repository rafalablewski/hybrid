import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, edgesFor } from "@/lib/social";
import { relationTo } from "@hybrid/core";

// Find people by @handle, display name or real name. Returns profile cards +
// the viewer's relation to each, so the discover screen can render follow CTAs.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const profiles = await prisma.socialProfile.findMany({
      where: {
        userId: { not: me.id },
        OR: [
          { handle: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: { user: { select: { name: true, coachVerified: true, role: true } } },
      take: 20,
    });
    const edges = await edgesFor(me.id);
    const results = profiles.map((p) => ({
      userId: p.userId,
      handle: p.handle,
      displayName: p.displayName ?? p.user.name,
      avatarUrl: p.avatarUrl,
      coachVerified: p.user.coachVerified,
      isCoach: p.user.role === "COACH",
      relation: relationTo(me.id, p.userId, edges),
    }));
    return NextResponse.json({ results });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ results: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
