import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getOrCreateDbUser } from "./server-auth";
import { prisma } from "./db";

// ---------------------------------------------------------------------------
// Admin access control + audit trail.
//
// Every /api/admin/* route MUST start with `requireAdmin(req)` and bail on the
// returned `error` response. Every privileged MUTATION should call `audit(...)`
// so the AdminAudit table (reference/sql-admin-audit.sql) records who did what,
// to whom, and what changed. Reads of another user's record are audited too
// (support-lookup accountability) — admins never get silent access.
// ---------------------------------------------------------------------------

type Ok = { admin: User; error?: undefined };
type Err = { admin?: undefined; error: NextResponse };

/** Resolve the caller and require the ADMIN role. Returns `{ admin }` or an
 *  `{ error }` NextResponse (401/403) the route should return as-is. */
export async function requireAdmin(req?: Request): Promise<Ok | Err> {
  const user = await getOrCreateDbUser(req);
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "ADMIN") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { admin: user };
}

/** Server-component variant: returns the admin User or null (for layout gates
 *  that redirect rather than return a JSON error). */
export async function getAdmin(): Promise<User | null> {
  const user = await getOrCreateDbUser();
  return user && user.role === "ADMIN" ? user : null;
}

/** Require ADMIN *and* membership of the agent-operator allow-list for the
 *  expensive/spend-causing agent actions (run, stream, schedule). The list is
 *  `AGENT_OPERATOR_EMAILS` (comma-separated) in the server env; if it's unset or
 *  empty, every admin is an operator (backward-compatible default). Wraps
 *  requireAdmin, so the admin gate still applies first. */
export async function requireAgentOperator(req?: Request): Promise<Ok | Err> {
  const gate = await requireAdmin(req);
  if (gate.error) return gate;
  const allow = (process.env.AGENT_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return gate; // no allow-list configured → all admins
  if (allow.includes(gate.admin.email.toLowerCase())) return gate;
  return { error: NextResponse.json({ error: "not an agent operator — ask an owner to add you to AGENT_OPERATOR_EMAILS" }, { status: 403 }) };
}

/** Best-effort request IP from the proxy headers Vercel sets. */
export function clientIp(req?: Request): string | null {
  if (!req) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export type AuditInput = {
  actor: User;
  action: string; // dotted verb, e.g. "user.role.update"
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: unknown;
  req?: Request;
};

/** Append one row to the admin audit trail. Best-effort: a logging failure
 *  (e.g. the table not yet created) must never break the underlying action,
 *  but it is surfaced to the server console so it can't pass silently. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.adminAudit.create({
      data: {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        summary: input.summary ?? null,
        metadata:
          input.metadata === undefined
            ? undefined
            : (input.metadata as Parameters<typeof prisma.adminAudit.create>[0]["data"]["metadata"]),
        ip: clientIp(input.req),
      },
    });
  } catch (e) {
    console.error("[admin audit] failed to record action", input.action, e);
  }
}
