import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { executeAgent } from "@/lib/agent-execute";
import { recordRun } from "@/lib/agent-runs";
import type { RunEvent, RunResult } from "@/lib/agent-runtime";
import { rowToDefinition } from "../../shared";

// Streaming variant of /run: forwards live progress (text deltas + delegation
// boundaries) to the browser as Server-Sent Events, then a final `done`/`error`
// frame. Same gates as /run (admin, rate limit, active, audited, persisted).
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent | { type: "done"; result: RunResult } | { type: "error"; message: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      if (!apiKey) {
        send({
          type: "error",
          message:
            "The agent runtime isn't configured. Set ANTHROPIC_API_KEY in the server environment to run agents.",
        });
        controller.close();
        return;
      }

      let roster = [def];
      try {
        const rows = await prisma.agentConfig.findMany({ where: { status: "active" } });
        roster = rows.map(rowToDefinition);
      } catch {
        /* fall back to the single agent */
      }

      try {
        const result = await executeAgent({ apiKey, row, def, roster, task, onEvent: (e) => send(e) });
        await recordRun({ def, task, result, status: "ok", actor: gate.admin });
        await audit({
          actor: gate.admin,
          action: "agent.run",
          targetType: "agent",
          targetId: id,
          summary: `Ran ${def.name} (${def.role}, ${def.runtime}, streamed)${result.steps.length ? ` · delegated to ${result.steps.length}` : ""}`,
          metadata: { task: task.slice(0, 200), runtime: def.runtime, delegations: result.steps.map((s) => s.role), usage: result.usage },
          req: request,
        });
        send({ type: "done", result });
      } catch (e) {
        console.error("[agent stream] failed", e);
        await recordRun({ def, task, result: { output: "(run failed)", steps: [], usage: { input: 0, output: 0 } }, status: "error", actor: gate.admin });
        send({ type: "error", message: "agent run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
