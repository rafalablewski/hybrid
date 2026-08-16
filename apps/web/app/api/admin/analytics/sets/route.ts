import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * CROSS-ATHLETE TRAINING ANALYTICS — in SQL, over the fact table.
 *
 * This is the shape of question that was previously impossible to ask honestly.
 * A set lived inside `Session.blocks`, a jsonb document Postgres cannot index
 * into, so "what does the platform actually train, and how hard" meant loading
 * whole sessions into this lambda under a row cap and walking them in
 * TypeScript. The cap is the real problem: it does not fail, it truncates —
 * the answer comes back looking complete and is quietly the answer for whatever
 * subset happened to fit.
 *
 * Every figure below is a GROUP BY over `SessionSet` with a date range and an
 * index behind it. No rows are pulled into the lambda, there is no cap, and the
 * cost is bounded by the aggregate rather than by the corpus.
 *
 * ADMIN-ONLY, AND AGGREGATES ONLY. Nothing here returns a row belonging to an
 * identifiable athlete: every group is suppressed below `K_ANON` distinct
 * athletes, so a lift only one person in the world logs cannot be read off this
 * endpoint as that person's training.
 *
 * GET ?days=90 → { window, exercises, patterns, disciplines, intensity, totals }
 */

/** Below this many distinct athletes, a group is not an aggregate — it is one
 *  person's training with a label on it. Matches the efficacy index's rule. */
const K_ANON = 5;

const DEFAULT_DAYS = 90;
const MAX_DAYS = 730;

type ExerciseRow = {
  exercise: string;
  athletes: number;
  sets: number;
  reps: number | null;
  tonnage: number | null;
  avg_rpe: number | null;
  top_load: number | null;
};

type GroupRow = { key: string | null; athletes: number; sets: number; tonnage: number | null };

type IntensityRow = { band: string; sets: number; athletes: number };

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "", 10) || DEFAULT_DAYS),
  );
  const since = new Date(Date.now() - days * 86_400_000);

  // Working sets only, archived workouts excluded — the same rule History and
  // the engines apply, expressed once here as a WHERE clause rather than as a
  // filter every caller has to remember.
  const [exercises, patterns, disciplines, intensity, totals] = await Promise.all([
    // The most-trained lifts: who trains them, how much, how hard.
    prisma.$queryRaw<ExerciseRow[]>`
      SELECT "exercise",
             count(DISTINCT "userId")::int          AS athletes,
             count(*)::int                          AS sets,
             sum("reps")::int                       AS reps,
             round(sum("volumeKg")::numeric, 0)::float8   AS tonnage,
             round(avg("rpe")::numeric, 2)::float8        AS avg_rpe,
             round(max("effectiveLoadKg")::numeric, 1)::float8 AS top_load
        FROM "SessionSet"
       WHERE "kind" = 'strength' AND "role" = 'working'
         AND NOT "archived" AND "performedAt" >= ${since}
       GROUP BY "exercise"
      HAVING count(DISTINCT "userId") >= ${K_ANON}
       ORDER BY sets DESC
       LIMIT 50`,

    // Movement-pattern balance across the platform — the "what is nobody
    // training" question, which needed a per-set pattern column to exist.
    prisma.$queryRaw<GroupRow[]>`
      SELECT "movement" AS key,
             count(DISTINCT "userId")::int        AS athletes,
             count(*)::int                        AS sets,
             round(sum("volumeKg")::numeric, 0)::float8 AS tonnage
        FROM "SessionSet"
       WHERE "kind" = 'strength' AND "role" = 'working' AND "movement" IS NOT NULL
         AND NOT "archived" AND "performedAt" >= ${since}
       GROUP BY "movement"
      HAVING count(DISTINCT "userId") >= ${K_ANON}
       ORDER BY sets DESC`,

    // The endurance side of the house, by modality.
    prisma.$queryRaw<GroupRow[]>`
      SELECT "discipline" AS key,
             count(DISTINCT "userId")::int         AS athletes,
             count(*)::int                         AS sets,
             round(sum("distanceKm")::numeric, 1)::float8 AS tonnage
        FROM "SessionSet"
       WHERE "kind" = 'cardio' AND "discipline" IS NOT NULL
         AND NOT "archived" AND "performedAt" >= ${since}
       GROUP BY "discipline"
      HAVING count(DISTINCT "userId") >= ${K_ANON}
       ORDER BY sets DESC`,

    // How hard the platform actually works, by RPE band. The single figure that
    // used to require reading every set of every session in the window.
    prisma.$queryRaw<IntensityRow[]>`
      SELECT CASE
               WHEN "rpe" >= 9.5 THEN '9.5+'
               WHEN "rpe" >= 9   THEN '9'
               WHEN "rpe" >= 8   THEN '8'
               WHEN "rpe" >= 7   THEN '7'
               ELSE '<7'
             END                                AS band,
             count(*)::int                      AS sets,
             count(DISTINCT "userId")::int      AS athletes
        FROM "SessionSet"
       WHERE "kind" = 'strength' AND "role" = 'working' AND "rpe" IS NOT NULL
         AND NOT "archived" AND "performedAt" >= ${since}
       GROUP BY 1
      HAVING count(DISTINCT "userId") >= ${K_ANON}
       ORDER BY 1 DESC`,

    prisma.$queryRaw<
      { sets: number; athletes: number; sessions: number; tonnage: number | null; measured: number }[]
    >`
      SELECT count(*)::int                            AS sets,
             count(DISTINCT "userId")::int            AS athletes,
             count(DISTINCT "sessionId")::int         AS sessions,
             round(sum("volumeKg")::numeric, 0)::float8 AS tonnage,
             count(*) FILTER (WHERE "measured")::int  AS measured
        FROM "SessionSet"
       WHERE NOT "archived" AND "performedAt" >= ${since}`,
  ]);

  return NextResponse.json({
    window: { days, since: since.toISOString() },
    kAnon: K_ANON,
    totals: totals[0] ?? { sets: 0, athletes: 0, sessions: 0, tonnage: 0, measured: 0 },
    exercises,
    patterns,
    disciplines,
    intensity,
  });
}
