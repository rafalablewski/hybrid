import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";

// Returns the signed-in user's app profile (role sourced from the DB, not from
// auth metadata). Used by the client session layer to get the authoritative role.
export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
  });
}
