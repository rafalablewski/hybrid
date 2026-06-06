import type { AgentConfig } from "@prisma/client";
import type { AgentDefinition } from "@hybrid/core";
import { runAgent, type RunResult, type OnEvent } from "./agent-runtime";
import { runManagedAgent } from "./managed-runtime";
import { persistManagedIds } from "./agent-runs";

// Dispatch a run to the right runtime: `messages` (stateless, with delegation)
// or `managed` (durable memory). For the managed path, the lazily-created agent +
// memory-store ids are persisted back so the next run reuses them.
export async function executeAgent(opts: {
  apiKey: string;
  row: AgentConfig;
  def: AgentDefinition;
  roster: AgentDefinition[];
  task: string;
  onEvent?: OnEvent;
}): Promise<RunResult> {
  if (opts.def.runtime === "managed") {
    const out = await runManagedAgent({
      apiKey: opts.apiKey,
      def: opts.def,
      task: opts.task,
      managedAgentId: opts.row.managedAgentId,
      memoryStoreId: opts.row.memoryStoreId,
      onEvent: opts.onEvent,
    });
    if (out.managedAgentId !== opts.row.managedAgentId || out.memoryStoreId !== opts.row.memoryStoreId) {
      await persistManagedIds(opts.def.id, out.managedAgentId, out.memoryStoreId);
    }
    return out.result;
  }
  return runAgent({ apiKey: opts.apiKey, def: opts.def, roster: opts.roster, task: opts.task, onEvent: opts.onEvent });
}
