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
    if (link.clientId !== me.id || link.status !== "PENDING") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const updated = await prisma.coachLink.update({ where: { id }, data: { status: "ACTIVE" } });
    return NextResponse.json({ link: updated });
  }

  if (action === "end") {
    if (link.coachId !== me.id && link.clientId !== me.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const updated = await prisma.coachLink.update({ where: { id }, data: { status: "ENDED" } });
    return NextResponse.json({ link: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
