import { prisma } from "@/lib/db";
import {
  computePerformanceState,
  computeInjuryRisk,
  toBiometrics,
  toTrainingLog,
  migrateBlocks,
  type LoggedSession,
  type Signal,
} from "@hybrid/core";
import { activeCalibration } from "@/lib/calibration";

/**
 * Compute an athlete's Performance State + injury risk from their stored
 * sessions and Signal ontology. Authorization is the CALLER's responsibility —
 * this reads raw rows, so only call it after a relationship/role check.
 */
export async function athleteState(userId: string) {
  const [rows, sigRows] = await Promise.all([
    // Archived sessions are excluded from analytics (the athlete hid them).
    prisma.session.findMany({ where: { userId, archivedAt: null }, orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.signal.findMany({ where: { userId }, orderBy: { ts: "desc" }, take: 200 }),
  ]);

  const sessions: LoggedSession[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    blocks: migrateBlocks(r.blocks),
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
  // Real signals only — never fabricate biometrics. No data → honest empty Performance State.
  const bio = toBiometrics(signals) ?? undefined;
  const state = computePerformanceState(log, bio);
  const { coeffs } = await activeCalibration();
  const risk = computeInjuryRisk(log, bio, coeffs);
  return { state, risk, sessionCount: sessions.length };
}
