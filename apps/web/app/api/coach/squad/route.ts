import { NextResponse } from "next/server";
import {
  computePerformanceState,
  computeInjuryRisk,
  computeLoad,
  toTrainingLog,
  toBiometrics,
  type SessionBlock,
  type LoggedSession,
  type Signal,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

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
  const [allRows, allSigRows] = await Promise.all([
    prisma.session.findMany({ where: { userId: { in: clientIds } }, orderBy: { startedAt: "desc" } }),
    prisma.signal.findMany({ where: { userId: { in: clientIds } }, orderBy: { ts: "desc" } }),
  ]);
  const groupBy = <T extends { userId: string }>(items: T[]) => {
    const m = new Map<string, T[]>();
    for (const it of items) { const a = m.get(it.userId); if (a) a.push(it); else m.set(it.userId, [it]); }
    return m;
  };
  const sessionsByUser = groupBy(allRows);
  const signalsByUser = groupBy(allSigRows);

  const squad = links.map((l) => {
      const rows = (sessionsByUser.get(l.clientId) ?? []).slice(0, 120); // already desc
      const sigRows = (signalsByUser.get(l.clientId) ?? []).slice(0, 200);
      const sessions: LoggedSession[] = rows.map((s) => ({
        id: s.id,
        title: s.title,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        blocks: s.blocks as unknown as SessionBlock[],
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
        acwr: load.acwr,
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
