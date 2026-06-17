import { NextResponse } from "next/server";
import {
  e1rm,
  sessionVolume,
  velocityProfileFor,
  migrateBlocks,
  type SessionBlock,
  type StrengthBlock,
  type LoggedSession,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Cross-athlete comparison for one lift, over the coach's ACTIVE roster. Every
// stat is computed server-side from each consented client's real sessions —
// only the coach's own clients are ever read.
//
//   GET /api/coach/compare?lift=Back%20Squat
//
// Returns the chosen lift's per-athlete stats AND the set of lifts seen across
// the roster (so the client can build a data-driven selector).

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
const n = (s: string | undefined) => {
  const v = parseFloat(s ?? "");
  return Number.isFinite(v) ? v : NaN;
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedLift = url.searchParams.get("lift");

  const links = await prisma.coachLink.findMany({
    where: { coachId: me.id, status: "ACTIVE" },
    include: { client: { select: { id: true, name: true, email: true } } },
  });

  // Pull every client's sessions in ONE query (not N) and group in-memory —
  // avoids an N+1 pattern that would spam the connection pool on big rosters.
  const clientIds = links.map((l) => l.clientId);
  const allRows = await prisma.session.findMany({
    where: { userId: { in: clientIds }, archivedAt: null },
    orderBy: { startedAt: "desc" },
  });
  const rowsByUser = new Map<string, typeof allRows>();
  for (const r of allRows) { const a = rowsByUser.get(r.userId); if (a) a.push(r); else rowsByUser.set(r.userId, [r]); }

  const clients = links.map((l) => {
    const rows = (rowsByUser.get(l.clientId) ?? []).slice(0, 120); // already desc
    const sessions: LoggedSession[] = rows.map((s) => ({
      id: s.id,
      title: s.title,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      blocks: migrateBlocks(s.blocks),
      readiness: s.readiness,
    }));
    return {
      linkId: l.id,
      name: l.client.name || l.client.email.split("@")[0],
      sessions,
    };
  });

  // Lifts present anywhere across the roster, most-common first.
  const liftCounts = new Map<string, number>();
  for (const c of clients)
    for (const s of c.sessions)
      for (const b of s.blocks)
        if (isStrength(b)) liftCounts.set(b.name, (liftCounts.get(b.name) ?? 0) + 1);
  const lifts = [...liftCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  const lift = requestedLift && lifts.includes(requestedLift) ? requestedLift : lifts[0] ?? null;

  const athletes = clients.map((c) => {
    let bestE1rm = 0;
    let bestVel = 0;
    let volume = 0;
    let reps = 0;
    let sessionCount = 0;

    for (const s of c.sessions) {
      let hit = false;
      for (const b of s.blocks) {
        if (!isStrength(b) || b.name !== lift) continue;
        hit = true;
        for (const set of b.sets) {
          const load = n(set.load);
          const r = n(set.reps);
          const v = n(set.vel);
          if (!Number.isNaN(load) && !Number.isNaN(r)) {
            bestE1rm = Math.max(bestE1rm, e1rm(load, r));
            volume += load * r;
            reps += r;
          }
          if (!Number.isNaN(v)) bestVel = Math.max(bestVel, v);
        }
      }
      if (hit) sessionCount++;
    }

    const estVel1rm = lift ? velocityProfileFor(c.sessions, lift).estimated1rm : 0;

    return {
      linkId: c.linkId,
      name: c.name,
      e1rm: Math.round(bestE1rm),
      bestVel: bestVel ? Number(bestVel.toFixed(2)) : 0,
      volume: Math.round(volume),
      reps,
      sessions: sessionCount,
      estVel1rm: Math.round(estVel1rm),
    };
  });

  // Only athletes who actually train this lift are interesting to compare.
  const filtered = athletes.filter((a) => a.sessions > 0);
  filtered.sort((a, b) => b.e1rm - a.e1rm);

  return NextResponse.json({ lift, lifts, athletes: filtered });
}
