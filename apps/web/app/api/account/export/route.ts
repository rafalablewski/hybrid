import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Data export (GDPR "download my data"). Gathers everything tied to the
// signed-in user into one JSON document. Read-only and scoped to the caller's
// id — never another user's rows. Best-effort per table, mirroring the reset
// route: a deployment may not have every advanced-feature table, so a
// missing/failing table is recorded under `_skipped` rather than 500-ing.
//
// GET /api/account/export  → application/json (attachment)
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = user.id;
  const data: Record<string, unknown> = {};
  const skipped: string[] = [];

  const grab = async (label: string, run: () => Promise<unknown>) => {
    try {
      data[label] = await run();
    } catch (err) {
      console.error(`[account/export] skipped ${label}:`, err);
      skipped.push(label);
    }
  };

  await grab("sessions", () => prisma.session.findMany({ where: { userId: id }, orderBy: { startedAt: "desc" } }));
  await grab("signals", () => prisma.signal.findMany({ where: { userId: id } }));
  await grab("biometrics", () => prisma.biometric.findMany({ where: { userId: id } }));
  await grab("checkins", () => prisma.checkin.findMany({ where: { userId: id } }));
  await grab("macrocycles", () => prisma.macrocycle.findMany({ where: { userId: id } }));
  await grab("templates", () => prisma.workoutTemplate.findMany({ where: { ownerId: id } }));
  await grab("assignments", () => prisma.assignment.findMany({ where: { OR: [{ athleteId: id }, { assignedById: id }] } }));
  await grab("rtpProtocols", () => prisma.rtpProtocol.findMany({ where: { userId: id } }));
  // SECURITY: never serialize the OAuth access/refresh tokens into the export
  // (they'd leak live third-party credentials into a downloadable/emailed file,
  // plaintext when TOKEN_ENCRYPTION_KEY is unset). Select only non-secret fields.
  await grab("connections", () =>
    prisma.connection.findMany({
      where: { userId: id },
      select: {
        id: true,
        provider: true,
        status: true,
        scope: true,
        expiresAt: true,
        lastSyncAt: true,
        createdAt: true,
      },
    }),
  );
  await grab("coachLinks", () => prisma.coachLink.findMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }));

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name ?? null, email: user.email ?? null, role: user.role ?? null },
    data,
    _skipped: skipped,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="hybrid-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
