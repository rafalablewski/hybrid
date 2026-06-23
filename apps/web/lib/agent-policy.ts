import { costUsd, estimateRunCost, type AgentDefinition } from "@hybrid/core";
import { prisma } from "./db";

// Spend controls for agent runs: per-agent 7-day budget caps (auto-pause) and the
// estimated-cost approval gate. All best-effort — a missing table never blocks.

/** Cost of an agent's recent runs (newest first), for the approval estimate. */
async function recentRunCosts(agentId: string, model: string, n = 10): Promise<number[]> {
  try {
    const rows = await prisma.agentRun.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: n,
      select: { inputTokens: true, outputTokens: true },
    });
    return rows.map((r) => costUsd(model, r.inputTokens, r.outputTokens));
  } catch {
    return [];
  }
}

/** Trailing-7-day spend for an agent (USD). */
export async function spend7d(agentId: string, model: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows = await prisma.agentRun.findMany({
      where: { agentId, createdAt: { gte: since } },
      select: { inputTokens: true, outputTokens: true },
    });
    return rows.reduce((n, r) => n + costUsd(model, r.inputTokens, r.outputTokens), 0);
  } catch {
    return 0;
  }
}

/** If the agent has a 7-day budget and it's now reached, pause it + notify.
 *  Returns true when the agent is (or just became) over budget.
 *
 *  The pause is an ATOMIC conditional update (only flips a still-active agent),
 *  and the "budget exceeded" notification is created ONLY by the call that
 *  actually performed the flip — so two concurrent over-budget runs can't double-
 *  pause or spam duplicate alerts. (Full prevention of two runs each reading
 *  under-budget before either records its cost needs a row reservation; the cron
 *  worker runs agents sequentially, so the practical window is the rare
 *  simultaneous manual trigger.) */
export async function enforceBudget(def: AgentDefinition): Promise<boolean> {
  if (!def.budgetUsd7d || def.budgetUsd7d <= 0) return false;
  const spent = await spend7d(def.id, def.model);
  if (spent < def.budgetUsd7d) return false;
  try {
    // updateMany is a single atomic WHERE status != paused → 0 rows if another
    // concurrent call already paused it.
    const flipped = await prisma.agentConfig.updateMany({
      where: { id: def.id, status: { not: "paused" } },
      data: { status: "paused" },
    });
    if (flipped.count > 0) {
      await prisma.agentNotification.create({
        data: {
          kind: "budget_exceeded",
          agentId: def.id,
          agentName: def.name,
          title: `${def.name} paused — 7-day budget reached`,
          body: `Spent $${spent.toFixed(2)} of the $${def.budgetUsd7d.toFixed(2)} weekly cap.`,
          severity: "error",
        },
      });
    }
  } catch (e) {
    console.error("[budget] enforce failed for", def.id, e);
  }
  return true;
}

/** Whether a run needs a second operator's approval: a threshold is set AND the
 *  estimated cost meets it (or there's no history to estimate from → be safe). */
export async function needsApproval(def: AgentDefinition): Promise<{ required: boolean; estimate: number | null }> {
  if (!def.approvalThresholdUsd || def.approvalThresholdUsd <= 0) return { required: false, estimate: null };
  const est = estimateRunCost(await recentRunCosts(def.id, def.model));
  if (est == null) return { required: true, estimate: null };
  return { required: est >= def.approvalThresholdUsd, estimate: est };
}
