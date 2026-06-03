import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

// Account reset — wipe ALL of the signed-in user's data while keeping their
// login. Everything here is scoped to the authenticated user's id; we never
// touch another user's rows. Irreversible by design (the client double-confirms).
//
// POST /api/account/reset   body: { confirm: "RESET" }
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Require an explicit confirmation token so a stray call can't nuke an account.
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

  // Coaching notes reference a CoachLink, so collect the user's links first and
  // delete the notes before the links.
  const links = await prisma.coachLink.findMany({
    where: { OR: [{ coachId: id }, { clientId: id }] },
    select: { id: true },
  });
  const linkIds = links.map((l) => l.id);

  // One transaction so a reset is all-or-nothing.
  const results = await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.macrocycle.deleteMany({ where: { userId: id } }),
    prisma.biometric.deleteMany({ where: { userId: id } }),
    prisma.signal.deleteMany({ where: { userId: id } }),
    prisma.checkin.deleteMany({ where: { userId: id } }),
    prisma.rtpProtocol.deleteMany({ where: { userId: id } }),
    prisma.videoAnalysis.deleteMany({ where: { userId: id } }),
    prisma.event.deleteMany({ where: { userId: id } }),
    prisma.riskOutcome.deleteMany({ where: { userId: id } }),
    prisma.talentProfile.deleteMany({ where: { userId: id } }),
    prisma.connection.deleteMany({ where: { userId: id } }), // connected devices / wearables
    prisma.membership.deleteMany({ where: { userId: id } }),
    prisma.workoutTemplate.deleteMany({ where: { ownerId: id } }),
    prisma.assignment.deleteMany({ where: { OR: [{ athleteId: id }, { assignedById: id }] } }),
    prisma.coachNote.deleteMany({ where: { linkId: { in: linkIds } } }),
    prisma.coachLink.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }),
  ]);

  const deleted = results.reduce((sum, r) => sum + r.count, 0);

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

  return NextResponse.json({ ok: true, deleted, photos });
}
