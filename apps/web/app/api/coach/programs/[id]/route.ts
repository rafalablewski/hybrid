import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { sanitizeProgramWeeks } from "@/lib/coach-program";

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: b, error } = await readJsonLimited<{
    name?: unknown; goal?: unknown; weeks?: unknown;
    published?: unknown; summary?: unknown; level?: unknown; visibility?: unknown;
  }>(request, 128 * 1024);
  if (error) return error;
  try {
    const program = await prisma.coachProgram.findUnique({ where: { id } });
    if (!program || program.coachId !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    const data: { name?: string; goal?: string | null; weeks?: object; published?: boolean; summary?: string | null; level?: string | null; visibility?: string } = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 80);
    if (typeof b.goal === "string") data.goal = b.goal.trim() ? b.goal.trim().slice(0, 40) : null;
    if (b.weeks !== undefined) data.weeks = sanitizeProgramWeeks(b.weeks);
    // marketplace listing fields
    if (typeof b.published === "boolean") data.published = b.published;
    if (typeof b.summary === "string") data.summary = b.summary.trim() ? b.summary.trim().slice(0, 280) : null;
    if (typeof b.level === "string") data.level = b.level.trim() ? b.level.trim().slice(0, 30) : null;
    if (b.visibility === "public" || b.visibility === "link") data.visibility = b.visibility;
    const updated = await prisma.coachProgram.update({ where: { id }, data });
    return NextResponse.json({ program: updated });
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
    const program = await prisma.coachProgram.findUnique({ where: { id } });
    if (!program || program.coachId !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.coachProgram.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not enabled yet" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
