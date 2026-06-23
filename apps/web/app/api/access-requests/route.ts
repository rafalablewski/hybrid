import { NextResponse } from "next/server";
import { NAV_ITEMS } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

const NAV_IDS = new Set(NAV_ITEMS.map((i) => i.id));

// A signed-in user's own access requests — so the UI can show which features
// they've already asked for and their status.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const requests = await prisma.accessRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, navId: true, status: true, createdAt: true },
    });
    return NextResponse.json({ requests });
  } catch {
    // table not created yet — behave as if there are none.
    return NextResponse.json({ requests: [], unavailable: true });
  }
}

// Ask for access to a feature beyond your persona. Goes to the admin queue.
// Rate-limited; deduped on (user, feature); re-opens a previously denied one.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, { key: "access-request", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ navId?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const navId = parsed.data.navId;
  if (typeof navId !== "string" || !NAV_IDS.has(navId))
    return NextResponse.json({ error: "unknown feature" }, { status: 400 });

  try {
    const req = await prisma.accessRequest.upsert({
      where: { userId_navId: { userId: user.id, navId } },
      update: { status: "pending", decidedAt: null },
      create: { userId: user.id, userEmail: user.email, navId, status: "pending" },
    });
    return NextResponse.json({ request: req }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Requests aren't enabled yet — ask your admin to run the migration." }, { status: 503 });
  }
}
