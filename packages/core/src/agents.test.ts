import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildAgentConfig,
  parseAgentInput,
  presetFor,
  coordinatedAgents,
  delegateToolName,
  resolveEffort,
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
    expect(r.ok && r.data.kpis).toEqual([{ metric: "Runway", target: "18mo" }]);
  });

  it("normalizes reportsTo '' to null", () => {
    const r = parseAgentInput({ reportsTo: "" }, false);
    expect(r).toEqual({ ok: true, data: { reportsTo: null } });
  });
});
