import { NextResponse } from "next/server";
import { FEATURE_FLAGS, evaluateFlags, flagValues, type FlagOverride } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { getCachedFlagOverrides } from "@/lib/cache";

// The feature flags evaluated for the signed-in user (registry defaults layered
// with admin overrides + audience scoping). Returns a boolean map the clients
// gate on, plus any config values for flags that carry one.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Global overrides are cached (short TTL, busted on admin edits); the per-user
  // grant fold below stays a live read.
  const overrides: Record<string, FlagOverride> = {};
  for (const r of await getCachedFlagOverrides()) {
    overrides[r.key] = { enabled: r.enabled, audience: r.audience, value: r.value ?? undefined };
  }

  const values = flagValues(FEATURE_FLAGS, overrides, user.role);

  return NextResponse.json({
    flags: evaluateFlags(FEATURE_FLAGS, overrides, user.role),
    values,
  });
}
