import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { parseMediaMeta, kindFromContentType, type MediaInput } from "./shared";

// The media catalog: every asset (drafts, published, archived), newest first.
// Admin-only. The MediaAsset table is created by reference/sql-media-library.sql
// — if it's missing we flag it rather than 500.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const assets = await prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ assets: [], unavailable: true });
  }
}

// Register an asset after its bytes were uploaded to the public media bucket
// (the admin client does the upload; this records the catalog row). Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-media-post", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<MediaInput>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  // Storage-provenance fields supplied by the uploader.
  if (typeof b.path !== "string" || !b.path.trim()) return NextResponse.json({ error: "path required" }, { status: 400 });
  if (typeof b.url !== "string" || !b.url.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });

  const meta = parseMediaMeta(b, true);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

  const contentType = typeof b.contentType === "string" ? b.contentType.slice(0, 120) : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        path: b.path.trim().slice(0, 400),
        url: b.url.trim().slice(0, 800),
        title: meta.data.title!,
        alt: meta.data.alt ?? null,
        kind: meta.data.kind ?? kindFromContentType(contentType),
        contentType,
        sizeBytes: num(b.sizeBytes),
        width: num(b.width),
        height: num(b.height),
        tags: meta.data.tags ?? [],
        status: meta.data.status ?? "published",
        authorId: gate.admin.id,
        authorEmail: gate.admin.email,
      },
    });

    await audit({
      actor: gate.admin,
      action: "media.create",
      targetType: "media",
      targetId: asset.id,
      summary: `Uploaded “${asset.title}” (${asset.kind})`,
      metadata: { path: asset.path, kind: asset.kind },
      req: request,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "that file path is already registered" }, { status: 409 });
    console.error("[admin media] register failed", e);
    return NextResponse.json({ error: "could not register asset" }, { status: 500 });
  }
}
