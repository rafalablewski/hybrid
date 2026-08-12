import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import {
  aggregate,
  datasetStats,
  brierScore,
  rocAuc,
  reliabilityBuckets,
  CALIBRATION_PRIOR,
  type InjurySample,
  type Observation,
} from "@hybrid/core";
import { activeCalibration } from "@/lib/calibration";

// Benchmarking-intelligence aggregate + injury-model calibration. De-identified:
// only cohort aggregates with ≥ K athletes are released. Admin-only — this is
// the data product, not raw rows.
//
// COHORT NORMS HAVE NO SOURCE RIGHT NOW. They were fed by the opt-in Talent
// Graph profile (sport/sex/age + self-declared metrics), which was cut in the
// 2026-08 strategy review. The aggregation stays wired so a real longitudinal
// source (the adaptive-MRV / program-efficacy datasets) can feed it — until
// then it honestly reports zero observations rather than inventing a cohort.
// The injury calibration below is unaffected: it runs on real labeled outcomes.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const obs: Observation[] = [];

  const [cal, outcomes, fits] = await Promise.all([
    activeCalibration(),
    // the labeled sample set is small by construction (one row per athlete-day
    // snapshot / injury); cap it defensively so the eval never unbounds
    prisma.riskOutcome.findMany({ select: { score: true, injured: true }, take: 10_000 }),
    prisma.modelFit.findMany({
      where: { key: "injury-calibration" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { version: true, intercept: true, slope: true, n: true, createdAt: true },
    }),
  ]);

  const samples: InjurySample[] = outcomes.map((o) => ({ score: o.score, injured: o.injured }));
  const positives = samples.filter((s) => s.injured).length;
  const negatives = samples.length - positives;

  // Offline evaluation of the LIVE calibration vs the documented prior, on the
  // same labeled set. AUC is coefficient-free (it scores the heuristic's
  // ranking); Brier moves when a refit actually improves calibration.
  const evals = {
    auc: rocAuc(samples),
    brierActive: brierScore(samples, cal.coeffs),
    brierPrior: brierScore(samples, CALIBRATION_PRIOR),
    n: samples.length,
  };

  return NextResponse.json({
    stats: datasetStats(obs, 0),
    norms: aggregate(obs),
    calibration: { ...cal, outcomes: samples.length, positives, negatives },
    evals,
    reliability: reliabilityBuckets(samples, cal.coeffs),
    fits,
  });
}
