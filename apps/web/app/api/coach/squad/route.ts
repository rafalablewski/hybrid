import { NextResponse } from "next/server";
import {
  computePerformanceState,
  computeInjuryRisk,
  computeLoad,
  toTrainingLog,
  toBiometrics,
  migrateBlocks,
  type LoggedSession,
  type Signal,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { publishExerciseCatalog } from "@/lib/cache";

// The squad monitor — one row per ACTIVE client with the numbers a coach scans
// every morning: readiness (RAG), training-load ACWR + band, injury-risk band,
// and last session. All computed server-side from each consented client's real
// sessions + signals (consent-gated by CoachLink; only the coach's own athletes).
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await prisma.coachLink.findMany({
    where: { coachId: me.id, status: "ACTIVE" },
    include: { client: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Batch both reads across the whole roster (two queries, not 2×N) and group
  // in-memory — avoids exhausting the connection pool as the roster grows.
  const clientIds = links.map((l) => l.clientId);
  // Bound the fetch by TIME (squad readiness/adherence only looks back weeks) so
  // it can't pull a whole roster's entire history into memory as clients age —
  // the previous unbounded fetch would OOM the function at scale. The per-user
  // slice(0, 120) below is a further safety cap.
  const now = Date.now();
  const sessionsSince = new Date(now - 90 * 24 * 60 * 60_000); // 90 days
  const signalsSince = new Date(now - 45 * 24 * 60 * 60_000); // 45 days
  const [allRows, allSigRows] = await Promise.all([
    prisma.session.findMany({
      where: { userId: { in: clientIds }, archivedAt: null, startedAt: { gte: sessionsSince } },
      orderBy: { startedAt: "desc" },
      take: 4000,
    }),
    prisma.signal.findMany({
      where: { userId: { in: clientIds }, ts: { gte: signalsSince } },
      orderBy: { ts: "desc" },
      take: 8000,
    }),
  ]);
  const groupBy = <T extends { userId: string }>(items: T[]) => {
    const m = new Map<string, T[]>();
    for (const it of items) { const a = m.get(it.userId); if (a) a.push(it); else m.set(it.userId, [it]); }
    return m;
  };
  const sessionsByUser = groupBy(allRows);
  const signalsByUser = groupBy(allSigRows);

  // Engines resolve exercise names against the movement catalog — publish the
  // admin library once for the whole roster, or library-named lifts contribute
  // zero tissue load and every athlete reads as untrained.
  await publishExerciseCatalog();

  const squad = links.map((l) => {
      const rows = (sessionsByUser.get(l.clientId) ?? []).slice(0, 120); // already desc
      const sigRows = (signalsByUser.get(l.clientId) ?? []).slice(0, 200);
      const sessions: LoggedSession[] = rows.map((s) => ({
        id: s.id,
        title: s.title,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        blocks: migrateBlocks(s.blocks),
        readiness: s.readiness,
      }));
      const signals: Signal[] = sigRows.map((r) => ({
        athleteId: r.userId, kind: r.kind as Signal["kind"], value: r.value, unit: r.unit, source: r.source, ts: r.ts.toISOString(),
      }));

      const log = toTrainingLog(sessions);
      const bio = toBiometrics(signals);
      const state = computePerformanceState(log, bio);
      const risk = computeInjuryRisk(log, bio);
      const load = computeLoad(sessions);

      return {
        linkId: l.id,
        name: l.client.name || l.client.email.split("@")[0],
        tags: l.tags,
        sessions: sessions.length,
        lastSession: rows[0] ? rows[0].startedAt.toISOString() : null,
        readiness: state.readiness.score,
        hpi: state.hpi.score,
        hpiBand: state.hpi.band,
        // Send 0 — which both monitors render as "—" — when the athlete has no
        // chronic base yet. The raw ratio is 4.00 by construction while every
        // session still sits inside the 7-day acute window (acute / (acute/4)),
        // and a squad row showing "4.00" reads as an emergency, not a gap.
        acwr: load.enoughHistory ? load.acwr : 0,
        acwrBand: load.band,
        acute: load.acute,
        strain: load.strain,
        riskOverall: risk.overall,
        riskBand: risk.band,
        flagged: risk.flagged[0]?.tissue ?? null,
      };
  });

  // squad summary — what a coach wants at a glance
  const summary = {
    athletes: squad.length,
    redReadiness: squad.filter((a) => a.readiness < 55).length,
    acwrFlags: squad.filter((a) => a.acwrBand === "caution" || a.acwrBand === "danger").length,
    injuryFlags: squad.filter((a) => a.flagged != null).length,
  };

  return NextResponse.json({ squad, summary });
}
