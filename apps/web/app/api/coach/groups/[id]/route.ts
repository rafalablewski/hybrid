import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Manage one client group: rename, set its members, or delete it. Owner-gated
// (coachId === me). Members are filtered to the coach's ACTIVE clients, so a
// group can never grant access to someone who isn't a consented client.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

async function ownGroup(meId: string, id: string) {
  const g = await prisma.coachGroup.findUnique({ where: { id } });
  return g && g.coachId === meId ? g : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: b, error } = await readJsonLimited<{ name?: unknown; clientIds?: unknown }>(request, 16 * 1024);
  if (error) return error;
  try {
    const group = await ownGroup(me.id, id);
    if (!group) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data: { name?: string; clientIds?: string[] } = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 60);
    if (Array.isArray(b.clientIds)) {
      const wanted = b.clientIds.filter((x): x is string => typeof x === "string");
      // Keep only ids that are this coach's ACTIVE clients — membership is not a grant.
      const active = await prisma.coachLink.findMany({
        where: { coachId: me.id, status: "ACTIVE", clientId: { in: wanted } },
        select: { clientId: true },
      });
      data.clientIds = active.map((l) => l.clientId);
    }
    const updated = await prisma.coachGroup.update({ where: { id }, data });
    return NextResponse.json({ group: updated });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not enabled yet" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const group = await ownGroup(me.id, id);
    if (!group) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.coachGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not enabled yet" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
