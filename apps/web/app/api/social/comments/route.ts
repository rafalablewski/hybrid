import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { canonicalSubjectType, subjectTypeAliases, tableMissing, authorCards, blockedIdsFor } from "@/lib/social";

// Comments on a feed subject (same (subjectType, subjectId) anchoring as kudos).

const TYPES = new Set(["session", "pr", "recap", "badge", "post"]);

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const subjectType = url.searchParams.get("subjectType") || "";
  const subjectId = url.searchParams.get("subjectId") || "";
  if (!TYPES.has(subjectType) || !subjectId) return NextResponse.json({ comments: [] });

  try {
    const rows = await prisma.comment.findMany({
      // `pr` folds onto `session` (lib/social.ts): the workout and the records
      // it set are one post, so the thread under it is one thread.
      where: { subjectType: { in: subjectTypeAliases(subjectType) }, subjectId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    // Mutual-invisibility: hide comments from anyone I've blocked or who has
    // blocked me (matches the feed/leaderboard block gate).
    const blocked = await blockedIdsFor(me.id);
    const visible = rows.filter((r) => !blocked.has(r.userId));
    const cards = await authorCards(visible.map((r) => r.userId));
    const comments = visible.map((r) => ({
      id: r.id,
      body: r.body,
      at: r.createdAt.getTime(),
      author: cards.get(r.userId) ?? { id: r.userId, handle: r.userId.slice(0, 8), displayName: null, avatarUrl: null },
      mine: r.userId === me.id,
    }));
    return NextResponse.json({ comments });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ comments: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "social-comment", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ subjectType?: unknown; subjectId?: unknown; ownerId?: unknown; body?: unknown }>(request);
  if (error) return error;
  const subjectType = typeof b.subjectType === "string" && TYPES.has(b.subjectType) ? canonicalSubjectType(b.subjectType) : "";
  const subjectId = typeof b.subjectId === "string" ? b.subjectId : "";
  const ownerId = typeof b.ownerId === "string" ? b.ownerId : "";
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 500) : "";
  if (!subjectType || !subjectId || !ownerId || !body)
    return NextResponse.json({ error: "subjectType, subjectId, ownerId, body required" }, { status: 400 });

  try {
    const comment = await prisma.comment.create({ data: { userId: me.id, ownerId, subjectType, subjectId, body } });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
