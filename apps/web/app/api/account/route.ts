import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { wipeUserData, wipeUserStorage } from "@/lib/account-wipe";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/db";
import { rateLimit, readJsonLimited } from "@/lib/guard";

// Self-serve account deletion (App Store Guideline 5.1.1(v) + GDPR Art. 17).
// Hard-deletes ALL of the signed-in user's data (via the shared wipeUserData
// helper, so coverage matches reset/admin-delete), their progress photos, the
// User row, and finally the Supabase auth identity so the login can't be reused.
//
// DELETE /api/account   body: { confirm: "DELETE" }
export async function DELETE(request: Request) {
  const limited = await rateLimit(request, { key: "account-delete", limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<{ confirm?: unknown }>(request);
  if (parsed.error) return parsed.error;
  if (parsed.data.confirm !== "DELETE") {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  // 1. All application data (+ email footprint, since the account is going away).
  const { deleted, skipped } = await wipeUserData(user.id, user.email);
  // 2. Progress photos (service-role, so it works for web + mobile).
  await wipeUserStorage(user.authId);

  // 3. The User row — the authoritative delete. Never swallow its failure.
  try {
    await prisma.user.delete({ where: { id: user.id } });
  } catch (err) {
    console.error("[account/delete] failed to delete user row:", err);
    return NextResponse.json(
      { error: "account_delete_failed", detail: "data was cleared but the account row could not be removed", skipped },
      { status: 500 },
    );
  }

  // 4. The Supabase auth identity so the login can't be reused. Best-effort
  //    (no-op without the service-role key; the DB delete is authoritative).
  let authDeleted: "deleted" | "skipped" | "failed" = "skipped";
  if (user.authId) {
    const admin = createAdminClient();
    if (admin) {
      try {
        const { error } = await admin.auth.admin.deleteUser(user.authId);
        authDeleted = error ? "failed" : "deleted";
        if (error) console.error("[account/delete] auth user delete failed:", error);
      } catch (err) {
        authDeleted = "failed";
        console.error("[account/delete] auth user delete threw:", err);
      }
    }
  }

  return NextResponse.json({ ok: true, deleted, authDeleted, skipped });
}
