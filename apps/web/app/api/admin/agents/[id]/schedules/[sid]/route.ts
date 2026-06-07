import { NextResponse } from "next/server";
import { CADENCES, nextRunFrom, type AgentCadence } from "@hybrid/core";
import { requireAdmin, requireAgentOperator, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

const CADENCE_VALUES = CADENCES.map((c) => c.value);

// Edit a schedule — toggle enabled, change task or cadence. Re-seeds nextRunAt
// when it's (re)enabled or the cadence changes. Audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const gate = await requireAgentOperator(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-agent-sched-patch", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { sid } = await params;
  const existing = await prisma.agentSchedule.findUnique({ where: { id: sid } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = await readJsonLimited<{ task?: unknown; cadence?: unknown; enabled?: unknown }>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const data: { task?: string; cadence?: string; enabled?: boolean; nextRunAt?: Date | null } = {};
  if (b.task !== undefined) {
    if (typeof b.task !== "string" || !b.task.trim()) return NextResponse.json({ error: "invalid task" }, { status: 400 });
    data.task = b.task.trim().slice(0, 4000);
  }
  if (b.cadence !== undefined) {
    if (typeof b.cadence !== "string" || !CADENCE_VALUES.includes(b.cadence as AgentCadence))
      return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
    data.cadence = b.cadence;
  }
  if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  // Recompute the next fire time when (re)enabling or changing cadence.
  const enabledNow = data.enabled ?? existing.enabled;
  const cadenceNow = data.cadence ?? existing.cadence;
  if (!enabledNow) data.nextRunAt = null;
  else if (data.enabled === true || data.cadence !== undefined) data.nextRunAt = nextRunFrom(cadenceNow, new Date());

  const updated = await prisma.agentSchedule.update({ where: { id: sid }, data });

  await audit({
    actor: gate.admin,
    action: "agent.schedule.update",
    targetType: "agent",
    targetId: existing.agentId,
    summary: `Updated schedule (${updated.cadence}${updated.enabled ? "" : ", disabled"})`,
    metadata: { changed: Object.keys(data) },
    req: request,
  });

  return NextResponse.json({ schedule: updated });
}

// Delete a schedule. Audited.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-agent-sched-delete", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { sid } = await params;
  const existing = await prisma.agentSchedule.findUnique({ where: { id: sid } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.agentSchedule.delete({ where: { id: sid } });

  await audit({
    actor: gate.admin,
    action: "agent.schedule.delete",
    targetType: "agent",
    targetId: existing.agentId,
    summary: `Deleted a ${existing.cadence} schedule`,
    req: request,
  });

  return NextResponse.json({ ok: true });
}
