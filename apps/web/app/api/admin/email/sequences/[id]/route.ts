import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseSteps, parseSequenceMeta } from "../../shared";

// Update a sequence — metadata (name/trigger/audience/active) and/or a full
// replacement of its steps. Steps are replaced wholesale (delete+recreate) so
// the editor can reorder/insert/remove freely in one save.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const limited = await rateLimit(request, { key: "admin-email-sequence-patch", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;

  const parsed = await readJsonLimited<{ name?: unknown; trigger?: unknown; audience?: unknown; active?: unknown; steps?: unknown }>(
    request,
    64 * 1024,
  );
  if (parsed.error) return parsed.error;

  const existing = await prisma.emailSequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const meta = parseSequenceMeta(parsed.data);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

  let steps: ReturnType<typeof parseSteps> | null = null;
  if (parsed.data.steps !== undefined) {
    steps = parseSteps(parsed.data.steps);
    if (!steps.ok) return NextResponse.json({ error: steps.error }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (steps && steps.ok) {
      await tx.emailSequenceStep.deleteMany({ where: { sequenceId: id } });
      await tx.emailSequenceStep.createMany({ data: steps.data.map((s) => ({ ...s, sequenceId: id })) });
    }
    return tx.emailSequence.update({
      where: { id },
      data: meta.data,
      include: { steps: { orderBy: { order: "asc" } } },
    });
  });

  await audit({
    actor: gate.admin,
    action: "email.sequence.update",
    targetType: "emailSequence",
    targetId: id,
    summary: `Updated sequence "${updated.name}"`,
    metadata: { active: updated.active, trigger: updated.trigger, steps: updated.steps.length },
    req: request,
  });
  return NextResponse.json({ sequence: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const { id } = await params;
  const existing = await prisma.emailSequence.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Steps + enrollments cascade (onDelete: Cascade in the schema).
  await prisma.emailSequence.delete({ where: { id } });
  await audit({
    actor: gate.admin,
    action: "email.sequence.delete",
    targetType: "emailSequence",
    targetId: id,
    summary: `Deleted sequence "${existing.name}"`,
    req: request,
  });
  return NextResponse.json({ ok: true });
}
