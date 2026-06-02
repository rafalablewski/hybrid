import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import {
  connectorSpec,
  parseWhoop,
  parseOura,
  parseHealthKit,
  type ProviderId,
  type Signal,
} from "@hybrid/core";
import { PROVIDER_ENDPOINTS } from "@/lib/connectors";

// Pull (or receive) provider data and write it into the Signal ontology.
//   • WHOOP / Oura  — server fetches recent recovery using the stored token.
//   • Apple Health  — the native client POSTs HealthKit samples in the body.
// Provider differences end here: everything becomes Signal rows the Twin reads.
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = await params;
  const spec = connectorSpec(provider as ProviderId);
  if (!spec) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  let signals: Signal[] = [];

  if (provider === "apple") {
    // native push: { samples: [...] }
    const raw = (await request.json().catch(() => ({}))) as Parameters<typeof parseHealthKit>[1];
    signals = parseHealthKit(user.id, raw);
  } else {
    const conn = await prisma.connection.findUnique({
      where: { userId_provider: { userId: user.id, provider } },
    });
    if (!conn?.accessToken)
      return NextResponse.json({ error: "not connected" }, { status: 400 });
    const ep = PROVIDER_ENDPOINTS[provider as ProviderId];
    if (!ep) return NextResponse.json({ error: "provider not configured" }, { status: 501 });

    const path = provider === "whoop" ? "/recovery" : "/daily_readiness";
    const res = await fetch(`${ep.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    });
    if (res.status === 401) {
      await prisma.connection.update({ where: { id: conn.id }, data: { status: "error" } });
      return NextResponse.json({ error: "token expired — reconnect" }, { status: 401 });
    }
    if (!res.ok) return NextResponse.json({ error: "provider fetch failed" }, { status: 502 });
    const raw = await res.json();
    signals = provider === "whoop" ? parseWhoop(user.id, raw) : parseOura(user.id, raw);
  }

  if (signals.length) {
    await prisma.signal.createMany({
      data: signals.map((s) => ({
        userId: user.id,
        kind: s.kind,
        value: s.value,
        unit: s.unit,
        source: s.source,
        ts: new Date(s.ts),
      })),
      skipDuplicates: true,
    });
    if (provider !== "apple")
      await prisma.connection.updateMany({
        where: { userId: user.id, provider },
        data: { lastSyncAt: new Date() },
      });
  }

  return NextResponse.json({ written: signals.length });
}
