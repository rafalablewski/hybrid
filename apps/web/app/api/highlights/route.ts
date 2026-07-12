import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Hidden highlights — the set of earned PRs/badges the owner keeps OFF their
// public Overview grid (Profile → Private). GET returns the hidden keys; POST
// toggles one ({ key, hidden }). Owner-only (RLS in reference/sql-private-tab.sql).
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.hiddenHighlight.findMany({ where: { userId: me.id }, select: { key: true } });
  return NextResponse.json({ hidden: rows.map((r) => r.key) });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof b.key === "string" ? b.key.trim().slice(0, 120) : "";
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  if (b.hidden === true) {
    // Idempotent hide — the @@unique([userId, key]) makes a re-hide a no-op.
    await prisma.hiddenHighlight.upsert({
      where: { userId_key: { userId: me.id, key } },
      create: { userId: me.id, key },
      update: {},
    });
  } else {
    await prisma.hiddenHighlight.deleteMany({ where: { userId: me.id, key } });
  }
  const rows = await prisma.hiddenHighlight.findMany({ where: { userId: me.id }, select: { key: true } });
  return NextResponse.json({ hidden: rows.map((r) => r.key) });
}
