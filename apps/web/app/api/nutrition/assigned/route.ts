import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The diet (macro targets) a coach assigned to the signed-in client, read-only.
// Returned only when an ACTIVE CoachLink still exists with the assigning coach,
// so ending the relationship withdraws it. Soft-degrades until the table exists.

const tableMissing = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "P2021" || code === "P2010";
};

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const diets = await prisma.coachDiet.findMany({
      where: { clientId: me.id },
      orderBy: { updatedAt: "desc" },
    });
    for (const diet of diets) {
      const link = await prisma.coachLink.findUnique({
        where: { coachId_clientId: { coachId: diet.coachId, clientId: me.id } },
      });
      if (link?.status === "ACTIVE") {
        const coach = await prisma.user.findUnique({ where: { id: diet.coachId }, select: { name: true, email: true } });
        return NextResponse.json({
          diet: { kcal: diet.kcal, protein: diet.protein, carbs: diet.carbs, fat: diet.fat, note: diet.note },
          coachName: coach?.name || coach?.email?.split("@")[0] || "your coach",
        });
      }
    }
    return NextResponse.json({ diet: null });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ diet: null, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
