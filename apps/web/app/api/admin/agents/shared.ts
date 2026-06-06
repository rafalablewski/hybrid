// Shared mapping for the AgentConfig admin routes. The DB stores JSON columns
// (responsibilities/kpis/guardrails/collaborators/tools); this turns a Prisma
// row into the core AgentDefinition the prompt builder consumes. Validation
// itself lives in @hybrid/core (parseAgentInput) so it's pure + unit-tested.

import type { AgentConfig } from "@prisma/client";
import {
  type AgentDefinition,
  type AgentModelId,
  type AgentEffort,
  type AuthorityLevel,
  type AgentStatus,
  type Kpi,
} from "@hybrid/core";

export { parseAgentInput, type AgentInput, type CleanAgentFields } from "@hybrid/core";

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function kpiArray(v: unknown): Kpi[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((k): k is Kpi => !!k && typeof k === "object" && typeof (k as Kpi).metric === "string")
    .map((k) => ({ metric: k.metric, target: typeof k.target === "string" ? k.target : "" }));
}

/** Map a stored row into the core AgentDefinition shape. */
export function rowToDefinition(row: AgentConfig): AgentDefinition {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    status: row.status as AgentStatus,
    model: row.model as AgentModelId,
    effort: row.effort as AgentEffort,
    authority: row.authority as AuthorityLevel,
    reportsTo: row.reportsTo,
    mandate: row.mandate,
    responsibilities: strArray(row.responsibilities),
    kpis: kpiArray(row.kpis),
    guardrails: strArray(row.guardrails),
    escalationThreshold: row.escalationThreshold,
    tone: row.tone,
    collaborators: strArray(row.collaborators),
    tools: strArray(row.tools),
    updatedAt: row.updatedAt.toISOString(),
  };
}
