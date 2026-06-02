import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

type DbRole = "CLIENT" | "COACH" | "ADMIN";

function toDbRole(r: unknown): DbRole {
  const s = String(r ?? "").toUpperCase();
  return s === "ADMIN" ? "ADMIN" : s === "COACH" ? "COACH" : "CLIENT";
}

/**
 * Resolve the signed-in Supabase user to our app `User` row, creating it on
 * first sight (keyed by the Supabase auth id). Role is taken from auth metadata
 * only at creation — after that the DB row is the source of truth. Returns null
 * when there is no authenticated user.
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
      role: toDbRole(meta.role),
    },
  });

  await claimPendingInvites(dbUser.id, dbUser.email);
  return dbUser;
}

/**
 * Materialize any pending org invitations addressed to this user's email into
 * real memberships. Runs on sign-in so an invited coach/athlete auto-joins.
 */
async function claimPendingInvites(userId: string, email: string) {
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
