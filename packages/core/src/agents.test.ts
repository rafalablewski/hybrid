import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildAgentConfig,
  parseAgentInput,
  presetFor,
  coordinatedAgents,
  delegateToolName,
  resolveEffort,
  costUsd,
  estimateRunCost,
  summarizeRuns,
  digestText,
  cadenceMs,
  nextRunFrom,
  ROLE_PRESETS,
  type AgentDefinition,
} from "./agents";

function def(over: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "a1",
    role: "CEO",
    name: "Ada — CEO",
    status: "active",
    model: "claude-opus-4-8",
    effort: "high",
    authority: "executive",
    reportsTo: null,
    mandate: "Lead the company.",
    responsibilities: ["Set the strategy.", "Delegate to the team."],
    kpis: [{ metric: "Goal attainment", target: "on time" }],
    guardrails: ["Never deceive."],
    escalationThreshold: "a decision is irreversible.",
    tone: "Decisive and calm.",
    collaborators: ["CFO", "CMO"],
    tools: ["delegate", "web_search", "memory"],
    runtime: "messages",
    approvalThresholdUsd: 0,
    budgetUsd7d: 0,
    ...over,
  };
}

describe("buildSystemPrompt", () => {
  it("reflects edits to the definition (dynamic)", () => {
    const base = buildSystemPrompt(def());
    expect(base).toContain("You are Ada — CEO, the CEO of the company. Lead the company.");
    expect(base).toContain("## KPIs (you are evaluated on)");
    expect(base).toContain("- Goal attainment — on time");

    // change a KPI → the prompt changes with it
    const edited = buildSystemPrompt(def({ kpis: [{ metric: "Runway", target: "18 months" }] }));
    expect(edited).toContain("- Runway — 18 months");
    expect(edited).not.toContain("Goal attainment");
  });

  it("omits empty sections so a half-filled draft stays clean", () => {
    const sparse = buildSystemPrompt(
      def({ kpis: [], responsibilities: [], guardrails: [], tone: "", collaborators: [], tools: [] }),
    );
    expect(sparse).not.toContain("## KPIs");
    expect(sparse).not.toContain("## CORE RESPONSIBILITIES");
    expect(sparse).not.toContain("## TOOLS");
    // authority + admin-direction are always present
    expect(sparse).toContain("## AUTHORITY LEVEL");
    expect(sparse).toContain("## DIRECTION FROM THE HUMAN ADMIN");
  });

  it("renders the reporting chain and falls back to a default escalation rule", () => {
    const exec = buildSystemPrompt(def({ reportsTo: null }));
    expect(exec).toContain("You report to the HUMAN ADMIN");

    const fn = buildSystemPrompt(def({ authority: "functional", reportsTo: "CEO", escalationThreshold: "" }));
    expect(fn).toContain("You report to the CEO, and above all to the HUMAN ADMIN");
    expect(fn).toContain("Escalate to the admin before any irreversible or out-of-policy action.");
  });
});

describe("buildAgentConfig", () => {
  it("maps to the Managed Agents shape and marks an executive as coordinator", () => {
    const cfg = buildAgentConfig(def());
    expect(cfg.model).toEqual({ id: "claude-opus-4-8" });
    expect(cfg.output_config).toEqual({ effort: "high" });
    expect(cfg.multiagent).toEqual({ type: "coordinator" });
    expect(cfg.metadata.memory).toBe("true");
    // web_search is a built-in → folds into the prebuilt toolset
    expect(cfg.tools).toContainEqual({ type: "agent_toolset_20260401" });
  });

  it("a functional agent without built-in tools gets no toolset and no coordinator", () => {
    const cfg = buildAgentConfig(def({ authority: "functional", tools: ["memory", "delegate"] }));
    expect(cfg.multiagent).toBeUndefined();
    expect(cfg.tools).toEqual([]);
    expect(cfg.metadata.memory).toBe("true");
  });
});

describe("presets", () => {
  it("ships the four C-suite roles with sensible model choices", () => {
    expect(Object.keys(ROLE_PRESETS).sort()).toEqual(["CEO", "CFO", "CMO", "COO"]);
    expect(ROLE_PRESETS.CEO!.model).toBe("claude-opus-4-8");
    expect(ROLE_PRESETS.CFO!.model).toBe("claude-opus-4-8");
    expect(ROLE_PRESETS.CMO!.model).toBe("claude-sonnet-4-6");
    expect(ROLE_PRESETS.COO!.authority).toBe("functional");
  });

  it("presetFor is case-insensitive and null for unknown roles", () => {
    expect(presetFor("ceo")).toBe(ROLE_PRESETS.CEO);
    expect(presetFor("CTO")).toBeNull();
  });
});

describe("coordinatedAgents", () => {
  const ceo = def({ id: "ceo", role: "CEO", authority: "executive", reportsTo: null });
  const cfo = def({ id: "cfo", role: "CFO", authority: "functional", reportsTo: "CEO", status: "active" });
  const coo = def({ id: "coo", role: "COO", authority: "functional", reportsTo: "ceo", status: "paused" });
  const all = [ceo, cfo, coo];

  it("returns the active agents that report to the executive (case-insensitive)", () => {
    expect(coordinatedAgents(ceo, all).map((a) => a.id)).toEqual(["cfo"]); // coo is paused → excluded
  });
  it("is empty for a non-executive", () => {
    expect(coordinatedAgents(cfo, all)).toEqual([]);
  });
});

describe("delegateToolName", () => {
  it("slugifies the role into a stable tool name", () => {
    expect(delegateToolName("CFO")).toBe("delegate_to_cfo");
    expect(delegateToolName("Head of Growth")).toBe("delegate_to_head_of_growth");
  });
});

describe("resolveEffort", () => {
  it("drops effort for Haiku, clamps Opus-only levels for Sonnet, passes Opus through", () => {
    expect(resolveEffort("claude-haiku-4-5", "high")).toBeNull();
    expect(resolveEffort("claude-sonnet-4-6", "max")).toBe("high");
    expect(resolveEffort("claude-sonnet-4-6", "xhigh")).toBe("high");
    expect(resolveEffort("claude-sonnet-4-6", "medium")).toBe("medium");
    expect(resolveEffort("claude-opus-4-8", "max")).toBe("max");
  });
});

describe("costUsd", () => {
  it("prices a run by model list price", () => {
    // 1M in + 1M out on Opus = $5 + $25
    expect(costUsd("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(30);
    // Sonnet: 0.5M in + 0.2M out = 1.5 + 3 = 4.5
    expect(costUsd("claude-sonnet-4-6", 500_000, 200_000)).toBeCloseTo(4.5);
  });
  it("falls back to Opus pricing for an unknown model", () => {
    expect(costUsd("legacy-model", 1_000_000, 0)).toBeCloseTo(5);
  });
});

describe("estimateRunCost", () => {
  it("means recent costs, null when empty", () => {
    expect(estimateRunCost([])).toBeNull();
    expect(estimateRunCost([1, 2, 3])).toBeCloseTo(2);
  });
});

describe("digest", () => {
  const runs = [
    { agentName: "CFO", status: "ok", cost: 0.5, task: "model" },
    { agentName: "CFO", status: "error", cost: 0.1, task: "broke" },
    { agentName: "CMO", status: "ok", cost: 0.2, task: "copy" },
  ];
  it("summarizes totals, success rate, cost, top agents, failures", () => {
    const s = summarizeRuns(runs);
    expect(s.total).toBe(3);
    expect(s.ok).toBe(2);
    expect(s.error).toBe(1);
    expect(s.successRate).toBe(67);
    expect(s.costUsd).toBeCloseTo(0.8);
    expect(s.topAgents[0]).toEqual({ name: "CFO", runs: 2, cost: 0.6 });
    expect(s.failures).toEqual([{ name: "CFO", task: "broke" }]);
  });
  it("renders text", () => {
    const t = digestText(summarizeRuns(runs), "today");
    expect(t).toContain("Agent digest — today");
    expect(t).toContain("3 runs");
    expect(t).toContain("⚠ 1 failed");
  });
});

describe("scheduling", () => {
  it("cadenceMs maps known cadences and defaults unknown to daily", () => {
    expect(cadenceMs("hourly")).toBe(3_600_000);
    expect(cadenceMs("weekly")).toBe(604_800_000);
    expect(cadenceMs("nonsense")).toBe(86_400_000);
  });
  it("nextRunFrom advances by the cadence interval", () => {
    const from = new Date("2026-06-06T00:00:00.000Z");
    expect(nextRunFrom("hourly", from).toISOString()).toBe("2026-06-06T01:00:00.000Z");
    expect(nextRunFrom("daily", from).toISOString()).toBe("2026-06-07T00:00:00.000Z");
  });
});

describe("parseAgentInput", () => {
  it("requires role + mandate on create", () => {
    expect(parseAgentInput({}, true)).toEqual({ ok: false, error: "role required" });
    expect(parseAgentInput({ role: "CFO" }, true)).toEqual({ ok: false, error: "mandate required" });
    const ok = parseAgentInput({ role: "CFO", mandate: "Own finance." }, true);
    expect(ok.ok).toBe(true);
  });

  it("allows partial updates on PATCH", () => {
    const r = parseAgentInput({ status: "paused" }, false);
    expect(r).toEqual({ ok: true, data: { status: "paused" } });
  });

  it("rejects invalid enums and unknown tools", () => {
    expect(parseAgentInput({ model: "gpt-4" }, false).ok).toBe(false);
    expect(parseAgentInput({ effort: "ultra" }, false).ok).toBe(false);
    expect(parseAgentInput({ status: "running" }, false).ok).toBe(false);
    expect(parseAgentInput({ runtime: "local" }, false).ok).toBe(false);
    expect(parseAgentInput({ runtime: "managed" }, false)).toEqual({ ok: true, data: { runtime: "managed" } });
    expect(parseAgentInput({ tools: ["web_search", "rm_rf"] }, false)).toEqual({
      ok: false,
      error: "unknown tool: rm_rf",
    });
  });

  it("cleans KPIs: trims, caps, and drops blank rows", () => {
    const r = parseAgentInput(
      { kpis: [{ metric: "  Runway  ", target: " 18mo " }, { metric: "", target: "x" }] },
      false,
    );
    expect(r.ok && r.data.kpis).toEqual([{ metric: "Runway", target: "18mo", targetValue: null }]);
  });

  it("normalizes reportsTo '' to null", () => {
    const r = parseAgentInput({ reportsTo: "" }, false);
    expect(r).toEqual({ ok: true, data: { reportsTo: null } });
  });
});
