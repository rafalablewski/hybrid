import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { canonicalSubjectType, subjectTypeAliases, tableMissing } from "@/lib/social";

// Toggle a kudos (like) on a feed subject, anchored by (subjectType, subjectId).
// ownerId is the item's author (for the count + future notifications).

const TYPES = new Set(["session", "pr", "recap", "badge", "post"]);

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "social-kudos", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ subjectType?: unknown; subjectId?: unknown; ownerId?: unknown }>(request);
  if (error) return error;
  // `pr` folds onto `session`: one workout, one post, one place a kudos lands
  // (lib/social.ts). A client on an older build may still say "pr".
  const subjectType = typeof b.subjectType === "string" && TYPES.has(b.subjectType) ? canonicalSubjectType(b.subjectType) : "";
  const subjectId = typeof b.subjectId === "string" ? b.subjectId : "";
  const ownerId = typeof b.ownerId === "string" ? b.ownerId : "";
  if (!subjectType || !subjectId || !ownerId)
    return NextResponse.json({ error: "subjectType, subjectId, ownerId required" }, { status: 400 });

  try {
    const types = subjectTypeAliases(subjectType);
    // findFirst over the aliases, not findUnique on the canonical pair: a kudos
    // given to the old PR card is the same kudos, and un-cheering must find it.
    const existing = await prisma.kudos.findFirst({
      where: { userId: me.id, subjectType: { in: types }, subjectId },
    });
    if (existing) {
      await prisma.kudos.delete({ where: { id: existing.id } });
    } else {
      await prisma.kudos.create({ data: { userId: me.id, ownerId, subjectType, subjectId } });
    }
    const count = await prisma.kudos.count({ where: { subjectType: { in: types }, subjectId } });
    return NextResponse.json({ kudosedByMe: !existing, kudos: count });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
