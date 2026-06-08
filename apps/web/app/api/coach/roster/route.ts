import { NextResponse } from "next/server";
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

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const roster = await Promise.all(
    links.map(async (l) => {
      const sessions = await prisma.session.findMany({
        where: { userId: l.clientId },
        orderBy: { startedAt: "desc" },
        take: 60,
      });
      const last = sessions[0] ?? null;
      const last7 = sessions.filter((s) => s.startedAt >= weekAgo).length;
      const volume = sessions.reduce(
        (sum, s) => sum + sessionVolume(migrateBlocks(s.blocks)),
        0,
      );
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
    }),
  );

  return NextResponse.json({ roster });
}
