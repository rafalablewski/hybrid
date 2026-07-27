import { prisma } from "@/lib/db";
import {
  computePerformanceState,
  computeInjuryRisk,
  toBiometrics,
  personalTrainingLog,
  migrateBlocks,
  type LoggedSession,
  type Signal,
} from "@hybrid/core";
import { activeCalibration } from "@/lib/calibration";
import { publishExerciseCatalog } from "@/lib/cache";

/**
 * Assemble the ENGINE INPUTS for an athlete from their stored sessions and
 * Signal ontology: the TrainingLog + Biometrics every engine consumes.
 * Authorization is the CALLER's responsibility — this reads raw rows, so only
 * call it after a relationship/role check.
 */
export async function athleteInputs(userId: string) {
  // The engines resolve logged exercise names against the movement catalog —
  // publish the admin library first or every library-named lift attributes to no
  // tissue at all (zero fatigue / injury load).
  await publishExerciseCatalog();
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
    // The athlete's own "how did that feel?" answer — dropped here, every
    // server-side engine read would silently fall back to the constants while
    // the clients (which get the full row) used the real thing, so the AI coach
    // would reason about a different athlete than the app shows.
    feel: r.feel,
  }));

  const signals: Signal[] = sigRows.map((r) => ({
    athleteId: r.userId,
    kind: r.kind as Signal["kind"],
    value: r.value,
    unit: r.unit,
    source: r.source,
    ts: r.ts.toISOString(),
  }));

  const log = personalTrainingLog(sessions);
  // Real signals only — never fabricate biometrics. No data → honest empty Performance State.
  const bio = toBiometrics(signals) ?? undefined;
  // `sessions` rides along for the callers that need the RAW rows rather than
  // the derived log — the effort model reads each session's reported feeling
  // against the effort its blocks imply, which the TrainingLog has already
  // collapsed away.
  return { log, bio, sessions, sessionCount: sessions.length };
}

/**
 * Compute an athlete's Performance State + injury risk from their stored
 * sessions and Signal ontology. Same authorization contract as athleteInputs.
 */
export async function athleteState(userId: string) {
  const { log, bio, sessionCount } = await athleteInputs(userId);
  const state = computePerformanceState(log, bio);
  const { coeffs } = await activeCalibration();
  const risk = computeInjuryRisk(log, bio, coeffs);
  return { state, risk, sessionCount };
}
