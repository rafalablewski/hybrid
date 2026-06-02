import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Return-to-play protocols for the signed-in athlete.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const protocols = await prisma.rtpProtocol.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ protocols });
}

// Open a new protocol for a tissue.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as { tissue?: unknown; injuryDate?: unknown };
  if (typeof b.tissue !== "string" || !b.tissue) return NextResponse.json({ error: "tissue required" }, { status: 400 });
  const injuryDate = typeof b.injuryDate === "string" && !Number.isNaN(Date.parse(b.injuryDate)) ? new Date(b.injuryDate) : new Date();

  const protocol = await prisma.rtpProtocol.create({
    data: { userId: user.id, tissue: b.tissue, injuryDate, stage: "acute", completed: [], status: "active" },
  });
  return NextResponse.json({ protocol }, { status: 201 });
}
