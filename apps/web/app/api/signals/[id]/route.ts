import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Delete one Signal you own.
//
// The stream is append-only for a reason — a reading is a fact about a moment,
// and rewriting history would make every baseline unreproducible. But a MANUAL
// reading can be a mistake (a mis-tapped water log, a weigh-in typed into the
// wrong day), and until now the only way to take one back was to leave it there.
//
// Undo on the water control is what needed this: the control appends 250 ml per
// tap, so taking a tap back means removing the Signal it wrote rather than
// appending a negative one — a −250 ml reading would be a lie about the day
// that every downstream sum would faithfully carry.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const s = await prisma.signal.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (s.userId !== me.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.signal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
