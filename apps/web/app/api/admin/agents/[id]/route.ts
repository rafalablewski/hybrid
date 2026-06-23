import { NextResponse } from "next/server";
import { buildSystemPrompt, buildAgentConfig, type AgentInput } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseAgentInput, rowToDefinition } from "../shared";

// One agent + the EXACT prompt and Managed-Agents config it would run on. The UI
// also previews the prompt live (buildSystemPrompt is pure + shared), but this is
// the server-of-record copy. Admin-only.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { id } = await params;
  const row = await prisma.agentConfig.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const def = rowToDefinition(row);
  return NextResponse.json({ agent: def, prompt: buildSystemPrompt(def), config: buildAgentConfig(def) });
}

// Edit any field — mandate, KPIs, responsibilities, guardrails, model/effort,
// tone, collaborators, tools — or flip status (pause/resume/activate). Partial
// update; arrays are full replacements. Audited with before/after. Admin-only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-agent-patch", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<AgentInput>(request, 32 * 1024);
  if (parsed.error) return parsed.error;

  const clean = parseAgentInput(parsed.data, false);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  if (Object.keys(clean.data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const before = await prisma.agentConfig.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const d = clean.data;
  const updated = await prisma.agentConfig.update({
    where: { id },
    data: {
      ...(d.role !== undefined ? { role: d.role } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.mandate !== undefined ? { mandate: d.mandate } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.model !== undefined ? { model: d.model } : {}),
      ...(d.effort !== undefined ? { effort: d.effort } : {}),
      ...(d.authority !== undefined ? { authority: d.authority } : {}),
      ...(d.reportsTo !== undefined ? { reportsTo: d.reportsTo } : {}),
      ...(d.escalationThreshold !== undefined ? { escalationThreshold: d.escalationThreshold } : {}),
      ...(d.tone !== undefined ? { tone: d.tone } : {}),
      ...(d.responsibilities !== undefined ? { responsibilities: d.responsibilities as never } : {}),
      ...(d.kpis !== undefined ? { kpis: d.kpis as never } : {}),
      ...(d.guardrails !== undefined ? { guardrails: d.guardrails as never } : {}),
      ...(d.collaborators !== undefined ? { collaborators: d.collaborators as never } : {}),
      ...(d.tools !== undefined ? { tools: d.tools as never } : {}),
      ...(d.runtime !== undefined ? { runtime: d.runtime } : {}),
      ...(d.approvalThresholdUsd !== undefined ? { approvalThresholdUsd: d.approvalThresholdUsd } : {}),
      ...(d.budgetUsd7d !== undefined ? { budgetUsd7d: d.budgetUsd7d } : {}),
      updatedById: gate.admin.id,
      updatedByEmail: gate.admin.email,
    },
  });

  await audit({
    actor: gate.admin,
    action: "agent.update",
    targetType: "agent",
    targetId: id,
    summary: `Updated agent ${updated.name}${before.status !== updated.status ? ` (${before.status} → ${updated.status})` : ""}`,
    metadata: {
      changed: Object.keys(d),
      before: { status: before.status, model: before.model, effort: before.effort },
      after: { status: updated.status, model: updated.model, effort: updated.effort },
    },
    req: request,
  });

  return NextResponse.json({ agent: rowToDefinition(updated) });
}

// Permanently delete an agent. Audited.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-agent-delete", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.agentConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.agentConfig.delete({ where: { id } });

  await audit({
    actor: gate.admin,
    action: "agent.delete",
    targetType: "agent",
    targetId: id,
    summary: `Deleted agent ${existing.name} (${existing.role})`,
    metadata: { role: existing.role },
    req: request,
  });

  return NextResponse.json({ ok: true });
}
