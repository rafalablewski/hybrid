import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { athleteState } from "@/lib/athlete-state";

// The signed-in athlete's own Twin headline — HPI, readiness, injury risk.
// Shared by the tactical (deployment readiness) and longevity surfaces.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { state, risk, sessionCount } = await athleteState(user.id);
  return NextResponse.json({
    hpi: state.hpi.score,
    hpiBand: state.hpi.band,
    readiness: state.readiness.score,
    injuryRisk: risk.overall,
    injuryBand: risk.band,
    sessionCount,
  });
}
