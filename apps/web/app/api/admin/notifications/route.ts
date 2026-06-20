import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Persistent Agent HQ notifications. Admin-only. GET lists recent (unread first);
// POST marks one ({id}) or all ({all:true}) as read. Flags if not migrated yet.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const notifications = await prisma.agentNotification.findMany({
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      take: 50,
    });
    const unread = notifications.filter((n) => !n.read).length;
    return NextResponse.json({ notifications, unread });
  } catch {
    return NextResponse.json({ notifications: [], unread: 0, unavailable: true });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-notif-post", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ id?: unknown; all?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (b.all === true) {
    const res = await prisma.agentNotification.updateMany({ where: { read: false }, data: { read: true } });
    await audit({
      actor: gate.admin,
      action: "agent.notifications.read_all",
      summary: `Marked ${res.count} notification(s) read`,
      metadata: { count: res.count },
      req: request,
    });
    return NextResponse.json({ ok: true, count: res.count });
  }
  if (typeof b.id === "string") {
    // Don't swallow — a missing/foreign id is a real 404, not a silent ok.
    const existing = await prisma.agentNotification.findUnique({ where: { id: b.id } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.agentNotification.update({ where: { id: b.id }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "id or all required" }, { status: 400 });
}
