import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { aggregate, datasetStats, BENCHMARK_METRICS, type BenchmarkMetric, type Observation, type Sex } from "@hybrid/core";
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

  const [cal, outcomes] = await Promise.all([activeCalibration(), prisma.riskOutcome.count()]);

  return NextResponse.json({
    stats: datasetStats(obs, profiles.length),
    norms: aggregate(obs),
    calibration: { ...cal, outcomes },
  });
}
