import { NextResponse } from "next/server";
import { CADENCES, nextRunFrom, type AgentCadence } from "@hybrid/core";
import { requireAdmin, requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

const CADENCE_VALUES = CADENCES.map((c) => c.value);

// Standing schedules for one agent. Admin-only. Flags (not 500s) if the
// AgentSchedule table doesn't exist yet.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { id } = await params;
  try {
    const schedules = await prisma.agentSchedule.findMany({ where: { agentId: id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ schedules });
  } catch {
    return NextResponse.json({ schedules: [], unavailable: true });
  }
}

// Create a schedule (defaults enabled). nextRunAt is seeded from the cadence so
// the cron picks it up. Audited.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-agent-sched-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const agent = await prisma.agentConfig.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const parsed = await readJsonLimited<{ task?: unknown; cadence?: unknown; enabled?: unknown }>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const task = typeof b.task === "string" ? b.task.trim() : "";
  if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });
  const cadence = (typeof b.cadence === "string" ? b.cadence : "daily") as AgentCadence;
  if (!CADENCE_VALUES.includes(cadence)) return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
  const enabled = b.enabled === undefined ? true : Boolean(b.enabled);

  const created = await prisma.agentSchedule.create({
    data: {
      agentId: id,
      task: task.slice(0, 4000),
      cadence,
      enabled,
      nextRunAt: enabled ? nextRunFrom(cadence, new Date()) : null,
      createdById: gate.admin.id,
      createdByEmail: gate.admin.email,
    },
  });

  await audit({
    actor: gate.admin,
    action: "agent.schedule.create",
    targetType: "agent",
    targetId: id,
    summary: `Scheduled ${agent.name} ${cadence}${enabled ? "" : " (disabled)"}`,
    metadata: { cadence, enabled, task: task.slice(0, 200) },
    req: request,
  });

  return NextResponse.json({ schedule: created }, { status: 201 });
}
