import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseAnnouncement, type AnnouncementInput } from "../shared";

// Edit an announcement — content, level/audience, and the publish/schedule
// lifecycle (draft → published → archived, plus pin + publish/expiry window).
// Every change is audited with before/after. Admin-only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-announcement-patch", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<AnnouncementInput>(request, 16 * 1024);
  if (parsed.error) return parsed.error;

  const clean = parseAnnouncement(parsed.data, false);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  if (Object.keys(clean.data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const before = await prisma.announcement.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Validate the publish window against the effective (post-update) values — a
  // PATCH may change only one side, so check it against what's already stored.
  const publishAt = clean.data.publishAt !== undefined ? clean.data.publishAt : before.publishAt;
  const expiresAt = clean.data.expiresAt !== undefined ? clean.data.expiresAt : before.expiresAt;
  if (publishAt && expiresAt && publishAt >= expiresAt)
    return NextResponse.json({ error: "publishAt must be before expiresAt" }, { status: 400 });

  const updated = await prisma.announcement.update({ where: { id }, data: clean.data });

  await audit({
    actor: gate.admin,
    action: "announcement.update",
    targetType: "announcement",
    targetId: id,
    summary: `Updated “${updated.title}”${
      before.status !== updated.status ? ` (${before.status} → ${updated.status})` : ""
    }`,
    metadata: {
      before: { status: before.status, pinned: before.pinned, audience: before.audience },
      after: { status: updated.status, pinned: updated.pinned, audience: updated.audience },
    },
    req: request,
  });

  return NextResponse.json({ announcement: updated });
}

// Permanently delete an announcement. Audited. (Archive is the soft path; this
// is the hard one for mistakes/spam.)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-announcement-delete", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.announcement.delete({ where: { id } });

  await audit({
    actor: gate.admin,
    action: "announcement.delete",
    targetType: "announcement",
    targetId: id,
    summary: `Deleted “${existing.title}”`,
    metadata: { status: existing.status },
    req: request,
  });

  return NextResponse.json({ ok: true });
}
