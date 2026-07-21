import { NextResponse } from "next/server";
import { builtinExerciseRefs } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseExercise, type ExerciseInput } from "./shared";

// A built-in exercise projected into the admin list's row shape: a virtual,
// non-persisted entry an admin can OVERRIDE (saving creates a real custom row of
// the same name that supersedes it). Marked source "builtin" with a synthetic id
// so the UI can tell it apart and start an override instead of a PATCH.
function builtinRows() {
  return builtinExerciseRefs().map((e) => ({
    id: `builtin:${e.slug}`,
    slug: e.slug,
    name: e.name,
    pattern: e.pattern,
    muscles: e.muscles,
    baseLoad: e.baseLoad,
    system: e.system,
    kind: e.kind,
    category: e.category,
    equipment: e.equipment,
    aliases: [] as string[],
    description: null as string | null,
    cues: [] as string[],
    videoUrl: null as string | null,
    thumbUrl: null as string | null,
    status: "published" as const,
    source: "builtin" as const,
    authorEmail: null as string | null,
  }));
}

// The exercise-library directory: EVERY exercise an admin can edit — the code
// built-ins AND the custom DB rows (drafts, published, archived) — one A–Z list.
// A custom row supersedes a built-in of the same name (the override wins). Admin-
// only. The Exercise table is created by reference/sql-exercise.sql; if it's
// missing we still return the built-ins so the library is never empty.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let custom: Awaited<ReturnType<typeof prisma.exercise.findMany>> = [];
  let unavailable = false;
  try {
    custom = await prisma.exercise.findMany({ orderBy: { name: "asc" } });
  } catch {
    unavailable = true;
  }

  // Fold built-ins under the custom rows: a custom entry of the same name (an
  // override) hides its built-in twin, so each lift appears once.
  const overridden = new Set(custom.map((c) => c.name));
  const builtins = builtinRows().filter((b) => !overridden.has(b.name));
  const exercises = [...custom, ...builtins].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ exercises, unavailable, builtinCount: builtins.length, customCount: custom.length });
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
