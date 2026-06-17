import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Admin maintenance: permanently delete EVERY user's logged training sessions
// (a global history wipe — e.g. clearing seed/demo data). Irreversible, so it
// requires an explicit confirm token. Admin-only; audited with the row count.
export async function DELETE(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "ALL") {
    return NextResponse.json({ error: "confirm=ALL required" }, { status: 400 });
  }

  const { count } = await prisma.session.deleteMany({});

  await audit({
    actor: gate.admin,
    action: "sessions.deleteAll",
    targetType: "session",
    summary: `GLOBAL wipe — deleted ${count} training session(s) across all users`,
    metadata: { deleted: count, scope: "all-users" },
    req: request,
  });

  return NextResponse.json({ ok: true, deleted: count });
}
