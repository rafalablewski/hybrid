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
    // The client's active coaches (one query, with the coach for the name).
    const activeLinks = await prisma.coachLink.findMany({
      where: { clientId: me.id, status: "ACTIVE" },
      include: { coach: { select: { name: true, email: true } } },
    });
    if (activeLinks.length > 0) {
      const diet = await prisma.coachDiet.findFirst({
        where: { clientId: me.id, coachId: { in: activeLinks.map((l) => l.coachId) } },
        orderBy: { updatedAt: "desc" },
      });
      if (diet) {
        const coach = activeLinks.find((l) => l.coachId === diet.coachId)?.coach;
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
