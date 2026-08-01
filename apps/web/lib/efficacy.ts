import {
  PLAN_PREVIEWS,
  migrateBlocks,
  programEfficacy,
  programFor,
  rankProgramCards,
  type EfficacyEnrollment,
  type ProgramEfficacy,
  EFFICACY_WINDOW_DAYS,
} from "@hybrid/core";
import { prisma } from "@/lib/db";

// The Program Efficacy Index, computed live from the database — the public
// "programs ranked by measured outcome" dataset behind /programs and
// /api/efficacy. Publishes ONLY k-anonymous aggregates (the core module
// suppresses every cohort under K_ANON = 5), so nothing here is per-user data.
//
// Auto-updating by construction: it reads enrollments + sessions on request
// (CDN-cached for an hour at the route), so every closed 12-week window shows
// up on the page without an editor or a cron.

export interface EfficacyIndexRow {
  planId: string;
  name: string;
  goalName: string;
  weeks: number;
  discipline: string;
  /** null = still collecting evidence (fewer than K_ANON measured athletes). */
  card: ProgramEfficacy | null;
}

export interface EfficacyIndex {
  updatedAt: string;
  /** Closed-window enrollments the index judged (measured + dropped). */
  enrollmentsJudged: number;
  rows: EfficacyIndexRow[];
  /** True when the DB was unreachable / unmigrated — rows are then empty shells. */
  unavailable?: boolean;
}

// Bounded work: the newest enrollments and their athletes' sessions, capped so
// a popular index page can never scan an unbounded table. At today's scale the
// caps are far above reality; when they start truncating, this moves to a
// nightly rollup (the ModelFit latest-row-per-key pattern).
const MAX_ENROLLMENTS = 2000;
const MAX_SESSION_ROWS = 20000;

/** The library programs the index covers — every encoded PlanProgram. */
function libraryPrograms(): Omit<EfficacyIndexRow, "card">[] {
  return PLAN_PREVIEWS.filter((p) => programFor(p.plan.id)).map((p) => ({
    planId: p.plan.id,
    name: p.plan.name,
    goalName: p.goalName,
    weeks: p.plan.weeks,
    discipline: programFor(p.plan.id)!.discipline,
  }));
}

export async function computeEfficacyIndex(now = Date.now()): Promise<EfficacyIndex> {
  const programs = libraryPrograms();
  const updatedAt = new Date(now).toISOString();
  const empty = (unavailable?: boolean): EfficacyIndex => ({
    updatedAt,
    enrollmentsJudged: 0,
    rows: programs.map((p) => ({ ...p, card: null })),
    ...(unavailable ? { unavailable: true } : {}),
  });

  try {
    // Oldest first so the dedupe in core keeps each athlete's FIRST run of a
    // program — a re-run is a different (more-trained) athlete than a first run.
    const enrollments = await prisma.macrocycle.findMany({
      where: { planId: { not: null } },
      orderBy: { startedAt: "asc" },
      take: MAX_ENROLLMENTS,
      select: { userId: true, planId: true, startedAt: true },
    });
    if (!enrollments.length) return empty();

    const userIds = [...new Set(enrollments.map((e) => e.userId))];
    const minStart = enrollments[0]!.startedAt;
    const maxEnd = new Date(
      Math.max(...enrollments.map((e) => e.startedAt.getTime())) + EFFICACY_WINDOW_DAYS * 86_400_000,
    );

    const sessionRows = await prisma.session.findMany({
      where: {
        userId: { in: userIds },
        archivedAt: null,
        startedAt: { gte: minStart, lt: maxEnd },
      },
      orderBy: { startedAt: "asc" },
      take: MAX_SESSION_ROWS,
      select: { userId: true, id: true, title: true, startedAt: true, blocks: true },
    });

    const sessionsByUser = new Map<string, EfficacyEnrollment["sessions"]>();
    for (const s of sessionRows) {
      const mapped = {
        id: s.id,
        title: s.title,
        startedAt: s.startedAt.toISOString(),
        blocks: migrateBlocks(s.blocks),
      };
      const arr = sessionsByUser.get(s.userId);
      if (arr) arr.push(mapped);
      else sessionsByUser.set(s.userId, [mapped]);
    }

    const efficacyEnrollments: EfficacyEnrollment[] = enrollments.map((e) => ({
      userId: e.userId,
      planId: e.planId!,
      startedAt: e.startedAt.toISOString(),
      sessions: sessionsByUser.get(e.userId) ?? [],
    }));

    let judged = 0;
    const rows: EfficacyIndexRow[] = programs.map((p) => {
      const card = programEfficacy(p.planId, efficacyEnrollments, { now });
      if (card) judged += card.enrolled;
      return { ...p, card };
    });

    const ranked = rankProgramCards(rows.filter((r) => r.card).map((r) => r.card!));
    const order = new Map(ranked.map((c, i) => [c.planId, i]));
    rows.sort((a, b) => {
      const ai = a.card ? order.get(a.planId)! : Number.MAX_SAFE_INTEGER;
      const bi = b.card ? order.get(b.planId)! : Number.MAX_SAFE_INTEGER;
      return ai - bi || a.name.localeCompare(b.name);
    });

    return { updatedAt, enrollmentsJudged: judged, rows };
  } catch {
    // Table missing / DB unreachable — the page stays up with honest shells.
    return empty(true);
  }
}
