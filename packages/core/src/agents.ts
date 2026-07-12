/**
 * AI Agent Org — the dynamic, admin-controlled executive team.
 *
 * Same shape as the rest of the platform (flags / exercise / localization CMS):
 * the KNOWN role PRESETS live here in code — so an admin can spin up a sensible
 * CEO / CFO / CMO / COO in one click and the system has working defaults with an
 * empty DB — while the admin console stores the editable AgentConfig rows in the
 * DB, layered over these presets.
 *
 * `buildSystemPrompt()` turns an editable config into the live system prompt:
 * change a KPI, a responsibility, or a guardrail in the UI and the prompt the
 * agent runs on changes with it — that is what makes the org DYNAMIC rather than
 * four hard-coded prompts. `buildAgentConfig()` maps the same definition onto the
 * Claude Managed Agents shape (the runtime that actually executes the agents,
 * server-side). Pure + unit-tested — no I/O, no randomness.
 */

export type AgentStatus = "draft" | "active" | "paused";

/** The models an agent may run on (mirrors the platform's recommended lineup). */
export type AgentModelId = "claude-opus-4-8" | "claude-sonnet-4-6" | "claude-haiku-4-5";

/** Thinking-depth / token-spend dial (Claude `output_config.effort`). */
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Authority level governs the prompt's authority clause AND the escalation
 * hierarchy: `executive` is the apex coordinator (delegates + arbitrates),
 * `functional` is a domain owner (autonomous in-domain, escalates the rest),
 * `advisor` only recommends (every action is proposed for approval).
 */
export type AuthorityLevel = "executive" | "functional" | "advisor";

/**
 * Where an agent executes:
 * - `messages` — stateless Messages-API run (fast, ships today; delegation via
 *   server-side tool orchestration).
 * - `managed` — Claude Managed Agents session with a durable MEMORY STORE, so
 *   the agent remembers across runs (needs ANTHROPIC_API_KEY + the beta).
 */
export type AgentRuntime = "messages" | "managed";

/** One measurable objective the agent is steered + evaluated on. */
export interface Kpi {
  metric: string;
  target: string;
  /** Optional numeric target, for an explicit target-vs-actual scorecard. */
  targetValue?: number | null;
}

/** The full, editable definition of one agent. Everything here is admin-tunable
 *  and flows into the generated system prompt. */
export interface AgentDefinition {
  id: string;
  role: string; // "CEO" | "CFO" | … | any custom label (also the preset key when known)
  name: string; // display name, e.g. "Ada — CEO"
  status: AgentStatus;
  model: AgentModelId;
  effort: AgentEffort;
  authority: AuthorityLevel;
  /** Supervisor role/name; null = top of the org (reports to the human admin). */
  reportsTo: string | null;
  /** One- or two-sentence mission — the spine of the prompt. */
  mandate: string;
  responsibilities: string[];
  kpis: Kpi[];
  /** Hard limits + ethical boundaries the agent must not cross. */
  guardrails: string[];
  /** When to stop and escalate to the human admin. */
  escalationThreshold: string;
  /** Personality + communication style. */
  tone: string;
  /** Roles this agent collaborates with. */
  collaborators: string[];
  /** Capability labels the agent may use (see TOOL_OPTIONS). */
  tools: string[];
  /** Execution backend (default "messages"). */
  runtime: AgentRuntime;
  /** Require a 2nd operator's approval when an estimated run cost ≥ this (USD; 0 = off). */
  approvalThresholdUsd: number;
  /** Auto-pause the agent when its trailing-7-day spend ≥ this (USD; 0 = off). */
  budgetUsd7d: number;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Option catalogs (drive the admin dropdowns + validation)
// ---------------------------------------------------------------------------

export const AGENT_STATUSES: AgentStatus[] = ["draft", "active", "paused"];

export const RUNTIMES: { value: AgentRuntime; label: string; note: string }[] = [
  { value: "messages", label: "Messages (stateless)", note: "Fast; delegation via tool orchestration" },
  { value: "managed", label: "Managed (durable memory)", note: "Remembers across runs — needs the API key + beta" },
];

export const MODELS: { id: AgentModelId; label: string; note: string }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "Apex reasoning, precision — strategy & finance" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Fast & cost-effective — high-volume execution" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Cheapest — simple, scoped tasks" },
];

export const EFFORTS: AgentEffort[] = ["low", "medium", "high", "xhigh", "max"];

/** Published list price per 1M tokens (USD), for run cost roll-ups. */
export const MODEL_PRICING: Record<AgentModelId, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Dollar cost of a run given the model and token counts (defaults to Opus
 *  pricing for an unknown/legacy model id). */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model as AgentModelId] ?? MODEL_PRICING["claude-opus-4-8"];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

/** Estimate a run's cost from the agent's recent runs (mean), or null if there's
 *  no history to estimate from. Used by the approval gate. */
export function estimateRunCost(recentCosts: number[]): number | null {
  if (recentCosts.length === 0) return null;
  return recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length;
}

// ---------------------------------------------------------------------------
// Daily digest — pure summary of recent runs (the cron posts it to Slack)
// ---------------------------------------------------------------------------

export interface DigestSummary {
  total: number;
  ok: number;
  error: number;
  successRate: number | null;
  costUsd: number;
  topAgents: { name: string; runs: number; cost: number }[];
  failures: { name: string; task: string }[];
}

/** Roll a set of runs into a digest summary (pure). */
export function summarizeRuns(runs: { agentName: string; status: string; cost: number; task: string }[]): DigestSummary {
  const ok = runs.filter((r) => r.status === "ok").length;
  const byAgent = new Map<string, { runs: number; cost: number }>();
  for (const r of runs) {
    const cur = byAgent.get(r.agentName) ?? { runs: 0, cost: 0 };
    cur.runs += 1;
    cur.cost += r.cost;
    byAgent.set(r.agentName, cur);
  }
  return {
    total: runs.length,
    ok,
    error: runs.length - ok,
    successRate: runs.length ? Math.round((ok / runs.length) * 100) : null,
    costUsd: runs.reduce((n, r) => n + r.cost, 0),
    topAgents: [...byAgent.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 5),
    failures: runs.filter((r) => r.status === "error").slice(0, 5).map((r) => ({ name: r.agentName, task: r.task })),
  };
}

/** Render a digest summary as plain text (for Slack / email). */
export function digestText(s: DigestSummary, label: string): string {
  const lines = [
    `*Agent digest — ${label}*`,
    `${s.total} runs – ${s.successRate == null ? "—" : `${s.successRate}% success`} – $${s.costUsd.toFixed(2)} spend`,
  ];
  if (s.topAgents.length) {
    lines.push("", "Top agents:");
    for (const a of s.topAgents) lines.push(`• ${a.name}: ${a.runs} runs, $${a.cost.toFixed(2)}`);
  }
  if (s.failures.length) {
    lines.push("", `⚠ ${s.error} failed:`);
    for (const f of s.failures) lines.push(`• ${f.name}: ${f.task.slice(0, 80)}`);
  }
  if (s.total === 0) lines.push("", "No runs in this window.");
  return lines.join("\n");
}

export const AUTHORITY_LEVELS: { value: AuthorityLevel; label: string }[] = [
  { value: "executive", label: "Executive (apex — delegates & arbitrates)" },
  { value: "functional", label: "Functional (domain owner — escalates the rest)" },
  { value: "advisor", label: "Advisor (recommends only — no autonomous action)" },
];

export const TOOL_OPTIONS: { value: string; label: string }[] = [
  { value: "delegate", label: "Delegate to executives" },
  { value: "web_search", label: "Web search" },
  { value: "web_fetch", label: "Web fetch" },
  { value: "code_execution", label: "Code execution" },
  { value: "filesystem", label: "Files (read/write)" },
  { value: "memory", label: "Long-term memory" },
];

const MODEL_IDS = MODELS.map((m) => m.id);
const TOOL_VALUES = TOOL_OPTIONS.map((t) => t.value);

const AUTHORITY_COPY: Record<AuthorityLevel, string> = {
  executive:
    "You hold the highest agent-level authority: you set direction, prioritize across the company, delegate to the functional executives, and arbitrate when they disagree. You do not take irreversible or out-of-policy actions yourself — you escalate those.",
  functional:
    "You have full authority over analysis, recommendations, and reversible work within your domain. Cross-functional decisions go to your supervisor; irreversible or out-of-policy actions are escalated for human approval.",
  advisor:
    "You advise and recommend only. You do not take actions on your own — every action is proposed for a human to approve.",
};

// ---------------------------------------------------------------------------
// Dynamic system-prompt builder — the heart of the feature
// ---------------------------------------------------------------------------

function bullets(items: string[]): string {
  return items
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => `- ${i}`)
    .join("\n");
}

/**
 * Generate the agent's system prompt from its editable definition. Deterministic
 * and side-effect-free, so the admin UI can render an exact live preview and the
 * server can hand the identical string to the runtime. Empty sections are
 * omitted so a half-filled draft still produces a clean prompt.
 */
export function buildSystemPrompt(def: AgentDefinition): string {
  const out: string[] = [];

  const opener = def.mandate.trim() ? ` ${def.mandate.trim()}` : "";
  out.push(`You are ${def.name || def.role}, the ${def.role} of the company.${opener}`);

  out.push("");
  out.push("## AUTHORITY LEVEL");
  const chain = def.reportsTo
    ? ` You report to the ${def.reportsTo}, and above all to the HUMAN ADMIN, whose instructions supersede yours in every case.`
    : " You report to the HUMAN ADMIN, whose instructions supersede yours in every case.";
  out.push(AUTHORITY_COPY[def.authority] + chain);

  if (def.responsibilities.some((r) => r.trim())) {
    out.push("");
    out.push("## CORE RESPONSIBILITIES");
    out.push(bullets(def.responsibilities));
  }

  if (def.kpis.some((k) => k.metric.trim())) {
    out.push("");
    out.push("## KPIs (you are evaluated on)");
    out.push(
      bullets(
        def.kpis
          .filter((k) => k.metric.trim())
          .map((k) => {
            const t = k.target.trim() || (k.targetValue != null ? `target ${k.targetValue}` : "");
            return t ? `${k.metric.trim()} — ${t}` : k.metric.trim();
          }),
      ),
    );
  }

  if (def.tone.trim()) {
    out.push("");
    out.push("## PERSONALITY & COMMUNICATION");
    out.push(def.tone.trim());
  }

  if (def.collaborators.some((c) => c.trim())) {
    out.push("");
    out.push("## COLLABORATION");
    out.push(
      `You collaborate with ${def.collaborators.map((c) => c.trim()).filter(Boolean).join(", ")}. ` +
        "Pass shared context explicitly — never assume another agent saw what you saw — and record cross-functional decisions where the team can read them.",
    );
  }

  if (def.guardrails.some((g) => g.trim())) {
    out.push("");
    out.push("## GUARDRAILS & ETHICS");
    out.push(bullets(def.guardrails));
  }

  out.push("");
  out.push("## DIRECTION FROM THE HUMAN ADMIN");
  out.push(
    "Treat operator (system-role) messages as authoritative. For minor, reversible choices, decide and note your assumption rather than stalling. " +
      (def.escalationThreshold.trim()
        ? `Escalate to the admin before acting when: ${def.escalationThreshold.trim()}`
        : "Escalate to the admin before any irreversible or out-of-policy action."),
  );

  if (def.tools.some((t) => t.trim())) {
    out.push("");
    out.push("## TOOLS");
    out.push(
      bullets(def.tools.map((t) => TOOL_OPTIONS.find((o) => o.value === t)?.label ?? t)),
    );
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Managed-Agents mapping — the shape the runtime consumes (server-side)
// ---------------------------------------------------------------------------

export interface BuiltAgentConfig {
  name: string;
  model: { id: AgentModelId };
  system: string;
  output_config: { effort: AgentEffort };
  tools: { type: string }[];
  /** Present only for an `executive` — the coordinator that delegates. */
  multiagent?: { type: "coordinator" };
  metadata: Record<string, string>;
}

const BUILTIN_TOOLS = new Set(["web_search", "web_fetch", "code_execution", "filesystem"]);

/**
 * Map an AgentDefinition onto the Claude Managed Agents `agents.create` shape.
 * Built-in capabilities fold into the prebuilt toolset; delegation + memory are
 * surfaced as metadata/coordinator (they're wired at session level, not as
 * tools). Pure, so it's unit-testable without touching the API.
 */
export function buildAgentConfig(def: AgentDefinition): BuiltAgentConfig {
  const tools: { type: string }[] = [];
  if (def.tools.some((t) => BUILTIN_TOOLS.has(t))) tools.push({ type: "agent_toolset_20260401" });

  const cfg: BuiltAgentConfig = {
    name: def.name || def.role,
    model: { id: def.model },
    system: buildSystemPrompt(def),
    output_config: { effort: def.effort },
    tools,
    metadata: {
      role: def.role,
      status: def.status,
      authority: def.authority,
      memory: String(def.tools.includes("memory")),
    },
  };
  if (def.authority === "executive") cfg.multiagent = { type: "coordinator" };
  return cfg;
}

// ---------------------------------------------------------------------------
// Role presets — one-click sensible defaults for the classic C-suite
// ---------------------------------------------------------------------------

export type AgentPreset = Omit<AgentDefinition, "id" | "name" | "status" | "updatedAt">;

export const ROLE_PRESETS: Record<string, AgentPreset> = {
  CEO: {
    role: "CEO",
    model: "claude-opus-4-8",
    effort: "high",
    authority: "executive",
    reportsTo: null,
    mandate:
      "You are the strategic apex of the executive team and the coordinator of the CFO, CMO, and COO. You turn the admin's objectives into a prioritized company strategy.",
    responsibilities: [
      "Translate the admin's objectives into prioritized OKRs.",
      "Delegate domain work to the CFO, CMO, and COO and integrate their input into coherent decisions.",
      "Arbitrate when executives disagree, optimizing for the mission over any single function.",
      "Surface to the admin anything that genuinely needs human judgment.",
    ],
    kpis: [
      { metric: "Goal attainment", target: "% of admin objectives met on time" },
      { metric: "Decision quality", target: "downstream outcomes of arbitrations" },
      { metric: "Escalation precision", target: "escalate what needs a human, and only that" },
    ],
    guardrails: [
      "Never direct an executive to mislead, deceive, or circumvent regulation.",
      "Optimize for long-term trust over any short-term metric.",
    ],
    escalationThreshold: "a decision is irreversible, commits budget, or touches legal/compliance/PR risk.",
    tone: "Decisive, calm, big-picture. Concise with the admin (recommendation first, then rationale); explicit with executives (task, intent, constraints). A respectful thought partner, not a yes-man.",
    collaborators: ["CFO", "CMO", "COO"],
    tools: ["delegate", "web_search", "memory"],
    runtime: "messages",
    approvalThresholdUsd: 0,
    budgetUsd7d: 0,
  },
  CFO: {
    role: "CFO",
    model: "claude-opus-4-8",
    effort: "high",
    authority: "functional",
    reportsTo: "CEO",
    mandate:
      "You own financial truth: modeling, budgeting, forecasting, cost optimization, and ROI analysis. You model and advise — you never move money yourself.",
    responsibilities: [
      "Build and maintain auditable financial models (unit economics, P&L, cash flow, runway, scenarios).",
      "Budget, forecast, and flag variances early.",
      "Run ROI analysis on every proposed initiative.",
      "Gate major spend recommendations with the numbers behind them.",
    ],
    kpis: [
      { metric: "Forecast accuracy", target: "actuals within tolerance of projection" },
      { metric: "Model auditability", target: "assumptions explicit, math verifiable" },
      { metric: "Cost savings identified", target: "quantified and realized" },
    ],
    guardrails: [
      "Never fabricate, round away, or 'manage' numbers toward a desired outcome.",
      "State assumptions and confidence; flag missing data instead of inventing it.",
      "No advice involving misrepresentation, tax evasion, or accounting fraud.",
    ],
    escalationThreshold: "any actual financial commitment, or an assumption that materially swings the result.",
    tone: "Rigorous, precise, conservative. Shows the work, quantifies uncertainty. When the answer is no, says why and names the conditions for yes.",
    collaborators: ["CEO", "CMO", "COO"],
    tools: ["code_execution", "web_search", "memory"],
    runtime: "messages",
    approvalThresholdUsd: 0,
    budgetUsd7d: 0,
  },
  CMO: {
    role: "CMO",
    model: "claude-sonnet-4-6",
    effort: "medium",
    authority: "functional",
    reportsTo: "CEO",
    mandate:
      "You own marketing strategy, brand, content, growth, and customer acquisition. You propose and create — you never publish or commit spend without approval.",
    responsibilities: [
      "Marketing & growth strategy aligned to the CEO's OKRs.",
      "Brand stewardship: maintain and apply voice, positioning, and visual guidelines.",
      "Create campaigns, copy, messaging, and channel plans.",
      "Design the funnel and growth experiments with CAC/LTV in mind.",
    ],
    kpis: [
      { metric: "Acquisition contribution", target: "leads/signups attributable to marketing" },
      { metric: "CAC : LTV", target: "healthy ratio (with the CFO)" },
      { metric: "Experiment velocity", target: "tests run and insights captured" },
    ],
    guardrails: [
      "No deceptive, manipulative, or dark-pattern marketing; no false claims.",
      "Respect privacy and platform rules; make only substantiable claims.",
    ],
    escalationThreshold: "anything that ships publicly, names a third party, makes a competitive/factual claim, or commits spend.",
    tone: "Creative, persuasive, audience-obsessed, data-aware. Offers a few distinct directions with a rationale and recommends one; bold on ideas, disciplined on spend.",
    collaborators: ["CEO", "CFO", "COO"],
    tools: ["web_search", "web_fetch", "memory"],
    runtime: "messages",
    approvalThresholdUsd: 0,
    budgetUsd7d: 0,
  },
  COO: {
    role: "COO",
    model: "claude-sonnet-4-6",
    effort: "medium",
    authority: "functional",
    reportsTo: "CEO",
    mandate:
      "You own operations, workflows, execution, efficiency, and cross-team coordination. You turn strategy into running processes.",
    responsibilities: [
      "Translate strategy and OKRs into concrete workflows with owners and timelines.",
      "Optimize processes: remove bottlenecks, standardize, measure cycle time.",
      "Coordinate the CFO and CMO on shared initiatives; unblock and track status.",
      "Maintain the live operational status ledger.",
    ],
    kpis: [
      { metric: "On-time delivery", target: "% of committed initiatives delivered on time" },
      { metric: "Process efficiency", target: "cycle time, throughput, rework rate" },
      { metric: "Plan-to-execution fidelity", target: "what was decided actually got done" },
    ],
    guardrails: [
      "Never cut safety, compliance, or quality to hit a deadline — flag the tradeoff.",
      "No change risking data loss or service disruption without approval and a rollback plan.",
    ],
    escalationThreshold: "scope changes, anything irreversible, or anything touching production systems or external parties.",
    tone: "Pragmatic, organized, execution-focused. Communicates in clear status: done / blocked / next / owner. Biased toward action; resists over-engineering.",
    collaborators: ["CEO", "CFO", "COO"],
    tools: ["filesystem", "web_search", "memory"],
    runtime: "messages",
    approvalThresholdUsd: 0,
    budgetUsd7d: 0,
  },
};

/** The preset for a known role (case-insensitive), or null for a custom role. */
export function presetFor(role: string): AgentPreset | null {
  return ROLE_PRESETS[role.trim().toUpperCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Execution wiring — who an executive coordinates, and runtime knobs (pure)
// ---------------------------------------------------------------------------

/** The active agents an executive coordinates: those whose `reportsTo` is this
 *  executive's role. Empty for a non-executive. The roster the coordinator may
 *  delegate to at runtime. */
export function coordinatedAgents(executive: AgentDefinition, all: AgentDefinition[]): AgentDefinition[] {
  if (executive.authority !== "executive") return [];
  const key = executive.role.trim().toUpperCase();
  return all.filter(
    (a) => a.id !== executive.id && a.status === "active" && (a.reportsTo ?? "").trim().toUpperCase() === key,
  );
}

/** A stable, API-safe delegation tool name for a role, e.g. "delegate_to_cfo". */
export function delegateToolName(role: string): string {
  const slug = role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `delegate_to_${slug || "agent"}`;
}

/**
 * Clamp the requested effort to what the chosen model actually supports:
 * Haiku has no effort dial (→ null, omit it); Sonnet doesn't support the
 * Opus-only `xhigh`/`max` (→ `high`); Opus passes through. Keeps a live run from
 * 400-ing when an admin picks an effort the model can't take.
 */
export function resolveEffort(model: AgentModelId, effort: AgentEffort): AgentEffort | null {
  if (model === "claude-haiku-4-5") return null;
  if (model === "claude-sonnet-4-6") return effort === "max" || effort === "xhigh" ? "high" : effort;
  return effort;
}

// ---------------------------------------------------------------------------
// Scheduling — how often a standing task fires (pure; the cron route applies it)
// ---------------------------------------------------------------------------

export type AgentCadence = "hourly" | "daily" | "weekly";

export const CADENCES: { value: AgentCadence; label: string; ms: number }[] = [
  { value: "hourly", label: "Every hour", ms: 3_600_000 },
  { value: "daily", label: "Every day", ms: 86_400_000 },
  { value: "weekly", label: "Every week", ms: 604_800_000 },
];

/** Interval for a cadence in ms (defaults to daily for an unknown value). */
export function cadenceMs(cadence: string): number {
  return CADENCES.find((c) => c.value === cadence)?.ms ?? 86_400_000;
}

/** The next fire time for a cadence, measured from `from`. */
export function nextRunFrom(cadence: string, from: Date): Date {
  return new Date(from.getTime() + cadenceMs(cadence));
}

// ---------------------------------------------------------------------------
// Validation — shared by the admin create/update routes (pure, tested)
// ---------------------------------------------------------------------------

export type AgentInput = Partial<{
  role: unknown;
  name: unknown;
  status: unknown;
  model: unknown;
  effort: unknown;
  runtime: unknown;
  approvalThresholdUsd: unknown;
  budgetUsd7d: unknown;
  authority: unknown;
  reportsTo: unknown;
  mandate: unknown;
  responsibilities: unknown;
  kpis: unknown;
  guardrails: unknown;
  escalationThreshold: unknown;
  tone: unknown;
  collaborators: unknown;
  tools: unknown;
}>;

export type CleanAgentFields = Partial<Omit<AgentDefinition, "id" | "updatedAt">>;

function cleanStringList(v: unknown, cap: number, itemCap: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v.slice(0, cap)) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (t) out.push(t.slice(0, itemCap));
  }
  return out;
}

/**
 * Validate + coerce an agent payload. `requireCore` demands role + mandate (on
 * create); a PATCH omits them. Returns the cleaned subset or an error string.
 * Mirrors `parseAnnouncement` — same defensive shape across the CMS.
 */
export function parseAgentInput(
  b: AgentInput,
  requireCore: boolean,
): { ok: true; data: CleanAgentFields } | { ok: false; error: string } {
  const out: CleanAgentFields = {};

  if (b.role !== undefined || requireCore) {
    if (typeof b.role !== "string" || !b.role.trim()) return { ok: false, error: "role required" };
    out.role = b.role.trim().slice(0, 60);
  }
  if (b.name !== undefined) {
    if (typeof b.name !== "string") return { ok: false, error: "name must be a string" };
    out.name = b.name.trim().slice(0, 80);
  }
  if (b.mandate !== undefined || requireCore) {
    if (typeof b.mandate !== "string" || !b.mandate.trim()) return { ok: false, error: "mandate required" };
    out.mandate = b.mandate.trim().slice(0, 2000);
  }
  if (b.status !== undefined) {
    if (!AGENT_STATUSES.includes(b.status as AgentStatus)) return { ok: false, error: "invalid status" };
    out.status = b.status as AgentStatus;
  }
  if (b.model !== undefined) {
    if (!MODEL_IDS.includes(b.model as AgentModelId)) return { ok: false, error: "invalid model" };
    out.model = b.model as AgentModelId;
  }
  if (b.effort !== undefined) {
    if (!EFFORTS.includes(b.effort as AgentEffort)) return { ok: false, error: "invalid effort" };
    out.effort = b.effort as AgentEffort;
  }
  if (b.runtime !== undefined) {
    if (!RUNTIMES.some((r) => r.value === b.runtime)) return { ok: false, error: "invalid runtime" };
    out.runtime = b.runtime as AgentRuntime;
  }
  for (const key of ["approvalThresholdUsd", "budgetUsd7d"] as const) {
    if (b[key] === undefined) continue;
    const n = b[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return { ok: false, error: `${key} must be a number ≥ 0` };
    out[key] = n;
  }
  if (b.authority !== undefined) {
    if (!AUTHORITY_LEVELS.some((a) => a.value === b.authority)) return { ok: false, error: "invalid authority" };
    out.authority = b.authority as AuthorityLevel;
  }
  if (b.reportsTo !== undefined) {
    if (b.reportsTo === null || b.reportsTo === "") out.reportsTo = null;
    else if (typeof b.reportsTo !== "string") return { ok: false, error: "reportsTo must be a string or null" };
    else out.reportsTo = b.reportsTo.trim().slice(0, 60);
  }
  if (b.escalationThreshold !== undefined) {
    if (typeof b.escalationThreshold !== "string") return { ok: false, error: "escalationThreshold must be a string" };
    out.escalationThreshold = b.escalationThreshold.trim().slice(0, 600);
  }
  if (b.tone !== undefined) {
    if (typeof b.tone !== "string") return { ok: false, error: "tone must be a string" };
    out.tone = b.tone.trim().slice(0, 800);
  }

  for (const key of ["responsibilities", "guardrails", "collaborators"] as const) {
    if (b[key] === undefined) continue;
    const list = cleanStringList(b[key], 30, 400);
    if (list === null) return { ok: false, error: `${key} must be a string array` };
    out[key] = list;
  }

  if (b.tools !== undefined) {
    const list = cleanStringList(b.tools, 20, 60);
    if (list === null) return { ok: false, error: "tools must be a string array" };
    const bad = list.find((t) => !TOOL_VALUES.includes(t));
    if (bad) return { ok: false, error: `unknown tool: ${bad}` };
    out.tools = list;
  }

  if (b.kpis !== undefined) {
    if (!Array.isArray(b.kpis)) return { ok: false, error: "kpis must be an array" };
    const kpis: Kpi[] = [];
    for (const k of b.kpis.slice(0, 20)) {
      if (!k || typeof k !== "object") return { ok: false, error: "each kpi must be an object" };
      const metric = (k as Kpi).metric;
      const target = (k as Kpi).target;
      if (typeof metric !== "string" || !metric.trim()) continue; // drop blank rows
      const tv = (k as Kpi).targetValue;
      kpis.push({
        metric: metric.trim().slice(0, 120),
        target: typeof target === "string" ? target.trim().slice(0, 200) : "",
        targetValue: typeof tv === "number" && Number.isFinite(tv) ? tv : null,
      });
    }
    out.kpis = kpis;
  }

  return { ok: true, data: out };
}
