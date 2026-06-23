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

  const { data: b, error } = await readJsonLimited<{
    name?: unknown;
    clientIds?: unknown;
    addClientId?: unknown;
    removeClientId?: unknown;
  }>(request, 16 * 1024);
  if (error) return error;
  try {
    const group = await ownGroup(me.id, id);
    if (!group) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Membership toggles use ATOMIC single-statement array ops, not a
    // read-modify-write of the whole array. Two coaches/tabs toggling different
    // members concurrently each PATCHed a full (stale) snapshot, so intermediate
    // toggles were silently lost (last write wins). array_append/array_remove
    // mutate in place under a row lock, so concurrent toggles all stick.
    if (typeof b.addClientId === "string") {
      // Membership is not a grant — only an ACTIVE client may be added.
      const link = await prisma.coachLink.findFirst({
        where: { coachId: me.id, status: "ACTIVE", clientId: b.addClientId },
        select: { clientId: true },
      });
      if (!link) return NextResponse.json({ error: "not an active client" }, { status: 400 });
      await prisma.$executeRaw`
        UPDATE "CoachGroup"
        SET "clientIds" = array_append("clientIds", ${b.addClientId})
        WHERE "id" = ${id} AND NOT (${b.addClientId} = ANY("clientIds"))`;
    }
    if (typeof b.removeClientId === "string") {
      await prisma.$executeRaw`
        UPDATE "CoachGroup"
        SET "clientIds" = array_remove("clientIds", ${b.removeClientId})
        WHERE "id" = ${id}`;
    }

    // Name change (and the legacy whole-array set, kept for a deliberate bulk
    // edit — note it remains last-writer-wins; prefer the add/remove deltas).
    const data: { name?: string; clientIds?: string[] } = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 60);
    if (Array.isArray(b.clientIds)) {
      const wanted = b.clientIds.filter((x): x is string => typeof x === "string");
      const active = await prisma.coachLink.findMany({
        where: { coachId: me.id, status: "ACTIVE", clientId: { in: wanted } },
        select: { clientId: true },
      });
      data.clientIds = active.map((l) => l.clientId);
    }
    if (data.name !== undefined || data.clientIds !== undefined) {
      await prisma.coachGroup.update({ where: { id }, data });
    }

    const updated = await prisma.coachGroup.findUnique({ where: { id } });
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
