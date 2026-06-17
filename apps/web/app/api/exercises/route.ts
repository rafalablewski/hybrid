import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Published exercises from the admin-managed library, for any signed-in user.
// The client folds these over the built-in MOVEMENTS (mergeMovements) into the
// catalog the engines + pickers consume. Drafts/archived stay admin-only.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let exercises: Array<{
    name: string;
    pattern: string;
    muscles: string[];
    baseLoad: number | null;
    system: string | null;
    aliases: string[];
    kind: string;
    category: string | null;
    equipment: string[];
    description: string | null;
    cues: string[];
    videoUrl: string | null;
  }> = [];

  try {
    exercises = await prisma.exercise.findMany({
      // Everyone sees the published global library (built-in + admin custom).
      // PLUS the caller's OWN exercises (source "user"), at any status — these
      // are private to them and never leak to other users.
      where: {
        OR: [
          { status: "published", NOT: { source: "user" } },
          { source: "user", authorId: user.id },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        name: true,
        pattern: true,
        muscles: true,
        baseLoad: true,
        system: true,
        aliases: true,
        kind: true,
        category: true,
        equipment: true,
        description: true,
        cues: true,
        videoUrl: true,
      },
    });
  } catch {
    // Table not created yet (reference/sql-exercise.sql) — degrade to empty so
    // the built-in catalog still serves.
    exercises = [];
  }

  return NextResponse.json({ exercises });
}
