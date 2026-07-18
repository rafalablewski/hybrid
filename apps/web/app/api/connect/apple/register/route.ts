import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The `apple` connector has no OAuth leg — the phone reads HealthKit locally
// and relays samples to /api/connect/apple/sync. This route only records the
// connection's existence so the Connections hub shows a real status:
//   POST   → upsert the row as active (the app calls it right after the Health
//            permission sheet completes)
//   DELETE → mark it revoked (Disconnect; there are no tokens to revoke — the
//            OS-level Health permission is managed in iOS Settings)
// A literal segment outranks the [provider] dynamic route, so this stays fully
// isolated from the OAuth providers' flow.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const connection = await prisma.connection.upsert({
    where: { userId_provider: { userId: user.id, provider: "apple" } },
    create: { userId: user.id, provider: "apple", status: "active" },
    update: { status: "active" },
    select: { id: true, provider: true, status: true, lastSyncAt: true },
  });
  return NextResponse.json({ connection });
}

export async function DELETE(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.connection.updateMany({
    where: { userId: user.id, provider: "apple" },
    data: { status: "revoked" },
  });
  return NextResponse.json({ ok: true });
}
