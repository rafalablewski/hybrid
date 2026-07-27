import { NextResponse } from "next/server";
import {
  acwrEventsFromHistory,
  derivePersonalization,
  effortSamples,
  deriveEffortModel,
  effortTrend,
} from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { athleteInputs } from "@/lib/athlete-state";
import { activeCalibration } from "@/lib/calibration";
import { prisma } from "@/lib/db";

const DAY_MS = 86_400_000;

// Engine Room athlete feed: the RAW ENGINE INPUTS (TrainingLog + Biometrics)
// for one athlete plus the live calibration, so the admin console runs the
// pure engines client-side — live trace, what-if sliders, no duplicated math.
// Admin-only, and the support-read is audited (an admin opening an athlete's
// training data must never be silent).
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const userId = (url.searchParams.get("user") ?? "").trim();
  if (!userId) return NextResponse.json({ error: "user required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ log, bio, sessions, sessionCount }, calibration, outcomes] = await Promise.all([
    athleteInputs(userId),
    activeCalibration(),
    prisma.riskOutcome.findMany({
      where: { userId },
      select: { injured: true, ts: true },
      orderBy: { ts: "desc" },
      take: 200,
    }),
  ]);

  // Personal spike onset: replay the athlete's peak ACWR at each labeled
  // outcome and shrink the onset toward what they've demonstrated.
  const now = Date.now();
  const personal = derivePersonalization(
    acwrEventsFromHistory(
      log,
      outcomes.map((o) => ({ daysAgo: (now - o.ts.getTime()) / DAY_MS, injured: o.injured })),
    ),
  );

  // The effort model: how this athlete's REPORTED effort compares to what their
  // log implies, learned server-side because it needs the raw sessions (the
  // TrainingLog has already collapsed each session to per-item intensities).
  const samples = effortSamples(sessions);
  const effort = {
    model: deriveEffortModel(samples),
    trend: effortTrend(samples),
    rated: samples.length,
  };

  await audit({
    actor: gate.admin,
    action: "user.engine.view",
    targetType: "user",
    targetId: user.id,
    summary: `Engine Room trace for ${user.email}`,
    req: request,
  });

  return NextResponse.json({ user, log, bio: bio ?? null, sessionCount, calibration, personal, effort });
}
