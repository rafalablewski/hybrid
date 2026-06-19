import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// GET: public-by-token lookup so the claim page can show "Coach X invited you".
// DELETE: the owning coach revokes a pending invite.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const invite = await prisma.coachInvite.findUnique({
      where: { token },
      include: { coach: { select: { name: true, email: true } } },
    });
    if (!invite) return NextResponse.json({ valid: false }, { status: 404 });
    const expired = invite.expiresAt.getTime() < Date.now();
    return NextResponse.json({
      valid: invite.status === "PENDING" && !expired,
      status: invite.status,
      expired,
      coachName: invite.coach?.name || invite.coach?.email || "Your coach",
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ valid: false, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await params;
  try {
    const invite = await prisma.coachInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (invite.coachId !== me.id && me.role !== "ADMIN")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.coachInvite.update({ where: { token }, data: { status: "REVOKED" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not enabled yet" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
