import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/guard";
import { computeEfficacyIndex } from "@/lib/efficacy";

// The Program Efficacy Index — PUBLIC and unauthenticated on purpose. It
// serves only k-anonymous aggregates (every cohort under 5 athletes is
// suppressed in core/program-efficacy.ts), and being openly readable is the
// point: it is the content engine ("programs ranked by measured outcome") and
// the mobile app's parity source for the same numbers. CDN-cached for an hour;
// the data only moves when a 12-week window closes, so an hour is generous.

export async function GET(request: Request) {
  // Public routes must still be rate-limited (security.test.ts enforces this
  // for every PUBLIC_ROUTES entry). Generous: the payload is CDN-cached anyway.
  const limited = await rateLimit(request, { key: "efficacy", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const index = await computeEfficacyIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
