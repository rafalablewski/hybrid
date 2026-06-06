import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { executeAgent } from "@/lib/agent-execute";
import { recordRun } from "@/lib/agent-runs";
import { rowToDefinition } from "../../shared";

// Execute an agent on a task (JSON, non-streaming — see /stream for live). Admin-
// only, heavily rate-limited (an LLM call; an executive fans out to its reports).
// The agent must be `active`. Without ANTHROPIC_API_KEY it returns an honest
// "unconfigured" note. Persists the run + audits.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-agent-run", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await readJsonLimited<{ task?: unknown }>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const task = typeof parsed.data.task === "string" ? parsed.data.task.trim() : "";
  if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });

  const row = await prisma.agentConfig.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const def = rowToDefinition(row);
  if (def.status !== "active")
    return NextResponse.json({ error: "agent is not active — activate it first" }, { status: 409 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      source: "unconfigured",
      output:
        "The agent runtime isn't configured. Set ANTHROPIC_API_KEY in the server environment to run agents (the same key the AI coach uses).",
      steps: [],
    });
  }

  let roster = [def];
  try {
    const rows = await prisma.agentConfig.findMany({ where: { status: "active" } });
    roster = rows.map(rowToDefinition);
  } catch {
    /* fall back to the single agent */
  }

  try {
    const result = await executeAgent({ apiKey, row, def, roster, task });
    await recordRun({ def, task, result, status: "ok", actor: gate.admin });
    await audit({
      actor: gate.admin,
      action: "agent.run",
      targetType: "agent",
      targetId: id,
      summary: `Ran ${def.name} (${def.role}, ${def.runtime})${result.steps.length ? ` · delegated to ${result.steps.length}` : ""}`,
      metadata: { task: task.slice(0, 200), runtime: def.runtime, delegations: result.steps.map((s) => s.role), usage: result.usage },
      req: request,
    });
    return NextResponse.json({ source: "ai", ...result });
  } catch (e) {
    console.error("[agent run] failed", e);
    await recordRun({ def, task, result: { output: "(run failed)", steps: [], usage: { input: 0, output: 0 } }, status: "error", actor: gate.admin });
    return NextResponse.json({ error: "agent run failed" }, { status: 502 });
  }
}
