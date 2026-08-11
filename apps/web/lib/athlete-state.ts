import { prisma } from "@/lib/db";
import {
  computePerformanceState,
  computeInjuryRisk,
  toBiometrics,
  personalTrainingLog,
  migrateBlocks,
  sanitizeDeviceWorkout,
  type LoggedSession,
  recoveryReports,
  sessionEndTimes,
  type Signal,
  type HeatSignalRow,
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
  const [rows, sigRows, heatRows, checkinRows] = await Promise.all([
    // Archived sessions are excluded from analytics (the athlete hid them).
    prisma.session.findMany({ where: { userId, archivedAt: null }, orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.signal.findMany({ where: { userId }, orderBy: { ts: "desc" }, take: 200 }),
    // HEAT IS QUERIED ON ITS OWN, deliberately. The unfiltered read above takes
    // the 200 newest rows of ANY kind, and one logged food writes up to eight
    // of them — so on a diligent nutrition logger that window covers a couple
    // of weeks and a sauna from Tuesday would simply not be in it. A recovery
    // input must not be evictable by an unrelated one.
    prisma.signal.findMany({
      where: { userId, kind: { in: ["sauna", "saunaTemp"] } },
      orderBy: { ts: "desc" },
      take: 120,
    }),
    // THE CHECK-IN HISTORY, with every read each day carries. The Engine Room's
    // clearance split is a comparison of the athlete's own recovery pairs, and a
    // pair is built from the READS — a day that holds "wrecked at 09:30" and
    // "good at 22:00" is the whole instrument. Collapsing it to one stored value
    // here would leave the console unable to compute what the phone shows.
    // Soft: the CheckinRead table is a later migration, so a failure degrades to
    // day-level reports rather than failing the whole feed.
    prisma.checkin.findMany({
      where: { userId },
      orderBy: { weekOf: "desc" },
      take: 120,
      include: { reads: { orderBy: { loggedAt: "asc" } } },
    }).catch(() => prisma.checkin.findMany({
      where: { userId },
      orderBy: { weekOf: "desc" },
      take: 120,
    }).catch(() => [])),
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
    // …and its two companions, for the same reason. `fatigue` is the immediate
    // post-session read and `feelLoggedAt` is WHEN it was given — together they
    // are the immediate side of a recovery pair, so without them every
    // server-side pair would silently fall back to a check-in taken hours later
    // and the console's clearance split would disagree with the athlete's own.
    fatigue: r.fatigue,
    feelLoggedAt: r.feelLoggedAt?.toISOString() ?? null,
    // The device's read of this workout, when it was matched — dropped here,
    // every server-side engine would fall back to the typed minutes/distance
    // while the clients used the measurement (see core/device-truth.ts).
    device: sanitizeDeviceWorkout(r.device),
  }));

  const signals: Signal[] = sigRows.map((r) => ({
    athleteId: r.userId,
    kind: r.kind as Signal["kind"],
    value: r.value,
    unit: r.unit,
    source: r.source,
    ts: r.ts.toISOString(),
  }));

  const heatSignals: HeatSignalRow[] = heatRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    value: r.value,
    source: r.source,
    ts: r.ts.toISOString(),
  }));

  const recovery = recoveryReports(
    (checkinRows as {
      weekOf: Date; soreness: number | null; sleep: number | null; energy: number | null;
      mood: number | null; createdAt: Date;
      reads?: { metric: string; value: number; loggedAt: Date }[];
    }[]).map((c) => ({
      weekOf: c.weekOf.toISOString(),
      soreness: c.soreness,
      sleep: c.sleep,
      energy: c.energy,
      mood: c.mood,
      createdAt: c.createdAt?.toISOString() ?? null,
      reads: (c.reads ?? []).map((r) => ({ metric: r.metric, value: r.value, loggedAt: r.loggedAt.toISOString() })),
    })),
    sessionEndTimes(sessions),
  );

  const log = personalTrainingLog(sessions);
  // Real signals only — never fabricate biometrics. No data → honest empty Performance State.
  const bio = toBiometrics(signals) ?? undefined;
  // `sessions` rides along for the callers that need the RAW rows rather than
  // the derived log — the effort model reads each session's reported feeling
  // against the effort its blocks imply, which the TrainingLog has already
  // collapsed away.
  return { log, bio, sessions, heatSignals, recovery, sessionCount: sessions.length };
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
