import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { parseMediaMeta, type MediaInput } from "../shared";

const BUCKET = "media";

// Edit an asset's metadata (title/alt/kind/tags) + lifecycle. Audited.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-media-patch", limit: 80, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;

  const parsed = await readJsonLimited<MediaInput>(request, 8 * 1024);
  if (parsed.error) return parsed.error;

  const meta = parseMediaMeta(parsed.data, false);
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });
  if (Object.keys(meta.data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const before = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.mediaAsset.update({ where: { id }, data: meta.data });

  await audit({
    actor: gate.admin,
    action: "media.update",
    targetType: "media",
    targetId: id,
    summary: `Updated “${updated.title}”${before.status !== updated.status ? ` (${before.status} → ${updated.status})` : ""}`,
    metadata: { before: { status: before.status }, after: { status: updated.status } },
    req: request,
  });

  return NextResponse.json({ asset: updated });
}

// Delete an asset: remove the catalog row, then best-effort remove the bytes
// from the bucket (the admin's auth carries through to the is_admin() RLS).
// A storage failure never blocks the row delete. Audited.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-media-delete", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  const existing = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.mediaAsset.delete({ where: { id } });

  try {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET).remove([existing.path]);
  } catch {
    // storage not reachable / not authed here — the row is gone, log-only.
    console.error("[media delete] could not remove storage object", existing.path);
  }

  await audit({
    actor: gate.admin,
    action: "media.delete",
    targetType: "media",
    targetId: id,
    summary: `Deleted “${existing.title}”`,
    metadata: { path: existing.path },
    req: request,
  });

  return NextResponse.json({ ok: true });
}
