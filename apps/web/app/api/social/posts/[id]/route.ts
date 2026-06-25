import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing } from "@/lib/social";

// Delete my own post (and its kudos/comments).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post || post.authorId !== me.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.$transaction([
      prisma.kudos.deleteMany({ where: { subjectType: "post", subjectId: id } }),
      prisma.comment.deleteMany({ where: { subjectType: "post", subjectId: id } }),
      prisma.post.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ ok: true, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
