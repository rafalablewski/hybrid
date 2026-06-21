import { NextResponse } from "next/server";
import { getOrCreateDbUser, claimPendingInvites, claimPendingCoachInvites } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Returns the signed-in user's app profile (role sourced from the DB, not from
// auth metadata). Used by the client session layer to get the authoritative role.
// This is hit on app load, so it's where we claim any pending org invites.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await claimPendingInvites(user.id, user.email);
  await claimPendingCoachInvites(user.id, user.email);

  // Has this user finished (or skipped) onboarding? Source of truth the clients
  // gate the questionnaire on. Prefer the explicit OnboardingState row; fall
  // back to "already has an enrolled plan" so long-standing users are never
  // nagged. Soft-guarded: no row / unmigrated table → not onboarded yet.
  let onboardedAt: string | null = null;
  try {
    const state = await prisma.onboardingState.findUnique({ where: { userId: user.id } });
    if (state) onboardedAt = state.onboardedAt.toISOString();
  } catch {
    /* OnboardingState not migrated yet — treat as not onboarded */
  }
  if (!onboardedAt) {
    const macro = await prisma.macrocycle.findFirst({ where: { userId: user.id }, select: { startedAt: true } });
    if (macro) onboardedAt = macro.startedAt.toISOString();
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
    entitlement: user.entitlement,
    // Surfaced as the verified tick on a coach's profile wherever clients see them.
    coachVerified: user.coachVerified,
    onboardedAt,
  });
}
