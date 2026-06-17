import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { parseExercise, slugify } from "../admin/exercises/shared";

// A user's OWN custom exercises (source "user", scoped to the author). Creating
// them is an ATHLETE+ capability — a free/casual user can't add custom movements
// (it's part of Full). Reads + writes both go through here; the published global
// library is the separate /api/exercises read. No new table: reuses Exercise
// (authorId/source/status already exist), so no migration is required.

/** Athlete+ = a paid client, or any coach/admin. Mirrors the server-side gate
 *  used for other paid features (e.g. check-in sharing reads entitlement). */
function isAthlete(u: { role: string; entitlement: string }): boolean {
  return u.role === "ADMIN" || u.role === "COACH" || u.entitlement === "paid";
}

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let exercises: unknown[] = [];
  try {
    exercises = await prisma.exercise.findMany({
      where: { source: "user", authorId: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, pattern: true, muscles: true, baseLoad: true,
        system: true, aliases: true, kind: true, category: true, equipment: true,
        description: true, cues: true, status: true,
      },
    });
  } catch {
    exercises = []; // Exercise table not migrated yet — degrade to empty.
  }
  return NextResponse.json({ exercises, canCreate: isAthlete(user) });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAthlete(user))
    return NextResponse.json({ error: "Custom exercises are part of Full — upgrade to add your own." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseExercise(body, true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  // name/slug are globally unique on Exercise. Keep the display name as typed,
  // but namespace the slug per author so two users can both add "My Curl"
  // without colliding (the name still must be unique — handled below).
  const slug = `u-${user.id.slice(0, 8)}-${d.slug ?? slugify(d.name ?? "exercise")}`.slice(0, 80);

  try {
    const exercise = await prisma.exercise.create({
      data: {
        slug,
        name: d.name!,
        pattern: d.pattern!,
        muscles: d.muscles!,
        baseLoad: d.baseLoad ?? null,
        system: d.system ?? null,
        kind: d.kind ?? "strength",
        category: d.category ?? "My exercises",
        equipment: d.equipment ?? [],
        aliases: d.aliases ?? [],
        description: d.description ?? null,
        cues: d.cues ?? [],
        videoUrl: d.videoUrl ?? null,
        status: "published", // visible to the author's pickers; scoped by source+authorId
        source: "user",
        authorId: user.id,
        authorEmail: user.email,
      },
    });
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (e) {
    // Most likely a unique-name collision (Exercise.name is globally unique).
    const msg = e instanceof Error && /unique|constraint/i.test(e.message)
      ? "That exercise name is already taken — pick a more specific one."
      : "Couldn't save the exercise.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
