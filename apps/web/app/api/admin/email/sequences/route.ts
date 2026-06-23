import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseSteps, parseSequenceMeta } from "../shared";

// List automated lifecycle sequences with their steps + active enrollment count.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  try {
    const sequences = await prisma.emailSequence.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { enrollments: true } },
      },
    });
    return NextResponse.json({ sequences });
  } catch {
    return NextResponse.json({ sequences: [], unavailable: true });
  }
}

// Create a sequence (metadata + ordered steps). Created inactive by default —
// an admin flips it on once the copy is right (so a half-written welcome series
// never starts emailing).
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const limited = await rateLimit(request, { key: "admin-email-sequence-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ name?: unknown; trigger?: unknown; audience?: unknown; active?: unknown; steps?: unknown }>(
    request,
    64 * 1024,
  );
  if (parsed.error) return parsed.error;

  const meta = parseSequenceMeta(parsed.data);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });
  if (!meta.data.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const steps = parseSteps(parsed.data.steps ?? []);
  if (!steps.ok) return NextResponse.json({ error: steps.error }, { status: 400 });

  try {
    const created = await prisma.emailSequence.create({
      data: {
        name: meta.data.name,
        trigger: meta.data.trigger ?? "signup",
        audience: meta.data.audience ?? "all",
        active: meta.data.active ?? false,
        steps: { create: steps.data },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    await audit({
      actor: gate.admin,
      action: "email.sequence.create",
      targetType: "emailSequence",
      targetId: created.id,
      summary: `Created sequence "${created.name}"`,
      metadata: { trigger: created.trigger, steps: created.steps.length, active: created.active },
      req: request,
    });
    return NextResponse.json({ sequence: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Email tables aren't migrated yet — run reference/sql-email.sql." }, { status: 503 });
  }
}
