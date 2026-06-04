import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Published announcements visible to the signed-in user RIGHT NOW: status
// published, within the publish/expiry window, and matching their audience.
// Pinned first, newest next. The admin CMS writes these; this is the read side
// the in-app banner consumes.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Map the user's role onto the audience buckets. Admins see everything.
  const audiences = ["all"];
  if (user.role === "COACH") audiences.push("coaches");
  if (user.role === "CLIENT") audiences.push("clients");
  if (user.role === "ADMIN") audiences.push("coaches", "clients");

  const now = new Date();

  let rows: Array<{
    id: string;
    title: string;
    body: string;
    level: string;
    pinned: boolean;
    createdAt: Date;
  }> = [];
  try {
    rows = await prisma.announcement.findMany({
      where: {
        status: "published",
        audience: { in: audiences },
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { id: true, title: true, body: true, level: true, pinned: true, createdAt: true },
    });
  } catch {
    // Table not created yet (reference/sql-announcement.sql) — degrade to empty.
    rows = [];
  }

  return NextResponse.json({ announcements: rows });
}
