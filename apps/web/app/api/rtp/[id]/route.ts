import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { advanceRtp, evaluateRtp, nextStage, type RtpStage } from "@hybrid/core";

type AuditEntry = { action: string; by: string; role: string; ts: string; from?: string; to?: string; gate?: string; done?: boolean; reason?: string };

// Mutate a protocol: toggle a gate, advance a stage, override past unmet gates
// (with a reason), or abandon. Every action is appended to an immutable audit
// log — who attested each criterion, who advanced, who overrode and why.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const p = await prisma.rtpProtocol.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The athlete or their active coach may act on the protocol (so coach
  // sign-offs + overrides actually work). The org medical/director staff path
  // went with the Org Graph in the 2026-08 strategy cuts.
  if (p.userId !== user.id) {
    const coachLink = await prisma.coachLink.findFirst({
      where: { coachId: user.id, clientId: p.userId, status: "ACTIVE" },
    });
    if (!coachLink) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = (await request.json().catch(() => ({}))) as { action?: unknown; gate?: unknown; reason?: unknown };
  const completed = (p.completed as string[]) ?? [];
  const audit = (p.audit as AuditEntry[]) ?? [];
  const state = { stage: p.stage as RtpStage, completed };
  const by = user.name ?? user.email ?? "User";
  const log = (e: Omit<AuditEntry, "by" | "role" | "ts">): AuditEntry[] => [
    ...audit,
    { ...e, by, role: user.role, ts: new Date().toISOString() },
  ];

  if (b.action === "toggleGate" && typeof b.gate === "string") {
    const done = !completed.includes(b.gate);
    const next = done ? [...completed, b.gate] : completed.filter((g) => g !== b.gate);
    const updated = await prisma.rtpProtocol.update({
      where: { id },
      data: { completed: next, audit: log({ action: done ? "attest" : "retract", gate: b.gate, done }) },
    });
    return NextResponse.json({ protocol: updated, eval: evaluateRtp({ stage: state.stage, completed: next }) });
  }

  if (b.action === "advance") {
    const advanced = advanceRtp(state);
    if (advanced.stage === state.stage)
      return NextResponse.json({ error: "gates not met", eval: evaluateRtp(state) }, { status: 409 });
    const status = advanced.stage === "cleared" ? "cleared" : "active";
    const updated = await prisma.rtpProtocol.update({
      where: { id },
      data: { stage: advanced.stage, completed: advanced.completed, status, audit: log({ action: "advance", from: state.stage, to: advanced.stage }) },
    });
    return NextResponse.json({ protocol: updated, eval: evaluateRtp(advanced) });
  }

  // Force-advance past unmet gates — requires a logged reason (auditable).
  if (b.action === "override") {
    const to = nextStage(state.stage);
    if (!to) return NextResponse.json({ error: "already cleared" }, { status: 409 });
    if (typeof b.reason !== "string" || !b.reason.trim())
      return NextResponse.json({ error: "override requires a reason" }, { status: 400 });
    const status = to === "cleared" ? "cleared" : "active";
    const updated = await prisma.rtpProtocol.update({
      where: { id },
      data: { stage: to, completed: [], status, audit: log({ action: "override", from: state.stage, to, reason: b.reason.trim() }) },
    });
    return NextResponse.json({ protocol: updated, eval: evaluateRtp({ stage: to, completed: [] }) });
  }

  if (b.action === "abandon") {
    const updated = await prisma.rtpProtocol.update({ where: { id }, data: { status: "abandoned", audit: log({ action: "abandon" }) } });
    return NextResponse.json({ protocol: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
