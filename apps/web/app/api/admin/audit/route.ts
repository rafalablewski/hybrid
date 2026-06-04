import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// The admin audit trail — paginated, newest first. Admin-only, read-only.
// If the AdminAudit table doesn't exist yet (SQL not run), returns an empty,
// flagged result instead of 500 so the panel still renders.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "50") || 50));
  const action = (url.searchParams.get("action") ?? "").trim();

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
