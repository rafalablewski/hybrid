import { NextResponse } from "next/server";
import { FEATURE_FLAGS, evaluateFlags, flagValues, sanitizePersonaAccess, type FlagOverride } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The feature flags evaluated for the signed-in user (registry defaults layered
// with admin overrides + audience scoping). Returns a boolean map the clients
// gate on, plus any config values for flags that carry one.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const overrides: Record<string, FlagOverride> = {};
  try {
    const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true, audience: true, value: true } });
    for (const r of rows) overrides[r.key] = { enabled: r.enabled, audience: r.audience, value: r.value ?? undefined };
  } catch {
    // table not created yet — evaluate on the registry defaults alone.
  }

  const values = flagValues(FEATURE_FLAGS, overrides, user.role);

  // Fold this user's personal feature grants into the persona-access map — each
  // granted nav id becomes visible-from-casual FOR THIS USER ONLY (the map is
  // per-request), so an admin can unlock a single feature for one person on top
  // of the global per-persona policy. Soft-guarded: if the FeatureGrant table
  // isn't migrated yet, there are simply no grants (the app still works).
  let grants: string[] = [];
  try {
    const fg = await prisma.featureGrant.findUnique({ where: { userId: user.id }, select: { navIds: true } });
    grants = fg?.navIds ?? [];
  } catch {
    // table not created yet — no per-user grants.
  }
  if (grants.length > 0) {
    const access = sanitizePersonaAccess(values["access.personaNav"]);
    for (const id of grants) access[id] = "casual";
    values["access.personaNav"] = access;
  }

  return NextResponse.json({
    flags: evaluateFlags(FEATURE_FLAGS, overrides, user.role),
    values,
  });
}
