import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { talentReport, type BenchmarkMetric, type Sex } from "@hybrid/core";
import { athleteState } from "@/lib/athlete-state";

type Metrics = Partial<Record<BenchmarkMetric, number>>;

// The signed-in athlete's talent profile + benchmarks. HPI is computed live
// from their Performance State and merged into the benchmark inputs.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await prisma.talentProfile.findUnique({ where: { userId: user.id } });
  const { state, sessionCount } = await athleteState(user.id);
  const computedHpi = sessionCount > 0 ? state.hpi.score : null;

  let report = null;
  if (profile) {
    const metrics: Metrics = { ...((profile.metrics as Metrics) ?? {}), ...(computedHpi != null ? { hpi: computedHpi } : {}) };
    report = talentReport(metrics, { sport: profile.sport, sex: profile.sex as Sex, age: profile.age });
  }
  return NextResponse.json({ profile, report, computedHpi });
}

// Create / update the profile. HPI is recomputed and stored so discovery search
// can rank on it without recomputing every athlete's Performance State.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as {
    sport?: unknown; sex?: unknown; age?: unknown; visibility?: unknown; metrics?: unknown;
  };
  if (typeof b.sport !== "string" || !b.sport) return NextResponse.json({ error: "sport required" }, { status: 400 });
  const sex: Sex = b.sex === "F" ? "F" : "M";
  const age = typeof b.age === "number" && b.age > 0 && b.age < 120 ? Math.round(b.age) : 0;
  if (!age) return NextResponse.json({ error: "valid age required" }, { status: 400 });
  const visibility = b.visibility === "discoverable" ? "discoverable" : "private";

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const inMetrics = (b.metrics ?? {}) as Record<string, unknown>;
  const { state, sessionCount } = await athleteState(user.id);
  const metrics: Metrics = {
    relStrength: num(inMetrics.relStrength),
    vo2: num(inMetrics.vo2),
    durability: num(inMetrics.durability),
    hpi: sessionCount > 0 ? state.hpi.score : undefined,
  };
  // drop undefined for a clean JSON column
  const clean = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined));

  // A discoverable profile enters the moderation queue (pending) on every save,
  // so edited content is re-reviewed before it surfaces; a private profile needs
  // no review.
  const moderationStatus = visibility === "discoverable" ? "pending" : "approved";

  const profile = await prisma.talentProfile.upsert({
    where: { userId: user.id },
    update: { sport: b.sport, sex, age, visibility, metrics: clean, moderationStatus },
    create: { userId: user.id, sport: b.sport, sex, age, visibility, metrics: clean, moderationStatus },
  });
  return NextResponse.json({ profile }, { status: 201 });
}
