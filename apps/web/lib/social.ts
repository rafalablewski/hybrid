import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { migrateBlocks, type FollowEdge, type LoggedSession } from "@hybrid/core";
import { sanitizeProgramWeeks, programAssignments } from "@/lib/coach-program";

/** A social/marketplace table hasn't been migrated yet (run reference/sql-social.sql). */
export const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

/** Materialize a coach program's weeks into dated Assignments for one client —
 *  the "deliver the program" step shared by accepting a ProgramEnrollment AND
 *  accepting a CoachLink that originated from an enrolment. Idempotent: clears
 *  exactly the (date, name) slots it's about to write, so a re-accept/retry
 *  never duplicates the calendar. Runs inside the caller's transaction. Returns
 *  the number of Assignment rows written. */
export async function deliverProgramAssignments(
  tx: Prisma.TransactionClient,
  programId: string,
  clientId: string,
  coachId: string,
  start: Date = new Date(),
): Promise<number> {
  const program = await tx.coachProgram.findUnique({ where: { id: programId } });
  if (!program) return 0;
  const weeks = sanitizeProgramWeeks(program.weeks);
  const rows = programAssignments(weeks, clientId, coachId, start);
  if (rows.length === 0) return 0;
  const dates = [...new Set(rows.map((r) => +new Date(r.date as Date)))].map((t) => new Date(t));
  const names = [...new Set(rows.map((r) => r.name))];
  await tx.assignment.deleteMany({
    where: { assignedById: coachId, athleteId: clientId, date: { in: dates }, name: { in: names } },
  });
  await tx.assignment.createMany({ data: rows });
  return rows.length;
}

/** All follow edges this user is a party to (either side), for relation maths. */
export async function edgesFor(userId: string): Promise<FollowEdge[]> {
  const rows = await prisma.follow.findMany({
    where: { OR: [{ followerId: userId }, { followeeId: userId }] },
    select: { followerId: true, followeeId: true, status: true, closeFriend: true },
  });
  return rows;
}

/** Ids the user follows with an ACTIVE edge (people whose results they may see). */
export async function activeFolloweeIds(userId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId, status: "active" },
    select: { followeeId: true, closeFriend: true },
  });
  return rows.map((r) => r.followeeId);
}

/** Mutual active follows = friends. */
export async function friendIds(userId: string): Promise<string[]> {
  const [out, incoming] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId, status: "active" }, select: { followeeId: true } }),
    prisma.follow.findMany({ where: { followeeId: userId, status: "active" }, select: { followerId: true } }),
  ]);
  const followees = new Set(out.map((r) => r.followeeId));
  return incoming.map((r) => r.followerId).filter((id) => followees.has(id));
}

/** Recent non-archived sessions for a set of users, capped per-user, as the
 *  LoggedSession shape the @hybrid/core engines consume. One windowed query
 *  (no N+1), mirroring the coach roster route. */
export async function recentSessionsByUsers(
  userIds: string[],
  sinceMs: number,
  perUser = 60,
): Promise<Map<string, LoggedSession[]>> {
  const out = new Map<string, LoggedSession[]>();
  if (!userIds.length) return out;
  const since = new Date(sinceMs);
  type Row = { id: string; userId: string; title: string; startedAt: Date; completedAt: Date | null; blocks: unknown };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "id", "userId", "title", "startedAt", "completedAt", "blocks"
    FROM (
      SELECT "id", "userId", "title", "startedAt", "completedAt", "blocks",
             ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "startedAt" DESC) AS rn
      FROM "Session"
      WHERE "userId" IN (${Prisma.join(userIds)})
        AND "archivedAt" IS NULL
        AND "startedAt" >= ${since}
    ) t
    WHERE t.rn <= ${perUser}`;
  for (const r of rows) {
    const s: LoggedSession = {
      id: r.id,
      title: r.title,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      blocks: migrateBlocks(r.blocks),
    };
    const arr = out.get(r.userId);
    if (arr) arr.push(s);
    else out.set(r.userId, [s]);
  }
  return out;
}

/** All sessions (lifetime-ish, capped) for one user — for compare / profile. */
export async function allSessionsFor(userId: string, cap = 400): Promise<LoggedSession[]> {
  const rows = await prisma.session.findMany({
    where: { userId, archivedAt: null },
    orderBy: { startedAt: "desc" },
    take: cap,
    select: { id: true, title: true, startedAt: true, completedAt: true, blocks: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    blocks: migrateBlocks(r.blocks),
  }));
}

/** Public author card shape used across the social APIs. */
export interface AuthorCard {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Load SocialProfile cards for a set of user ids, keyed by user id. Users
 *  without a profile yet fall back to a derived handle from their name/email. */
export async function authorCards(userIds: string[]): Promise<Map<string, AuthorCard>> {
  const out = new Map<string, AuthorCard>();
  if (!userIds.length) return out;
  const [profiles, users] = await Promise.all([
    prisma.socialProfile.findMany({ where: { userId: { in: userIds } } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
  ]);
  const profById = new Map(profiles.map((p) => [p.userId, p]));
  for (const u of users) {
    const p = profById.get(u.id);
    out.set(u.id, {
      id: u.id,
      handle: p?.handle ?? (u.email?.split("@")[0] || u.id.slice(0, 8)),
      displayName: p?.displayName ?? u.name ?? null,
      avatarUrl: p?.avatarUrl ?? null,
    });
  }
  return out;
}
