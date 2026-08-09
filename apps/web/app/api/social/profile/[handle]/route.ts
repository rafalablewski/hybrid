import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { tableMissing } from "@/lib/social";
import { loadPublicProfile } from "@/lib/profile-read";

// A user's PUBLIC profile CARD by @handle. The card (handle/name/bio) is always
// returned; RESULTS (stats) are gated by the privacy visibility × relation.
// Also reports the viewer's relation so the UI can render the follow button.
//
// The whole PAGE — this, plus the social counts, their coaching and their
// recent activity — is /api/social/user/[handle]. This endpoint stays the light
// read: the handle-availability check in the profile editor hits it on every
// keystroke, and it should never pay for a timeline.

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { handle } = await params;

  try {
    const p = await loadPublicProfile(me.id, handle);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      profile: p.profile,
      relation: p.relation,
      followState: p.followState,
      canViewResults: p.canViewResults,
      stats: p.stats,
      fitnessLevel: p.fitnessLevel,
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "not found", unavailable: true }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
