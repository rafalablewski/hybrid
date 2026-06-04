import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseAnnouncement, type AnnouncementInput } from "./shared";

// The CMS content directory: every announcement (drafts, scheduled, published,
// archived), newest first. Admin-only. The Announcement table is created by
// reference/sql-announcement.sql — if it doesn't exist yet we flag it (like the
// audit log) rather than 500.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ announcements });
  } catch {
    return NextResponse.json({ announcements: [], unavailable: true });
  }
}

// Create a new announcement (defaults to a draft). Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-announcement-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<AnnouncementInput>(request, 16 * 1024);
  if (parsed.error) return parsed.error;

  const clean = parseAnnouncement(parsed.data, true);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  const created = await prisma.announcement.create({
    data: {
      title: clean.data.title!,
      body: clean.data.body!,
      level: clean.data.level ?? "info",
      audience: clean.data.audience ?? "all",
      status: clean.data.status ?? "draft",
      pinned: clean.data.pinned ?? false,
      publishAt: clean.data.publishAt ?? null,
      expiresAt: clean.data.expiresAt ?? null,
      authorId: gate.admin.id,
      authorEmail: gate.admin.email,
    },
  });

  await audit({
    actor: gate.admin,
    action: "announcement.create",
    targetType: "announcement",
    targetId: created.id,
    summary: `Created “${created.title}” (${created.status})`,
    metadata: { status: created.status, audience: created.audience, level: created.level },
    req: request,
  });

  return NextResponse.json({ announcement: created }, { status: 201 });
}
