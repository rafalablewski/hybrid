import { NextResponse } from "next/server";
import { migrateBlocks, blockBestE1rm, cosignRequestPush, fmtWeight, type StrengthBlock } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, blockedIdsFor } from "@/lib/social";
import { notify } from "@/lib/push";

// Verified Strength Record, tier 2 — witness co-signing.
//
// POST asks a witness (by handle) to co-sign one lift in one of MY sessions.
// The claim (best e1RM + top load for that lift, kg) is snapshotted here,
// server-side from the session's own blocks — the client cannot type the
// number the witness signs. GET returns both directions: the attestations on
// my sessions (badges) and the pending requests addressed to ME as witness
// (the co-sign inbox). Soft-degrades until reference/sql-verified-record.sql
// runs. Tier grading lives in core/attestation.ts.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sessionId = new URL(request.url).searchParams.get("sessionId");

  try {
    const [mine, inbox] = await Promise.all([
      prisma.recordAttestation.findMany({
        where: { ownerId: me.id, ...(sessionId ? { sessionId } : {}) },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { witness: { select: { socialProfile: { select: { handle: true, displayName: true } } } } },
      }),
      prisma.recordAttestation.findMany({
        where: { witnessId: me.id, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { owner: { select: { socialProfile: { select: { handle: true, displayName: true } } } } },
      }),
    ]);
    return NextResponse.json({
      attestations: mine.map((a) => ({
        id: a.id,
        sessionId: a.sessionId,
        lift: a.lift,
        status: a.status,
        e1rm: a.e1rm,
        topLoad: a.topLoad,
        witnessHandle: a.witness.socialProfile?.handle ?? null,
        witnessName: a.witness.socialProfile?.displayName ?? null,
        createdAt: a.createdAt.toISOString(),
        respondedAt: a.respondedAt?.toISOString() ?? null,
      })),
      inbox: inbox.map((a) => ({
        id: a.id,
        sessionId: a.sessionId,
        lift: a.lift,
        e1rm: a.e1rm,
        topLoad: a.topLoad,
        ownerHandle: a.owner.socialProfile?.handle ?? null,
        ownerName: a.owner.socialProfile?.displayName ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ attestations: [], inbox: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: `record-attest:${me.id}`, limit: 30, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ sessionId?: unknown; lift?: unknown; witnessHandle?: unknown }>(request);
  if (error) return error;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : "";
  const lift = typeof b.lift === "string" ? b.lift.trim().slice(0, 120) : "";
  const witnessHandle = typeof b.witnessHandle === "string" ? b.witnessHandle.trim().replace(/^@/, "").toLowerCase() : "";
  if (!sessionId || !lift || !witnessHandle)
    return NextResponse.json({ error: "sessionId, lift, witnessHandle required" }, { status: 400 });

  try {
    // The session must be MINE, and the lift must really be in it — the claim
    // snapshot is computed from the stored blocks, never taken from the client.
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: me.id, archivedAt: null },
      select: { id: true, blocks: true },
    });
    if (!session) return NextResponse.json({ error: "not your session" }, { status: 404 });
    const block = migrateBlocks(session.blocks).find(
      (blk): blk is StrengthBlock => blk.kind === "strength" && blk.name === lift,
    );
    if (!block) return NextResponse.json({ error: "that lift is not in this session" }, { status: 400 });
    const e1rm = blockBestE1rm(block) || null;
    const topLoad = block.sets.reduce((m, s) => Math.max(m, parseFloat(String(s.load)) || 0), 0) || null;

    const witnessProfile = await prisma.socialProfile.findUnique({ where: { handle: witnessHandle } });
    if (!witnessProfile) return NextResponse.json({ error: "no such handle" }, { status: 404 });
    if (witnessProfile.userId === me.id)
      return NextResponse.json({ error: "you can't witness your own lift" }, { status: 400 });
    const blocked = await blockedIdsFor(me.id);
    if (blocked.has(witnessProfile.userId)) return NextResponse.json({ error: "no such handle" }, { status: 404 });

    const attestation = await prisma.recordAttestation.upsert({
      where: { sessionId_lift_witnessId: { sessionId, lift, witnessId: witnessProfile.userId } },
      // Asking again re-opens a DECLINED request with a fresh snapshot; a
      // cosigned row is final and comes back unchanged (append-only spirit).
      update: {},
      create: { ownerId: me.id, witnessId: witnessProfile.userId, sessionId, lift, e1rm, topLoad },
    });

    // Ask the witness where they actually are. A co-sign request has no value to
    // either side until it is answered, and the witness has no reason to be
    // inside HYBRID at the moment somebody else claims a lift — this is the one
    // of the three notifications whose absence made a whole feature (tier-2
    // verified records) depend on the two of you being in the same room.
    // Only for a request still OPEN: re-asking on an already-cosigned row
    // returns the finished attestation unchanged, and must not re-notify.
    if (attestation.status === "pending") {
      const mine = await prisma.socialProfile.findUnique({
        where: { userId: me.id },
        select: { handle: true, displayName: true },
      });
      // kg — the canonical storage unit. The witness's own lb/kg preference is a
      // device preference the server can't see, and a load in the wrong unit
      // would misstate the very number they are being asked to vouch for.
      await notify(witnessProfile.userId, "cosign", (lang) =>
        cosignRequestPush({
          from: mine?.displayName || (mine?.handle ? `@${mine.handle}` : "") || me.name || "",
          lift,
          load: topLoad ? fmtWeight(topLoad, "kg") : undefined,
          lang,
        }),
      );
    }

    return NextResponse.json({ attestation: { id: attestation.id, status: attestation.status } }, { status: 201 });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
