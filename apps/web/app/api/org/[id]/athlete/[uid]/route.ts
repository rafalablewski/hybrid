import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { canRead, canSeeAthlete, type OrgRole, type TeamNode } from "@hybrid/core";
import { athleteState } from "@/lib/athlete-state";

// An athlete's Performance State within the org, gated by the caller's role.
// The caller must be an org member who can read performance data, and the
// target must be a member of the same org. Medical-tier detail (full injury
// drivers) only surfaces to roles allowed to read it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; uid: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, uid } = await params;
  const me = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: user.id } } });
  if (!me) return NextResponse.json({ error: "not a member" }, { status: 403 });
  const myRole = me.role as OrgRole;
  if (!canRead(myRole, "performance")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // target must belong to the same org
  const target = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: id, userId: uid } } });
  if (!target) return NextResponse.json({ error: "athlete not in org" }, { status: 404 });

  // team-subtree scoping: a team-pinned coach only sees their subtree
  const teamRows = await prisma.team.findMany({ where: { orgId: id }, select: { id: true, name: true, parentId: true } });
  const teams: TeamNode[] = teamRows.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId }));
  if (!canSeeAthlete(myRole, me.teamId, target.teamId, teams))
    return NextResponse.json({ error: "outside your team scope" }, { status: 403 });

  const { state, risk, sessionCount } = await athleteState(uid);

  const seesMedical = canRead(myRole, "medical");
  return NextResponse.json({
    hpi: state.hpi,
    readiness: state.readiness,
    summary: state.summary,
    drivers: state.drivers,
    sessionCount,
    injury: {
      overall: risk.overall,
      band: risk.band,
      // tissue-level detail is medical-tier; performance-only roles see counts
      tissues: seesMedical ? risk.tissues : undefined,
      flaggedCount: risk.flagged.length,
    },
  });
}
