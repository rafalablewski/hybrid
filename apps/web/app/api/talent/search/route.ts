import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { benchmarkMetric, BENCHMARK_METRICS, type BenchmarkMetric, type Sex } from "@hybrid/core";

// Talent discovery — the consent-gated marketplace. Only profiles set to
// "discoverable" are returned. Ranks athletes by their percentile (or maturation
// -adjusted potential) for a chosen metric, optionally filtered by sport.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sport = url.searchParams.get("sport") || undefined;
  const metricParam = url.searchParams.get("metric") as BenchmarkMetric | null;
  const metric: BenchmarkMetric = metricParam && BENCHMARK_METRICS.includes(metricParam) ? metricParam : "hpi";
  const minPct = Number(url.searchParams.get("minPct") ?? 0) || 0;
  const byPotential = url.searchParams.get("byPotential") === "1";

  const profiles = await prisma.talentProfile.findMany({
    where: { visibility: "discoverable", ...(sport ? { sport } : {}) },
    include: { user: true },
    take: 200,
  });

  const results = profiles
    .map((p) => {
      const m = (p.metrics as Record<string, number>)?.[metric];
      if (typeof m !== "number") return null;
      const b = benchmarkMetric(metric, m, { sport: p.sport, sex: p.sex as Sex, age: p.age });
      return {
        name: p.user.name ?? "Athlete",
        sport: p.sport,
        age: p.age,
        sex: p.sex,
        percentile: b.percentile,
        potential: b.potentialPercentile,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => (byPotential ? r.potential : r.percentile) >= minPct)
    .sort((a, b) => (byPotential ? b.potential - a.potential : b.percentile - a.percentile))
    .slice(0, 50);

  return NextResponse.json({ metric, results });
}
