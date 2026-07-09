import { NextResponse } from "next/server";
import { migrateBlocks } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Admin view of anonymous (guest, pre-account) workouts — real product usage
// from people who haven't signed up. Admin-only; the inspection is audited.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let sessions: unknown[] = [];
  let unavailable = false;
  try {
    const rows = await prisma.anonSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    sessions = rows.map((s) => ({ ...s, blocks: migrateBlocks(s.blocks) }));
  } catch (err) {
    // The AnonSession table isn't migrated yet (or the DB read failed). Flag it
    // so the admin screen can say "not enabled — run the SQL" instead of showing
    // a misleading empty list that reads as "guest workouts are broken".
    unavailable = true;
    console.error("[admin/anon-sessions] table missing / read failed:", err);
  }

  await audit({ actor: gate.admin, action: "anonSessions.view", targetType: "anonSession", req: request });
  return NextResponse.json({ sessions, unavailable });
}

// Permanently delete an anonymous workout (cleanup of spam/test rows).
export async function DELETE(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await prisma.anonSession.delete({ where: { id } }).catch(() => {});
  await audit({ actor: gate.admin, action: "anonSession.delete", targetType: "anonSession", targetId: id, req: request });
  return NextResponse.json({ ok: true });
}
