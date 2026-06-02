import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { advanceRtp, evaluateRtp, type RtpStage } from "@hybrid/core";

// Mutate a protocol: toggle a gate, advance a stage, or abandon. The gate
// rails are enforced by the core engine — you can't advance past unmet gates.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const p = await prisma.rtpProtocol.findFirst({ where: { id, userId: user.id } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = (await request.json().catch(() => ({}))) as { action?: unknown; gate?: unknown };
  const completed = (p.completed as string[]) ?? [];
  const state = { stage: p.stage as RtpStage, completed };

  if (b.action === "toggleGate" && typeof b.gate === "string") {
    const next = completed.includes(b.gate) ? completed.filter((g) => g !== b.gate) : [...completed, b.gate];
    const updated = await prisma.rtpProtocol.update({ where: { id }, data: { completed: next } });
    return NextResponse.json({ protocol: updated, eval: evaluateRtp({ stage: state.stage, completed: next }) });
  }

  if (b.action === "advance") {
    const advanced = advanceRtp(state);
    if (advanced.stage === state.stage)
      return NextResponse.json({ error: "gates not met", eval: evaluateRtp(state) }, { status: 409 });
    const status = advanced.stage === "cleared" ? "cleared" : "active";
    const updated = await prisma.rtpProtocol.update({
      where: { id },
      data: { stage: advanced.stage, completed: advanced.completed, status },
    });
    return NextResponse.json({ protocol: updated, eval: evaluateRtp(advanced) });
  }

  if (b.action === "abandon") {
    const updated = await prisma.rtpProtocol.update({ where: { id }, data: { status: "abandoned" } });
    return NextResponse.json({ protocol: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
