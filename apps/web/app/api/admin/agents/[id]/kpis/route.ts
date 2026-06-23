import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { rowToDefinition } from "../../shared";

// Recorded numeric ACTUALS for an agent's KPIs — the "actual" half of the
// target-vs-actual scorecard. Admin-only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { id } = await params;
  try {
    const measurements = await prisma.agentKpiMeasurement.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ measurements });
  } catch {
    return NextResponse.json({ measurements: [], unavailable: true });
  }
}

// Log an actual for one of the agent's KPI metrics. Audited.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-agent-kpi-post", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const row = await prisma.agentConfig.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const parsed = await readJsonLimited<{ metric?: unknown; value?: unknown; note?: unknown }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const metric = typeof b.metric === "string" ? b.metric.trim() : "";
  if (!metric) return NextResponse.json({ error: "metric required" }, { status: 400 });
  const value = typeof b.value === "number" && Number.isFinite(b.value) ? b.value : NaN;
  if (Number.isNaN(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

  // Only accept metrics that exist on the agent (keeps actuals tied to real KPIs).
  const def = rowToDefinition(row);
  if (!def.kpis.some((k) => k.metric === metric))
    return NextResponse.json({ error: "unknown metric for this agent" }, { status: 400 });

  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : null;

  const created = await prisma.agentKpiMeasurement.create({
    data: { agentId: id, metric, value, note, recordedById: gate.admin.id, recordedByEmail: gate.admin.email },
  });

  await audit({
    actor: gate.admin,
    action: "agent.kpi.record",
    targetType: "agent",
    targetId: id,
    summary: `Logged ${metric} = ${value} for ${def.name}`,
    metadata: { metric, value },
    req: request,
  });

  return NextResponse.json({ measurement: created }, { status: 201 });
}
