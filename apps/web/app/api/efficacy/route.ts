import { NextResponse } from "next/server";
import { computeEfficacyIndex } from "@/lib/efficacy";

// The Program Efficacy Index — PUBLIC and unauthenticated on purpose. It
// serves only k-anonymous aggregates (every cohort under 5 athletes is
// suppressed in core/program-efficacy.ts), and being openly readable is the
// point: it is the content engine ("programs ranked by measured outcome") and
// the mobile app's parity source for the same numbers. CDN-cached for an hour;
// the data only moves when a 12-week window closes, so an hour is generous.

export async function GET() {
  const index = await computeEfficacyIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
