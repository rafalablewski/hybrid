import { NextResponse } from "next/server";
import { clampPage, clampPageSize } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The admin audit trail — paginated, newest first. Admin-only, read-only.
// If the AdminAudit table doesn't exist yet (SQL not run), returns an empty,
// flagged result instead of 500 so the panel still renders.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const page = clampPage(url.searchParams.get("page"));
  const pageSize = clampPageSize(url.searchParams.get("pageSize"), 50, 100);
  const action = (url.searchParams.get("action") ?? "").trim().slice(0, 120);

  try {
    const where = action ? { action: { contains: action, mode: "insensitive" as const } } : {};
    const [total, entries] = await Promise.all([
      prisma.adminAudit.count({ where }),
      prisma.adminAudit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ total, page, pageSize, pages: Math.ceil(total / pageSize), entries });
  } catch {
    return NextResponse.json({
      total: 0,
      page: 1,
      pageSize,
      pages: 0,
      entries: [],
      unavailable: true,
    });
  }
}

// Permanently clear the ENTIRE audit trail. Irreversible, so it requires an
// explicit confirm token. Admin-only. We write ONE fresh audit row recording
// the clear (with the count) BEFORE wiping is paradoxical, so we record it
// AFTER — that single surviving entry is the proof the log was cleared and by
// whom (the trail can't pre-date itself).
export async function DELETE(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "ALL") {
    return NextResponse.json({ error: "confirm=ALL required" }, { status: 400 });
  }

  try {
    const { count } = await prisma.adminAudit.deleteMany({});
    // Re-stamp the clear itself so there's always a record of who wiped the log.
    await audit({
      actor: gate.admin,
      action: "audit.clearAll",
      targetType: "audit",
      summary: `Cleared the audit log (${count} entr${count === 1 ? "y" : "ies"} removed)`,
      metadata: { cleared: count },
      req: request,
    });
    return NextResponse.json({ ok: true, deleted: count });
  } catch {
    return NextResponse.json({ error: "audit log unavailable" }, { status: 503 });
  }
}
