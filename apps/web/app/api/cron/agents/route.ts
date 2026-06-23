import { NextResponse } from "next/server";
import { nextRunFrom } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { executeAgent } from "@/lib/agent-execute";
import { recordRun } from "@/lib/agent-runs";
import { partialFromError } from "@/lib/agent-runtime";
import { enforceBudget } from "@/lib/agent-policy";
import { rowToDefinition } from "../../admin/agents/shared";

// Scheduled-run worker. Hit by Vercel Cron (see apps/web/vercel.json) — NOT
// admin-gated; authenticated by CRON_SECRET (Vercel sends it as a Bearer token
// when the env var is set). Runs every enabled schedule that's due, on an active
// agent, rolling nextRunAt forward. Bounded per invocation to cap cost/latency.
const MAX_PER_RUN = 5;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ran: 0, reason: "ANTHROPIC_API_KEY not set" });

  const now = new Date();
  let due: Awaited<ReturnType<typeof prisma.agentSchedule.findMany>> = [];
  try {
    due = await prisma.agentSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: "asc" },
      take: MAX_PER_RUN,
    });
  } catch {
    return NextResponse.json({ ran: 0, reason: "AgentSchedule table missing" });
  }

  // Roster (active agents) for executive delegation, fetched once.
  const activeRows = await prisma.agentConfig.findMany({ where: { status: "active" } });
  const roster = activeRows.map(rowToDefinition);

  let ran = 0;
  for (const sched of due) {
    // CLAIM BEFORE RUNNING. Atomically roll nextRunAt forward, guarded on the
    // row still being due. Only the cron invocation that wins this race (count
    // 1) executes the schedule; an overlapping invocation (Vercel retry, manual
    // trigger, or a previous run that overran the interval) sees count 0 and
    // skips — so a scheduled agent never double-runs / double-spends. Advancing
    // up-front also gives at-most-once semantics (a crashed run rolls forward
    // rather than retrying), matching the prior "always roll forward" intent.
    const claim = await prisma.agentSchedule.updateMany({
      where: { id: sched.id, enabled: true, nextRunAt: { lte: now } },
      data: { lastRunAt: now, nextRunAt: nextRunFrom(sched.cadence, now) },
    });
    if (claim.count === 0) continue;

    const row = activeRows.find((a) => a.id === sched.agentId);
    if (!row) continue; // paused/missing agent — already advanced above
    const def = rowToDefinition(row);
    // Respect the 7-day budget: skip (and pause) an over-budget agent. Scheduled
    // runs are pre-authorized by the operator who created them, so they bypass the
    // approval gate — but never the budget cap.
    if (await enforceBudget(def)) continue;
    try {
      const result = await executeAgent({ apiKey, row, def, roster, task: sched.task });
      await recordRun({ def, task: sched.task, result, status: "ok" });
      await enforceBudget(def);
      ran++;
    } catch (e) {
      console.error("[cron agents] run failed for", sched.agentId, e);
      await recordRun({ def, task: sched.task, result: partialFromError(e), status: "error" });
    }
  }

  return NextResponse.json({ ran, due: due.length });
}
