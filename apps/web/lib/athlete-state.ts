import { prisma } from "@/lib/db";
import {
  computePerformanceState,
  computeInjuryRisk,
  toBiometrics,
  toTrainingLog,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
  type SessionBlock,
  type Signal,
} from "@hybrid/core";

/**
 * Compute an athlete's Performance State + injury risk from their stored
 * sessions and Signal ontology. Authorization is the CALLER's responsibility —
 * this reads raw rows, so only call it after a relationship/role check.
 */
export async function athleteState(userId: string) {
  const [rows, sigRows] = await Promise.all([
    prisma.session.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.signal.findMany({ where: { userId }, orderBy: { ts: "desc" }, take: 200 }),
  ]);

  const sessions: LoggedSession[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    blocks: r.blocks as unknown as SessionBlock[],
    readiness: r.readiness,
  }));

  const signals: Signal[] = sigRows.map((r) => ({
    athleteId: r.userId,
    kind: r.kind as Signal["kind"],
    value: r.value,
    unit: r.unit,
    source: r.source,
    ts: r.ts.toISOString(),
  }));

  const log = toTrainingLog(sessions);
  const bio = toBiometrics(signals) ?? (sessions.length ? undefined : SAMPLE_BIOMETRICS);
  const state = computePerformanceState(log, bio);
  const risk = computeInjuryRisk(log, bio);
  return { state, risk, sessionCount: sessions.length };
}
