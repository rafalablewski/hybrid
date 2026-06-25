import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// The signed-in COACH's own marketplace storefront (headline/bio/specialties/
// sports/accepting). GET returns it (plus whether a @handle is claimed, which
// is required to appear in the directory); PUT upserts it.

const arr = (v: unknown, cap = 12) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => (x as string).trim().slice(0, 40)).filter(Boolean).slice(0, cap) : [];

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [profile, social] = await Promise.all([
      prisma.coachProfile.findUnique({ where: { userId: me.id } }),
      prisma.socialProfile.findUnique({ where: { userId: me.id }, select: { handle: true } }),
    ]);
    return NextResponse.json({ profile, handle: social?.handle ?? null, isCoach: me.role === "COACH" || me.role === "ADMIN" });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ profile: null, handle: null, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "COACH" && me.role !== "ADMIN")
    return NextResponse.json({ error: "coach only" }, { status: 403 });

  const { data: b, error } = await readJsonLimited<{
    headline?: unknown; bio?: unknown; specialties?: unknown; sports?: unknown;
    acceptingClients?: unknown; autoAccept?: unknown; priceNote?: unknown; visibility?: unknown;
  }>(request, 32 * 1024);
  if (error) return error;

  const data = {
    headline: typeof b.headline === "string" ? b.headline.trim().slice(0, 100) || null : null,
    bio: typeof b.bio === "string" ? b.bio.trim().slice(0, 600) || null : null,
    specialties: arr(b.specialties),
    sports: arr(b.sports),
    acceptingClients: b.acceptingClients !== false,
    autoAccept: b.autoAccept === true,
    priceNote: typeof b.priceNote === "string" ? b.priceNote.trim().slice(0, 120) || null : null,
    visibility: b.visibility === "unlisted" ? "unlisted" : "public",
  };

  try {
    const profile = await prisma.coachProfile.upsert({
      where: { userId: me.id },
      update: data,
      create: { userId: me.id, ...data },
    });
    return NextResponse.json({ profile });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "The marketplace isn't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
