import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  coordinatedAgents,
  delegateToolName,
  resolveEffort,
  type AgentDefinition,
} from "@hybrid/core";

// The Messages-API agent runtime. Runs an agent on a task using its dynamically
// generated system prompt. An EXECUTIVE with a roster runs an agentic loop: its
// reports are exposed as `delegate_to_<role>` tools, and when it delegates this
// orchestrator runs that functional agent (its own prompt/model) and feeds the
// result back — a real coordinator→functional hierarchy on plain tool use.
//
// Streams progress via the optional `onEvent` callback (text deltas + delegation
// boundaries); callers that don't stream just await the returned RunResult.
// (The `managed` runtime — see managed-runtime.ts — is the durable-memory path.)

const MAX_TOKENS = 8000;
const MAX_DELEGATION_TURNS = 4; // bound latency + cost for an admin-triggered run

export type RunStep = { agent: string; role: string; task: string; output: string };
export type RunResult = { output: string; steps: RunStep[]; usage: { input: number; output: number } };

/** Live progress events. The route forwards these to the browser over SSE. */
export type RunEvent =
  | { type: "status"; message: string }
  | { type: "text"; delta: string }
  | { type: "delegate_start"; role: string; agent: string; task: string }
  | { type: "delegate_end"; role: string; agent: string; output: string };

export type OnEvent = (e: RunEvent) => void;

function textOf(msg: Anthropic.Message): string {
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

function baseParams(def: AgentDefinition, system: string) {
  const effort = resolveEffort(def.model, def.effort);
  return {
    model: def.model,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" as const },
    ...(effort ? { output_config: { effort } } : {}),
    system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
  };
}

/** Stream one message, forwarding text deltas, and return the assembled Message. */
async function streamMessage(
  client: Anthropic,
  params: Anthropic.MessageStreamParams,
  onText?: (t: string) => void,
): Promise<Anthropic.Message> {
  const stream = client.messages.stream(params);
  if (onText) stream.on("text", onText);
  return stream.finalMessage();
}

/** One-shot run of a functional agent (no delegation). */
async function runFunctional(
  client: Anthropic,
  def: AgentDefinition,
  task: string,
  onText?: (t: string) => void,
): Promise<{ output: string; usage: { input: number; output: number } }> {
  const msg = await streamMessage(
    client,
    { ...baseParams(def, buildSystemPrompt(def)), messages: [{ role: "user", content: task }] },
    onText,
  );
  return { output: textOf(msg), usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

/** Coordinator run: delegate to reports via tools, looping until the executive
 *  stops calling tools or the turn budget is exhausted. */
async function runExecutive(
  client: Anthropic,
  def: AgentDefinition,
  roster: AgentDefinition[],
  task: string,
  onEvent?: OnEvent,
): Promise<RunResult> {
  const steps: RunStep[] = [];
  let inTok = 0;
  let outTok = 0;

  const tools: Anthropic.Tool[] = roster.map((r) => ({
    name: delegateToolName(r.role),
    description: `Delegate a task to ${r.name} (${r.role}). ${r.mandate} Call this when the work falls in their domain; pass a clear, self-contained task.`,
    input_schema: {
      type: "object",
      properties: { task: { type: "string", description: "The specific, self-contained task or question for this executive." } },
      required: ["task"],
    },
  }));
  const byTool = new Map(roster.map((r) => [delegateToolName(r.role), r]));

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  let final = "";

  for (let turn = 0; turn < MAX_DELEGATION_TURNS; turn++) {
    const resp = await streamMessage(client, { ...baseParams(def, buildSystemPrompt(def)), messages, tools }, (t) =>
      onEvent?.({ type: "text", delta: t }),
    );
    inTok += resp.usage.input_tokens;
    outTok += resp.usage.output_tokens;
    const text = textOf(resp);
    if (text) final = text;

    if (resp.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: resp.content }); // preserve thinking + tool_use blocks

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const sub = byTool.get(tu.name);
      const subTask =
        tu.input && typeof (tu.input as { task?: unknown }).task === "string"
          ? (tu.input as { task: string }).task
          : JSON.stringify(tu.input);
      if (!sub) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown delegate.", is_error: true });
        continue;
      }
      onEvent?.({ type: "delegate_start", role: sub.role, agent: sub.name, task: subTask });
      const r = await runFunctional(client, sub, subTask);
      inTok += r.usage.input;
      outTok += r.usage.output;
      steps.push({ agent: sub.name, role: sub.role, task: subTask, output: r.output });
      onEvent?.({ type: "delegate_end", role: sub.role, agent: sub.name, output: r.output });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r.output || "(no output)" });
    }
    messages.push({ role: "user", content: results });
  }

  return { output: final, steps, usage: { input: inTok, output: outTok } };
}

/** Run an agent on a task via the Messages API. Coordinates its reports when
 *  it's an executive with an active roster; otherwise runs it directly. */
export async function runAgent(opts: {
  apiKey: string;
  def: AgentDefinition;
  roster: AgentDefinition[];
  task: string;
  onEvent?: OnEvent;
}): Promise<RunResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const reports = coordinatedAgents(opts.def, opts.roster);
  if (opts.def.authority === "executive" && reports.length > 0) {
    opts.onEvent?.({ type: "status", message: `${opts.def.role} coordinating ${reports.length} report(s)…` });
    return runExecutive(client, opts.def, reports, opts.task, opts.onEvent);
  }
  opts.onEvent?.({ type: "status", message: `${opts.def.role} working…` });
  const r = await runFunctional(client, opts.def, opts.task, (t) => opts.onEvent?.({ type: "text", delta: t }));
  return { output: r.output, steps: [], usage: r.usage };
}
