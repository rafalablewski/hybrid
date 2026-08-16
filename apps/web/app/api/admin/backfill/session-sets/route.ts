import { NextResponse } from "next/server";
import { audit, requireAdmin } from "@/lib/admin";
import { athleteBodyweight, projectSession } from "@/lib/session-projection";
import { prisma } from "@/lib/db";

/**
 * REBUILD THE PROJECTION — the operation a derived table has to have.
 *
 * `SessionSet` is a projection of `Session.blocks`, not a second copy of the
 * truth. That is what makes it safe: it can be dropped and rebuilt from the
 * documents at any time. Three things need this route:
 *
 *   • sessions logged BEFORE the fact table existed, which have no rows;
 *   • sessions whose projection failed (the write path deliberately swallows a
 *     projection error rather than losing an athlete's workout);
 *   • sessions whose bodyweight-dependent rows went stale — an athlete who
 *     back-fills a year of weigh-ins changes what a year of pull-ups weighed,
 *     and the rows record the weight they assumed precisely so they can be
 *     found and redone.
 *
 * POST { limit?, userId?, sessionIds?, force? } → { scanned, projected, rows }
 *
 * Batched and RESUMABLE by design: it takes the oldest sessions that still need
 * work, up to `limit`, and returns what it did. Call it until `projected` comes
 * back 0. It deliberately does not loop internally — a serverless function that
 * tries to rebuild a million sessions in one request times out having committed
 * an arbitrary prefix, and nobody can tell which.
 *
 * By default it only touches sessions with NO fact rows. `force: true` reprojects
 * regardless, which is what a bodyweight backfill or a change to the projection
 * itself needs.
 */

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    limit?: unknown;
    userId?: unknown;
    sessionIds?: unknown;
    force?: unknown;
  };
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT),
  );
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
  const sessionIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.filter((v): v is string => typeof v === "string").slice(0, MAX_LIMIT)
    : null;
  const force = body.force === true;

  const sessions = await prisma.session.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(sessionIds?.length ? { id: { in: sessionIds } } : {}),
      // "Has no rows yet" as a relation filter, so the scan is bounded by the
      // work remaining rather than by the size of the table.
      ...(force || sessionIds?.length ? {} : { sets: { none: {} } }),
    },
    orderBy: { startedAt: "asc" },
    take: limit,
  });

  // One bodyweight lookup per ATHLETE, not per session: a backfill of one
  // athlete's five hundred sessions must not be five hundred queries for the
  // same weight history.
  const lookups = new Map<string, Awaited<ReturnType<typeof athleteBodyweight>>>();
  let projected = 0;
  let rows = 0;
  const failed: string[] = [];
  for (const s of sessions) {
    try {
      let bw = lookups.get(s.userId);
      if (!bw) {
        bw = await athleteBodyweight(s.userId);
        lookups.set(s.userId, bw);
      }
      rows += await projectSession(s, bw);
      projected += 1;
    } catch (e) {
      // One unprojectable session must not stop the batch — record it and carry
      // on, so a single malformed document can't block every session after it.
      console.error("[backfill session-sets] failed for", s.id, e);
      failed.push(s.id);
    }
  }

  await audit({
    actor: gate.admin,
    action: "backfill.session-sets",
    targetType: "Session",
    summary: `projected ${projected} session(s) into ${rows} fact rows`,
    metadata: { scanned: sessions.length, projected, rows, failed: failed.length, force, userId },
    req: request,
  });

  return NextResponse.json({
    scanned: sessions.length,
    projected,
    rows,
    failed,
    // True while there may be more to do — the caller loops on this rather than
    // guessing whether a short batch means "done" or "hit the limit".
    more: sessions.length === limit,
  });
}
