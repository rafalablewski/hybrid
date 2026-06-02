import { NextResponse } from "next/server";
import { getOrCreateDbUser, claimPendingInvites } from "@/lib/server-auth";

// Returns the signed-in user's app profile (role sourced from the DB, not from
// auth metadata). Used by the client session layer to get the authoritative role.
// This is hit on app load, so it's where we claim any pending org invites.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await claimPendingInvites(user.id, user.email);
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
  });
}
