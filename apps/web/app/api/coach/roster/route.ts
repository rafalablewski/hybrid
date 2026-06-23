import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { sessionVolume, migrateBlocks } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Aggregated roster for the Coach dashboard — one row per ACTIVE client, with
// stats computed from their real sessions. Only the coach's own consented
// clients are ever returned.
export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const links = await prisma.coachLink.findMany({
    where: { coachId: me.id, status: "ACTIVE" },
    include: { client: { select: { id: true, name: true, email: true } } },
  });
  const clientIds = links.map((l) => l.clientId);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  // Single windowed query for the 60 most-recent non-archived sessions PER
  // client, instead of one findMany per client (an N+1 that fired hundreds of
  // concurrent queries for a big roster and could exhaust the pool). Bounded by
  // the row-number filter; served by the Session(userId, startedAt) index.
  type Row = { userId: string; startedAt: Date; readiness: number | null; blocks: unknown };
  const rows: Row[] = clientIds.length
    ? await prisma.$queryRaw<Row[]>`
        SELECT "userId", "startedAt", "readiness", "blocks"
        FROM (
          SELECT "userId", "startedAt", "readiness", "blocks",
                 ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "startedAt" DESC) AS rn
          FROM "Session"
          WHERE "userId" IN (${Prisma.join(clientIds)}) AND "archivedAt" IS NULL
        ) t
        WHERE t.rn <= 60`
    : [];

  const byUser = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byUser.get(r.userId);
    if (arr) arr.push(r);
    else byUser.set(r.userId, [r]);
  }

  const roster = links.map((l) => {
    const sessions = (byUser.get(l.clientId) ?? []).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );
    const last = sessions[0] ?? null;
    const last7 = sessions.filter((s) => s.startedAt >= weekAgo).length;
    const volume = sessions.reduce((sum, s) => sum + sessionVolume(migrateBlocks(s.blocks)), 0);
    return {
      linkId: l.id,
      name: l.client.name || l.client.email.split("@")[0],
      email: l.client.email,
      sessions: sessions.length,
      lastSession: last ? last.startedAt.toISOString() : null,
      readiness: last?.readiness ?? null,
      adherence: Math.min(100, last7 * 25), // target ~4 sessions/week
      volume,
    };
  });

  return NextResponse.json({ roster });
}
