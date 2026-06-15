import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// A signed-in user's own coach application — so the UI can show whether they've
// applied and the decision status.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const application = await prisma.coachApplication.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true, credentials: true, createdAt: true },
    });
    return NextResponse.json({ application });
  } catch {
    // table not created yet — behave as if there is none.
    return NextResponse.json({ application: null, unavailable: true });
  }
}

// Apply to become a coach. Goes to the admin queue. Rate-limited; deduped on
// user; re-opens a previously denied one.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = rateLimit(request, { key: "coach-apply", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ credentials?: unknown }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const raw = parsed.data.credentials;
  if (typeof raw !== "string" || raw.trim().length === 0)
    return NextResponse.json({ error: "credentials required" }, { status: 400 });
  const credentials = raw.trim().slice(0, 2000);

  if (user.role === "COACH" || user.role === "ADMIN")
    return NextResponse.json({ error: "already a coach" }, { status: 400 });

  try {
    const application = await prisma.coachApplication.upsert({
      where: { userId: user.id },
      update: { status: "pending", decidedAt: null, credentials },
      create: { userId: user.id, userEmail: user.email, credentials, status: "pending" },
    });
    return NextResponse.json({ application }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Coach applications aren’t enabled yet — ask your admin to run the migration." }, { status: 503 });
  }
}
