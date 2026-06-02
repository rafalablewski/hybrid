import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { refitCalibration, RISK_MODEL_VERSION, type InjurySample } from "@hybrid/core";

// Refit the injury calibration on labeled outcomes (admin). Samples come from
// captured RiskOutcome rows plus any fed in via the body (e.g. a club's
// historical medical records). Persists a new ModelFit when there's real signal
// (≥30 samples) — which then applies everywhere injury risk is read.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { samples?: unknown };
  const uploaded: InjurySample[] = Array.isArray(body.samples)
    ? (body.samples as unknown[])
        .map((s) => s as { score?: unknown; injured?: unknown })
        .filter((s) => typeof s.score === "number" && typeof s.injured === "boolean")
        .map((s) => ({ score: s.score as number, injured: s.injured as boolean }))
    : [];

  const stored = await prisma.riskOutcome.findMany({ select: { score: true, injured: true } });
  const samples: InjurySample[] = [...stored.map((s) => ({ score: s.score, injured: s.injured })), ...uploaded];

  const fit = refitCalibration(samples);
  const persisted = fit.n >= 30;
  let version = RISK_MODEL_VERSION;
  if (persisted) {
    version = `refit-${new Date().toISOString().slice(0, 10)}-n${fit.n}`;
    await prisma.modelFit.create({
      data: { key: "injury-calibration", intercept: fit.intercept, slope: fit.slope, n: fit.n, version },
    });
  }

  return NextResponse.json({ fit, persisted, version, sampleCount: samples.length });
}
