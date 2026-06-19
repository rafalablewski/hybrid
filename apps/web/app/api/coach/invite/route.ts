import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Coach-led onboarding of a brand-new client. ONE CoachInvite backs all three
// delivery methods (QR code, copyable link, and — later — email/SMS); the client
// claims it on first sign-up, creating an ACTIVE CoachLink (claim = consent).
// Soft-degrades to "not enabled yet" until reference/sql-coach-invites.sql runs.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010"; // table does not exist
};

// Until coach-seat billing tiers are wired, cap live invites + ACTIVE clients at
// the largest tier (Business = 150) as a guardrail. TODO: read the coach's real
// tier once coach billing lands, and enforce 10 / 40 / 150.
const MAX_ROSTER = 150;
const INVITE_TTL_DAYS = 30;

function inviteUrl(request: Request, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "COACH" && me.role !== "ADMIN")
    return NextResponse.json({ error: "coach only" }, { status: 403 });
  try {
    const invites = await prisma.coachInvite.findMany({
      where: { coachId: me.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      invites: invites.map((i) => ({
        id: i.id,
        token: i.token,
        email: i.email,
        phone: i.phone,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        url: inviteUrl(request, i.token),
      })),
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ invites: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "COACH" && me.role !== "ADMIN")
    return NextResponse.json({ error: "coach only" }, { status: 403 });

  const { data: b, error } = await readJsonLimited<{ email?: unknown; phone?: unknown }>(request, 4 * 1024);
  if (error) return error;
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim().toLowerCase().slice(0, 200) : null;
  const phone = typeof b.phone === "string" && b.phone.trim() ? b.phone.trim().slice(0, 40) : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });

  try {
    // Roster guardrail: ACTIVE clients + still-open invites.
    const [active, pending] = await Promise.all([
      prisma.coachLink.count({ where: { coachId: me.id, status: "ACTIVE" } }),
      prisma.coachInvite.count({ where: { coachId: me.id, status: "PENDING" } }),
    ]);
    if (active + pending >= MAX_ROSTER)
      return NextResponse.json({ error: `Roster limit reached (${MAX_ROSTER}).` }, { status: 409 });

    // If the email already belongs to a HYBRID user, use the existing-user link
    // path (a PENDING link they accept) instead of a pre-account invite.
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (existing.id === me.id)
          return NextResponse.json({ error: "You can't coach yourself." }, { status: 400 });
        try {
          await prisma.coachLink.create({ data: { coachId: me.id, clientId: existing.id, status: "PENDING" } });
        } catch {
          // unique [coachId, clientId] — link already exists; fine.
        }
        return NextResponse.json(
          { existingUser: true, message: "They're already on HYBRID — sent them a link request to accept." },
          { status: 201 },
        );
      }
    }

    const token = randomBytes(18).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
    const invite = await prisma.coachInvite.create({ data: { coachId: me.id, token, email, phone, expiresAt } });
    return NextResponse.json(
      { invite: { id: invite.id, token, email, phone, expiresAt }, url: inviteUrl(request, token) },
      { status: 201 },
    );
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json(
        { error: "Invites aren't enabled yet — run reference/sql-coach-invites.sql." },
        { status: 503 },
      );
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
