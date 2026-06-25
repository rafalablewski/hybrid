import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards } from "@/lib/social";

// Reviews for a coach. POST creates/updates my one review — gated on having (or
// having had) an active CoachLink with them, so only real clients can review.

async function coachIdForHandle(handle: string) {
  const social = await prisma.socialProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { userId: true } });
  return social?.userId ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;
  try {
    const coachId = await coachIdForHandle(handle);
    if (!coachId) return NextResponse.json({ reviews: [], rating: null });
    const rows = await prisma.coachReview.findMany({ where: { coachId }, orderBy: { createdAt: "desc" }, take: 50 });
    const cards = await authorCards(rows.map((r) => r.authorId));
    const reviews = rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, at: r.createdAt.getTime(), author: cards.get(r.authorId), mine: r.authorId === me.id }));
    const rating = rows.length ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : null;
    return NextResponse.json({ reviews, rating });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ reviews: [], rating: null, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "coach-review", limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const { handle } = await params;

  const { data: b, error } = await readJsonLimited<{ rating?: unknown; body?: unknown }>(request);
  if (error) return error;
  const rating = typeof b.rating === "number" ? Math.round(b.rating) : NaN;
  if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 600) || null : null;

  try {
    const coachId = await coachIdForHandle(handle);
    if (!coachId) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (coachId === me.id) return NextResponse.json({ error: "You can't review yourself." }, { status: 400 });

    // must have a real coaching relationship (any status that ever existed)
    const link = await prisma.coachLink.findUnique({ where: { coachId_clientId: { coachId, clientId: me.id } } });
    if (!link || link.status === "PENDING")
      return NextResponse.json({ error: "Only the coach's clients can leave a review." }, { status: 403 });

    const review = await prisma.coachReview.upsert({
      where: { coachId_authorId: { coachId, authorId: me.id } },
      update: { rating, body },
      create: { coachId, authorId: me.id, rating, body },
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
