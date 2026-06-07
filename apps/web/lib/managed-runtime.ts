import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type AgentDefinition } from "@hybrid/core";
import type { RunResult, OnEvent } from "./agent-runtime";

// The Managed Agents runtime — the DURABLE-MEMORY path. Unlike the stateless
// Messages runtime, the agent runs inside a Claude Managed Agents session with a
// MEMORY STORE mounted, so it remembers across runs. The agent + memory store are
// created lazily and their ids returned so the caller can persist + reuse them
// (Agent-once → Session-every-run, the mandated flow).
//
// Can't be exercised from the sandbox (needs ANTHROPIC_API_KEY + the managed-
// agents beta + network), but it's wired to the SDK's typed beta surface.

const BUILTIN_TOOLS = new Set(["web_search", "web_fetch", "code_execution", "filesystem"]);
const ENV_NAME = "hybrid-agents";
const POLL_GUARD_MS = 120_000; // hard wall-clock cap on a single session

export type ManagedRunResult = {
  result: RunResult;
  managedAgentId: string;
  memoryStoreId: string;
};

/** Find the shared cloud environment or create it (reused across all agents). */
async function ensureEnvironment(client: Anthropic): Promise<string> {
  for await (const env of client.beta.environments.list()) {
    if (env.name === ENV_NAME) return env.id;
  }
  const created = await client.beta.environments.create({
    name: ENV_NAME,
    config: { type: "cloud", networking: { type: "unrestricted" } },
  });
  return created.id;
}

/** Ensure the durable memory store exists; returns its id. */
async function ensureMemoryStore(client: Anthropic, def: AgentDefinition, existing: string | null): Promise<string> {
  if (existing) return existing;
  const store = await client.beta.memoryStores.create({
    name: `${def.role} memory`,
    description: `Durable memory for ${def.name} (${def.role}): decisions, context, and prior work to carry across runs.`,
  });
  return store.id;
}

/** Ensure the Managed Agent exists; returns its id. Created from the same prompt
 *  the Messages runtime uses, so behavior matches. */
async function ensureAgent(client: Anthropic, def: AgentDefinition, existing: string | null): Promise<string> {
  if (existing) return existing;
  const tools = def.tools.some((t) => BUILTIN_TOOLS.has(t))
    ? [{ type: "agent_toolset_20260401" as const }]
    : [];
  const agent = await client.beta.agents.create({
    name: def.name || def.role,
    model: def.model,
    system: buildSystemPrompt(def),
    tools,
    metadata: { role: def.role, authority: def.authority },
  });
  return agent.id;
}

/**
 * Run an agent on a task inside a Managed Agents session with durable memory.
 * Returns the output plus the (possibly newly-created) agent + memory-store ids
 * so the caller can persist them for reuse.
 */
export async function runManagedAgent(opts: {
  apiKey: string;
  def: AgentDefinition;
  task: string;
  managedAgentId: string | null;
  memoryStoreId: string | null;
  onEvent?: OnEvent;
}): Promise<ManagedRunResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const { def, onEvent } = opts;

  onEvent?.({ type: "status", message: "Provisioning durable memory…" });
  const memoryStoreId = await ensureMemoryStore(client, def, opts.memoryStoreId);
  const managedAgentId = await ensureAgent(client, def, opts.managedAgentId);
  const environmentId = await ensureEnvironment(client);

  onEvent?.({ type: "status", message: "Starting session…" });
  const session = await client.beta.sessions.create({
    agent: managedAgentId,
    environment_id: environmentId,
    title: `${def.role}: ${opts.task.slice(0, 60)}`,
    resources: [
      {
        type: "memory_store",
        memory_store_id: memoryStoreId,
        access: "read_write",
        instructions: "Your durable memory. Check it before starting, and record decisions + context as you go.",
      },
    ],
  });

  // Stream-first: open the stream, then send the task.
  const stream = await client.beta.sessions.events.stream(session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: opts.task }] }],
  });

  let output = "";
  let inTok = 0;
  let outTok = 0;
  const deadline = Date.now() + POLL_GUARD_MS;

  for await (const ev of stream) {
    if (Date.now() > deadline) break;
    if (ev.type === "agent.message") {
      const text = ev.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      if (text) {
        output += output ? `\n${text}` : text;
        onEvent?.({ type: "text", delta: text });
      }
    } else if (ev.type === "span.model_request_end") {
      inTok += ev.model_usage.input_tokens;
      outTok += ev.model_usage.output_tokens;
    } else if (ev.type === "session.status_terminated") {
      break;
    } else if (ev.type === "session.status_idle") {
      // Terminal unless the agent is blocked waiting on us (it isn't — no custom
      // tools / always_ask here), so any idle that isn't requires_action ends it.
      if (ev.stop_reason.type !== "requires_action") break;
    }
  }

  return {
    result: { output: output.trim(), steps: [], usage: { input: inTok, output: outTok } },
    managedAgentId,
    memoryStoreId,
  };
}
