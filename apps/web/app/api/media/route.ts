import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// Published media assets from the admin library, for any signed-in user — the
// read side a future in-app media picker (or embedded demo lookups) consumes.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let assets: Array<{ id: string; url: string; title: string; alt: string | null; kind: string; tags: string[] }> = [];
  try {
    assets = await prisma.mediaAsset.findMany({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, url: true, title: true, alt: true, kind: true, tags: true },
    });
  } catch {
    assets = [];
  }

  return NextResponse.json({ assets });
}
