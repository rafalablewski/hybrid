import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Coaching notes. The coach can mark a note private — those are NEVER returned
// to the client.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isCoach = link.coachId === me.id;
  const isClient = link.clientId === me.id;
  if (!isCoach && !isClient) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const notes = await prisma.coachNote.findMany({
    where: { linkId: id, ...(isClient && !isCoach ? { private: false } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only the coach writes notes, and only on an active link.
  if (link.coachId !== me.id || link.status !== "ACTIVE") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { body?: unknown; private?: unknown };
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "note body is required" }, { status: 400 });
  }

  const note = await prisma.coachNote.create({
    data: { linkId: id, body: body.body.trim(), private: body.private === true },
  });
  return NextResponse.json({ note }, { status: 201 });
}
