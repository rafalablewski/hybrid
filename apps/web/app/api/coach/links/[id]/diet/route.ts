import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// A coach assigns / reads the DIET (daily macro targets) for a rostered client.
// CoachLink-gated (coach owns + ACTIVE). The client views it read-only on their
// Nutrition screen. Soft-degrades until reference/sql-coach-diet.sql has run.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

const clampInt = (v: unknown, max: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.min(Math.round(v), max);
};

async function gateLink(request: Request, id: string) {
  const me = await getOrCreateDbUser(request);
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const link = await prisma.coachLink.findUnique({ where: { id } });
  if (!link) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (link.coachId !== me.id || link.status !== "ACTIVE")
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { me, link };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gateLink(request, id);
  if (g.error) return g.error;
  try {
    const diet = await prisma.coachDiet.findUnique({
      where: { coachId_clientId: { coachId: g.me.id, clientId: g.link.clientId } },
    });
    return NextResponse.json({ diet });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ diet: null, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gateLink(request, id);
  if (g.error) return g.error;

  const { data: b, error } = await readJsonLimited<{ kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown; note?: unknown }>(request, 4 * 1024);
  if (error) return error;
  const data = {
    kcal: clampInt(b.kcal, 12000),
    protein: clampInt(b.protein, 1000),
    carbs: clampInt(b.carbs, 2000),
    fat: clampInt(b.fat, 1000),
    note: typeof b.note === "string" ? b.note.trim().slice(0, 500) : null,
  };

  try {
    const diet = await prisma.coachDiet.upsert({
      where: { coachId_clientId: { coachId: g.me.id, clientId: g.link.clientId } },
      update: data,
      create: { coachId: g.me.id, clientId: g.link.clientId, ...data },
    });
    return NextResponse.json({ diet }, { status: 201 });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Diet assignment isn't enabled yet — run reference/sql-coach-diet.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
