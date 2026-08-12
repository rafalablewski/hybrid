import { prisma } from "./db";
import { createAdminClient } from "./supabase/admin";

export type WipeResult = { deleted: number; skipped: string[] };

/**
 * Delete EVERY row of application data owned by, authored by, or about a user.
 *
 * This is the SINGLE source of truth for account data removal, shared by:
 *   - POST   /api/account/reset          (wipes data, KEEPS the User + login)
 *   - DELETE /api/account                (self-serve account deletion)
 *   - DELETE /api/admin/users/[id]       (admin-initiated deletion)
 * so the three can never drift and leave a table behind (the bug that let a
 * "reset"/delete keep the private journal, body metrics, and social graph, and
 * made the final User delete throw an FK violation on a RESTRICT constraint).
 *
 * Best-effort by table: a deployment may not have run every feature migration,
 * so a missing/failing table is recorded in `skipped`, never aborts the wipe.
 * Ordering: child rows before the rows they reference (CoachNote → CoachLink);
 * every other table references User directly and is order-independent.
 *
 * Does NOT delete the User row or the Supabase auth user — callers decide that.
 */
export async function wipeUserData(id: string, email?: string | null): Promise<WipeResult> {
  let deleted = 0;
  const skipped: string[] = [];
  const wipe = async (label: string, run: () => Promise<{ count: number }>) => {
    try {
      deleted += (await run()).count;
    } catch (err) {
      console.error(`[account-wipe] skipped ${label}:`, err);
      skipped.push(label);
    }
  };

  // CoachNote references CoachLink → notes must go before links.
  let linkIds: string[] = [];
  try {
    linkIds = (
      await prisma.coachLink.findMany({
        where: { OR: [{ coachId: id }, { clientId: id }] },
        select: { id: true },
      })
    ).map((l) => l.id);
  } catch (err) {
    console.error("[account-wipe] could not read coach links:", err);
  }

  // --- training + health ---------------------------------------------------
  await wipe("sessions", () => prisma.session.deleteMany({ where: { userId: id } }));
  await wipe("macrocycles", () => prisma.macrocycle.deleteMany({ where: { userId: id } }));
  await wipe("biometrics", () => prisma.biometric.deleteMany({ where: { userId: id } }));
  await wipe("bodyMetrics", () => prisma.bodyMetric.deleteMany({ where: { userId: id } }));
  await wipe("signals", () => prisma.signal.deleteMany({ where: { userId: id } }));
  await wipe("checkins", () => prisma.checkin.deleteMany({ where: { userId: id } }));
  await wipe("rtpProtocols", () => prisma.rtpProtocol.deleteMany({ where: { userId: id } }));
  await wipe("riskOutcomes", () => prisma.riskOutcome.deleteMany({ where: { userId: id } }));
  await wipe("connections", () => prisma.connection.deleteMany({ where: { userId: id } }));
  await wipe("templates", () => prisma.workoutTemplate.deleteMany({ where: { ownerId: id } }));
  await wipe("planDayOverrides", () => prisma.planDayOverride.deleteMany({ where: { userId: id } }));
  await wipe("onboardingState", () => prisma.onboardingState.deleteMany({ where: { userId: id } }));

  // --- private tab (the most sensitive free text — was previously skipped) --
  await wipe("journalEntries", () => prisma.journalEntry.deleteMany({ where: { userId: id } }));
  await wipe("hiddenHighlights", () => prisma.hiddenHighlight.deleteMany({ where: { userId: id } }));
  await wipe("highlightOrder", () => prisma.highlightOrder.deleteMany({ where: { userId: id } }));

  // --- assignments ---------------------------------------------------------
  await wipe("assignments", () =>
    prisma.assignment.deleteMany({ where: { OR: [{ athleteId: id }, { assignedById: id }] } }),
  );

  // --- social graph (authored by OR about the user) ------------------------
  await wipe("kudos", () => prisma.kudos.deleteMany({ where: { OR: [{ userId: id }, { ownerId: id }] } }));
  await wipe("comments", () => prisma.comment.deleteMany({ where: { OR: [{ userId: id }, { ownerId: id }] } }));
  await wipe("posts", () => prisma.post.deleteMany({ where: { authorId: id } }));
  await wipe("follows", () => prisma.follow.deleteMany({ where: { OR: [{ followerId: id }, { followeeId: id }] } }));
  await wipe("blocks", () => prisma.block.deleteMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] } }));
  await wipe("coachReviews", () => prisma.coachReview.deleteMany({ where: { OR: [{ coachId: id }, { authorId: id }] } }));
  await wipe("programEnrollments", () =>
    prisma.programEnrollment.deleteMany({ where: { OR: [{ clientId: id }, { coachId: id }] } }),
  );
  await wipe("socialProfile", () => prisma.socialProfile.deleteMany({ where: { userId: id } }));
  await wipe("coachProfile", () => prisma.coachProfile.deleteMany({ where: { userId: id } }));

  // --- coach-authored artefacts -------------------------------------------
  await wipe("coachGroups", () => prisma.coachGroup.deleteMany({ where: { coachId: id } }));
  await wipe("coachPrograms", () => prisma.coachProgram.deleteMany({ where: { coachId: id } }));
  await wipe("coachInvites", () =>
    prisma.coachInvite.deleteMany({ where: { OR: [{ coachId: id }, { claimedById: id }] } }),
  );
  await wipe("coachDiets", () => prisma.coachDiet.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }));
  await wipe("coachApplication", () => prisma.coachApplication.deleteMany({ where: { userId: id } }));

  // --- coach relationship (notes before links) ----------------------------
  if (linkIds.length) {
    await wipe("coachNotes", () => prisma.coachNote.deleteMany({ where: { linkId: { in: linkIds } } }));
  }
  await wipe("coachLinks", () =>
    prisma.coachLink.deleteMany({ where: { OR: [{ coachId: id }, { clientId: id }] } }),
  );

  // --- email footprint ------------------------------------------------------
  if (email) {
    await wipe("emailMessages", () =>
      prisma.emailMessage.deleteMany({
        where: { OR: [{ userId: id }, { email: email.toLowerCase() }] },
      }),
    );
  }

  return { deleted, skipped };
}

/**
 * Remove the user's progress-photo folder from Storage. Uses the service-role
 * admin client so it works regardless of transport (web cookie OR mobile Bearer)
 * and after the auth user is gone. No-op without the service-role key. Returns
 * the number of objects removed.
 */
export async function wipeUserStorage(authId: string | null | undefined): Promise<number> {
  if (!authId) return 0;
  const admin = createAdminClient();
  if (!admin) return 0;
  try {
    const { data: files } = await admin.storage.from("progress").list(authId, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${authId}/${f.name}`);
    if (paths.length) await admin.storage.from("progress").remove(paths);
    return paths.length;
  } catch (e) {
    console.error("[account-wipe] storage wipe failed:", e);
    return 0;
  }
}
