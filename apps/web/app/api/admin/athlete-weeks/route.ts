import { NextResponse } from "next/server";
import {
  RETENTION_GAP_WEEKS,
  THE_NUMBER_DEFINITION,
  addWeeks,
  athleteWeekLedger,
  bindingLeg,
  gradeAthleteWeeks,
  labeledAthleteWeeks,
  legCapture,
  numberMovement,
  utcMondayKey,
  type AthleteWeekInput,
} from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * THE NUMBER — labeled athlete-weeks, computed from the database.
 *
 * The definition lives in core (athlete-weeks.ts) and is deliberately not
 * restated here; this route's only job is to answer, per athlete and per week,
 * which of the three legs the platform actually captured. That is one SQL
 * statement: a UNION of per-leg week markers, folded with `bool_or` into one
 * row per (athlete, week). No rows are pulled into the lambda and there is no
 * cap, so the answer cannot quietly become the answer for whatever fitted.
 *
 * Weeks are Postgres `date_trunc('week')` Mondays in UTC, which can differ by a
 * few hours from an athlete's own local Monday. That is correct for an
 * aggregate and wrong for a personal claim — nothing here is ever shown to an
 * athlete about their own week.
 *
 * ADMIN-ONLY, AGGREGATES ONLY. `userId` is used to group and to test retention
 * and is never returned.
 *
 * GET ?weeks=26 → { window, number, ledger, legs, binding, movement }
 */

const DEFAULT_WEEKS = 26;
const MAX_WEEKS = 104;

type LegRow = AthleteWeekInput;

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const weeks = Math.min(
    MAX_WEEKS,
    Math.max(1, Number.parseInt(url.searchParams.get("weeks") ?? "", 10) || DEFAULT_WEEKS),
  );
  // The window is `weeks` whole Mondays ending with the current (part) week,
  // aligned to the same UTC Mondays Postgres will group by.
  const now = Date.now();
  const from = addWeeks(utcMondayKey(now), -(weeks - 1));
  // Query RETENTION_GAP_WEEKS further back than we report: the earliest reported
  // week has to be testable for retention against real history rather than
  // against the edge of the window, or every window would open with a wall of
  // "first weeks" that were nothing of the kind.
  const since = new Date(`${addWeeks(from, -RETENTION_GAP_WEEKS)}T00:00:00.000Z`);

  const rows = await prisma.$queryRaw<LegRow[]>`
    WITH legs AS (
      -- STATE — how the athlete was, as they answered or as a wearable read it.
      SELECT "userId" AS user_id, date_trunc('week', "loggedAt") AS wk, true AS state, false AS intervention, false AS outcome
        FROM "CheckinRead" WHERE "loggedAt" >= ${since}
      UNION ALL
      SELECT "userId", date_trunc('week', "weekOf"), true, false, false
        FROM "Checkin"
       WHERE "weekOf" >= ${since}
         AND ("energy" IS NOT NULL OR "sleep" IS NOT NULL OR "soreness" IS NOT NULL OR "mood" IS NOT NULL)
      UNION ALL
      SELECT "userId", date_trunc('week', "ts"), true, false, false
        FROM "Signal" WHERE "ts" >= ${since} AND "kind" IN ('hrv', 'restingHr', 'sleep')

      -- INTERVENTION — training that actually landed as performed rows. A
      -- session with no projected sets is an empty document, not a week of
      -- training, and must not label a week on its own.
      UNION ALL
      SELECT "userId", date_trunc('week', "performedAt"), false, true, false
        FROM "SessionSet" WHERE NOT "archived" AND "performedAt" >= ${since}

      -- OUTCOME — the measured response. Never the training numbers themselves.
      UNION ALL
      SELECT "userId", date_trunc('week', "startedAt"), false, false, true
        FROM "Session"
       WHERE "archivedAt" IS NULL AND "startedAt" >= ${since}
         -- An unlinked device is written as SQL NULL (Prisma.DbNull), but a
         -- jsonb column can also hold a literal json null, which IS NOT NULL
         -- and is not a recording. Both mean "no device here".
         AND ("feel" IS NOT NULL OR "fatigue" IS NOT NULL
              OR ("device" IS NOT NULL AND "device" <> 'null'::jsonb))
      UNION ALL
      SELECT "userId", date_trunc('week', "performedAt"), false, false, true
        FROM "SessionStream" WHERE NOT "archived" AND "performedAt" >= ${since}
      UNION ALL
      SELECT "userId", date_trunc('week', "measuredAt"), false, false, true
        FROM "BodyMetric" WHERE "measuredAt" >= ${since}
    )
    SELECT user_id                  AS "userId",
           to_char(wk, 'YYYY-MM-DD') AS "week",
           bool_or(state)            AS "state",
           bool_or(intervention)     AS "intervention",
           bool_or(outcome)          AS "outcome"
      FROM legs
     GROUP BY user_id, wk
     ORDER BY wk, user_id`;

  const graded = gradeAthleteWeeks(rows);
  // Report only the requested window; the lookback rows have done their work in
  // `gradeAthleteWeeks` and are not part of the ledger.
  const reported = graded.filter((g) => g.week >= from);
  const ledger = athleteWeekLedger(reported, from, weeks);

  return NextResponse.json({
    definition: THE_NUMBER_DEFINITION,
    window: { weeks, from, retentionGapWeeks: RETENTION_GAP_WEEKS },
    /** THE NUMBER banked in the window, and the athletes who banked it. */
    number: labeledAthleteWeeks(reported),
    athletes: new Set(reported.filter((r) => r.counts).map((r) => r.userId)).size,
    activeWeeks: reported.length,
    ledger,
    legs: legCapture(reported),
    binding: bindingLeg(reported),
    movement: numberMovement(ledger),
  });
}
