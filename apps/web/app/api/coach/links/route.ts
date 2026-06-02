import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The coach↔client relationship. Inviting someone makes YOU their coach and them
// your client (a PENDING link); they accept to make it ACTIVE. Mutual consent.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [asCoach, asClient] = await Promise.all([
    prisma.coachLink.findMany({
      where: { coachId: me.id },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true, email: true } } },
    }),
    prisma.coachLink.findMany({
      where: { clientId: me.id },
      orderBy: { createdAt: "desc" },
      include: { coach: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return NextResponse.json({
    asCoach: asCoach.map((l) => ({ id: l.id, status: l.status, client: l.client })),
    asClient: asClient.map((l) => ({ id: l.id, status: l.status, coach: l.coach })),
  });
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!target) {
    return NextResponse.json(
      { error: "No HYBRID user with that email (they must sign in once first)." },
      { status: 404 },
    );
  }
  if (target.id === me.id) {
    return NextResponse.json({ error: "You can't coach yourself." }, { status: 400 });
  }

  try {
    const link = await prisma.coachLink.create({
      data: { coachId: me.id, clientId: target.id, status: "PENDING" },
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch {
    // unique [coachId, clientId] — link already exists
    return NextResponse.json({ error: "You already have a link with this athlete." }, { status: 409 });
  }
}
