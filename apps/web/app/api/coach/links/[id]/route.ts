import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The link record (coach or client) — used to load roster tags.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (link.coachId !== me.id && link.clientId !== me.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ link: { id: link.id, status: link.status, tags: link.tags } });
}

// Accept a pending invite (client only), end a link (either party), or set the
// coach's roster tags (coach only).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; tags?: unknown };
  const action = body.action;

  if (action === "tags") {
    if (link.coachId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 12))]
      : [];
    const updated = await prisma.coachLink.update({ where: { id }, data: { tags } });
    return NextResponse.json({ link: { id: updated.id, status: updated.status, tags: updated.tags } });
  }

  if (action === "accept") {
    if (link.clientId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // Guarded transition: only PENDING→ACTIVE. If a concurrent `end` already
    // moved the row out of PENDING, this finds nothing (409) rather than
    // resurrecting a link the coach just terminated.
    const claimed = await prisma.coachLink.updateMany({
      where: { id, clientId: me.id, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    if (claimed.count === 0) return NextResponse.json({ error: "no longer pending" }, { status: 409 });
    const updated = await prisma.coachLink.findUnique({ where: { id } });
    return NextResponse.json({ link: updated });
  }

  if (action === "end") {
    if (link.coachId !== me.id && link.clientId !== me.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Terminating intent must win over a concurrent accept: end from any
    // non-ENDED state (idempotent if already ended).
    await prisma.coachLink.updateMany({
      where: { id, status: { not: "ENDED" } },
      data: { status: "ENDED" },
    });
    const updated = await prisma.coachLink.findUnique({ where: { id } });
    return NextResponse.json({ link: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
