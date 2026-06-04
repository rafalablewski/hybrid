import { NextResponse } from "next/server";
import { FEATURE_FLAGS, evaluateFlags, flagValues, type FlagOverride } from "@hybrid/core";
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

  return NextResponse.json({
    flags: evaluateFlags(FEATURE_FLAGS, overrides, user.role),
    values: flagValues(FEATURE_FLAGS, overrides, user.role),
  });
}
