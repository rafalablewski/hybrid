import type { AgentDefinition } from "@hybrid/core";
import { prisma } from "./db";
import type { RunResult } from "./agent-runtime";

// Best-effort persistence of agent runs (the transcript / history). A logging
// failure (e.g. the AgentRun table not yet created) must never break the run —
// it's surfaced to the server console, like the admin audit trail.

export async function recordRun(input: {
  def: AgentDefinition;
  task: string;
  result: RunResult;
  status: "ok" | "error";
  /** Who triggered it; omit for machine (scheduled) runs. */
  actor?: { id: string; email: string };
}): Promise<void> {
  try {
    await prisma.agentRun.create({
      data: {
        agentId: input.def.id,
        agentRole: input.def.role,
        agentName: input.def.name,
        task: input.task.slice(0, 4000),
        output: input.result.output.slice(0, 20000),
        steps: input.result.steps as never,
        inputTokens: input.result.usage.input,
        outputTokens: input.result.usage.output,
        status: input.status,
        runtime: input.def.runtime,
        ranById: input.actor?.id ?? null,
        ranByEmail: input.actor?.email ?? "scheduler",
      },
    });
  } catch (e) {
    console.error("[agent run] failed to record run for", input.def.id, e);
  }

  // Persistent inbox notification on failure (best-effort, independent of the
  // run write above so one failing doesn't lose the other).
  if (input.status === "error") {
    try {
      await prisma.agentNotification.create({
        data: {
          kind: "run_failed",
          agentId: input.def.id,
          agentName: input.def.name,
          title: `${input.def.name} run failed`,
          body: input.task.slice(0, 300),
          severity: "error",
        },
      });
    } catch (e) {
      console.error("[agent run] failed to record notification for", input.def.id, e);
    }
  }
}

/** Persist the lazily-created Managed Agents ids back onto the agent so the next
 *  run reuses the same agent + memory store (durable memory). Best-effort. */
export async function persistManagedIds(agentId: string, managedAgentId: string, memoryStoreId: string): Promise<void> {
  try {
    await prisma.agentConfig.update({ where: { id: agentId }, data: { managedAgentId, memoryStoreId } });
  } catch (e) {
    console.error("[agent run] failed to persist managed ids for", agentId, e);
  }
}
