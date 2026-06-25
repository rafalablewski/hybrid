import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

const TARGET_TYPES = ["talentProfile", "socialProfile", "comment"];
const REASONS = ["inappropriate", "fake", "spam", "other"];

// File a content report (flagged content) — any signed-in user. Feeds the admin
// moderation queue. Rate-limited so it can't be used to spam the queue.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, { key: "report-post", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ targetType?: unknown; targetId?: unknown; reason?: unknown; detail?: unknown }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (typeof b.targetType !== "string" || !TARGET_TYPES.includes(b.targetType))
    return NextResponse.json({ error: "invalid targetType" }, { status: 400 });
  if (typeof b.targetId !== "string" || !b.targetId.trim())
    return NextResponse.json({ error: "targetId required" }, { status: 400 });
  const targetId = b.targetId.trim();
  const reason = typeof b.reason === "string" && REASONS.includes(b.reason) ? b.reason : "other";
  const detail = typeof b.detail === "string" ? b.detail.trim().slice(0, 1000) : null;

  // Reject reports against a non-existent target so the queue can't be spammed
  // with orphaned rows.
  if (b.targetType === "talentProfile") {
    const exists = await prisma.talentProfile.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "target not found" }, { status: 404 });
  } else if (b.targetType === "socialProfile") {
    const exists = await prisma.socialProfile.findUnique({ where: { userId: targetId }, select: { userId: true } }).catch(() => null);
    if (!exists) return NextResponse.json({ error: "target not found" }, { status: 404 });
  } else if (b.targetType === "comment") {
    const exists = await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true } }).catch(() => null);
    if (!exists) return NextResponse.json({ error: "target not found" }, { status: 404 });
  }

  // Collapse duplicate open reports from the same user on the same target.
  const existing = await prisma.report.findFirst({
    where: { reporterId: user.id, targetType: b.targetType, targetId, status: "open" },
  });
  if (existing) return NextResponse.json({ report: existing, deduped: true });

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      reporterEmail: user.email,
      targetType: b.targetType,
      targetId,
      reason,
      detail,
    },
  });

  return NextResponse.json({ report }, { status: 201 });
}
