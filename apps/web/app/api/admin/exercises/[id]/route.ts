import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseExercise, type ExerciseInput } from "../shared";

// Edit an exercise — content (cues/equipment/video), engine fields, and the
// draft/published/archived lifecycle. A rename auto-keeps the OLD name as an
// alias so historical logged sessions still resolve to this movement. Audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-exercise-patch", limit: 80, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<ExerciseInput>(request, 16 * 1024);
  if (parsed.error) return parsed.error;

  const clean = parseExercise(parsed.data, false);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  if (Object.keys(clean.data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const before = await prisma.exercise.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data = { ...clean.data };

  // Name-as-key: on rename, preserve the old name as an alias (deduped, and
  // never aliasing to its own new name) so prior logs keep resolving.
  if (data.name && data.name !== before.name) {
    const incoming = data.aliases ?? before.aliases;
    data.aliases = [...new Set([...incoming, before.name])].filter((a) => a !== data.name);
  }

  try {
    const updated = await prisma.exercise.update({ where: { id }, data });

    await audit({
      actor: gate.admin,
      action: "exercise.update",
      targetType: "exercise",
      targetId: id,
      summary: `Updated “${updated.name}”${before.status !== updated.status ? ` (${before.status} → ${updated.status})` : ""}`,
      metadata: {
        before: { name: before.name, status: before.status },
        after: { name: updated.name, status: updated.status },
      },
      req: request,
    });

    return NextResponse.json({ exercise: updated });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "an exercise with that name already exists" }, { status: 409 });
    throw e;
  }
}

// Permanently delete an exercise. Audited. (Archive is the soft path.)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-exercise-delete", limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.exercise.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.exercise.delete({ where: { id } });

  await audit({
    actor: gate.admin,
    action: "exercise.delete",
    targetType: "exercise",
    targetId: id,
    summary: `Deleted “${existing.name}”`,
    req: request,
  });

  return NextResponse.json({ ok: true });
}
