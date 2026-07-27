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
  BENCHMARK_METRICS,
  type BenchmarkMetric,
  type InjurySample,
  type Observation,
  type Sex,
} from "@hybrid/core";
import { activeCalibration } from "@/lib/calibration";

// Benchmarking-intelligence aggregate over the CONSENTED population (profiles
// opted in as discoverable). De-identified: only cohort aggregates with ≥ K
// athletes are released. Admin-only — this is the data product, not raw rows.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const profiles = await prisma.talentProfile.findMany({
    where: { visibility: "discoverable" },
    select: { sport: true, sex: true, age: true, metrics: true },
  });

  const obs: Observation[] = [];
  for (const p of profiles) {
    const metrics = (p.metrics as Record<string, number>) ?? {};
    for (const m of BENCHMARK_METRICS) {
      const v = metrics[m];
      if (typeof v === "number" && Number.isFinite(v))
        obs.push({ sport: p.sport, sex: p.sex as Sex, age: p.age, metric: m as BenchmarkMetric, value: v });
    }
  }

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
    stats: datasetStats(obs, profiles.length),
    norms: aggregate(obs),
    calibration: { ...cal, outcomes: samples.length, positives, negatives },
    evals,
    reliability: reliabilityBuckets(samples, cal.coeffs),
    fits,
  });
}
