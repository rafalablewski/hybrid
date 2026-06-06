import { costUsd, summarizeRuns, digestText, type DigestSummary } from "@hybrid/core";
import { prisma } from "./db";

// Build the agent run digest over a time window (default 24h): pull recent runs,
// cost them at each agent's model, and roll up via the pure core helpers.
export async function buildDigest(windowMs = 86_400_000): Promise<{ text: string; summary: DigestSummary; label: string }> {
  const since = new Date(Date.now() - windowMs);
  let runs: { agentName: string; status: string; cost: number; task: string }[] = [];
  try {
    const rows = await prisma.agentRun.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1000 });
    const agents = await prisma.agentConfig.findMany({ select: { id: true, model: true } });
    const modelOf = new Map(agents.map((a) => [a.id, a.model]));
    runs = rows.map((r) => ({
      agentName: r.agentName,
      status: r.status,
      task: r.task,
      cost: costUsd(modelOf.get(r.agentId) ?? "claude-opus-4-8", r.inputTokens, r.outputTokens),
    }));
  } catch {
    /* tables not migrated yet → empty digest */
  }
  const label = "last 24h";
  const summary = summarizeRuns(runs);
  return { text: digestText(summary, label), summary, label };
}
