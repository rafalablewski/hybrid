import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { CONNECTORS } from "@hybrid/core";

// The user's connected wearable/sensor accounts. Never returns tokens — just
// status + which providers exist and are configured on this deployment.
import { oauthConfig } from "@/lib/connectors";

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.connection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, provider: true, status: true, lastSyncAt: true, createdAt: true },
  });

  const providers = CONNECTORS.map((c) => ({
    id: c.id,
    label: c.label,
    auth: c.auth,
    provides: c.provides,
    // an oauth provider is "configured" only when its creds are present
    configured: c.auth === "oauth" ? oauthConfig(c.id) != null : c.auth === "native",
  }));

  return NextResponse.json({ connections: rows, providers });
}
