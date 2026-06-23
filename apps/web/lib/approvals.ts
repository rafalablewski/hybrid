import { prisma } from "./db";
import { executeAgent } from "./agent-execute";
import { recordRun } from "./agent-runs";
import { enforceBudget } from "./agent-policy";
import { rowToDefinition } from "../app/api/admin/agents/shared";

// Shared approval-decision logic, used by the web Approvals UI and the Slack
// interactive callback. APPROVE executes the held run; DENY just records it.
export async function decideApproval(opts: {
  approvalId: string;
  decision: "approve" | "deny";
  decidedById: string | null;
  decidedByEmail: string;
  /** Enforce the two-person rule (a different operator than the requester).
   *  Web path: true (we know the operator's email). Slack path: false (Slack
   *  identity isn't mapped to operators). */
  enforceTwoPerson: boolean;
}): Promise<{ ok: boolean; status?: "approved" | "denied"; error?: string; output?: string; agentName?: string }> {
  const ap = await prisma.agentApproval.findUnique({ where: { id: opts.approvalId } });
  if (!ap) return { ok: false, error: "not found" };
  if (ap.status !== "pending") return { ok: false, error: "already decided", agentName: ap.agentName };

  const decidedAt = new Date();

  if (opts.decision === "deny") {
    // Atomic claim: only the first decider flips pending→denied. A concurrent
    // approve/deny on the same row sees count 0 and bails.
    const claim = await prisma.agentApproval.updateMany({
      where: { id: ap.id, status: "pending" },
      data: { status: "denied", decidedById: opts.decidedById, decidedByEmail: opts.decidedByEmail, decidedAt },
    });
    if (claim.count === 0) return { ok: false, error: "already decided", agentName: ap.agentName };
    return { ok: true, status: "denied", agentName: ap.agentName };
  }

  if (opts.enforceTwoPerson && ap.requestedByEmail && ap.requestedByEmail.toLowerCase() === opts.decidedByEmail.toLowerCase())
    return { ok: false, error: "a different operator must approve this run", agentName: ap.agentName };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set", agentName: ap.agentName };

  const row = await prisma.agentConfig.findUnique({ where: { id: ap.agentId } });
  if (!row) return { ok: false, error: "agent no longer exists", agentName: ap.agentName };
  const def = rowToDefinition(row);

  if (await enforceBudget(def)) return { ok: false, error: "agent is over its 7-day budget and has been paused", agentName: ap.agentName };

  // CLAIM BEFORE SPENDING. Atomically move the row out of `pending` into a
  // transient `approving` state. Only the winner of this race executes the
  // (expensive, multi-second) agent run, so two operators approving the same
  // held run can never double-spend or defeat the two-person control. The
  // pending-inbox query filters on status, so the row also leaves the inbox.
  const claim = await prisma.agentApproval.updateMany({
    where: { id: ap.id, status: "pending" },
    data: { status: "approving", decidedById: opts.decidedById, decidedByEmail: opts.decidedByEmail, decidedAt },
  });
  if (claim.count === 0) return { ok: false, error: "already decided", agentName: ap.agentName };

  let roster = [def];
  try {
    const rows = await prisma.agentConfig.findMany({ where: { status: "active" } });
    roster = rows.map(rowToDefinition);
  } catch {
    /* fall back */
  }

  try {
    const result = await executeAgent({ apiKey, row, def, roster, task: ap.task });
    await recordRun({ def, task: ap.task, result, status: "ok", actor: { id: opts.decidedById ?? "approver", email: opts.decidedByEmail } });
    await enforceBudget(def);
    await prisma.agentApproval.update({
      where: { id: ap.id },
      data: { status: "approved", decidedAt: new Date(), runId: null },
    });
    return { ok: true, status: "approved", output: result.output, agentName: ap.agentName };
  } catch (e) {
    console.error("[approval] run failed", e);
    await recordRun({ def, task: ap.task, result: { output: "(run failed)", steps: [], usage: { input: 0, output: 0 } }, status: "error", actor: { id: opts.decidedById ?? "approver", email: opts.decidedByEmail } });
    // Release the claim back to `pending` so the run can be retried (matching
    // the prior retryable-on-failure behaviour), without a stuck `approving` row.
    await prisma.agentApproval.updateMany({
      where: { id: ap.id, status: "approving" },
      data: { status: "pending", decidedById: null, decidedByEmail: null, decidedAt: null },
    });
    return { ok: false, error: "approved run failed", agentName: ap.agentName };
  }
}
