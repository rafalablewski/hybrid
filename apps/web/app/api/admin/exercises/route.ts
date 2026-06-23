import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseExercise, type ExerciseInput } from "./shared";

// The exercise-library directory: every exercise (drafts, published, archived),
// newest first. Admin-only. The Exercise table is created by
// reference/sql-exercise.sql — if it's missing we flag it rather than 500.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const exercises = await prisma.exercise.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ exercises });
  } catch {
    return NextResponse.json({ exercises: [], unavailable: true });
  }
}

// Create a new exercise. Defaults to published (a library entry is content, not
// a draft, unless asked). Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-exercise-post", limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<ExerciseInput>(request, 16 * 1024);
  if (parsed.error) return parsed.error;

  const clean = parseExercise(parsed.data, true);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  try {
    const created = await prisma.exercise.create({
      data: {
        name: clean.data.name!,
        slug: clean.data.slug!,
        pattern: clean.data.pattern!,
        muscles: clean.data.muscles!,
        baseLoad: clean.data.baseLoad ?? null,
        system: clean.data.system ?? null,
        kind: clean.data.kind ?? "strength",
        category: clean.data.category ?? null,
        equipment: clean.data.equipment ?? [],
        aliases: clean.data.aliases ?? [],
        description: clean.data.description ?? null,
        cues: clean.data.cues ?? [],
        videoUrl: clean.data.videoUrl ?? null,
        thumbUrl: clean.data.thumbUrl ?? null,
        status: clean.data.status ?? "published",
        source: "custom",
        authorId: gate.admin.id,
        authorEmail: gate.admin.email,
      },
    });

    await audit({
      actor: gate.admin,
      action: "exercise.create",
      targetType: "exercise",
      targetId: created.id,
      summary: `Created “${created.name}” (${created.status})`,
      metadata: { pattern: created.pattern, muscles: created.muscles },
      req: request,
    });

    return NextResponse.json({ exercise: created }, { status: 201 });
  } catch (e) {
    // Unique violation on name/slug (Prisma P2002).
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "an exercise with that name already exists" }, { status: 409 });
    console.error("[admin exercises] create failed", e);
    return NextResponse.json({ error: "could not create exercise" }, { status: 500 });
  }
}
