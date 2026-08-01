import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// The witness answers: co-sign or decline a PENDING attestation addressed to
// me. One transition, stamped — a cosigned or declined row never moves again
// (the record is append-only in spirit; asking again re-opens only a decline,
// see the upsert in ../route.ts). Mirrors social/follow/respond.

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: `record-attest-respond:${me.id}`, limit: 60, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ id?: unknown; action?: unknown }>(request);
  if (error) return error;
  const id = typeof b.id === "string" ? b.id : "";
  const action = b.action === "cosign" || b.action === "decline" ? b.action : "";
  if (!id || !action) return NextResponse.json({ error: "id + action required" }, { status: 400 });

  try {
    // Only the WITNESS can act, and only while the request is still pending.
    const row = await prisma.recordAttestation.findUnique({ where: { id } });
    if (!row || row.witnessId !== me.id || row.status !== "pending")
      return NextResponse.json({ error: "no pending request" }, { status: 404 });

    const attestation = await prisma.recordAttestation.update({
      where: { id },
      data: { status: action === "cosign" ? "cosigned" : "declined", respondedAt: new Date() },
    });
    return NextResponse.json({ attestation: { id: attestation.id, status: attestation.status } });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
