import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { getCachedPublishedExercises } from "@/lib/cache";

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
    thumbUrl: string | null;
  }> = [];

  // Global published library — cached (short TTL, busted on admin edits).
  exercises = await getCachedPublishedExercises();

  return NextResponse.json({ exercises });
}
