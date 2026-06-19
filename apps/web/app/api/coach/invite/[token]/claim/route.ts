import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Claim a coach invite (signed-in client). The act of claiming IS the consent,
// so this creates/activates the CoachLink as ACTIVE directly. Single-use.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await params;
  try {
    const invite = await prisma.coachInvite.findUnique({ where: { token } });
    if (!invite || invite.status !== "PENDING")
      return NextResponse.json({ error: "This invite is no longer valid." }, { status: 410 });
    if (invite.expiresAt.getTime() < Date.now())
      return NextResponse.json({ error: "This invite has expired." }, { status: 410 });
    if (invite.coachId === me.id)
      return NextResponse.json({ error: "You can't coach yourself." }, { status: 400 });

    await prisma.$transaction([
      prisma.coachLink.upsert({
        where: { coachId_clientId: { coachId: invite.coachId, clientId: me.id } },
        update: { status: "ACTIVE" },
        create: { coachId: invite.coachId, clientId: me.id, status: "ACTIVE" },
      }),
      prisma.coachInvite.update({ where: { id: invite.id }, data: { status: "CLAIMED", claimedById: me.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Invites aren't enabled yet." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
