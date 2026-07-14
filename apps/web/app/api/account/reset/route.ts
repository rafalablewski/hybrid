import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { wipeUserData, wipeUserStorage } from "@/lib/account-wipe";

// Account reset — wipe ALL of the signed-in user's data while keeping their
// login. Everything is scoped to the authenticated user's id via the shared
// wipeUserData() helper (one source of truth, so it can't drift from the
// self-delete / admin-delete paths and leave a table behind). Irreversible by
// design (the client double-confirms).
//
// POST /api/account/reset   body: { confirm: "RESET" }
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { confirm?: unknown } = {};
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    /* empty body → fail the confirm check below */
  }
  if (body.confirm !== "RESET") {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  // Reset keeps the login, so we keep the email lifecycle footprint (no email
  // arg) — only the training/health/social data is wiped.
  const { deleted, skipped } = await wipeUserData(user.id);
  const photos = await wipeUserStorage(user.authId);

  return NextResponse.json({ ok: true, deleted, photos, skipped });
}
