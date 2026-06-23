import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

/**
 * Resolve the signed-in Supabase user to our app `User` row, creating it on
 * first sight (keyed by the Supabase auth id). New self-signups are ALWAYS
 * created as CLIENT — never seeded from client-controllable user_metadata.role,
 * which a crafted signup could set to "admin"/"coach" to self-escalate.
 * Elevated roles are granted only by an admin action (which writes the DB row
 * directly, so this upsert hits the update branch on the user's first login).
 * After creation the DB row is the source of truth. Returns null when there is
 * no authenticated user.
 */
export async function getOrCreateDbUser(req?: Request) {
  const supabase = await createClient();

  // Web sends the session via cookies (SSR); mobile sends a Bearer access token.
  // Support both so one API serves both clients.
  const authHeader = req?.headers.get("authorization");
  const user =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? (await supabase.auth.getUser(authHeader.slice(7).trim())).data.user
      : (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const dbUser = await prisma.user.upsert({
    where: { authId: user.id },
    update: { email: user.email ?? "" },
    create: {
      authId: user.id,
      email: user.email ?? "",
      name: (meta.name as string | undefined) ?? null,
      // Never trust meta.role here — default to CLIENT (see fn doc).
      role: "CLIENT",
    },
  });

  // Fire the `signup` lifecycle automation once, just after the row is first
  // created. We can't get a "created" flag back from upsert, so we gate on a
  // short window after createdAt; enrollInTrigger is idempotent (unique
  // [sequenceId,userId]) so a couple of attempts in that window are harmless, and
  // it no-ops entirely until email sequences exist. Never blocks the request.
  if (dbUser.email && Date.now() - dbUser.createdAt.getTime() < 30_000) {
    try {
      const { enrollInTrigger } = await import("@/lib/email");
      await enrollInTrigger("signup", {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        entitlement: dbUser.entitlement,
      });
    } catch {
      /* best-effort */
    }
  }

  return dbUser;
}

/**
 * The signed-in user's billing entitlement, read from Supabase auth metadata
 * ('free' | 'paid'; default 'free'). Server-side mirror of the client check —
 * used to gate paid (athlete) AUTHORING actions on the API so a coached/casual
 * free client can't POST around the hidden UI. Being coached never confers this.
 */
export async function getAuthEntitlement(req?: Request): Promise<"free" | "paid"> {
  const supabase = await createClient();
  const authHeader = req?.headers.get("authorization");
  const user =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? (await supabase.auth.getUser(authHeader.slice(7).trim())).data.user
      : (await supabase.auth.getUser()).data.user;
  const meta = user?.user_metadata ?? {};
  return String(meta.entitlement ?? "free").toLowerCase() === "paid" ? "paid" : "free";
}

/**
 * Materialize any pending org invitations addressed to this user's email into
 * real memberships. Called from /api/me (app load), NOT on every request, so it
 * doesn't add a query to every authenticated endpoint.
 */
export async function claimPendingInvites(userId: string, email: string) {
  if (!email) return;
  const invites = await prisma.orgInvite.findMany({ where: { email, status: "pending" } });
  for (const inv of invites) {
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: inv.orgId, userId } },
      update: {},
      create: { orgId: inv.orgId, userId, role: inv.role, teamId: inv.teamId },
    });
    await prisma.orgInvite.update({ where: { id: inv.id }, data: { status: "accepted" } });
  }
}

/**
 * Materialize any pending COACH invites addressed to this user's (verified)
 * email into an ACTIVE CoachLink — the coach-led onboarding path for someone who
 * wasn't on HYBRID when invited. Mirrors claimPendingInvites; called from /api/me
 * on app load. Soft no-ops until reference/sql-coach-invites.sql has been run.
 */
export async function claimPendingCoachInvites(userId: string, email: string) {
  if (!email) return;
  try {
    const invites = await prisma.coachInvite.findMany({
      where: { email: email.toLowerCase(), status: "PENDING" },
    });
    const now = Date.now();
    for (const inv of invites) {
      if (inv.expiresAt.getTime() < now || inv.coachId === userId) continue;
      // Atomic: never leave an ACTIVE link with a still-PENDING invite.
      await prisma.$transaction([
        prisma.coachLink.upsert({
          where: { coachId_clientId: { coachId: inv.coachId, clientId: userId } },
          update: { status: "ACTIVE" },
          create: { coachId: inv.coachId, clientId: userId, status: "ACTIVE" },
        }),
        prisma.coachInvite.update({ where: { id: inv.id }, data: { status: "CLAIMED", claimedById: userId } }),
      ]);
    }
  } catch {
    // CoachInvite table not migrated yet — onboarding-by-email just no-ops.
  }
}
