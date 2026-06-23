import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Delete a custom onboarding question. Built-ins (system) can't be deleted — only
// disabled — so the five engine questions are never lost. The id is a real DB row
// id (built-ins without a row can't reach here).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-onboarding-delete", limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.onboardingQuestion.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.system)
    return NextResponse.json({ error: "built-in questions can't be deleted — disable it instead" }, { status: 400 });

  await prisma.onboardingQuestion.delete({ where: { id } });

  await audit({
    actor: gate.admin,
    action: "onboarding.question.delete",
    targetType: "onboarding-question",
    targetId: id,
    summary: `Deleted “${existing.title}”`,
    metadata: { key: existing.key },
    req: request,
  });

  return NextResponse.json({ ok: true });
}
