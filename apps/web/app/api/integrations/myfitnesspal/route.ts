import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// MyFitnessPal nutrition linkage — available to EVERY user (surfaced on the
// free Nutrition screen). The diary-sync flow is code-complete but MyFitnessPal's
// API is partner-only, so it stays BLOCKED until that access is granted: until
// MFP_CLIENT_ID/MFP_CLIENT_SECRET land, GET reports configured:false and POST
// returns a 503 'not configured' — exactly how every other external integration
// here (Stripe, Apple IAP, wearables) degrades safely.
const PROVIDER = "myfitnesspal";
const configured = () => !!(process.env.MFP_CLIENT_ID && process.env.MFP_CLIENT_SECRET);

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let connected = false;
  let lastSyncAt: string | null = null;
  try {
    const conn = await prisma.connection.findUnique({
      where: { userId_provider: { userId: user.id, provider: PROVIDER } },
      select: { status: true, lastSyncAt: true },
    });
    connected = conn?.status === "active";
    lastSyncAt = conn?.lastSyncAt ? conn.lastSyncAt.toISOString() : null;
  } catch {
    // Connection table not present — degrade to not-connected.
  }
  return NextResponse.json({ provider: PROVIDER, configured: configured(), connected, lastSyncAt });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!configured()) {
    return NextResponse.json(
      {
        configured: false,
        error: "MyFitnessPal sync isn’t enabled on this deployment yet.",
        needs: ["MFP_CLIENT_ID", "MFP_CLIENT_SECRET"],
        note: "MyFitnessPal’s API is partner-only; once access is granted and the keys are set, connecting will sync your diet into your nutrition log.",
      },
      { status: 503 },
    );
  }

  // Configured path (kept ready for when partner creds land): begin the OAuth
  // handshake. Until then this branch is unreachable.
  return NextResponse.json({ configured: true, url: `/api/connect/${PROVIDER}` });
}
