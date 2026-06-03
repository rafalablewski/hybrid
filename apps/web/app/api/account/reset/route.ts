import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

// Account reset — wipe ALL of the signed-in user's data while keeping their
// login. Everything here is scoped to the authenticated user's id; we never
// touch another user's rows. Irreversible by design (the client double-confirms).
//
// Best-effort by table: a deployment may not have every table from the schema
// (advanced features ship their own migrations the user may not have run), so
// each delete is isolated — a missing/failing table is skipped, never 500s the
// whole reset.
//
// POST /api/account/reset   body: { confirm: "RESET" }
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { confirm?: unknown } = {};
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    /* empty body → fail the confirm check below */
  }
  if (body.confirm !== "RESET") {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const id = user.id;
  let deleted = 0;
  const skipped: string[] = [];

  const wipe = async (label: string, run: () => Promise<{ count: number }>) => {
    try {
      const { count } = await run();
      deleted += count;
    } catch (err) {
      console.error(`[account/reset] skipped ${label}:`, err);
      skipped.push(label);
    }
  };

  // Coaching notes reference a CoachLink, so notes must go before links.
  let linkIds: string[] = [];
  try {
    const links = await prisma.coachLink.findMany({
      where: { OR: [{ coachId: id }, { clientId: id }] },
      select: { id: true },
    });
    linkIds = links.map((l) => l.id);
  } catch (err) {
    console.error("[account/reset] could not read coach links:", err);
  }

  await wipe("sessions", () => prisma.session.deleteMany({ where: { userId: id } }));
  await wipe("macrocycles", () => prisma.macrocycle.deleteMany({ where: { userId: id } }));
  await wipe("biometrics", () => prisma.biometric.deleteMany({ where: { userId: id } }));
  await wipe("signals", () => prisma.signal.deleteMany({ where: { userId: id } }));
  await wipe("checkins", () => prisma.checkin.deleteMany({ where: { userId: id } }));
  await wipe("rtpProtocols", () => prisma.rtpProtocol.deleteMany({ where: { userId: id } }));
  await wipe("videoAnalyses", () => prisma.videoAnalysis.deleteMany({ where: { userId: id } }));
  await wipe("events", () => prisma.event.deleteMany({ where: { userId: id } }));
  await wipe("riskOutcomes", () => prisma.riskOutcome.deleteMany({ where: { userId: id } }));
  await wipe("talentProfile", () => prisma.talentProfile.deleteMany({ where: { userId: id } }));
  await wipe("connections", () => prisma.connection.deleteMany({ where: { userId: id } }));
  await wipe("memberships", () => prisma.membership.deleteMany({ where: { userId: id } }));
  await wipe("templates", () => prisma.workoutTemplate.deleteMany({ where: { ownerId: id } }));
  await wipe("assignments", () =>
    prisma.assignment.deleteMany({ where: { OR: [{ athleteId: id }, { assignedById: id }] } }),
  );
  if (linkIds.length) {
    await wipe("coachNotes", () => prisma.coachNote.deleteMany({ where: { linkId: { in: linkIds } } }));
  }
  await wipe("coachLinks", () =>
    prisma.coachLink.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }),
  );

  // Best-effort: clear the user's progress-photo folder in Storage. Works for
  // web (cookie session); silently skipped where the server client isn't authed
  // (e.g. a mobile Bearer request) — the device can clear its own as a fallback.
  let photos = 0;
  try {
    if (user.authId) {
      const supabase = await createClient();
      const { data: files } = await supabase.storage.from("progress").list(user.authId);
      const paths = (files ?? []).map((f) => `${user.authId}/${f.name}`);
      if (paths.length) {
        await supabase.storage.from("progress").remove(paths);
        photos = paths.length;
      }
    }
  } catch {
    /* storage not reachable / not authed here — ignore */
  }

  return NextResponse.json({ ok: true, deleted, photos, skipped });
}
