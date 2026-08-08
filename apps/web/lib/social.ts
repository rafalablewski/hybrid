import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { migrateBlocks, sanitizeDeviceWorkout, type FollowEdge, type LoggedSession, type FeedPostInput } from "@hybrid/core";
import { sanitizeProgramWeeks, programAssignments } from "@/lib/coach-program";

/** A social/marketplace table hasn't been migrated yet (run reference/sql-social.sql). */
export const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

/**
 * REACTIONS FOLLOW THE POST THEY WERE GIVEN TO.
 *
 * A session used to produce TWO cards — the workout and a separate `pr` card
 * anchored on the same Session id — so kudos and comments were written against
 * whichever of the two the reader happened to be looking at. There is one post
 * per workout now (core/social.ts buildSocialFeed), and the records live on it.
 *
 * So `session` and `pr` are ONE subject at the reaction layer: every write
 * canonicalises to `session`, and every read counts both. Nobody's kudos or
 * comment disappeared when the two cards became one, and the thread under the
 * post is the whole thread rather than half of it.
 */
export const canonicalSubjectType = (subjectType: string): string => (subjectType === "pr" ? "session" : subjectType);

/** Every subject type a read must cover for one canonical subject. */
export const subjectTypeAliases = (subjectType: string): string[] =>
  canonicalSubjectType(subjectType) === "session" ? ["session", "pr"] : [subjectType];

/** The (subjectType, subjectId) pairs to query for a set of feed items, and the
 *  key a returned row counts towards — `pr` rows fold onto their session. */
export function reactionKeys(items: { subjectType: string; subjectId: string }[]): {
  pairs: { subjectType: string; subjectId: string }[];
  keyOf: (row: { subjectType: string; subjectId: string }) => string;
} {
  const pairs = items.flatMap((i) => subjectTypeAliases(i.subjectType).map((subjectType) => ({ subjectType, subjectId: i.subjectId })));
  return { pairs, keyOf: (row) => `${canonicalSubjectType(row.subjectType)}:${row.subjectId}` };
}

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

/** Ids the user has blocked OR who have blocked them — mutual invisibility.
 *  Excluded from feed/search/suggestions/leaderboard and barred from following.
 *  Soft-degrades to an empty set if the Block table isn't migrated yet. */
export async function blockedIdsFor(userId: string): Promise<Set<string>> {
  try {
    const rows = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const out = new Set<string>();
    for (const r of rows) out.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    return out;
  } catch {
    return new Set();
  }
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
  type Row = { id: string; userId: string; title: string; startedAt: Date; completedAt: Date | null; blocks: unknown; device: unknown };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "id", "userId", "title", "startedAt", "completedAt", "blocks", "device"
    FROM (
      SELECT "id", "userId", "title", "startedAt", "completedAt", "blocks", "device",
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
      // The measurement rides along — a weekly distance compared between two
      // athletes must be what their devices measured (see core/device-truth.ts).
      device: sanitizeDeviceWorkout(r.device),
    };
    const arr = out.get(r.userId);
    if (arr) arr.push(s);
    else out.set(r.userId, [s]);
  }
  return out;
}

/** Recent shared posts for a set of users, as the core FeedPostInput shape,
 *  keyed by author id. Soft-degrades to an empty map until Post is migrated. */
export async function recentPostsByUsers(userIds: string[], sinceMs: number): Promise<Map<string, FeedPostInput[]>> {
  const out = new Map<string, FeedPostInput[]>();
  if (!userIds.length) return out;
  try {
    const rows = await prisma.post.findMany({
      where: { authorId: { in: userIds }, createdAt: { gte: new Date(sinceMs) } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const r of rows) {
      const item: FeedPostInput = {
        id: r.id,
        kind: (r.kind as FeedPostInput["kind"]) ?? "status",
        text: r.text,
        data: (r.data ?? {}) as Record<string, unknown>,
        at: r.createdAt.getTime(),
      };
      const arr = out.get(r.authorId);
      if (arr) arr.push(item);
      else out.set(r.authorId, [item]);
    }
  } catch {
    /* Post table not migrated yet — feed is sessions-only. */
  }
  return out;
}

/** All sessions (lifetime-ish, capped) for one user — for compare / profile. */
export async function allSessionsFor(userId: string, cap = 400): Promise<LoggedSession[]> {
  const rows = await prisma.session.findMany({
    where: { userId, archivedAt: null },
    orderBy: { startedAt: "desc" },
    take: cap,
    select: { id: true, title: true, startedAt: true, completedAt: true, blocks: true, device: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    blocks: migrateBlocks(r.blocks),
    device: sanitizeDeviceWorkout(r.device),
  }));
}

/** Public author card shape used across the social APIs. */
export interface AuthorCard {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** True only when the user has a real SocialProfile (so `handle` is their
   *  chosen handle, not the opaque id-slice fallback). Surfaces that a card can
   *  hide the synthetic @handle and show just the name. */
  hasProfile: boolean;
}

/** Load SocialProfile cards for a set of user ids, keyed by user id. Users
 *  without a profile yet show their real name (User.name) and fall back to an
 *  opaque id-slice handle — NEVER their email. The community surface shows a
 *  person's first + last name, so an email address must never leak into a
 *  card's name or @handle. */
export async function authorCards(userIds: string[]): Promise<Map<string, AuthorCard>> {
  const out = new Map<string, AuthorCard>();
  if (!userIds.length) return out;
  const [profiles, users] = await Promise.all([
    prisma.socialProfile.findMany({ where: { userId: { in: userIds } } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const profById = new Map(profiles.map((p) => [p.userId, p]));
  for (const u of users) {
    const p = profById.get(u.id);
    out.set(u.id, {
      id: u.id,
      // Never derive a handle from the email local-part — an id-slice keeps the
      // fallback unique without exposing the address.
      handle: p?.handle ?? u.id.slice(0, 8),
      displayName: p?.displayName ?? u.name ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      hasProfile: !!p,
    });
  }
  return out;
}
