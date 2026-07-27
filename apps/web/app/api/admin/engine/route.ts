import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { athleteInputs } from "@/lib/athlete-state";
import { activeCalibration } from "@/lib/calibration";
import { prisma } from "@/lib/db";

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

  const [{ log, bio, sessionCount }, calibration] = await Promise.all([
    athleteInputs(userId),
    activeCalibration(),
  ]);

  await audit({
    actor: gate.admin,
    action: "user.engine.view",
    targetType: "user",
    targetId: user.id,
    summary: `Engine Room trace for ${user.email}`,
    req: request,
  });

  return NextResponse.json({ user, log, bio: bio ?? null, sessionCount, calibration });
}
