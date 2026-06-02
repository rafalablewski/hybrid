import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { analyzeSquat, motionSignals, type PoseFrame } from "@hybrid/core";

// Past motion analyses for the signed-in athlete.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const analyses = await prisma.videoAnalysis.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ analyses });
}

// Analyze a clip's pose frames (produced by the on-device pose model) and store
// the metrics; derived asymmetry also lands in the Signal ontology.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as { frames?: unknown };
  if (!Array.isArray(b.frames) || b.frames.length === 0)
    return NextResponse.json({ error: "frames required" }, { status: 400 });

  const metrics = analyzeSquat(b.frames as PoseFrame[]);

  const analysis = await prisma.videoAnalysis.create({
    data: { userId: user.id, movement: metrics.movement, metrics: JSON.parse(JSON.stringify(metrics)) },
  });

  const sigs = motionSignals(user.id, metrics);
  if (sigs.length)
    await prisma.signal.createMany({
      data: sigs.map((s) => ({ userId: user.id, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: new Date(s.ts) })),
    });

  return NextResponse.json({ analysis, metrics }, { status: 201 });
}
