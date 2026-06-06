import { NextResponse } from "next/server";
import { ROLE_PRESETS, presetFor, type AgentInput } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseAgentInput, rowToDefinition } from "./shared";

// The available role presets (CEO/CFO/CMO/COO) the UI can one-click create from.
// Derived from the @hybrid/core registry so code is the single source of truth.
const PRESETS = Object.entries(ROLE_PRESETS).map(([key, p]) => ({
  key,
  role: p.role,
  mandate: p.mandate,
  model: p.model,
  authority: p.authority,
}));

// List every configured agent (newest first), plus the presets. Admin-only. If
// the AgentConfig table doesn't exist yet we flag it (like flags/announcements)
// rather than 500 — the presets are still offered so the org can be created.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const rows = await prisma.agentConfig.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ agents: rows.map(rowToDefinition), presets: PRESETS });
  } catch {
    return NextResponse.json({ agents: [], presets: PRESETS, unavailable: true });
  }
}

// Create an agent. Pass `preset` (a role key) to seed sensible defaults; any
// provided fields override the preset. Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-agent-post", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<AgentInput & { preset?: unknown }>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const { preset, ...body } = parsed.data;

  // Seed from a preset when asked, then overlay the request body.
  let seed: AgentInput = {};
  if (preset !== undefined) {
    if (typeof preset !== "string") return NextResponse.json({ error: "preset must be a string" }, { status: 400 });
    const p = presetFor(preset);
    if (!p) return NextResponse.json({ error: "unknown preset" }, { status: 400 });
    seed = { ...p };
  }

  const clean = parseAgentInput({ ...seed, ...body }, true);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
  const d = clean.data;

  const created = await prisma.agentConfig.create({
    data: {
      role: d.role!,
      name: d.name?.trim() || d.role!,
      mandate: d.mandate!,
      status: d.status ?? "draft",
      model: d.model ?? "claude-opus-4-8",
      effort: d.effort ?? "high",
      authority: d.authority ?? "functional",
      reportsTo: d.reportsTo ?? null,
      responsibilities: (d.responsibilities ?? []) as never,
      kpis: (d.kpis ?? []) as never,
      guardrails: (d.guardrails ?? []) as never,
      escalationThreshold: d.escalationThreshold ?? "",
      tone: d.tone ?? "",
      collaborators: (d.collaborators ?? []) as never,
      tools: (d.tools ?? []) as never,
      runtime: d.runtime ?? "messages",
      updatedById: gate.admin.id,
      updatedByEmail: gate.admin.email,
    },
  });

  await audit({
    actor: gate.admin,
    action: "agent.create",
    targetType: "agent",
    targetId: created.id,
    summary: `Created agent ${created.name} (${created.role}, ${created.status})`,
    metadata: { role: created.role, model: created.model, authority: created.authority, preset: preset ?? null },
    req: request,
  });

  return NextResponse.json({ agent: rowToDefinition(created) }, { status: 201 });
}
