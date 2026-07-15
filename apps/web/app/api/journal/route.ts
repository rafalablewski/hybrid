import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The athlete's private journal (Profile → Private tab). Owner-only: every query
// is scoped to me.id, and the table's RLS (reference/sql-private-tab.sql) keeps
// it private at the database too. GET lists newest-first; POST adds; DELETE removes.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entries = await prisma.journalEntry.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return NextResponse.json({ error: "empty" }, { status: 400 });
  const entry = await prisma.journalEntry.create({
    data: { userId: me.id, body: body.slice(0, 5000) },
  });
  return NextResponse.json({ entry }, { status: 201 });
}

export async function DELETE(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // deleteMany with the userId guard — a stray id from another user deletes nothing.
  await prisma.journalEntry.deleteMany({ where: { id, userId: me.id } });
  return NextResponse.json({ ok: true });
}
