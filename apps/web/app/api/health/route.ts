import { NextResponse } from "next/server";

// A tiny, public, no-auth reachability probe. Both clients can hit it to tell
// "the server is up" apart from "this request needs auth / the data is empty".
// Used by the mobile connectivity manager (lib/net.tsx) to drive the offline
// banner + TanStack onlineManager without misreading a 401 as offline.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
